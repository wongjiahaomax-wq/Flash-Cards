# Import Package Final Preview and History Cleanup Plan

_Status: amended implementation plan on Draft PR #167. Implementation has not started. The PR remains Draft and is reconciled onto current `main` at `7988bd7a01caa82f58d1bc09849fd6fa1b9a8a74` before coding._

## Goal

Improve **Admin → Import package** in two focused ways:

1. after a ZIP passes the existing **Validate and preview** step, show an easy-to-scan read-only **package-declared content preview** for the exact ZIP that passed server validation; and
2. let a Production Admin remove old terminal import-job history from **Durable progress → Current / recent imports** without deleting imported Flash-Cards content, Reviews, learner progress, or learner-served media.

The intent is a final human sanity check plus low-risk operational housekeeping. This is not a redesign of Import Package v1, resumable execution, slide-review tooling, Production/Preview authority, domain-content deletion, schema, migrations, or teaching-media ownership.

## Reconciled baseline

This plan is reconciled against current `main` at:

```text
7988bd7a01caa82f58d1bc09849fd6fa1b9a8a74
```

The intervening Case-editor work is unrelated to the importer and does not change this design.

At this baseline, `/admin/import` already has the safe two-step gate:

```text
1. Validate and preview exact ZIP
   - hardened package/static validation
   - no D1/R2 writes
   - short-lived HttpOnly SHA-256 marker

2. Re-select exact ZIP + explicit confirmation
   - SHA-256 must match the successful preview
   - only then create/stage the durable resumable import job
```

The route currently loads only the 10 newest `import_jobs`. `complete` and `cancelled` are terminal. Failed jobs remain recoverable/resumable and retain staging by design.

Current import staging can contain:

```text
imports/staging/<job-id>.zip
imports/staging/<job-id>.plan.json
imports/staging/<job-id>/media/<asset-id>  (one per staged create Asset)
```

The current cleanup helper lists staged media and deletes media objects individually. Therefore bulk cleanup must be bounded by actual storage work, not merely by a row count.

## Non-negotiable safety invariants

### Preview authority

- The existing hardened Production Import Package v1 parser/static validator remains authoritative for whether the ZIP is structurally valid.
- Step 1 remains **no-write to D1 and R2**.
- The browser display helper is never an authoritative validator and must not broaden or narrow package acceptance.
- The final surface must be described as the exact **package-declared content preview** for the successfully validated ZIP, with database conflicts/existing-object validation still pending.
- Step 2 retains the existing server-side exact-ZIP SHA-256 equality gate and remains authoritative for import start.
- No Production DB reads are added merely to beautify `use` previews.
- No edits, approvals, warning overrides, source-slide review, package mutation, or medical reconciliation are introduced on `/admin/import`.
- No Preview Admin authority expansion is introduced.

### `create`, `use`, `skip` semantics

- `create` package fields are authoritative package declarations for the object that would be created if later DB validation succeeds.
- `use` is a no-write reference to an existing Production object. Optional package title/prompt/answer/Asset metadata/CaseAsset caption/order fields are **not** authoritative descriptions of the current Production row unless the existing package contract explicitly validates identity for that field.
- A `use` item must therefore render primarily as an existing Production reference, e.g. type + `applicationId`. Optional package text may be shown only in a clearly labelled **non-authoritative package note** area if retaining it is useful for inspection.
- The package cannot establish the current active/inactive state of a `use` object. Do not display package `isActive` as current Production state for `use`.
- `skip` remains represented in counts but is excluded from learner-content preview.

### History cleanup

- Only `complete` and `cancelled` `import_jobs` rows are removable as history.
- `validating`, `ready`, `importing`, and `failed` jobs remain non-removable through history cleanup.
- Failed jobs retain the existing Retry/resume or Cancel path and staging needed for recovery.
- Cancellation semantics do not change: cancelling stops future import work and does not roll back committed domain chunks.
- History cleanup may touch only the target job's private import-staging objects plus its operational `import_jobs` row.
- Imported Topics, Cases, Questions, relationships, Assets, Reviews, learner progress, and learner-served R2 teaching media are never deleted by this feature.
- Staging cleanup completes **before** the status-qualified D1 row delete for each job.
- Never delete a D1 row for a job whose full private staging cleanup was not completed.
- Cleanup safety is per job. Failure for job B must not force unsafe deletion of B, but must not head-of-line block independently safe job A.
- No schema migration is introduced.

