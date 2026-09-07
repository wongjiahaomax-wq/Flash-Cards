# Import Package Final Preview and History Cleanup Plan

_Status: amended implementation plan on Draft PR #167. Implementation has not started. The PR remains Draft and is reconciled onto `main` at `7988bd7a01caa82f58d1bc09849fd6fa1b9a8a74` before coding._

## Goal

Improve **Admin → Import package** in two focused ways:

1. after a ZIP passes the existing **Validate and preview** step, show an easy-to-scan, read-only **package-declared content preview** for the exact ZIP that passed server validation; and
2. let a Production Admin remove old terminal import-job history from **Durable progress → Current / recent imports** without deleting imported Flash-Cards content, Reviews, learner progress, or learner-served media.

The intent is a final human sanity check plus low-risk operational housekeeping. This is not a redesign of Import Package v1, resumable execution, slide-review tooling, Production/Preview authority, domain-content deletion, schema, migrations, or teaching-media ownership.

## Reconciled baseline

This plan is reconciled against `main` at:

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

The current `deleteStagedImportPackage()` helper has two relevant characteristics:

- with normal R2 `list()` support, it lists staged media and deletes media objects individually; and
- without `list()`, it has a compatibility fallback that deletes only the exact ZIP.

That fallback is not sufficient proof of full staging cleanup for destructive history deletion. History cleanup therefore needs a strict path that can prove ZIP + plan + staged media cleanup before the D1 row is removed.

## Non-negotiable safety invariants

### Preview authority

- The existing hardened Production Import Package v1 parser/static validator remains authoritative for whether the ZIP is structurally valid.
- Step 1 remains **no-write to D1 and R2**.
- The browser display helper is never an authoritative validator and must not broaden or narrow package acceptance.
- The final surface is the exact **package-declared content preview** for the successfully validated ZIP, with database conflict/existing-object validation still pending.
- Step 2 retains the existing server-side exact-ZIP SHA-256 equality gate and remains authoritative for import start.
- No Production DB reads are added merely to beautify `use` previews.
- No Production R2 reads are added merely to compare preview media against an already-existing deterministic Asset object.
- No edits, approvals, warning overrides, source-slide review, package mutation, or medical reconciliation are introduced on `/admin/import`.
- No Preview Admin authority expansion is introduced.

### `create`, `use`, `skip` semantics

- `create` package fields are authoritative **package declarations** for the object/relationship that would be created or idempotently accepted if later DB validation succeeds.
- `use` is a no-write reference to an existing Production object. The authoritative preview information for a `use` item is its validated reference/relationship identity unless the current DB-validation contract explicitly validates an additional field against Production.
- Normalized manifest values are not evidence that a `use` field was explicitly authored in the source package. The normalizer currently supplies defaults such as:
  - `isActive = true` when omitted;
  - Case `questionSelectionMode = automatic` when omitted; and
  - Topic Question `inheritToDescendants = false` when omitted.
- Therefore the presentation layer must never infer package authorship, current Production state, or authoritative behavior for `use` from normalized field presence alone.
- Do not surface normalized `use` defaults as package notes or as the current state of the referenced Production object.
- Optional package title/prompt/answer/Asset metadata/CaseAsset caption/order values for `use` are not authoritative descriptions of the current Production row unless the existing DB-validation path explicitly proves equivalence for that field.
- If optional original package text is retained for diagnostic value, it must be sourced from data that preserves explicit source presence rather than inferred from normalized defaults, and it must be labelled non-authoritative. If explicit source presence cannot be preserved reliably without broadening the parser contract, omit the note.
- A `create` relationship may legitimately target a `use` object. In that case the relationship itself is package-declared/authoritative while the referenced `use` object remains an existing Production reference.
- `skip` remains represented in counts but is excluded from learner-content preview.
- CaseAsset has no `isActive`; do not invent one in presentation data, copy, or tests.

### Create-Asset package media semantics

- A `create` Asset's local preview image is the **exact package media declared for that create Asset**.
- Do not label it unconditionally as the bytes that will be newly imported into Production.
- Current idempotent create-Asset validation may accept an already-existing deterministic D1 Asset row/storage key, after which `applyAsset()` can return without comparing the package media bytes to existing R2 object bytes.
- Step 1 must not add DB/R2 reads to resolve that distinction.
- Copy should therefore distinguish package declaration from guaranteed future storage mutation, e.g. `Package media declared for this create Asset`.

### History cleanup

- Only `complete` and `cancelled` `import_jobs` rows are removable as history.
- `validating`, `ready`, `importing`, and `failed` jobs remain non-removable through history cleanup.
- Failed jobs retain the existing Retry/resume or Cancel path and staging needed for recovery.
- Cancellation semantics do not change: cancelling stops future import work and does not roll back committed domain chunks.
- History cleanup may touch only the target job's private import-staging objects plus its operational `import_jobs` row.
- Imported Topics, Cases, Questions, relationships, Assets, Reviews, learner progress, and learner-served R2 teaching media are never deleted by this feature.
- Full private staging cleanup completes **before** the status-qualified D1 row delete for each job.
- Never delete a D1 row for a job whose complete ZIP + plan + staged-media cleanup was not proven.
- The no-`list()` compatibility fallback in the existing general staging helper is not sufficient proof for history deletion.
- Cleanup safety is per job. Failure for job B must not force unsafe deletion of B and must not head-of-line block independently safe jobs forever.
- Bulk work is bounded by actual storage work as well as row count.
- Bulk cleanup must make monotonic progress across requests even when some terminal rows fail permanently.
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
- `questionCount` when applicable;
- primary Topic declaration/reference;
- fixed Case Assets in declared display order;
- CaseAsset caption where authoritative for the create relationship;
- exact package media for create Assets where available;
- full Case Question prompt/answer content;
- compact active/inactive metadata only for records that actually have `isActive` and where the `create` declaration makes it authoritative package content.

