# Import Package Final Preview and History Cleanup Plan

_Status: simplified implementation plan on Draft PR #167. Implementation has not started. Reconciled onto `main` at `7988bd7a01caa82f58d1bc09849fd6fa1b9a8a74`._

# Luna implementation contract — implement from this section

Implement from this short contract using current repository code/tests and routed repository guidance. Consult the appendix only when an edge case needs rationale.

## Goal

Improve **Admin → Import package** in one focused PR:

1. after no-write **Validate and preview**, show a compact read-only **package-declared content preview** for the exact validated ZIP; and
2. let Production Admin remove terminal import-job history without deleting imported content, Reviews, learner progress, or learner-served teaching media.

## Preserve

- Step 1 remains no-write to D1/R2; the hardened Package-v1 parser remains acceptance authority.
- Step 2 keeps the existing server-side exact-ZIP SHA-256 cookie gate as import-start authority.
- No DB reads merely to resolve `use` content/current state/Production Topic ancestry.
- No R2 reads merely to compare package create-Asset bytes with an existing deterministic Production Asset.
- `use` preview is reference-only; normalized defaults never become authored/current Production state.
- Create-Asset images are described as **package media declared for that create Asset**.
- Topic Question preview includes owner context but is not a complete learner-pool simulation.
- Server preview validity, local exact-file binding, and per-image display state remain separate.
- Step-1 file changes fence stale generations and revoke old Blob URLs.
- History mutation state stays separate from package preview/start state and the active processing loop.
- History eligibility is server-derived globally; newest-10 rows are presentation only.
- Only `complete`/`cancelled` jobs are removable. Failed/active jobs remain recoverable.
- History removal validates canonical staging identity and proves full private staging cleanup before D1 deletion.
- One failed terminal job cannot authorize unsafe deletion or permanently starve later safe jobs.
- History cleanup never deletes imported domain content, Reviews, learner progress, teaching Assets, or learner-served media.
- No schema/package-version/Preview-authority/resumable-execution/slide-review redesign.
- New behavior requires executable route/runtime/helper/client coverage; regex/source checks are supplemental.
- Keep PR #167 Draft through implementation, validation, and final base→head review.

## Scope — deterministic design

### Preview model and authority

Keep the existing count preview, then render:

```text
Package-declared content preview
Read-only view of the exact ZIP that passed package validation.
Existing Production references and database conflicts are validated later.
```

For `create`, show only behavior/content needed for inspection:

- Case title/vignette and active state;
- Case selection: `all` → `All eligible questions`; `fixed` → declared count; `automatic` → exactly `Automatic selection`;
- primary Topic declaration/reference;
- Case Assets by deterministic display order, with create CaseAsset caption;
- create-Asset package media;
- operation-aware Case/Topic Question content as specified below;
- Topic Questions with owner Topic and create `inheritToDescendants`.

Q&A rendering is operation-aware. For every Case Question and Topic Question:

- show the authoritative create answer when the question relationship is `create`;
- show prompt text only when the referenced Prompt operation is `create`;
- when the Prompt operation is `use`, show only `Existing Production Question Prompt · <applicationId>` and do not present package/defaulted prompt text as authoritative;
- all authoritative prompt and answer text is expanded and visible by default, with no per-question click/accordion required for the one-pass review.

For `use`, always show reference-only (`Existing Production <type> · <applicationId>`). Do not show optional package source notes or normalized/defaulted behavior.

Mixed operations must work: create CaseAsset→use Asset, create CaseQuestion→use Prompt, create Case→use primary Topic, create Topic Question→use owner Topic/Prompt.

Case↔Topic has **no independent manifest relationship operation**. Do not invent `relationshipOperation`. Current reviewed Package-v1 hardening rejects non-empty `secondaryTopicIds`, so this PR previews the primary Topic only; `secondaryTopicIds: []` remains compatibility shape. If executable package authority changes before coding, stop and reconcile this boundary.