## Proposed UX

## 1. Step 1 package-declared content preview

Keep the existing package count panel. Directly below it, render a compact, scrollable final preview.

Suggested copy:

```text
Package-declared content preview
Read-only view of the exact ZIP that passed package validation.
Existing Production references and database conflicts are validated later.
```

For package-declared `create` Case content, show:

- Case title;
- vignette;
- active/inactive state;
- `questionSelectionMode`;
- `questionCount` when present/applicable;
- primary Topic declaration/reference;
- fixed Case Assets in declared display order;
- CaseAsset caption where authoritative for the create relationship;
- learner image for create Assets where available;
- full Case Question prompt/answer content;
- compact active/inactive metadata for behavior-bearing create records/relationships where the manifest supports it.

If Topic Questions are present, render a separate compact **Topic Questions** section and include:

- prompt/answer package content for create relationships;
- active/inactive state for authoritative create records;
- `inheritToDescendants` for create Topic Questions.

The preview may show every package-declared Q&A for inspection, but the UI must not imply that every displayed question necessarily appears in every learner Review. Case `questionSelectionMode`/`questionCount` are behavior-bearing and must be visible enough to explain that distinction.

### `use` display

Render `use` as an existing Production reference, for example:

```text
Existing Production Case · <applicationId>
Existing Production Question Prompt · <applicationId>
Existing Production Asset · <applicationId>
```

Do not describe optional package title/prompt/answer/Asset metadata/caption/order as the content that will be imported or as the current Production object's authoritative state.

If optional package text is retained for diagnostic value, label it explicitly, e.g.:

```text
Package note (non-authoritative for existing Production object)
```

Do not add DB reads to resolve current Production text or active state.

### Presentation priorities

- optimized for one-pass visual inspection, not a second approval workflow;
- all package-declared Q&A expanded by default;
- images large enough to inspect without a modal;
- no technical IDs in the primary reading flow except where needed to identify `use` references;
- preserve normalized manifest order;
- Case Assets ordered by `displayOrder` with stable manifest order as deterministic tie-breaker;
- safe text rendering only; no unsanitized package Markdown through `{@html}`;
- no implication that static preview has completed DB conflict/existing-object validation.

## 2. Server presentation model

Build a small read-only presentation model from the already parsed/normalized manifest after the current hardened parse/static-validation path.

Illustrative shape only; this is not a persisted schema:

```js
{
  cases: [
    {
      id,
      operation,
      applicationId,
      packageDeclared: {
        title,
        vignetteMd,
        isActive,
        questionSelectionMode,
        questionCount
      },
      primaryTopic: {
        operation,
        applicationId,
        packageDeclaredName,
        packageDeclaredIsActive
      } | null,
      assets: [
        {
          relationId,
          relationOperation,
          relationApplicationId,
          packageDeclaredDisplayOrder,
          packageDeclaredCaptionMd,
          packageDeclaredIsActive,
          asset: {
            id,
            operation,
            applicationId,
            packageDeclaredPath,
            packageDeclaredMimeType,
            packageDeclaredAltText,
            packageDeclaredIsActive
          }
        }
      ],
      questions: [
        {
          id,
          operation,
          applicationId,
          packageDeclaredAnswerMd,
          packageDeclaredIsActive,
          prompt: {
            id,
            operation,
            applicationId,
            packageDeclaredPromptMd,
            packageDeclaredIsActive
          }
        }
      ]
    }
  ],
  topicQuestions: [
    {
      operation,
      applicationId,
      packageDeclaredAnswerMd,
      packageDeclaredIsActive,
      packageDeclaredInheritToDescendants,
      prompt: { ... }
    }
  ]
}
```

Implementation may use a smaller shape. The important rules are:

- derive only from the authoritative normalized package plan;
- do not mutate the manifest;
- do not include media bytes;
- keep deterministic ordering;
- for `create`, expose behavior-bearing package metadata needed to understand the learner result;
- for `use`, ensure the UI can distinguish the authoritative reference identity from optional non-authoritative package text/metadata;
- do not claim package `isActive` is current state for `use`;
- omit skipped learner content from the content surface while retaining existing count information;
- no DB reads solely for preview beautification.

Use a pure helper with executable unit coverage rather than inline mapping in the Svelte page.

## 3. Exact-local-ZIP display support

Do not return image bytes/base64 through the SvelteKit action and do not stage preview media in R2.

After successful server validation:

1. retain the exact browser `File` snapshot submitted for that Step-1 request;
2. server returns existing counts/warnings/package ID plus successful package SHA-256 and the presentation model;
3. client hashes the retained exact File with `crypto.subtle`;
4. local display is accepted only when the local digest equals the successful server digest;
5. a display-only ZIP reader extracts only declared create-Asset media needed by the rendered package relationships;
6. Blob/Object URLs are revoked when invalidated/replaced/destroyed.

### Supported ZIP variants

The browser display reader must support the ordinary ZIP entry compression modes accepted by the hardened Production parser:

```text
method 0  — stored
method 8  — deflated
```

`Image preview unavailable` is reserved for a genuine local display/decompression/runtime failure after server validation, not as a substitute for supporting a normal valid Package-v1 ZIP.

The display reader must:

- select the exact declared path only;
- reject/handle malformed local ZIP structure safely;
- never fall back to a similarly named entry;
- never infer package validity;
- enforce bounded extraction using the already server-validated package limits/metadata rather than inventing a second acceptance contract;
- avoid decompressing unrelated entries;
- fail the affected image display cleanly if local decompression/display is unavailable.

Do not import `tools/slide-import-review` into the Production Svelte app and do not broaden this into a shared ZIP architecture refactor.

Executable helper coverage must include at least:

- stored entry extraction;
- deflated entry extraction;
- exact path selection;
- local/server digest mismatch;
- malformed ZIP/display failure;
- unavailable decompression/display handling;
- bound enforcement derived from the server-accepted package limits.

## 4. Explicit Step-1 preview state machine

Step 1 requires enhanced submission because the selected browser `File` must remain available after action completion.

Use an explicit state model. Exact names may vary, but behavior must be equivalent to:

```text
empty
  no Step-1 file selected; no accepted preview

selected
  Step-1 File snapshot selected but not yet accepted

previewing
  one exact File snapshot is currently submitted
  no second Step-1 preview request may be issued

accepted
  server response + successful digest + presentation model are bound to the same File generation
  local digest matched
  Blob URLs belong only to this accepted generation

failed/display-error
  request or local display failed
  no stale accepted state may be resurrected
```

### Required transition rules

- Prefer **preventing overlapping Step-1 requests**. Disable/reject another Step-1 preview submission while one is in flight.
- Bind every request/result to a monotonically increasing client selection/request generation and the exact `File` object snapshot submitted.
- A Step-1 file change immediately:
  - increments/invalidate generation;
  - clears accepted preview/model/digest for the old selection;
  - revokes all old Blob URLs;
  - resets confirmation;
  - ensures an older in-flight response cannot restore the old preview.
- If request A was started for File A and the user selects File B before A resolves, A's response is stale and must be ignored for client acceptance/display.
- Because the preview cookie is HttpOnly response state, the UI must not create overlapping Step-1 requests that can race which digest is written by response order. The server SHA gate remains authoritative if cross-tab activity changes the cookie.
- While Step 1 is in flight, Step 2 must not behave as though a newer file selection has passed preview.
- Step-2 file selection is a separate state concern: selecting/reselecting the Step-2 file must **not** erase a valid accepted Step-1 preview.
- Step-2 confirmation may still reset when appropriate, but do not couple that reset to destruction of the accepted Step-1 preview.
- A stale action response must never restore confirmation, content model, digest, or Blob URLs.

Executable client/state coverage must explicitly exercise:

- A preview submitted → select B before A response → A cannot restore accepted state;
- overlapping Step-1 submission prevention/reconciliation;
- accepted preview → Step-2 file selected → accepted Step-1 preview remains;
- stale Blob URL revocation;
- local digest mismatch prevents local content/media acceptance.

## 5. Step 2 remains the import gate

Do not collapse Step 1 and Step 2.

Step 2 remains:

```text
Package ZIP [choose exact ZIP again]
[ ] I reviewed the preview and explicitly confirm this exact import package.
Start resumable import
```

The existing server-side SHA-256 cookie comparison remains authoritative before staging/domain writes.

The local digest check exists only to ensure that the displayed browser content/media corresponds to the successful Step-1 server result. It never authorizes import.

## Durable progress cleanup UX

## 6. Global history snapshot and eligibility

The visible list remains the newest 10 jobs, but cleanup eligibility must be derived globally from the server, not from those 10 rows.

Create/reuse a focused server helper that returns an authoritative history snapshot such as:

```js
{
  jobs: newestTenSerializedJobs,
  hasEligibleTerminalHistory: boolean
}
```

`hasEligibleTerminalHistory` must be true when **any** eligible `complete`/`cancelled` row exists, including rows older than the visible 10.

Use this snapshot for:

- initial `load`;
- successful individual cleanup response;
- successful/partial bulk cleanup response;
- any history refresh path introduced by this PR.

Do not locally filter removed IDs and assume the remaining visible list is authoritative. Reload/requery the newest 10 after cleanup so the former 11th row backfills immediately.

If a visible job becomes `complete` or `cancelled` through the existing processing/cancel flow, update client `hasEligibleTerminalHistory` immediately to true without requiring a full page refresh.

`Clear old imports` remains available when the newest 10 contain no terminal row but older eligible history exists.

## 7. Per-job `Remove from history`

For each visible `complete` or `cancelled` job, show a small history-removal control with explicit non-destructive copy, e.g.:

```text
Remove from history
Imported content will not be deleted.
```

Do not show the control for `validating`, `ready`, `importing`, or `failed` jobs.

A failed job becomes eligible only after the existing Cancel flow moves it to an eligible terminal state.

## 8. `Clear old imports`

Show **Clear old imports** whenever server-derived global terminal eligibility is true.

Confirmation must explicitly state:

```text
Remove completed/cancelled import records from history?
Imported Flash-Cards content will not be deleted.
Failed or active resumable imports will be kept.
```

The action operates on a bounded server-selected set; the client never submits arbitrary eligible IDs as authority.

## 9. History actions must be isolated from SvelteKit import action state

The existing `form` action data is used for package preview/start flow. New history mutations must not replace or clear that valid preview state.

Use isolated enhanced/fetch handling for history mutations, equivalent to the existing explicit `fetch` + `deserialize` pattern used by processing actions.

Maintain separate state, for example:

```text
previewRequestInFlight
processingRequestInFlight / runningJobId
historyMutationInFlight / historyMutationError
```

Exact names are flexible. Required behavior:

- history cleanup must not write through the page-level `form` preview state;
- history cleanup must not clear/replace a valid accepted package preview;
- history cleanup must not reuse `requestInFlight` in a way that pauses, clears, blocks, or falsely unlocks an unrelated active import-processing loop;
- processing job state and history-mutation state remain independently fenced;
- cleanup may disable its own relevant controls while in flight, without globally disabling unrelated process/resume/pause behavior unless a concrete shared safety reason exists.

Executable client/state coverage must include removing/clearing history while another job is actively processing and prove that the processing loop remains correctly locked/running.

## Backend history cleanup design

## 10. Canonical staging identity is required before deletion

Before cleaning staging for a terminal job, validate persisted staging identity.

For every candidate row:

```text
expected = importPackageStorageKey(job.id)
recorded = job.package_storage_key
```

Require:

```text
recorded === expected
```

unless implementation evidence identifies an explicitly supported historical canonical form that must remain valid. Do not invent compatibility forms speculatively.

If the persisted key differs:

- fail closed for that job;
- do not delete the arbitrary recorded key;
- do not clean only the ID-derived canonical location and then hide the row;
- retain the D1 row so a possible staging orphan remains visible/recoverable;
- report a focused canonical-key mismatch error.