The preview may show every package-declared Q&A for inspection, but it must not imply that every displayed question necessarily appears in every learner Review.

For Case selection behavior:

- `all` can be described as all eligible Case Questions;
- `fixed` can show the package-declared `questionCount`;
- `automatic` must not be presented as an exact package-declared question-count promise when `questionCount` is null. Either explain compactly that learner runtime default selection applies or simply label it `Automatic selection` without promising a number.

### `use` display

Render `use` primarily as an existing Production reference, for example:

```text
Existing Production Case · <applicationId>
Existing Production Question Prompt · <applicationId>
Existing Production Asset · <applicationId>
Existing Production Topic · <applicationId>
```

Do not describe normalized/defaulted title/prompt/answer/Asset metadata/active state/selection mode/inheritance/caption/order as package-authored or as current Production state.

For mixed-operation relationships, preserve the distinction explicitly. Examples:

```text
create CaseAsset relationship
→ Existing Production Asset · <applicationId>

create CaseQuestion relationship
→ Existing Production Question Prompt · <applicationId>

create Case primary-Topic relationship
→ Existing Production Topic · <applicationId>
```

The create relationship is authoritative package intent; the `use` target's current content/behavior remains intentionally unresolved until normal DB validation.

Do not add DB reads to resolve current Production text, active state, hierarchy, or inherited question pool.

### Presentation priorities

- optimized for one-pass visual inspection, not a second approval workflow;
- all package-declared Q&A expanded by default;
- images large enough to inspect without a modal;
- no technical IDs in the primary reading flow except where needed to identify `use` references;
- preserve normalized manifest order;
- Case Assets ordered by `displayOrder` with stable manifest order as deterministic tie-breaker;
- safe text rendering only; no unsanitized package Markdown through `{@html}`;
- no implication that static preview has completed DB conflict/existing-object validation;
- no implication that preview is a complete simulation of the learner question pool.

## 2. Topic Question owner and hierarchy context

If Topic Questions are present, render a separate compact **Topic Questions** section.

Each displayed Topic Question must include enough owner context to interpret inheritance:

- owning Topic;
- prompt/answer package content for authoritative `create` relationships/records;
- active/inactive state only where authoritative for `create` records;
- `inheritToDescendants` for a create Topic Question;
- immediate parent Topic context for a create owning Topic where that parent relationship is package-declared and useful to interpret hierarchy;
- optionally a compact create-parent chain when it is already available from the package model and materially improves interpretation.

Owner rendering follows operation authority:

```text
create Topic
→ package-declared Topic name/slug/parent context may be shown

use Topic
→ Existing Production Topic · <applicationId>
```

If a create Topic points to a `use` parent Topic, show the package-declared parent relationship plus the existing Production Topic reference. Do not DB-fetch the existing parent's current name/ancestors.

The UI must state that Topic Question preview is **not a complete learner-pool simulation**. Existing Production `use` Topics, ancestors, and their currently inherited questions may contribute learner questions that are intentionally not fetched during Step 1.

## 3. Server presentation model

Build a small read-only presentation model from the already parsed/normalized manifest after the current hardened parse/static-validation path.

The model must distinguish **operation/reference authority** from display values. Do not use normalized field presence as a proxy for explicit source presence on `use` records.

Illustrative shape only; this is not a persisted schema:

```js
{
  cases: [
    {
      id,
      operation,
      applicationId,
      createDeclaration: operation === 'create' ? {
        title,
        vignetteMd,
        isActive,
        questionSelectionMode,
        questionCount
      } : null,
      primaryTopic: {
        relationshipOperation,
        topic: {
          id,
          operation,
          applicationId,
          createDeclaration: operation === 'create' ? {
            name,
            slug,
            isActive,
            parentTopic: { ... }
          } : null
        }
      } | null,
      assets: [
        {
          relationId,
          relationOperation,
          relationApplicationId,
          createRelationDeclaration: relationOperation === 'create' ? {
            displayOrder,
            captionMd
          } : null,
          asset: {
            id,
            operation,
            applicationId,
            createDeclaration: operation === 'create' ? {
              path,
              mimeType,
              altText,
              isActive
            } : null
          }
        }
      ],
      questions: [
        {
          id,
          operation,
          applicationId,
          createDeclaration: operation === 'create' ? {
            answerMd,
            isActive
          } : null,
          prompt: {
            id,
            operation,
            applicationId,
            createDeclaration: operation === 'create' ? {
              promptMd,
              isActive
            } : null
          }
        }
      ]
    }
  ],
  topicQuestions: [
    {
      id,
      operation,
      applicationId,
      createDeclaration: operation === 'create' ? {
        answerMd,
        isActive,
        inheritToDescendants
      } : null,
      ownerTopic: {
        id,
        operation,
        applicationId,
        createDeclaration: operation === 'create' ? {
          name,
          slug,
          parentTopic: { ... }
        } : null
      },
      prompt: { ... }
    }
  ]
}
```

