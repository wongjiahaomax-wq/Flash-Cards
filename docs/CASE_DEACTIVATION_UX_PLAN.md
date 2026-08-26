# Case Deactivation and Restore Admin UX

Status: **Implemented in draft PR #100.** This document records the current Case lifecycle contract and the implementation decisions made in this PR.

## Goal

Production Admin can remove an incorrect, obsolete, or mistakenly imported Case from current learner use without physically deleting the Case, its teaching content, or its historical Reviews.

The normal lifecycle is:

```text
Active Production Case
→ Deactivate
→ Inactive Production Case, fully preserved
→ Restore after validation
→ Active Production Case
```

The existing `cases.is_active` column is the lifecycle state. PR #100 does not add another deletion-state model.

## Lifecycle semantics

### Active

```text
cases.is_active = true
preview_session_id IS NULL
```

An active Production Case is eligible for normal Admin authoring and, subject to the existing learner routing/question rules, learner study.

### Inactive

```text
cases.is_active = false
preview_session_id IS NULL
```

An inactive Production Case:

- is excluded from normal learner Case selection and direct new-Review source loading;
- is excluded from the default Active Case library;
- remains stored with all relationships and historical data intact;
- is intentionally unavailable to the normal active-only Case editor;
- can be inspected through the purpose-specific Admin recovery read;
- can be restored only after restore invariants pass.

## Deactivate means preserve

Deactivation changes only `cases.is_active`.

It does **not** delete, detach, deactivate, rewrite, or clean up:

- Case Questions;
- Question Prompts;
- Primary Topic or legacy inert Topic relationships;
- Case Tags;
- fixed Case Assets;
- Stimulus Groups;
- Stimulus Options;
- reusable image-question relationships;
- shared/global Assets or Prompts;
- teaching Assets;
- R2 objects;
- historical Reviews;
- Review Questions/Assets;
- Review snapshots or provenance.

Permanent Case deletion remains out of scope.

## Production / Preview boundary

Production lifecycle operations require a Case with:

```text
preview_session_id IS NULL
```

Preview-owned Cases are rejected by the production lifecycle domain owner.

`requireProductionCase(...)` is unchanged and still means **active Production Case**. Normal active authoring continues to use that guard. Inactive recovery intentionally uses a separate lifecycle read/mutation path rather than weakening the existing guard.

The shared Production/Preview Case editor does not expose the lifecycle section in Preview Mode. The production deactivate form posts to an `/admin/...` endpoint guarded by the production Admin role and the lifecycle domain production-ownership check; no Preview lifecycle authority is introduced.

## Restore validation

Restore is not a blind `UPDATE cases SET is_active = true` operation.

Before an inactive Case is activated, the lifecycle domain validates:

1. the Case exists;
2. the Case is Production-owned;
3. it has exactly one relationship with `role = 'primary'`;
4. the referenced Primary concept exists;
5. that concept is classified as a Topic, not a System;
6. that Topic is active.

These checks match the current learner-presentability assumptions inspected in the learner source/resolver paths: new learner Reviews require an active Production Case connected through its active canonical Topic.

If any restore invariant fails:

- the Case stays inactive;
- no partial restore is performed;
- Admin receives an actionable error such as `Cannot restore this Case because its Primary Topic is inactive.`

Single restore is safely idempotent when the same Case is already active.

## Case library UX

The Case library has two explicit lifecycle views:

```text
Active | Inactive
```

Active remains the default.

The implementation uses:

```text
lifecycle=inactive
```

for the inactive view. Active is the default/omitted value.

This deliberately does **not** use `status=inactive`, because the existing Case library already uses the `status` query parameter for success/feedback redirects such as bulk Topic updates. Keeping lifecycle state separate preserves the existing feedback contract.

Both lifecycle views remain:

- Production-only;
- SQL filtered and bounded;
- paginated;
- searchable by Case title;
- searchable/filterable by Topic and System;
- filterable by Tag;
- sortable by Case, Topic, System, and Tag.

Query state is preserved across relevant filter/sort/pagination navigation. Lifecycle changes reset pagination while retaining useful filters.

### Active view

The Active view preserves the existing bulk Primary Topic assignment flow and adds:

```text
Deactivate selected
```

Bulk deactivation requires explicit client confirmation and server-side lifecycle validation.

### Inactive view

The Inactive view:

- shows an obvious `Inactive` badge;
- hides active-only bulk Primary Topic assignment;
- provides `Restore selected`;
- links each row to the purpose-specific recovery page rather than the active editor.

Inactive library enrichment may show inactive Topic/Tag context so the Admin can identify preserved records even when taxonomy state has changed since deactivation.

## Active Case editor UX

The Production active Case editor has a compact lifecycle section near the bottom.

It shows:

```text
Active
Deactivate Case
```

The confirmation explains that learner availability is removed while questions, images, Topics, Tags, and history are retained.

After deactivation, Admin is redirected to the inactive recovery page instead of remaining on the active-only editor route.

## Inactive Case recovery UX

Inactive Production Cases are loaded through:

```text
/admin/cases/<caseId>/recovery
```

The recovery page is read-oriented. It shows:

- Case title;
- prominent `Inactive` status;
- stable Case ID;
- Primary Topic state;
- System context when resolvable;
- Tags, including inactive state where relevant;
- vignette when present;
- `Restore Case`.

Normal authoring forms are intentionally absent while the Case is inactive.

Showing stable identity is intentional because human-readable titles are not unique.

## Bulk lifecycle semantics

The lifecycle owner reuses the established Case bulk safety limit:

```text
60 Cases per operation
```

### Bulk deactivate

- selected Cases must all be active Production Cases;
- Preview-owned or already-inactive selections are rejected;
- the full selected set is validated before lifecycle writes;
- writes are submitted through the D1/Drizzle batch path.

### Bulk restore

- selected Cases must all be inactive Production Cases;
- every selected Case is restore-validated before any activation writes are built;
- one invalid Case fails the requested set instead of being silently skipped;
- writes are submitted through the D1/Drizzle batch path.

If database batch support is unavailable, the lifecycle owner fails closed rather than falling back to a sequential partial bulk mutation.

## Corrected-import invariant

A supported correction workflow is:

```text
Import v1
→ discover Case error
→ deactivate erroneous Case
→ correct the source/package
→ import corrected Case as a new content identity
```

The old inactive Case and corrected active replacement may legitimately have:

- exactly the same Case title;
- identical Question Prompt wording;
- similar images;
- the same diagnosis/Topic/Tags.

Therefore:

- Case title is **not** a lifecycle identity and is not made unique;
- `prompt_md` wording is **not** a lifecycle identity and is not globally deduplicated;
- lifecycle mutation is ID-based;
- restore/deactivate does not compare display text to infer duplicates;
- duplicate titles are made distinguishable by lifecycle state and Admin context, with stable Case ID available on the recovery page.

Import Package identity/versioning remains governed by the existing importer. PR #100 does not implement import replacement, rollback, title matching, prompt-text matching, or package-version redesign.

## Learner and historical behavior

The learner paths inspected in `src/lib/server/db/learning.js` already enforce active Production Case filtering in both:

- learner Case eligibility; and
- direct Case source loading when starting a new Review.

PR #100 preserves those filters.

Historical Review reads continue to use stored Review snapshots/provenance. Deactivating a Case does not rewrite or invalidate historical Reviews.

## Domain ownership

Canonical lifecycle behavior is owned by:

```text
src/lib/server/db/case-lifecycle.ts
```

That module owns:

- production ownership checks that intentionally see active or inactive Cases;
- single deactivate/restore;
- bulk deactivate/restore;
- restore validation;
- inactive recovery read data;
- the 60-Case bulk lifecycle limit/failure semantics.

Routes remain responsible for authorization, form parsing, translating domain errors, and redirect/feedback UX.

The existing active-production guard remains unchanged in `content-guards.js`.

## Tests added by PR #100

Focused lifecycle coverage verifies:

- single deactivation and idempotent retry;
- preservation of Case Questions, Topic relationships, Tags, Case Assets, Stimulus Groups/Options, Prompts, Assets, and Reviews;
- learner exclusion while inactive and eligibility after restore;
- active-only `requireProductionCase(...)` rejection of inactive Cases;
- Active/Inactive Case-library lifecycle filtering;
- Topic/System/Tag filtering, sorting, and pagination in inactive view;
- inactive recovery context;
- restore success and validation failures;
- failed restore leaves `is_active = false`;
- duplicate Case titles do not block lifecycle operations;
- identical Prompt wording across distinct Prompt IDs does not affect lifecycle operations;
- bulk validation, restore all-set validation, Preview ownership rejection, and 60-Case limit;
- shared editor lifecycle UX does not add Preview lifecycle authority;
- lifecycle domain has no media-storage/delete dependency.

Existing `test/admin-editor-preview-contract.test.js` remains part of repository validation and must stay green.

## Explicitly out of scope

PR #100 does not implement:

- permanent Case deletion;
- cascade cleanup;
- schema migration;
- production data migration;
- R2 deletion;
- shared Asset/Prompt deactivation;
- taxonomy redesign;
- import rollback;
- import replacement semantics;
- package identity changes;
- automatic duplicate matching;
- title uniqueness;
- prompt wording uniqueness/deduplication;
- Preview Case lifecycle mutation.

## Manual UI verification before merge

In a local development database, verify:

1. Active Case library opens by default and existing filters/sorts/pagination still work.
2. Select one or more active Cases and confirm `Deactivate selected` requires confirmation.
3. Confirm deactivated Cases disappear from Active and appear in Inactive with the badge.
4. Open an inactive Case and verify the recovery page shows the intended Case context and no normal edit forms.
5. Restore a valid Case and confirm redirect to the normal active editor with success feedback.
6. Make a test Case non-restorable by using an inactive/missing invalid Primary Topic state in local data and confirm the recovery page shows the actionable server error without activating the Case.
7. From the active editor, confirm `Deactivate Case` is visually secondary/destructive and confirmation copy is clear.
8. Confirm Preview editor does not show Production Case lifecycle controls.
9. Verify duplicate-title active/inactive Cases remain distinguishable in the library/recovery flow.

No production Case should be deactivated/restored as part of verification for this PR.