Cover this in both single and bulk cleanup tests.

## 11. Single terminal-history removal

Semantic flow:

1. fetch job by ID;
2. require job exists;
3. require status `complete` or `cancelled`;
4. require persisted `package_storage_key` to match `importPackageStorageKey(job.id)`;
5. perform full idempotent private staging cleanup for that job;
6. only after cleanup succeeds, run D1 delete with:

```sql
WHERE id = ? AND status IN ('complete', 'cancelled')
```

7. require exactly one row change or fail closed;
8. return removed ID/status plus an authoritative refreshed history snapshot.

Do not call teaching-image deletion helpers.

If staging cleanup fails, retain the D1 row.

## 12. Bulk cleanup bounded by actual storage work

A job-count limit alone is insufficient. One resumable job may own the ZIP, plan sidecar, and many staged create-Asset objects. Current Package v1 allows up to 256 archive entries, and current staging cleanup may perform one R2 delete per media object.

Define a conservative **request work budget** in addition to a maximum candidate-job count.

The implementation may choose the smallest robust design supported by the current storage path, for example:

```text
max candidate jobs per request
+
max listed/deleted staging object operations per request
```

or bounded R2 multi-delete if the established Worker binding/storage helper path supports it cleanly and tests can model it.

Requirements regardless of mechanism:

- the request cannot launch thousands of unbounded R2 operations merely because it selected a fixed number of jobs;
- budget accounting includes package ZIP, plan sidecar, list pages, and staged media deletes as relevant to the chosen helper;
- stop selecting/processing new jobs before exceeding the request budget;
- a single selected job is never D1-deleted until its **entire** private staging cleanup is complete;
- if a job cannot be fully cleaned within the bounded request strategy, leave its D1 row intact and return it as retained/failed/deferred as appropriate;
- return authoritative `hasMore`/global eligibility after the bounded attempt.

Do not hard-code `20 jobs` as the sole bound.

Prefer a conservative initial budget over maximizing records cleared per click.

## 13. Bulk cleanup is per-job partial success, not batch all-or-nothing

Process server-selected eligible jobs independently within the request budget.

For each job:

```text
validate terminal status
→ validate canonical storage identity
→ fully clean private staging
→ status-qualified D1 delete
→ record removed ID
```

If one job fails at canonical validation or R2 cleanup:

```text
retain that row
record failed ID/error
continue with later independent jobs only while request budget remains
```

A failure in job B must not roll back or prevent a safely completed deletion of job A.

Return a result shape sufficient for the UI/tests, for example:

```js
{
  removedIds: [...],
  failed: [{ id, error }],
  deferredIds: [...], // only if useful for work-budget reporting
  history: {
    jobs: newestTen,
    hasEligibleTerminalHistory
  }
}
```

Exact shape may follow route conventions.

Do not repeatedly reprocess already-removed jobs on retry.

## 14. Admin route actions

Add named individual and bulk history actions under `/admin/import`.

Requirements:

- same Production Admin authorization as existing import actions;
- require both DB and MEDIA bindings because safe removal includes private staging cleanup;
- reuse current `packageError()`/action error conventions where applicable;
- executable action tests invoke the actual action functions rather than relying only on regex/source inspection;
- actions return authoritative refreshed history state after mutation;
- no domain-content deletion endpoint is added.

## Implementation tranches for Luna / Codex

Continue this same Draft PR/branch. Do not create another PR. Implement only after confirming the branch is still based on current `main`; if `main` moves again before coding, reconcile before implementation and final validation.

### Tranche 1 — Lock current behavior and test harnesses

- inspect current route/action/runtime tests through repository progressive retrieval;
- characterize existing no-write Step-1 behavior;
- characterize existing Step-2 exact-SHA gate;
- characterize current job terminal/recoverable statuses and staging cleanup idempotency;
- establish executable route-action harnesses for named actions;
- establish the smallest client/helper/state test surface needed for Step-1 state-machine and history-state behavior.

Static source/regex contracts may remain supplemental but must not be the primary proof for new runtime behavior.