Important rules:

- derive relationships from the authoritative normalized package plan;
- do not mutate the manifest;
- do not include media bytes;
- keep deterministic ordering;
- for `create`, expose behavior-bearing package metadata needed to understand the learner result;
- for `use`, expose reference identity only unless current DB validation explicitly makes another field authoritative;
- do not expose normalized `use` defaults as source-declared notes/current behavior;
- mixed-operation tests must prove create relationship → use Prompt/Asset/Topic behavior;
- CaseAsset has no `isActive` and no such field appears in this model;
- omit skipped learner content from the content surface while retaining existing count information;
- no DB reads solely for preview beautification.

Prefer a pure helper with executable unit coverage rather than inline mapping in the Svelte page.

## 4. Exact-local-ZIP media display support

Do not return image bytes/base64 through the SvelteKit action and do not stage preview media in R2.

After successful server validation:

1. retain the exact browser `File` snapshot submitted for that Step-1 request;
2. server returns existing counts/warnings/package ID plus successful package SHA-256 and the presentation model;
3. client hashes the retained exact File with `crypto.subtle`;
4. current-generation local binding succeeds only when the local digest equals the successful server digest;
5. a display-only ZIP reader extracts only declared create-Asset media needed by rendered relationships;
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
- reject/handle malformed local ZIP structure safely for display purposes;
- never fall back to a similarly named entry;
- never infer package validity;
- enforce bounded extraction using already server-validated package limits/metadata rather than inventing a second acceptance contract;
- avoid decompressing unrelated entries;
- fail only the affected image display cleanly when local decompression/display is unavailable.

Create-Asset image copy must say, in substance:

```text
Package media declared for this create Asset
```

rather than promising that the exact bytes will necessarily be newly written to Production.

Do not import `tools/slide-import-review` into the Production Svelte app and do not broaden this into a shared ZIP architecture refactor.

Executable helper coverage must include at least:

- stored entry extraction;
- deflated entry extraction;
- exact path selection;
- local/server digest mismatch;
- malformed ZIP/display failure;
- unavailable decompression/display handling;
- bound enforcement derived from the server-accepted package limits.

## 5. Explicit Step-1 preview state model

Step 1 requires enhanced submission because the selected browser `File` must remain available after action completion.

Do not collapse all preview state into one `accepted`/`failed` flag. Track three independent dimensions:

```text
A. Server preview validity for current generation
   idle | in-flight | succeeded | failed | invalidated

B. Local exact-file binding for current generation
   unchecked | hashing | matched | mismatched | invalidated

C. Per-image display state
   pending | ready | unavailable
```

A genuine media-display/decompression failure belongs only to dimension C. It does **not** retroactively make the server-successful package invalid.

### Generation and concurrency rules

- Prefer **preventing overlapping Step-1 requests**. Disable/reject another Step-1 preview submission while one is in flight in the same page instance.
- Bind every request/result to a monotonically increasing client selection/request generation and the exact `File` object snapshot submitted.
- A Step-1 file change immediately:
  - increments/invalidates generation;
  - invalidates server-success authorization for the old generation in client state;
  - invalidates local digest binding;
  - revokes all old Blob URLs;
  - resets Step-2 confirmation;
  - ensures an older in-flight response cannot restore old authorization/model/digest/URLs.
- If request A was started for File A and the user selects File B before A resolves, A's action response is stale client state even if that HTTP response writes the HttpOnly cookie. It must be ignored for current-generation authorization/display.
- Because the preview cookie is HttpOnly response state, same-page overlapping Step-1 requests must be prevented so response ordering cannot race the cookie. Cross-tab cookie changes remain protected by the authoritative server SHA gate.
- While Step 1 is in flight or local digest binding is not `matched`, Step 2 must not be enabled as though the current generation passed.
- Step-2 file selection is a separate state concern: selecting/reselecting the Step-2 file must **not** erase a valid Step-1 preview/model.
- Step-2 confirmation may reset when appropriate, but that reset must not destroy accepted Step-1 inspection content.
- A stale action response must never restore confirmation, current-generation authorization, content model, digest binding, or Blob URLs.

### Step-2 enablement and cookie consumption

Client-side Step-2 confirmation/start controls are enabled only when the **current Step-1 generation** has both:

```text
server preview = succeeded
AND
local exact-file binding = matched
```

Per-image display state does not participate in package authorization. One or more `unavailable` images produce visible warnings but do not narrow server package acceptance.

The server SHA cookie remains the final authority. If a Step-2 server action consumes/clears that cookie—whether import starts successfully or the action fails through a path that intentionally clears preview authorization—the client must invalidate its **authorization state** accordingly. The already-rendered preview may remain visible for inspection if useful, but the UI must not continue to present it as currently authorized for Step 2; a new successful Step 1 is required before another start attempt.

Executable client/state coverage must explicitly exercise:

- A preview submitted → select B before A response → A cannot restore current authorization;
- overlapping Step-1 submission prevention/reconciliation;
- server success + local digest matched + one media display failure → Step 2 remains eligible, with warning;
- server success + local digest mismatch → Step 2 disabled;
- accepted preview → Step-2 file selected → Step-1 preview remains;
- stale Blob URL revocation;
- server start action consumes/clears preview cookie → client authorization is invalidated even if preview content stays rendered.

## 6. Step 2 remains the import gate

Do not collapse Step 1 and Step 2.

Step 2 remains:

```text
Package ZIP [choose exact ZIP again]
[ ] I reviewed the preview and explicitly confirm this exact import package.
Start resumable import
```

The existing server-side SHA-256 cookie comparison remains authoritative before staging/domain writes.

The local digest check exists only to ensure that the displayed browser content/media corresponds to the successful Step-1 server result. It never replaces server authorization.

## Durable progress cleanup UX

## 7. Global history snapshot and eligibility

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
- individual cleanup response;
- successful/partial/deferred bulk cleanup response;
- any history refresh path introduced by this PR.

Do not locally filter removed IDs and assume the remaining visible list is authoritative. Reload/requery the newest 10 after cleanup so the former 11th row backfills immediately.

If a visible job becomes `complete` or `cancelled` through the existing processing/cancel flow, update client `hasEligibleTerminalHistory` immediately to true without requiring refresh.

`Clear old imports` remains available when the newest 10 contain no terminal row but older eligible history exists.

## 8. Per-job `Remove from history`

For each visible `complete` or `cancelled` job, show a small history-removal control with explicit non-destructive copy, e.g.:

```text
Remove from history
Imported content will not be deleted.
```

Do not show the control for `validating`, `ready`, `importing`, or `failed` jobs.

A failed job becomes eligible only after the existing Cancel flow moves it to an eligible terminal state.

## 9. `Clear old imports`

Show **Clear old imports** whenever server-derived global terminal eligibility is true.

Confirmation must explicitly state:

```text
Remove completed/cancelled import records from history?
Imported Flash-Cards content will not be deleted.
Failed or active resumable imports will be kept.
```

The action operates on a bounded server-selected traversal. The client never submits arbitrary job IDs as eligibility authority.

## 10. History actions are isolated from package/processing action state

The existing page `form` action data is used for package preview/start flow. New history mutations must not replace or clear that valid preview state.

Use isolated enhanced/fetch handling for history mutations, equivalent to the existing explicit `fetch` + `deserialize` pattern used by processing actions.

Maintain separate state, for example:

```text
previewRequestInFlight
processingRequestInFlight / runningJobId
historyMutationInFlight / historyMutationResult
```

Exact names are flexible. Required behavior:

- history cleanup must not write through page-level package preview `form` state;
- history cleanup must not clear/replace a valid Step-1 preview;
- history cleanup must not reuse processing `requestInFlight` in a way that pauses, clears, blocks, or falsely unlocks an unrelated active processing loop;
- processing job state and history-mutation state remain independently fenced;
- cleanup may disable its own controls while in flight without globally disabling unrelated process/resume/pause behavior unless a concrete shared safety reason exists.

Executable client/state coverage must include removing/clearing history while another job is actively processing and prove that the processing loop remains correctly locked/running.

## 11. Partial-success feedback is part of the UX contract

Bulk cleanup may legitimately return a mix of:

```text
removed
failed
and/or deferred
```

The UI must not silently refresh the list and discard that result.

After every bulk attempt, display a concise operator-safe summary such as:

```text
Removed 6 imports.
2 could not be removed and were kept.
3 were deferred to a later bounded cleanup pass.
```

For retained failures, show actionable safe messages by job/package identifier where possible. Examples of acceptable categories:

- staging key does not match the expected canonical key;
- private staging cleanup could not be completed;
- job state changed and is no longer eligible;
- storage is temporarily unavailable.

Do not expose arbitrary raw R2/storage exception text, object internals, stack traces, or sensitive infrastructure details.

The server should return structured safe failure information, for example:

```js
{
  code: 'canonical_key_mismatch' | 'staging_cleanup_failed' | 'state_changed' | 'storage_unavailable',
  message: 'Safe operator-facing message.'
}
```

Exact codes may follow current error conventions.

The result summary remains visible long enough for the operator to understand why terminal rows may still exist even when global eligibility remains true. A subsequent cleanup attempt may replace the prior summary.

## Backend history cleanup design

## 12. Canonical staging identity is required before deletion

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
- return a safe canonical-key mismatch result.

Cover this in both single and bulk cleanup tests.

## 13. Strict full-staging cleanup for history deletion

History deletion must not call a cleanup path whose success can mean `ZIP removed, plan/media unknown`.

Use or introduce a strict history-specific staging cleanup contract, for example:

```text
deleteStagedImportPackageStrict(...)
```

or an equivalent strict mode on the established helper.

Exact naming is flexible. Required semantics:

- require the storage capabilities needed to enumerate/prove the staged-media prefix state;
- delete the canonical package ZIP;
- delete the canonical plan sidecar;
- delete staged media under the canonical job prefix within the current request work budget;
- distinguish `complete` from `incomplete/deferred` cleanup;
- only report `complete` when no staged media remain in the canonical prefix and required direct-key deletes have completed successfully;
- a no-`list()` environment or other inability to prove full cleanup is a history-cleanup failure/defer condition, not proof of success;
- preserve the existing general/finalize compatibility behavior unless implementation evidence shows it must change. Do not broaden this PR merely to remove the old fallback.