For each Topic Question show owner Topic; for a create owner Topic show only its immediate package-declared parent/reference. Never fetch a `use` Topic's ancestors. State once that existing Production Topics/ancestors may contribute inherited questions not fetched here.

Create-Asset image copy must mean `Package media declared for this create Asset`, not guaranteed newly written Production bytes.

Use one pure presentation-model shape:

```js
{
  cases: [{
    id, operation, applicationId,
    create: operation === 'create' ? { title, vignetteMd, isActive, selectionLabel, questionCount } : null,
    primaryTopic: topicRef | null,
    assets: [{ id, operation, applicationId, create: operation === 'create' ? { displayOrder, captionMd } : null, asset: assetRef }],
    questions: [{ id, operation, applicationId, create: operation === 'create' ? { answerMd, isActive } : null, prompt: promptRef }]
  }],
  topicQuestions: [{
    id, operation, applicationId,
    create: operation === 'create' ? { answerMd, isActive, inheritToDescendants } : null,
    ownerTopic: topicRef,
    ownerParentTopic: topicIdentityRef | null,
    prompt: promptRef
  }]
}
```

`use` refs contain identity only; create refs contain only fields needed by the UI. `topicIdentityRef` is one level only. CaseAsset has no `isActive`. Skip content stays in counts but not the content surface. Do not return media bytes or mutate the manifest.

### Step-1 exact-file state and local media

Enhance Step 1 so the submitted browser `File` snapshot survives its response. Prevent overlapping Step-1 submissions.

Track current generation independently:

```text
serverPreview: idle | in-flight | succeeded | failed | invalidated
localBinding: unchecked | hashing | matched | mismatched | invalidated
media[assetId]: pending | ready | unavailable
```

A Step-1 file change immediately invalidates the generation, revokes old Blob URLs, clears client authorization, resets confirmation, and makes older responses unable to restore state.

Step 2 is enabled only for current-generation `serverPreview=succeeded` + `localBinding=matched`. Per-image `unavailable` is warning-only and never becomes package validation failure.

Step-2 file selection does not erase the visual Step-1 preview. On any Step-2 start submission, conservatively consume client authorization immediately; if start does not complete, require a fresh Step-1 preview before another attempt. Server SHA/cookie state remains authoritative.

Use one display-only browser ZIP helper supporting methods 0 (stored) and 8 (deflated). Read exact declared create-Asset paths only, reuse server-validated bounds, avoid unrelated decompression, never infer package validity, and revoke Blob URLs on invalidation/destruction.

### Strict history backend

Return one authoritative history snapshot from load and every history mutation:

```js
{ jobs: newestTenSerializedJobs, hasEligibleTerminalHistory: boolean }
```

Eligibility is global. Requery newest 10 after mutation so row 11 backfills. When a visible job becomes complete/cancelled, set client eligibility true immediately.

Add a **history-specific strict staging cleanup helper**; keep the existing general/finalize cleanup fallback unchanged.

For one terminal candidate:

1. require `complete`/`cancelled`;
2. require `package_storage_key === importPackageStorageKey(job.id)`;
3. require R2 capabilities needed to enumerate/delete/verify; otherwise fail closed;
4. fully enumerate the canonical media prefix using `list()` cursor/truncation handling until enumeration is complete, accumulating canonical media keys across pages; fail closed if the cumulative media-key count exceeds the current Package-v1 staging bound;
5. delete `[zipKey, planKey, ...mediaKeys]` with one bounded R2 multi-key delete;
6. verify ZIP/plan absent and re-enumerate the canonical media prefix to prove it is empty;
7. only then status-qualified delete D1 and require exactly one row change.

A single `list()` response never proves the prefix is complete when the result is truncated. No-list, incomplete enumeration, over-bound enumeration, or failed post-delete verification can authorize history-row deletion.

Current Package v1 is capped at 256 archive entries, so one valid job fits below R2's 1000-key multi-delete limit. Do not implement partial per-job cleanup or a second operation-budget scheme. No-list/incomplete cleanup can never authorize history-row deletion.