### Tranche 2 — Pure package presentation model

- add a pure normalized-manifest → preview-model helper;
- make `create` content authoritative only as package-declared content;
- render `use` as existing-object references with optional package text explicitly non-authoritative;
- do not expose `use.isActive` as current Production state;
- include authoritative create behavior metadata: active/inactive state, Case `questionSelectionMode`/`questionCount`, Topic Question `inheritToDescendants`;
- preserve ordering and skip behavior;
- update `previewResumableImport()` to return the presentation model plus successful digest/counts/warnings without changing parser authority.

Focused executable tests cover create/use/skip semantics, inactive create content, Case selection metadata, Topic Question inheritance, ordering, and absence of DB lookup.

### Tranche 3 — Step-1 enhanced submission/state machine

- retain exact submitted File snapshot;
- prevent overlapping Step-1 preview submissions;
- add generation/snapshot reconciliation so stale responses cannot restore preview state after a file change;
- keep Step-2 file selection independent of accepted Step-1 preview;
- revoke old Blob URLs on Step-1 invalidation/replacement/destruction;
- keep server SHA cookie authoritative.

Executable state tests cover A→B-before-A-response, overlap prevention, stale response rejection, Step-2 selection preservation, digest mismatch, and Blob URL revocation.

### Tranche 4 — Browser ZIP display helper and preview UX

- support both stored and deflated entries accepted by Production parser;
- extract only exact declared create-Asset media paths;
- enforce bounded display extraction using server-validated limits/metadata;
- fail individual media display clearly on genuine malformed/unavailable display cases;
- render compact package-declared Cases/images/Q&A plus behavior-bearing metadata;
- do not imply all displayed Case Questions appear in every learner Review;
- keep all answers visible by default;
- preserve safe text rendering.

Focused helper tests include stored/deflated/exact-path/digest-mismatch/malformed/unavailable cases.

### Tranche 5 — Authoritative history snapshot + single cleanup

- add/reuse one server helper for newest 10 jobs + global terminal-history eligibility;
- use it for `load` and history mutation responses;
- implement single terminal-history removal;
- require canonical `package_storage_key` identity;
- clean staging first, then status-qualified D1 delete;
- return refreshed newest-10 snapshot and eligibility.

Executable tests cover complete/cancelled success, all ineligible statuses, canonical mismatch, R2 failure, binding guards, Admin auth, backfill of the 11th row, and domain/teaching-media survival.

### Tranche 6 — Bounded partial-success bulk cleanup

- replace the original job-count-only concept with a conservative actual-storage-work budget;
- server selects eligible jobs; client IDs are not authority;
- process each job independently;
- continue after an unrelated job failure while budget remains;
- never delete a row whose full staging cleanup did not complete;
- return removed/failed/deferred information as useful plus authoritative refreshed history and global eligibility.

Executable tests cover off-screen terminal eligibility, budget stopping, partial success, canonical mismatch among otherwise valid jobs, storage failure among otherwise valid jobs, `hasMore`/eligibility, and no unsafe D1 deletion.

### Tranche 7 — Isolated history UI/action state

- add per-card `Remove from history`;
- add globally eligible `Clear old imports` control;
- use isolated fetch/enhanced handling rather than page `form` state;
- keep valid package preview intact across history mutations;
- keep history mutation in-flight state independent from active processing loop state;
- after cleanup, replace visible jobs with authoritative newest-10 snapshot rather than filtering IDs locally;
- when a visible job becomes complete/cancelled, update global terminal eligibility immediately.

Executable client/state tests cover cleanup while another import is processing and off-screen/backfill behavior.

### Tranche 8 — Documentation reconciliation and validation

After implementation:

- update `docs/CONTENT_IMPORT_PACKAGES.md` for package-declared final preview semantics, `use` reference authority, Step-1 state/digest behavior, and terminal-history cleanup;
- update `docs/RESUMABLE_IMPORT_RUNTIME_SAFETY.md` for staging-first terminal-history cleanup, canonical-key validation, per-job partial-success semantics, and failed/active recoverability;
- update `docs/R2_COST_GUARDRAILS.md` because it owns R2 deletion authority and this PR adds a new terminal-history staging-cleanup path; document the bounded R2 operation-work requirement and per-job fail-closed deletion boundary;
- update `docs/DOCUMENTATION_INDEX.md` to classify `IMPORT_PACKAGE_FINAL_PREVIEW_AND_HISTORY_CLEANUP_PLAN.md` as the historical PR #167 planning record once implementation is complete;
- update this plan status only when implementation is complete, using precise wording such as:

```text
implemented on Draft PR #167 branch
```

rather than ambiguous `implemented` before merge;
- preserve existing slide-review documentation boundaries; do not claim the Production Admin performs source reconciliation.

Validation must include:

- focused executable helper/action/client/runtime tests introduced by this PR;
- `npm run agent:checks -- --compact` and the repository-required final validation set;
- storage/runtime-specialized validation required by repository guidance because R2 deletion behavior changes, including `npm run runtime:smoke` when applicable to the current repository/runtime guidance;
- exact-head CI/final validation after reconciliation with current `main`.

Do not stop at static Svelte/source checks.

## Focused executable coverage matrix

### Preview / presentation

Prove:

- invalid ZIP still fails through the existing hardened parser;
- valid ZIP returns existing count preview plus package-declared presentation model and digest;
- Step 1 still writes neither D1 nor R2;
- `use` fields are not presented as authoritative existing Production content;
- `use` active state is not asserted from package data;
- create inactive state is visible;
- create Case `questionSelectionMode`/`questionCount` are represented;
- create Topic Question `inheritToDescendants` is represented;
- displayed Q&A does not imply every question appears in every Review;
- stored and deflated create-Asset media display correctly;
- exact media path selection is enforced;
- local digest mismatch prevents accepted local display;
- malformed/unavailable local extraction has deterministic fallback behavior;
- A-preview → select-B-before-response cannot restore A;
- overlapping Step-1 preview requests are prevented/reconciled;
- stale Blob URLs are revoked;
- Step-2 file selection preserves accepted Step-1 preview;
- Step 2 still rejects a SHA mismatch against the server HttpOnly preview digest.

### Route actions

Executable tests must invoke the new individual and bulk action functions and cover:

- Production Admin authorization;
- DB binding guard;
- MEDIA binding guard;
- complete/cancelled eligibility;
- validating/ready/importing/failed rejection;
- successful staging-first cleanup;
- R2 cleanup failure retains row;
- canonical storage-key mismatch retains row and does not delete arbitrary key;
- refreshed newest-10 history snapshot;
- global off-screen terminal eligibility;
- visible-list backfill after removal.

Static route/source inspection may supplement these tests only.

### Bulk runtime

Prove:

- server-side candidate selection;
- actual storage-work bound in addition to job count;
- per-job partial success;
- one failed/canonical-mismatch job does not block later independently safe jobs within budget;
- a job whose staging cleanup did not fully complete is never D1-deleted;
- removed IDs and failed errors are returned as appropriate;
- authoritative `hasMore`/global eligibility remains accurate;
- imported domain rows and learner media are untouched.

### Client/history state

Prove:

- history mutation does not replace/clear valid package preview;
- history mutation state is independent from `requestInFlight`/active import-processing loop;
- cleanup while another job is actively processing does not pause, unlock, or clear that loop;
- visible job transitioning to complete/cancelled enables terminal cleanup without refresh;
- cleanup response replaces visible jobs with authoritative newest-10 snapshot and can backfill the 11th row;
- Clear old imports remains visible when eligible rows exist only off-screen.

## Likely implementation surface

Use current routing/repository guidance as authority; exact filenames may evolve.

Expected core surface:

- `src/routes/admin/import/+page.svelte`
- `src/routes/admin/import/+page.server.js`
- `src/lib/server/import/resumable-content-package.js`
- `src/lib/server/import/resumable-content-package-runtime.js`
- `src/lib/server/storage/import-packages.js` or the established import-staging storage helper path
- a small browser-only import-preview media/state helper under normal app source if needed
- directly related executable import/Admin/client tests
- `docs/CONTENT_IMPORT_PACKAGES.md`
- `docs/RESUMABLE_IMPORT_RUNTIME_SAFETY.md`
- `docs/R2_COST_GUARDRAILS.md`
- `docs/DOCUMENTATION_INDEX.md`