D1 history deletion is permitted only after strict cleanup returns/proves complete.

Executable tests must prove:

- strict cleanup removes ZIP + plan + media;
- no-list/incomplete cleanup cannot delete the D1 row;
- a partial bounded cleanup leaves the D1 row intact;
- a later retry can continue from the remaining canonical staging state.

## 14. Single terminal-history removal

Semantic flow:

1. fetch job by ID;
2. require job exists;
3. require status `complete` or `cancelled`;
4. require persisted `package_storage_key` to match `importPackageStorageKey(job.id)`;
5. run strict full private staging cleanup for that job;
6. only after strict cleanup is complete, run D1 delete with:

```sql
WHERE id = ? AND status IN ('complete', 'cancelled')
```

7. require exactly one row change or fail closed;
8. return removed ID/status plus authoritative refreshed history state.

Do not call teaching-image deletion helpers.

If staging cleanup fails or is incomplete/deferred, retain the D1 row and return a safe operator-facing result.

## 15. Bulk cleanup bounded by actual storage work

A job-count limit alone is insufficient. One resumable job may own the ZIP, plan sidecar, and many staged create-Asset objects. Current Package v1 permits many archive entries, and current staging cleanup may perform one storage delete per staged media object.

Define a conservative **request work budget** in addition to a maximum candidate-row scan/window size.

The implementation may choose the smallest robust design supported by the current storage path, for example:

```text
max terminal rows scanned per request
+
max R2 list pages/object deletes per request
```

or bounded multi-delete if the established Worker/R2 binding path supports it cleanly and tests can model it.

Requirements regardless of mechanism:

- the request cannot launch thousands of unbounded R2 operations merely because it selected a fixed number of jobs;
- budget accounting includes package ZIP, plan sidecar, list pages, and staged media deletes as relevant to the chosen helper;
- stop taking new storage work before exceeding the request budget;
- a job is never D1-deleted until its **entire** strict private staging cleanup is complete;
- return authoritative global eligibility/`hasMore` state after the bounded attempt;
- do not hard-code `20 jobs` as the sole safety bound;
- prefer a conservative initial budget over maximizing rows cleared per click.

## 16. Bulk cleanup liveness and progress across requests

Per-job partial success in one selected window is not enough. Permanently failing oldest rows must not prevent later independently safe terminal rows from ever being reached.

The bulk design must include bounded traversal/continuation across requests using a stable server-controlled ordering. A suitable design is:

```text
terminal candidates ordered by stable age + ID
→ scan a bounded window from a continuation cursor
→ server re-queries and revalidates every candidate
→ return next traversal cursor when later eligible rows may remain
→ eventually wrap/restart so retained failures can be retried
```

The cursor is a traversal hint, not eligibility authority. The client must not submit arbitrary selected job IDs. On every request the server revalidates terminal status and canonical staging identity.

Required liveness properties:

1. **Blocked-row bypass**
   - more permanently failing rows than the per-request candidate window must not make later safe terminal rows unreachable forever;
   - repeated bounded cleanup attempts must advance traversal to later rows.

2. **Retry visibility**
   - retained failed rows remain globally eligible/visible through refreshed state and can be retried on a later pass after traversal wraps or when their failure condition is fixed.

3. **Maximum-valid single-job progress**
   - a maximum-valid job must eventually be removable;
   - either one request's object-work budget is guaranteed to cover the maximum valid staging footprint, **or** strict staging cleanup must make monotonic progress by deleting a bounded subset while leaving the D1 row intact;
   - when partial cleanup is used, later retries must continue from remaining objects rather than restart destructive work from zero;
   - final D1 deletion occurs only on the request that proves strict staging cleanup is complete.

No schema change is required solely for traversal/progress. Prefer stable query cursors and the naturally monotonic disappearance of already-deleted staging objects over adding persisted cleanup state.

Executable tests must include:

- more blocked terminal rows than the candidate window followed by safe rows, proving the safe rows are eventually reached;
- a maximum-media/maximum-valid job whose staging cleanup eventually completes under the chosen budget strategy;
- retries do not re-delete already-removed D1 rows;
- retained failures remain eligible after traversal advances.

## 17. Bulk cleanup is per-job partial success, not batch all-or-nothing

Process server-selected eligible jobs independently within request budget and traversal window.

For each job:

```text
revalidate terminal status
→ validate canonical storage identity
→ perform strict staging cleanup work
→ if complete: status-qualified D1 delete
→ if incomplete: retain row + mark deferred
→ if failed: retain row + safe failure result
→ continue to later candidates while scan/storage budget permits
```

A failure in job B must not roll back or prevent a safely completed deletion of job A.

Return a result shape sufficient for UI/tests, for example:

```js
{
  removedIds: [...],
  failed: [{ id, code, message }],
  deferred: [{ id, reason }],
  nextCursor: 'opaque-or-stable-cursor' | null,
  history: {
    jobs: newestTen,
    hasEligibleTerminalHistory
  }
}
```