Bulk cleanup uses a fixed **10-candidate** server batch ordered `(created_at ASC, id ASC)` with a server-returned traversal cursor for the last scanned tuple. The cursor is traversal state only, never deletion authority.

Each job is atomic at history-cleanup level: fully clean+verify+remove, or retain with sanitized failure. Continue past failures. Return:

```js
{ removedIds, failed: [{ id, code, message }], nextCursor, history }
```

Advance the cursor past failed rows during the current sweep so later safe rows are reachable. At end, `nextCursor=null`; if retained failures remain globally eligible, a later Clear starts a new sweep and retries them. Never expose raw R2 exceptions.

### History UI/state

Show `Remove from history` only on visible complete/cancelled jobs and `Clear old imports` whenever global eligibility is true. Copy must state `Imported content will not be deleted.`

`Clear old imports` requires an explicit confirmation dialog stating, in substance:

```text
Remove completed/cancelled import records from history?
Imported Flash-Cards content will not be deleted.
Failed or active resumable imports will be kept.
```

Use isolated fetch/enhanced history handling; do not replace page `form` preview state. Keep separate preview, processing/running-job, and history-mutation in-flight/error state.

History cleanup must not pause/unlock/clear an unrelated processing loop. After mutation replace visible jobs with the authoritative snapshot.

Bulk results must visibly summarize removed and safely retained failed jobs with sanitized actionable messages. If `nextCursor` exists, allow continuation of the current sweep. Do not silently refresh after partial success.

## Five implementation tranches

### 1. Presentation model + preview server result

Implement the pure model and return model + successful digest from Step 1 without DB/R2 reads.

**Done when executable tests prove:** create/use/skip authority; normalized-default-safe reference-only `use`; mixed create→use Topic/Asset/Prompt; operation-aware Q&A (create answer + create Prompt text or `use` Prompt reference); all authoritative Q&A expanded by default without per-question click; primary-Topic modeling without invented operation; current empty-secondary rule; create selection/active state; Topic Question owner/inheritance/immediate parent; CaseAsset has no `isActive`; Step 1 remains no-write.

### 2. Step-1 exact-file state + local ZIP media + preview UI

Implement enhanced submission, generation fencing, digest binding, stored/deflated exact-path extraction, Blob lifecycle, and compact preview UI.

**Done when executable tests prove:** A→select B before A response cannot restore A; overlap prevention; digest mismatch blocks Step 2; stored+deflated display; stale URL revocation; media-display failure is warning-only; Step-2 selection preserves preview; start consumes client authorization; `Automatic selection` has no duplicated count logic; `All eligible questions` copy is used for `all`; package-media wording is accurate; server SHA gate unchanged.

### 3. Strict single/bulk history backend

Implement authoritative history snapshot, strict per-job cleanup, individual action, and 10-candidate cursor bulk action.

**Done when executable action/runtime tests prove:** Admin + DB/MEDIA guards; terminal eligibility; canonical mismatch retains row; no-list/incomplete cleanup retains row; truncated/paginated `list()` enumeration is followed to completion; cumulative over-bound enumeration fails closed; bounded multi-delete+post-delete ZIP/plan/prefix verification precedes D1 delete; maximum-valid media job succeeds atomically; one failure does not block later candidates; more failures than one batch do not starve later rows; cursor/new-sweep retry works; off-screen eligibility/newest-10 backfill works; domain/teaching media survive.

### 4. History UI/state/feedback

Wire Remove/Clear with isolated state and authoritative snapshots.

**Done when executable client tests prove:** history mutation preserves package preview; cleanup during active processing does not disturb the loop; visible terminal transition enables cleanup; server snapshot backfills row 11; off-screen eligibility keeps Clear visible; Clear old imports shows the explicit non-destructive confirmation; partial results show removed+sanitized failures; `nextCursor` continues without client IDs becoming authority.

### 5. Docs + repository validation

After implementation update `CONTENT_IMPORT_PACKAGES.md`, `RESUMABLE_IMPORT_RUNTIME_SAFETY.md`, `R2_COST_GUARDRAILS.md`, and `DOCUMENTATION_INDEX.md`. Classify this file as historical PR #167 planning only when implementation is complete; before merge use wording such as `implemented on Draft PR #167 branch`.