Do not modify `tools/slide-import-review` unless implementation evidence establishes a genuinely shared boundary; this PR concerns Production Admin final package inspection, not source-slide review.

## Explicit non-goals

Do not include:

- Import Package v2 or manifest schema changes;
- migrations or `import_jobs` schema changes;
- Production DB reads solely to decorate `use` previews;
- automatic medical/content review;
- editing package content on the Import page;
- source-slide provenance/warning UI;
- importing the review bundle directly;
- replacing or redesigning the slide reviewer;
- Preview Admin import authority;
- rollback/deletion of imported Cases/Questions/Topics/Assets;
- Review/learner-progress cleanup;
- teaching-image garbage collection;
- changing resumable chunk budgets/leases;
- background/async import execution;
- auto-clearing failed imports;
- unbounded historical cleanup;
- generic R2 deletion helpers that blur object ownership classes;
- unrelated Admin visual redesign.

## Acceptance criteria

PR #167 is implementation-ready under this plan and is ready for final review only after implementation when all of the following are true:

1. A valid Package-v1 ZIP produces the existing static/count preview plus a safe package-declared Case/image/Q&A preview.
2. `use` objects are shown as existing Production references; optional package text/metadata is not presented as authoritative Production content/state.
3. Create behavior-bearing metadata includes active/inactive state, Case `questionSelectionMode`/`questionCount`, and Topic Question `inheritToDescendants` where applicable.
4. The surface explicitly leaves DB conflict/existing-object validation pending and does not imply every displayed Case Question appears in every learner Review.
5. Step 1 remains no-write to D1/R2 and cannot accept stale/concurrent preview state.
6. Stored and deflated create-Asset media can be displayed from the exact local ZIP after digest match, with bounded exact-path extraction.
7. Step-2 file selection does not erase accepted Step-1 preview, and Step 2's server SHA gate remains unchanged/authoritative.
8. History mutations use isolated client/action state and do not disturb package preview or an unrelated active processing loop.
9. The page has an authoritative newest-10 history snapshot plus server-derived global terminal eligibility, including off-screen eligible rows and backfill after cleanup.
10. Single cleanup validates canonical staging identity, fully cleans private staging first, then status-qualified deletes the D1 row.
11. Bulk cleanup is bounded by actual storage work as well as candidate count and supports per-job partial success rather than batch all-or-nothing behavior.
12. No job row is deleted when canonical staging identity mismatches or full private staging cleanup fails.
13. History cleanup never deletes imported domain content, Reviews, learner progress, or learner-served teaching media.
14. Executable action/helper/client/runtime tests cover the review matrix above; source/regex contracts remain supplemental only.
15. `CONTENT_IMPORT_PACKAGES.md`, `RESUMABLE_IMPORT_RUNTIME_SAFETY.md`, `R2_COST_GUARDRAILS.md`, and `DOCUMENTATION_INDEX.md` are reconciled after implementation, with this file classified as the historical PR #167 planning record.
16. Repository-required final validation plus storage/runtime-specialized validation, including `runtime:smoke` when applicable, is green at the exact implemented head against current `main`.
17. The same PR remains Draft until a deliberate implemented base→head final review says it is ready.

## Handoff

When coding starts, continue **Draft PR #167 and this existing branch**. Do not create a replacement PR and do not restart from `main` except as required to reconcile this branch with a newer `main` head.

Inspect actual current repository state, use repository progressive retrieval, implement tranche-by-tranche, and preserve every invariant above.

The amendment does not materially change the established scope boundaries; it makes the preview authority, state-machine concurrency, history-state isolation, storage-work bounds, canonical staging identity, partial-success semantics, executable coverage, documentation ownership, and base reconciliation explicit. No additional deliberate planning review is required before implementation unless implementation discovery forces one of those boundaries to change. Reserve the next full review for the implemented base→head diff.