Exact shape may follow route conventions.

Do not repeatedly reprocess already-removed jobs on retry. Do not silently discard partial-success information.

## 18. Admin route actions

Add named individual and bulk history actions under `/admin/import`.

Requirements:

- same Production Admin authorization as existing import actions;
- require both DB and MEDIA bindings because safe removal includes private staging cleanup;
- reuse current `packageError()`/action error conventions where applicable while sanitizing storage failures for operator display;
- executable action tests invoke the actual action functions rather than relying only on regex/source inspection;
- actions return authoritative refreshed history state after mutation;
- bulk action returns removed/failed/deferred summary plus continuation information needed for bounded progress;
- no domain-content deletion endpoint is added.

## Implementation tranches for Luna / Codex

Continue this same Draft PR/branch. Do not create another PR. Implement only after confirming the branch is still based on current `main`; if `main` moves again before coding, reconcile before implementation and final validation.

### Tranche 1 — Lock current behavior and test harnesses

- characterize current no-write Step-1 behavior;
- characterize current Step-2 exact-SHA gate and cookie-clear paths;
- characterize current job terminal/recoverable statuses;
- characterize current staging helper behavior, including the no-`list()` ZIP-only fallback;
- establish executable route-action harnesses for named actions;
- establish the smallest client/helper/state test surface needed for Step-1 state-machine and history-state behavior.

Static source/regex contracts may remain supplemental but must not be the primary proof for new runtime behavior.

### Tranche 2 — Pure package presentation model

- add a pure normalized-manifest → preview-model helper;
- make `create` content authoritative only as package-declared content;
- render `use` as existing-object references;
- never infer explicit package authorship/current state from normalized `use` defaults;
- include authoritative create behavior metadata: active/inactive state, Case `questionSelectionMode`/`questionCount`, Topic Question `inheritToDescendants`;
- include Topic Question owner Topic and useful create-parent context;
- make clear the preview is not a complete learner-pool simulation;
- preserve ordering and skip behavior;
- remove any invented CaseAsset `isActive` concept;
- update `previewResumableImport()` to return the presentation model plus successful digest/counts/warnings without changing parser authority.

Focused executable tests cover:

- create/use/skip semantics;
- normalized-default non-authority for `use`;
- mixed create relation → use Prompt/Asset/Topic;
- inactive create content;
- Case selection metadata;
- Topic Question inheritance + owner/hierarchy context;
- CaseAsset field shape;
- ordering;
- absence of DB lookup.

### Tranche 3 — Step-1 enhanced submission and state separation

- retain exact submitted File snapshot;
- prevent overlapping Step-1 preview submissions;
- add generation/snapshot reconciliation so stale responses cannot restore current authorization after a file change;
- track server preview success, local digest binding, and per-image display status independently;
- keep Step-2 file selection independent of accepted Step-1 preview;
- revoke old Blob URLs on Step-1 invalidation/replacement/destruction;
- invalidate client authorization whenever the server consumes/clears the preview cookie;
- keep server SHA cookie authoritative.

Executable state tests cover A→B-before-A-response, overlap prevention, stale response rejection, Step-2 selection preservation, digest mismatch, media-display failure without validation failure, cookie-consumption invalidation, and Blob URL revocation.

### Tranche 4 — Browser ZIP display helper and preview UX

- support both stored and deflated entries accepted by Production parser;
- extract only exact declared create-Asset media paths;
- enforce bounded display extraction using server-validated limits/metadata;
- fail individual media display clearly on genuine malformed/unavailable display cases;
- label images as exact package-declared create-Asset media, not guaranteed new Production bytes;
- render compact package-declared Cases/images/Q&A plus behavior-bearing metadata;
- render Topic Question owner/hierarchy context;
- do not imply all displayed Case Questions appear in every learner Review;
- keep all answers visible by default;
- preserve safe text rendering.

Focused helper tests include stored/deflated/exact-path/digest-mismatch/malformed/unavailable cases.

### Tranche 5 — Authoritative history snapshot + strict single cleanup

- add/reuse one server helper for newest 10 jobs + global terminal-history eligibility;
- use it for `load` and history mutation responses;
- introduce/use strict full-staging cleanup for destructive history deletion;
- preserve existing finalize compatibility unless evidence requires otherwise;
- implement single terminal-history removal;
- require canonical `package_storage_key` identity;
- prove full staging cleanup before status-qualified D1 delete;
- return refreshed newest-10 snapshot and eligibility.

Executable tests cover complete/cancelled success, all ineligible statuses, canonical mismatch, R2 failure, no-list/incomplete cleanup, binding guards, Admin auth, backfill of the 11th row, and domain/teaching-media survival.

### Tranche 6 — Bounded, live, partial-success bulk cleanup

- bound row scanning and actual storage work;
- server selects/revalidates eligible jobs; client IDs are not authority;
- add continuation/traversal so permanently failing oldest rows cannot starve later safe rows;
- make partial staging cleanup monotonic when one maximum-valid job cannot fit in one request;
- continue after unrelated job failure while budget remains;
- never delete a row whose strict staging cleanup is incomplete;
- return removed/failed/deferred information plus safe messages, continuation state, authoritative refreshed history, and global eligibility.

Executable tests cover:

- off-screen terminal eligibility;
- actual storage-work budget stopping;
- partial success;
- canonical mismatch among otherwise valid jobs;
- storage failure among otherwise valid jobs;
- more blocked rows than candidate window followed by safe rows;
- maximum-media job eventual completion;
- traversal/wrap/retry semantics;
- accurate global eligibility/`hasMore`;
- no unsafe D1 deletion.

### Tranche 7 — Isolated history UI/action state and feedback

- add per-card `Remove from history`;
- add globally eligible `Clear old imports` control;
- use isolated fetch/enhanced handling rather than page package-preview `form` state;
- keep valid package preview intact across history mutations;
- keep history mutation in-flight state independent from active processing loop state;
- after cleanup, replace visible jobs with authoritative newest-10 snapshot rather than filtering IDs locally;
- when a visible job becomes complete/cancelled, update global terminal eligibility immediately;
- render partial-success removed/failed/deferred summary;
- preserve safe actionable failure messages instead of raw storage exceptions.

Executable client/state tests cover cleanup while another import is processing, off-screen/backfill behavior, and persistent partial-success feedback.

### Tranche 8 — Documentation reconciliation and validation

After implementation:

- update `docs/CONTENT_IMPORT_PACKAGES.md` for package-declared final preview semantics, normalized-`use` authority limits, create-media wording, Topic Question owner/hierarchy context, Step-1 state/digest behavior, and terminal-history cleanup;
- update `docs/RESUMABLE_IMPORT_RUNTIME_SAFETY.md` for strict staging-first terminal-history cleanup, canonical-key validation, bounded traversal/liveness, per-job partial-success semantics, and failed/active recoverability;
- update `docs/R2_COST_GUARDRAILS.md` because it owns R2 deletion authority and this PR adds a terminal-history staging-cleanup path; document strict full cleanup proof, bounded R2 operation work, monotonic partial cleanup where used, and per-job fail-closed D1 deletion;
- update `docs/DOCUMENTATION_INDEX.md` to classify `IMPORT_PACKAGE_FINAL_PREVIEW_AND_HISTORY_CLEANUP_PLAN.md` as the historical PR #167 planning record once implementation is complete;
- update this plan status only when implementation is complete, using precise wording such as:

```text
implemented on Draft PR #167 branch
```

rather than ambiguous `implemented` before merge;
- preserve existing slide-review documentation boundaries; do not claim Production Admin performs source reconciliation.

Validation must include:

- focused executable helper/action/client/runtime tests introduced by this PR;
- `npm run agent:checks -- --compact` and the repository-required final validation set;
- storage/runtime-specialized validation required by repository guidance because R2 deletion behavior changes, including `npm run runtime:smoke` when applicable to current repository/runtime guidance;
- exact-head CI/final validation after reconciliation with current `main`.

Do not stop at static Svelte/source checks.

## Focused executable coverage matrix

### Preview / presentation

Prove:

- invalid ZIP still fails through the existing hardened parser;
- valid ZIP returns existing count preview plus package-declared presentation model and digest;
- Step 1 still writes neither D1 nor R2;
- `use` is rendered as reference identity rather than authoritative existing Production content;
- normalized `use` defaults (`isActive`, automatic Case selection, Topic Question non-inheritance) are not surfaced as source-authored/current Production behavior;
- mixed create relationship → use Prompt/Asset/Topic preserves relationship authority while keeping target object reference-only;
- CaseAsset presentation has no invented `isActive`;
- create inactive state is visible where the entity actually supports it;
- create Case `questionSelectionMode`/`questionCount` is represented without overpromising `automatic` count;
- create Topic Question `inheritToDescendants` plus owner Topic context is represented;
- create parent Topic context is shown when package-declared/useful;
- preview explicitly does not simulate inherited questions from existing Production `use` Topic ancestry;
- displayed Q&A does not imply every question appears in every Review;
- create-Asset image copy identifies exact package-declared media rather than guaranteed new Production bytes;
- stored and deflated create-Asset media display correctly;
- exact media path selection is enforced;
- local digest mismatch disables current-generation Step-2 eligibility;
- malformed/unavailable local extraction has deterministic per-image fallback without turning server success into validation failure;
- A-preview → select-B-before-response cannot restore A authorization;
- overlapping Step-1 preview requests are prevented/reconciled;
- stale Blob URLs are revoked;
- Step-2 file selection preserves accepted Step-1 inspection content;
- server preview-cookie consumption/clear invalidates client Step-2 authorization;
- Step 2 still rejects a SHA mismatch against the server HttpOnly preview digest.

### Route actions

Executable tests must invoke new individual and bulk action functions and cover:

- Production Admin authorization;
- DB binding guard;
- MEDIA binding guard;
- complete/cancelled eligibility;
- validating/ready/importing/failed rejection;
- successful strict staging-first cleanup;
- R2 cleanup failure retains row;
- no-list/incomplete staging cleanup retains row;
- canonical storage-key mismatch retains row and does not delete arbitrary key;
- refreshed newest-10 history snapshot;
- global off-screen terminal eligibility;
- visible-list backfill after removal;
- safe structured partial-success errors rather than raw storage exception leakage.

Static route/source inspection may supplement these tests only.

### Bulk runtime

Prove:

- server-side candidate selection/revalidation;
- actual storage-work bound in addition to row-scan/candidate count;
- per-job partial success;
- one failed/canonical-mismatch job does not block later independently safe jobs within the request budget;
- more blocked rows than the candidate window do not starve later safe rows across repeated requests;
- a maximum-valid staged-media job eventually reaches full cleanup and D1 deletion under the chosen budget strategy;
- partial strict cleanup is monotonic and never deletes D1 early;
- a job whose staging cleanup did not fully complete is never D1-deleted;
- removed/failed/deferred and continuation information is returned as appropriate;
- authoritative global eligibility/`hasMore` remains accurate;
- imported domain rows and learner media are untouched.

### Client/history state

Prove:

- history mutation does not replace/clear valid package preview;
- history mutation state is independent from active import-processing loop state;
- cleanup while another job is actively processing does not pause, unlock, or clear that loop;
- visible job transitioning to complete/cancelled enables terminal cleanup without refresh;
- cleanup response replaces visible jobs with authoritative newest-10 snapshot and can backfill the 11th row;
- `Clear old imports` remains visible when eligible rows exist only off-screen;
- partial-success feedback visibly summarizes removed/failed/deferred work;
- safe failure messages explain retained rows without exposing raw storage exceptions.

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
- Production R2 reads solely to compare package create-Asset bytes with already-existing deterministic Asset bytes;
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
2. `use` objects are shown as existing Production references; normalized defaults and optional package metadata are not presented as authoritative Production content/state unless current DB validation explicitly proves the field.
3. Mixed create relationship → use Prompt/Asset/Topic is represented correctly: relationship package intent remains visible while the `use` target remains reference-only.
4. CaseAsset preview contains only real CaseAsset fields and does not invent `isActive`.
5. Create behavior-bearing metadata includes active/inactive state where supported, Case `questionSelectionMode`/`questionCount`, and Topic Question `inheritToDescendants` where applicable.
6. Topic Question preview includes owning Topic and useful package-declared create-parent context while explicitly not simulating inherited questions from existing Production `use` Topics/ancestors.
7. Create-Asset images are labelled as exact package-declared media, not guaranteed new Production bytes; Step 1 performs no DB/R2 read to compare existing objects.
8. The surface explicitly leaves DB conflict/existing-object validation pending and does not imply every displayed Case Question appears in every learner Review.
9. Step 1 remains no-write to D1/R2 and cannot accept stale/concurrent preview state.
10. Server preview validity, local digest binding, and per-image display status are independently represented; a media display failure does not become a second validator.
11. Step-2 client controls require current-generation server success + local digest match, while the server SHA cookie remains authoritative.
12. Step-2 file selection does not erase accepted Step-1 inspection content, and server preview-cookie consumption/clear invalidates client authorization for another start attempt.
13. Stored and deflated create-Asset media can be displayed from the exact local ZIP after digest match, with bounded exact-path extraction.
14. History mutations use isolated client/action state and do not disturb package preview or an unrelated active processing loop.
15. The page has an authoritative newest-10 history snapshot plus server-derived global terminal eligibility, including off-screen eligible rows and backfill after cleanup.
16. Single cleanup validates canonical staging identity and uses strict full ZIP + plan + media cleanup before status-qualified D1 deletion; no-list/incomplete cleanup cannot delete the row.
17. Bulk cleanup is bounded by actual storage work as well as candidate scanning and supports per-job partial success rather than batch all-or-nothing behavior.
18. Bulk traversal has a liveness invariant: permanently failing oldest rows cannot starve later safe rows, and a maximum-valid job eventually makes monotonic cleanup progress to completion.
19. No job row is deleted when canonical staging identity mismatches or strict private staging cleanup is incomplete/fails.
20. Bulk UI visibly summarizes removed/failed/deferred work and preserves actionable sanitized failure messages for retained terminal rows.
21. History cleanup never deletes imported domain content, Reviews, learner progress, or learner-served teaching media.
22. Executable action/helper/client/runtime tests cover the review matrix above; source/regex contracts remain supplemental only.
23. `CONTENT_IMPORT_PACKAGES.md`, `RESUMABLE_IMPORT_RUNTIME_SAFETY.md`, `R2_COST_GUARDRAILS.md`, and `DOCUMENTATION_INDEX.md` are reconciled after implementation, with this file classified as the historical PR #167 planning record.
24. Repository-required final validation plus storage/runtime-specialized validation, including `runtime:smoke` when applicable, is green at the exact implemented head against current `main`.
25. The same PR remains Draft until a deliberate implemented base→head final review says it is ready.

## Handoff

When coding starts, continue **Draft PR #167 and this existing branch**. Do not create a replacement PR and do not restart from `main` except as required to reconcile this branch with a newer `main` head.

Inspect actual current repository state, use repository progressive retrieval, implement tranche-by-tranche, and preserve every invariant above.

These amendments do not materially change the established scope boundaries. They refine normalized-`use` authority, create-media wording, Topic Question hierarchy context, preview-state separation, strict full-staging proof, bounded cleanup liveness, and operator-visible partial-success handling. No additional deliberate planning review is required before implementation unless implementation discovery forces one of those boundaries to change. Reserve the next deep review for the implemented base→head diff.