**Done when:** focused executable tests, `npm run agent:checks -- --compact`, repository final checks, storage/runtime-specialized validation including `npm run runtime:smoke` when applicable, exact-head CI, and the manual local Admin smoke below are green against current `main`; PR remains Draft pending final review.

#### Final manual local Admin smoke

This supplements automated tests and `runtime:smoke`; it does not replace them.

1. Prepare the local replica/Admin using the repository runbook (`npm run local:setup` / `npm run local:admin` if needed).
2. Run `npm run dev` and, as local Admin, open `/admin/import`.
3. Preview a representative valid ZIP and verify counts, all authoritative Q&A visible in one pass, and create-Asset image display.
4. Change the Step-1 file and verify the old preview authorization is invalidated.
5. Re-preview, select the exact ZIP in Step 2, start and complete the import against local D1/R2.
6. Remove the completed job from history and exercise **Clear old imports** as applicable, including its explicit confirmation.
7. Verify the imported local Case/Q&A/teaching image remain after history deletion.
8. Stop the local replica with `npm run local:stop`.

## Acceptance criteria

1. Valid Package-v1 ZIP → existing counts + safe package-declared content preview; Step 1 still writes neither D1 nor R2.
2. `use` is reference-only; normalized defaults never appear as authored/current Production state.
3. Create behavior shows applicable active state, Case selection (`All eligible questions` for `all`; `Automatic selection` without duplicated runtime count), and Topic Question owner/inheritance context.
4. Q&A is operation-aware: authoritative create answers are shown; Prompt text is shown only for create Prompts, while `use` Prompts render as Production references; all authoritative Q&A is visible by default in one pass.
5. Case→Topic preview uses current primary-Topic authority only; no invented CaseTopic operation; current empty-secondary reviewed contract remains intact.
6. Create-Asset images come from the exact locally bound package and are labelled package-declared media; image display failure is not package validation failure.
7. Step-1 generation races are fenced; Step 2 requires current server success + digest match; server SHA gate remains authoritative.
8. History state is isolated from package preview and active processing; Clear old imports requires explicit non-destructive confirmation.
9. History responses provide authoritative newest-10 rows + global eligibility with off-screen eligibility/backfill.
10. Single removal requires terminal status, canonical identity, complete paginated prefix enumeration, strict bounded ZIP+plan+media deletion, post-delete verification, then status-qualified D1 deletion.
11. Bulk removal scans at most 10 server-selected candidates with stable `(created_at,id)` traversal, continues past failures, and reaches later safe rows.
12. Partial results visibly report removed and safely retained failures with sanitized messages; raw storage exceptions are not exposed.
13. Cleanup never deletes imported domain content, Reviews, learner progress, teaching Assets, or learner-served media; failed/active jobs remain recoverable.
14. Executable route/runtime/helper/client tests, repository/runtime/storage validation, and the final manual local Admin smoke are green at exact implemented head.
15. No schema/package-version/Preview-authority/resumable-execution/slide-review redesign; PR remains Draft until deliberate implemented base→head review.

## Execution

Continue this existing Draft PR #167/branch. Do not create another PR or mark Ready.

Before coding, reconcile again if `main` has moved. Use progressive retrieval from directly affected importer/runtime/storage/UI/tests. Implement the five tranches in order. Use this contract as primary authority; consult the appendix only for rationale/edge cases.

Reserve the next deep review for the implemented **base → head** diff unless implementation discovery changes a safety boundary.

---

# Reviewer rationale / reference appendix — not required for normal implementation

## A. Baseline

Planning is reconciled against `main` `7988bd7a01caa82f58d1bc09849fd6fa1b9a8a74`.

Current flow is intentionally two-stage: Step 1 hardened static validation + HttpOnly digest with no D1/R2 writes; Step 2 reselect exact ZIP + explicit confirmation + server SHA comparison.

