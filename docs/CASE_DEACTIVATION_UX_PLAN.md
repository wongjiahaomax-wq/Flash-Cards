# Case Deactivation and Restore Admin UX

_Status: **implemented and merged in PR #100** (`19d0ecc59a9f23e86da9f9cc7182904ac9d8a6bb`). This document records the current Production Case lifecycle contract and the Case Library curation behavior added with that work._

_Last reconciled: 28 August 2026_

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

The existing `cases.is_active` column is the lifecycle state. No separate Case deletion-state model was added.

## Lifecycle semantics

### Active

```text
cases.is_active = true
preview_session_id IS NULL
```

An active Production Case is eligible for normal Admin authoring and, subject to learner-routing/question rules, learner study.

### Inactive

```text
cases.is_active = false
preview_session_id IS NULL
```

An inactive Production Case:

- is excluded from normal learner Case selection and new-Review source loading;
- is excluded from the default Active Case Library;
- remains stored with relationships/history intact;
- is unavailable to the normal active-only Case editor;
- is inspectable through the purpose-specific recovery surface;
- can be restored only after restore invariants pass.

## Deactivate means preserve

Deactivation changes only `cases.is_active`.

It does **not** delete, detach, deactivate, rewrite, or clean up:

- Case Questions or Question Prompts;
- Primary Topic or legacy inert secondary Topic relationships;
- Case Tags;
- fixed Case Assets;
- Stimulus Groups/Options;
- reusable image-question relationships;
- shared/global Assets or Prompts;
- R2 objects;
- historical Reviews;
- Review Questions/Assets;
- Review snapshots/provenance.

Permanent Case deletion remains out of scope.

## Production / Preview boundary

Production lifecycle operations require:

```text
preview_session_id IS NULL
```

Preview-owned Cases are rejected.

`requireProductionCase(...)` retains its established meaning: **active Production Case**. Inactive recovery uses a separate lifecycle read/mutation path rather than weakening that guard.

The shared Production/Preview Case editor does not grant Preview lifecycle authority.

## Restore validation

Restore is not a blind `UPDATE cases SET is_active = true`.

Before activation, the lifecycle domain validates that:

1. the Case exists;
2. it is Production-owned;
3. it has exactly one `role = 'primary'` relationship;
4. the referenced Primary concept exists;
5. that concept is classified as a Topic, not a System;
6. that Topic is active.

The pre-migration-0015 compatibility layer is retained so recovery/restore does not directly assume `concepts.kind` exists on older compatible local/production-shaped databases.

If an invariant fails, the Case remains inactive and Admin receives an actionable error.

Single restore is safely idempotent when the same Case is already active.

## Case Library UX

The Case Library has explicit lifecycle views:

```text
Active | Inactive
```

Active remains the default.

### Active view

Current active-only mutation surfaces include:

- bulk Primary Topic assignment;
- Deactivate selected;
- inline Case Tag editing;
- bulk Case Tag curation.

### Inactive view

Inactive rows preserve classification/Tag context for recovery but remain read-only for ordinary authoring.

The view supports:

- recovery inspection;
- validated single restore;
- Restore selected.

Inactive Tag filtering includes retained inactive Tag context so filters correspond to what recovery rows display.

## Bulk lifecycle behavior

Bulk lifecycle operations retain the established maximum of 60 unique Case IDs.

They:

- require the complete requested set to be valid before lifecycle writes;
- require Production ownership;
- preserve the D1/Drizzle batch path;
- fail closed when the required batch behavior is unavailable;
- do not partially reinterpret invalid Cases as a smaller successful request.

## Inline Case Tag curation added in PR #100

Active Case rows provide direct Tag editing without opening the full Case editor.

Admin may:

- attach an existing active canonical Tag;
- remove an attached Tag;
- create a new canonical Tag and attach it immediately.

Canonical Tag rename/deactivation remains on the dedicated Tag administration surface.

Inactive rows keep Tag context but expose no Tag mutation controls.

## Bulk Case Tag curation added in PR #100

For selected active Production Cases, the bulk Tag editor describes each Tag membership as:

```text
All
Some
None
```

Admin may:

- Add to all;
- Remove from all;
- Create & add to all.

Important invariants:

- maximum 60 unique selected Cases;
- active Production Cases only;
- Preview/inactive/missing Cases fail the complete requested set before relationship writes;
- add/remove is idempotent for mixed membership;
- unrelated Case Tags are preserved;
- existing-Tag operations require an active canonical Tag;
- create-and-add reuses canonical Tag normalization/duplicate validation;
- if the newly created Tag cannot be attached, cleanup prevents a misleading orphan from being left by that failed operation;
- Tag curation changes Case↔Tag membership only; it does not change Primary Topic, Question Tags, Shared Questions, or System↔Tag exposure.

## Duplicate/re-import behavior

Lifecycle identity is Case ID, not title or Prompt wording.

An inactive erroneous Case and a corrected active replacement may legitimately share title/Prompt wording. Deactivation does not create a title/Prompt uniqueness contract and does not itself block a corrected re-import on wording alone.

## Explicitly out of scope

- permanent Case deletion;
- cascade cleanup / R2 garbage collection;
- import rollback/replacement semantics;
- automatic duplicate matching;
- Case-title or Prompt-text uniqueness;
- taxonomy redesign;
- global Tag rename/deactivation from the Case Library;
- System↔Tag exposure editing from the Case Library;
- editing Tags on inactive Cases;
- Preview lifecycle redesign;
- historical Review rewrites;
- production deployment/data mutation merely to implement the UX.

## Authority

For current behavior, use:

1. `src/lib/server/db/case-lifecycle.ts` and current Case Library routes/components;
2. `V1_DATA_MODEL.md` / `AUTHORING_MODEL.md` for classification semantics;
3. this document for lifecycle/UX rationale;
4. PR #100 history for implementation/review context.