Current staging may contain exact ZIP, plan sidecar, and one private media object per create Asset. The page displays only 10 recent jobs.

## B. `use` normalization rationale

Normalized manifests fill omitted defaults such as `isActive=true`, Case `questionSelectionMode=automatic`, and Topic Question `inheritToDescendants=false`. Presence after normalization therefore cannot prove source authorship for `use`. Reference-only rendering removes that ambiguity entirely.

A create relationship targeting a `use` object is different: create relationship intent is authoritative while target Production content is not fetched.

## C. Case↔Topic correction

The lower-level parser retains `secondaryTopicIds`, but the current hardened reviewed-import layer rejects non-empty values under the reviewed Topic-to-Tag model. There is no independent CaseTopic manifest collection/operation. The preview therefore shows current primary-Topic authority only. A future executable-contract change would require plan reconciliation.

## D. Create-Asset media rationale

Idempotent create-Asset handling can accept an already-existing deterministic Asset row/storage key without comparing package bytes with existing R2 bytes. Step 1 must not DB/R2-read to resolve this, so local bytes are accurately described as package-declared media rather than guaranteed newly stored Production bytes.

## E. Topic Question scope

Existing Production `use` Topics/ancestors may contribute inherited questions. Fetching them would turn Step 1 into a DB-backed learner-pool simulation. Owner + immediate package parent/reference provides enough package context without crossing that boundary.

## F. Three preview states

Server validation answers package validity; local digest answers exact displayed File binding; media status answers browser display capability. Keeping them separate prevents stale File A from authorizing File B and prevents a browser decompression failure from becoming a second package validator.

Preventing overlapping Step-1 submissions also avoids response-order races over the HttpOnly digest cookie.

## G. Strict history cleanup

The existing general cleanup helper has a no-`list()` compatibility fallback that may remove only the exact ZIP. That behavior remains unchanged for existing finalize compatibility but cannot prove all staging is gone before hiding a history row. History removal therefore requires a separate strict proof path.

## H. Why one multi-delete per job

Package v1 permits at most 256 archive entries. A job therefore has far fewer than R2's 1000-key Worker multi-delete ceiling even after adding ZIP + plan. Strict enumeration and post-delete verification still fail closed on unexpected staging.

This removes the need for per-object operation budgeting or partial per-job staging progress.

## I. Cursor liveness

Always restarting from the oldest rows would let permanently failing rows starve later jobs. Stable `(created_at,id)` traversal moves through one bounded sweep while retaining failures safely. At end-of-sweep, a new pass can retry retained failures.

The cursor is never eligibility authority; server-side status and canonical identity are revalidated for each candidate.

## J. Operator-safe failures

A retained row means safety proof failed. Show stable sanitized categories/messages such as canonical-key mismatch, full staging cleanup could not be proven, or state changed before removal. Keep raw storage exceptions server-side under existing logging/reporting conventions.

## K. State isolation and backfill

History actions must not replace SvelteKit page `form` data used by preview/start or reuse the active processing in-flight lock. Separate state avoids clearing a valid preview or disturbing resumable processing.

After removal, authoritative server requery is required because the visible 10-row list may need row 11 backfilled and global terminal eligibility may depend on off-screen rows.

## L. Non-goals and documentation ownership

No Import Package v2, migration, Production DB/R2 beautification reads, Preview Admin authority, source-slide review, rollback/domain deletion, Review/progress deletion, teaching-image GC, resumable lease/chunk redesign, background import execution, auto-clear failed jobs, or generic R2 cleanup abstraction.

Implementation documentation owners remain:

```text
docs/CONTENT_IMPORT_PACKAGES.md
docs/RESUMABLE_IMPORT_RUNTIME_SAFETY.md
docs/R2_COST_GUARDRAILS.md
docs/DOCUMENTATION_INDEX.md
```

`R2_COST_GUARDRAILS.md` must record the new strict terminal-history staging-deletion authority. Final validation includes focused executable coverage, repository-required checks, and runtime/storage validation including `npm run runtime:smoke` when applicable.
