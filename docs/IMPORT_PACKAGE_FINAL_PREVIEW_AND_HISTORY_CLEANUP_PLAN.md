# Import Package Final Preview and History Cleanup Plan

_Status: simplified implementation plan on Draft PR #167. Implementation has not started. The PR remains Draft and is reconciled onto `main` at `7988bd7a01caa82f58d1bc09849fd6fa1b9a8a74` before coding._

# Luna implementation contract — implement from this section

This section is the implementation contract. Luna should implement from here using current repository code/tests plus routed repository guidance. Consult the appendix only when an edge case needs rationale or historical context.

## Goal

Improve **Admin → Import package** in one focused PR:

1. after the existing no-write **Validate and preview** step, show a compact read-only **package-declared content preview** for the exact ZIP that passed server validation; and
2. let a Production Admin remove old terminal import-job history without deleting imported Flash-Cards content, Reviews, learner progress, or learner-served teaching media.

## Preserve

- Step 1 remains **no-write to D1/R2**.
- The hardened Production Import Package v1 parser/static validator remains authoritative for package acceptance.
- Step 2 keeps the existing server-side exact-ZIP SHA-256 cookie comparison as the authoritative import-start gate.
- No DB reads are added merely to resolve `use` content, current state, or Production Topic ancestry.
- No R2 reads are added merely to compare package create-Asset bytes with an already-existing deterministic Production Asset object.
- `use` records are reference-only in preview. Never infer package authorship/current Production behavior from normalized defaults.
- Create-Asset images are labelled as **package media declared for that create Asset**, not guaranteed newly written Production bytes.
- Topic Question preview includes owner context but is explicitly **not a complete learner-pool simulation**.
- Server preview validity, local exact-file digest binding, and per-image display state remain separate client states.
- Step-1 file changes fence stale generations and revoke old Blob URLs immediately.
- History mutations use state isolated from package preview/start state and from the active resumable-processing loop.
- History eligibility is server-derived globally, not inferred from the visible newest-10 rows.
- Only `complete` and `cancelled` jobs are removable from history.
- Every history deletion validates canonical staging identity and proves full private staging cleanup before the status-qualified D1 row delete.
- Failure for one terminal job never authorizes unsafe deletion and does not permanently starve later independently safe terminal jobs.
- History cleanup never deletes imported domain content, Reviews, learner progress, teaching Assets, or learner-served R2 media.
- No schema migration, Import Package version change, Preview-authority change, resumable-execution redesign, slide-review redesign, or generic R2 garbage collection is introduced.
- New behavior is proven with executable route/runtime/helper/client tests. Source/regex checks are supplemental only.
- Keep PR #167 Draft until implementation, validation, and deliberate final base→head review are complete.

## Scope and deterministic design

### 1. Preview authority and display

Keep the existing package count preview. Add a read-only content surface beneath it.

Use this copy/meaning:

```text
Package-declared content preview
Read-only view of the exact ZIP that passed package validation.
Existing Production references and database conflicts are validated later.
```

#### `create`

Show package-declared content needed to understand learner behavior:

- Case title and vignette;
- create-record active/inactive state where the manifest record actually has `isActive`;
- Case selection mode:
  - `all` → `All eligible Case Questions`;
  - `fixed` → show the package-declared `questionCount`;
  - `automatic` → show exactly `Automatic selection`; do not duplicate learner runtime count logic;
- primary Topic declaration/reference;
- Case Assets in deterministic `displayOrder` order with caption for create CaseAsset relationships;
- create-Asset package media where available;
- full create Case Question prompt/answer content;
- Topic Questions with owner Topic context and create `inheritToDescendants`.

The preview may show every package Q&A for inspection, but must not imply every displayed question appears in every learner Review.

#### `use`

Always render reference-only. Do **not** show optional package text/metadata as notes.

Examples:

```text
Existing Production Case · <applicationId>
Existing Production Topic · <applicationId>
Existing Production Asset · <applicationId>
Existing Production Question Prompt · <applicationId>
```

Normalized defaults such as `isActive=true`, Case `questionSelectionMode=automatic`, and Topic Question `inheritToDescendants=false` are never surfaced as authored/current state for `use`.

Mixed operations remain valid and must be represented correctly:

```text
create CaseAsset → use Asset
create CaseQuestion → use Question Prompt
create Case → use primary Topic
create Topic Question → use owning Topic or Prompt
```

The create relationship/record remains authoritative package intent; the `use` target remains a Production reference.

#### Case ↔ Topic modeling

Do not invent a CaseTopic manifest operation or `relationshipOperation` for Case→Topic links.

Current reviewed Package-v1 hardening requires `secondaryTopicIds` to be empty. Therefore this PR previews the Case **primary Topic** only. Treat `secondaryTopicIds: []` as compatibility shape, not a second relationship feature.

For a create Case, `primaryTopicId` is package-declared and may point to a create Topic or a `use` Topic reference. For a `use` Case, show only reference/relationship identity that the existing package/DB validation actually validates; do not infer current Topic content.

If executable Import Package authority changes before implementation to permit non-empty secondary Topic links, stop and reconcile the plan rather than inventing support inside this PR.

#### Topic Question owner context

For each Topic Question, show:

- owning Topic;
- create prompt/answer/inheritance state where authoritative;
- for a create owning Topic, its immediate package-declared parent Topic/reference when present;
- no optional ancestor-chain feature.

For `use` owner/parent Topics, show references only. Do not DB-fetch names or ancestors.

State once in the UI that existing Production `use` Topics/ancestors may contribute current inherited questions not fetched by this preview.

#### Create-Asset media wording

For a create Asset, local image bytes are the exact package bytes declared for that create Asset. Use copy equivalent to:

```text
Package media declared for this create Asset
```

Do not promise that those bytes will necessarily be newly written to Production because current idempotent create-Asset handling can accept an already-existing deterministic Asset row without comparing existing R2 bytes.

### 2. One presentation-model shape

Use one pure normalized-manifest → presentation-model helper. Do not return media bytes and do not mutate the manifest.

Use this semantic shape; exact TypeScript/JSDoc syntax may follow repository conventions:

```js
{
  cases: [
    {
      id,
      operation,
      applicationId,
      create: operation === 'create' ? {
        title,
        vignetteMd,
        isActive,
        selectionLabel,
        questionCount
      } : null,
      primaryTopic: topicRef | null,
      assets: [
        {
          id,
          operation,
          applicationId,
          create: operation === 'create' ? { displayOrder, captionMd } : null,
          asset: assetRef
        }
      ],
      questions: [
        {
          id,
          operation,
          applicationId,
          create: operation === 'create' ? { answerMd, isActive } : null,
          prompt: promptRef
        }
      ]
    }
  ],
  topicQuestions: [
    {
      id,
      operation,
      applicationId,
      create: operation === 'create' ? { answerMd, isActive, inheritToDescendants } : null,
      ownerTopic: topicRef,
      ownerParentTopic: topicIdentityRef | null,
      prompt: promptRef
    }
  ]
}
```

Reference helpers obey these rules:

```text
topicRef / assetRef / promptRef
- use → { id, operation:'use', applicationId, create:null }
- create → include only the create fields needed by the UI

topicIdentityRef
- one level only; no recursive ancestors
```

CaseAsset has no `isActive`; do not invent one.

Skip content remains in existing counts but is omitted from the learner-content surface.

### 3. Step-1 exact-file state and local media

Enhance the Step-1 form so the submitted browser `File` snapshot survives the action response.

Prevent overlapping Step-1 preview submissions.

Track three independent dimensions for the current selection generation:

```text
serverPreview: idle | in-flight | succeeded | failed | invalidated
localBinding: unchecked | hashing | matched | mismatched | invalidated
media[assetId]: pending | ready | unavailable
```

A Step-1 file change must immediately:

- increment/invalidate the generation;
- clear prior server-result authorization for the client;
- revoke all Blob URLs from the old generation;
- reset confirmation;
- ensure any older response cannot restore model/digest/URLs/confirmation.

Step 2 may be enabled only when the **current** Step-1 generation has:

```text
serverPreview === succeeded
AND
localBinding === matched
```

Per-image `unavailable` is a warning only. It must not turn a server-valid package into a client-invalid package or become a second validator.

Step-2 file selection must not erase the accepted Step-1 visual preview.

On any Step-2 start submission, conservatively mark the client preview authorization as consumed immediately. The visual preview may remain visible, but another start attempt requires a fresh successful Step-1 preview if the first attempt does not complete. This keeps client state aligned with the server cookie-consumption boundary without trying to read the HttpOnly cookie.

The server SHA comparison remains authoritative regardless of client state or cross-tab activity.

#### Browser ZIP reader

Use one small display-only helper that supports the same ordinary compression methods accepted by the hardened parser:

```text
0 = stored
8 = deflated
```

It must:

- read only the exact declared create-Asset paths needed for display;
- never fall back to similarly named entries;
- use already server-validated package bounds rather than create a second package contract;
- avoid decompressing unrelated entries;
- surface genuine decompression/display failure as `Image preview unavailable` for that image only;
- revoke Blob URLs on invalidation/replacement/destruction.

Do not import `tools/slide-import-review` into the Production app.

### 4. Strict terminal-history cleanup

#### Authoritative history snapshot

Use one server helper for:

```js
{
  jobs: newestTenSerializedJobs,
  hasEligibleTerminalHistory: boolean
}
```

`hasEligibleTerminalHistory` is global across all jobs, not just the newest 10.

Use the authoritative snapshot for initial load and after every history mutation. Never update the list only by filtering removed IDs locally; requery so the former 11th row can backfill.

When a visible job becomes `complete` or `cancelled` through the existing process/cancel flow, set client global terminal eligibility true immediately.

#### Strict per-job R2 cleanup

Add a history-specific strict cleanup helper. Keep the existing general/finalize helper and its no-`list()` compatibility fallback unchanged.

For one candidate terminal job:

1. require status `complete` or `cancelled`;
2. require persisted `package_storage_key === importPackageStorageKey(job.id)`;
3. require normal R2 capabilities needed to prove cleanup (`list`, multi-key `delete`, and verification reads/listing); otherwise fail closed;
4. fully enumerate the canonical staged-media prefix;
5. fail closed if enumeration exceeds current Package-v1 bounded staging expectations;
6. build exactly:

```text
[zipKey, planKey, ...mediaKeys]
```

7. delete that bounded key list with one R2 multi-key delete call;
8. verify ZIP and plan are absent and the canonical media prefix is empty;
9. only then run the status-qualified D1 delete;
10. require exactly one D1 row change.

Current Package v1 is capped at 256 archive entries, so one job's ZIP + plan + staged create-Asset media remains well below R2's 1000-key multi-delete limit. Do not implement partial per-job staging cleanup or a second operation-budget architecture.

If full cleanup cannot be proven, retain the D1 row.

Never delete an arbitrary persisted key when canonical identity mismatches.

#### Bulk traversal

Use a fixed server candidate limit of **10 terminal jobs per request**.

Order candidates stably by:

```text
created_at ASC, id ASC
```

Use a server-returned traversal cursor containing the last scanned `(created_at, id)` tuple. The cursor is traversal state only; it never authorizes deletion. Server queries still select and revalidate eligible terminal jobs.

Query enough rows to know whether another candidate exists, process at most 10, and continue after individual failures.

Each attempted job is atomic at the history-cleanup level:

```text
fully clean + verify staging → remove D1 row
OR
retain row + sanitized failure
```

Return:

```js
{
  removedIds: [...],
  failed: [{ id, code, message }],
  nextCursor,
  history: { jobs, hasEligibleTerminalHistory }
}
```

Cursor progression must move past failed rows during the current sweep so later safe rows can be reached. When a sweep reaches the end, `nextCursor = null`; if retained failures remain globally eligible, a later Clear action starts a new sweep from the beginning and may retry them.

Do not expose raw R2/storage exception text. Map failures to stable operator-safe categories/messages such as canonical-key mismatch, staging cleanup could not be proven, or state changed before removal.

### 5. History UI/state

Add:

- `Remove from history` on visible `complete` / `cancelled` jobs only;
- `Clear old imports` whenever global terminal eligibility is true.

Copy must make the non-destructive boundary explicit:

```text
Imported content will not be deleted.
```

Use isolated fetch/enhanced handling for history mutations. Do not route history action results through the page `form` state used by package preview/start.

Keep separate in-flight/error state for:

```text
preview
resumable processing / runningJobId
history mutation
```

History cleanup must not pause, unlock, clear, or otherwise disturb an unrelated active processing loop.

After bulk cleanup, visibly summarize:

- number/IDs removed as appropriate;
- retained failed jobs with sanitized actionable messages;
- whether another sweep/page is available when `nextCursor` is non-null.

Do not silently replace the list after partial success. Global eligibility may remain true because failed terminal rows remain; explain that they were kept safely.

## Five implementation tranches

### Tranche 1 — Presentation model + preview server result

Implement the pure presentation-model helper and return it plus the successful package digest from the existing Step-1 server path.

Do not add DB/R2 reads or change parser authority.

**Done when:**

- executable tests cover create/use/skip behavior;
- `use` is reference-only despite normalized defaults;
- mixed create→use Topic/Asset/Prompt cases are covered;
- Case primary Topic modeling has no invented relationship operation;
- current reviewed Package-v1 empty-secondary rule remains intact;
- create Case active state/selection behavior and Topic Question inheritance are represented;
- Topic Question owner + immediate package parent/reference are represented;
- CaseAsset has no `isActive`;
- Step 1 remains no-write to D1/R2.

### Tranche 2 — Step-1 exact-file state + local ZIP media + preview UI

Add enhanced Step-1 handling, generation fencing, local digest binding, display-only ZIP extraction, Blob lifecycle, and the compact preview UI.

**Done when:**

- A submitted → select B before A response cannot restore A;
- overlapping Step-1 requests are prevented;
- digest mismatch prevents current-generation Step-2 enablement;
- stored and deflated exact-path media display works;
- stale Blob URLs are revoked;
- genuine media display failure remains a warning and does not invalidate server preview;
- Step-2 file selection preserves the accepted visual preview;
- start submission consumes client authorization state;
- create-Asset copy says package-declared media, not guaranteed newly imported bytes;
- `automatic` displays exactly `Automatic selection` without duplicating learner-count logic;
- Step-2 server SHA gate remains unchanged and authoritative.

### Tranche 3 — Strict single/bulk history backend

Add authoritative history snapshot, strict history-only staging cleanup, individual removal, and cursor-based bulk removal.

Use the fixed 10-candidate `(created_at, id)` traversal design above.

**Done when:**

- executable action/runtime tests cover Production Admin auth plus DB/MEDIA binding guards;
- only complete/cancelled rows are eligible;
- canonical-key mismatch keeps the row and does not delete arbitrary storage;
- no-`list()` / incomplete cleanup cannot delete the D1 row;
- strict helper enumerates, multi-deletes, verifies, then status-qualified deletes D1;
- maximum-valid Package-v1 staged media fits and completes in one per-job cleanup attempt;
- one failed job does not block later safe candidates;
- more failed rows than one candidate batch do not starve later rows across requests;
- cursor progression and new-sweep retry behavior are covered;
- newest-10 backfill and off-screen global eligibility are covered;
- domain rows and learner/teaching media survive unchanged.

### Tranche 4 — History UI/state/feedback

Wire Remove/Clear controls through isolated history state and authoritative refreshed snapshots.

**Done when:**

- history mutation does not clear/replace a valid package preview;
- cleanup while another import is processing does not pause/unlock/clear that loop;
- visible completion/cancellation enables cleanup without refresh;
- newest-10 state is replaced from the server after mutation and backfills correctly;
- Clear old imports remains visible for off-screen eligible rows;
- partial success visibly reports removed + failed jobs with sanitized messages;
- `nextCursor` continuation can continue the current sweep without exposing client-selected job IDs as authority.

### Tranche 5 — Docs + repository validation

After implementation, reconcile:

- `docs/CONTENT_IMPORT_PACKAGES.md`;
- `docs/RESUMABLE_IMPORT_RUNTIME_SAFETY.md`;
- `docs/R2_COST_GUARDRAILS.md`;
- `docs/DOCUMENTATION_INDEX.md`.

Classify this file as the historical PR #167 planning record only when implementation is complete. Use precise status wording such as `implemented on Draft PR #167 branch`, not ambiguous `implemented` before merge.

**Done when:**

- focused executable helper/action/client/runtime tests are green;
- `npm run agent:checks -- --compact` and repository-required final validation are green;
- storage/runtime-specialized validation required by repository guidance is green, including `npm run runtime:smoke` when applicable;
- exact-head CI/final validation is green against current `main`;
- the PR is still Draft pending deliberate implemented base→head review.

## Acceptance criteria

PR #167 is ready for final implemented review only when:

1. A valid Package-v1 ZIP produces the existing count preview plus a safe package-declared content preview without Step-1 D1/R2 writes.
2. `use` content is reference-only and normalized defaults are never presented as authored/current Production state.
3. Create behavior shows active/inactive state where applicable, Case selection (`Automatic selection` without duplicated count logic), and Topic Question inheritance/owner context.
4. Case→Topic preview uses the Case's current primary Topic model only; no invented CaseTopic operation is introduced and current reviewed Package-v1 empty-secondary authority is preserved.
5. Create-Asset images come from the exact locally bound package and are labelled as package-declared media, while per-image display failure does not become package validation failure.
6. Step-1 generations are race-safe; Step 2 is enabled only for current-generation server success + local digest match; the server SHA cookie gate remains authoritative.
7. History UI/actions are isolated from package preview state and active resumable-processing state.
8. History load/mutations return authoritative newest-10 rows plus global terminal eligibility, including off-screen eligibility and visible-list backfill.
9. Single history removal requires terminal status, canonical staging identity, strict bounded ZIP+plan+media multi-delete, post-delete verification, then status-qualified D1 deletion.
10. Bulk cleanup processes at most 10 server-selected terminal candidates per request using stable `(created_at, id)` traversal, continues past failures, and eventually reaches later safe rows.
11. Partial bulk results visibly report removed and safely retained failures using sanitized operator messages; raw storage exceptions are not exposed.
12. No cleanup path deletes imported domain content, Reviews, learner progress, teaching Assets, or learner-served media; failed/active resumable jobs remain recoverable.
13. Executable route/runtime/helper/client tests cover the new safety behavior and repository-required + runtime/storage validation is green at the exact implemented head.
14. No schema/package-version/Preview-authority/resumable-execution/slide-review redesign is introduced, and PR #167 remains Draft until final review.

## Execution instruction

Continue **this existing Draft PR #167 and branch**. Do not create another PR and do not mark Ready.

Before coding, confirm the branch is still reconciled with current `main`; if `main` has moved, reconcile first.

Use repository progressive retrieval. Start from directly affected importer/runtime/storage/UI/tests and broaden only when evidence requires it.

Implement the five tranches in order. Use the contract above as the primary task authority. Consult the appendix only when an edge case or review question needs the underlying rationale.

Reserve the next deep review for the implemented **base → head** diff unless implementation discovery changes one of the stated safety boundaries.

---

# Reviewer rationale / reference appendix — not required for normal implementation

This appendix records why the contract is shaped this way. Luna should not preload or reproduce it during normal implementation.

## A. Reconciled baseline

Planning is reconciled against `main` at:

```text
7988bd7a01caa82f58d1bc09849fd6fa1b9a8a74
```

The current `/admin/import` flow is intentionally two-stage:

```text
Step 1: hardened static package validation + HttpOnly digest; no D1/R2 writes
Step 2: reselect exact ZIP + explicit confirmation + server SHA comparison
```

The current page loads only the newest 10 jobs, so visible rows cannot be the authority for global terminal-history eligibility.

Current private staging can include:

```text
imports/staging/<job-id>.zip
imports/staging/<job-id>.plan.json
imports/staging/<job-id>/media/<asset-id>
```

## B. Why `use` is reference-only

The normalized manifest supplies defaults even when the source package omitted them. Examples include:

```text
isActive = true
Case questionSelectionMode = automatic
Topic Question inheritToDescendants = false
```

Therefore normalized field presence cannot prove source authorship for `use` records. Rendering optional `use` package text as a note also adds complexity without improving import authority. The deterministic rule is simpler: `use` always displays only validated reference identity.

A create relationship targeting a `use` object is different: the relationship's create declaration is package intent, while the target object's current Production content remains unresolved.

## C. Case↔Topic authority correction

The lower-level parser still contains `secondaryTopicIds`, but the current hardened reviewed-import layer rejects non-empty values and requires the field to remain empty under the reviewed Topic-to-Tag model.

There is also no independent CaseTopic collection/operation in the Import Package v1 manifest. Case Topic links derive from Case data/runtime planning, not a separate manifest relationship record.

Therefore this PR must not invent `relationshipOperation` for Case→Topic preview. It shows the primary Topic relation supported by current reviewed package authority and leaves secondary Topics out of the UI while they remain invalid/non-empty reviewed input.

If executable package authority changes later, that is a boundary change requiring reconciliation rather than speculative support here.

## D. Why create-Asset media is described as package-declared

A create Asset normally supplies media bytes, but idempotent validation can encounter an already-existing deterministic Asset row/storage key. Existing apply behavior can then avoid rewriting the Asset without comparing the package bytes to existing R2 bytes.

Step 1 must remain no-DB/no-R2-read, so it cannot claim those local bytes are guaranteed to become new Production bytes. `Package media declared for this create Asset` is accurate in both the new-write and idempotent-existing-row cases.

## E. Why Topic Question preview is not a learner-pool simulator

A package can reference existing Production Topics. Existing ancestors and inherited Topic Questions are intentionally not DB-fetched during Step 1.

Showing owner Topic plus one immediate package-declared parent/reference is enough to interpret package inheritance intent without turning preview into a Production learner-pool query.

## F. Why preview has three state dimensions

Server package validation, local exact-file binding, and browser image display answer different questions:

```text
server preview succeeded?        package/static authority
local digest matched?            exact File displayed?
image rendered?                  browser display capability
```

A decompression/display problem must not retroactively invalidate a server-valid package. Conversely, a server-successful result from stale File A must not authorize current File B. Separate state avoids both errors.

Preventing overlapping Step-1 requests also avoids races over the server's HttpOnly digest cookie.

## G. Why history cleanup needs a strict helper

The existing general staging cleanup has a no-`list()` compatibility fallback that can remove only the exact ZIP. That is acceptable for its existing compatibility/finalize role but cannot prove all private staging is gone before hiding a history row.

History removal therefore uses a separate strict proof path and leaves the old helper behavior unchanged.

## H. Why one R2 multi-delete is sufficient per job

Current Package v1 caps the archive at 256 entries. A resumable job owns at most its exact ZIP, one plan sidecar, and staged create-Asset media derived from that bounded package.

Cloudflare R2 Worker bindings accept up to 1000 keys in one multi-key delete call. A valid current job therefore fits comfortably inside one strict per-job deletion set.

The strict helper still enumerates and verifies rather than trusting assumptions. Unexpected/unprovable staging fails closed and leaves the D1 row visible.

This is deliberately simpler than per-object operation budgets or resumable partial staging deletion.

## I. Why bulk uses a traversal cursor

Per-job partial success is necessary but not sufficient. If each request always starts from the oldest rows, permanently failing rows can starve later safe rows.

Stable `(created_at, id)` traversal gives one bounded sweep:

```text
oldest terminal rows → process up to 10 → continue after last scanned tuple
```

Failures remain retained but do not block movement through the current sweep. At end-of-sweep, a later Clear action can start again from the beginning and retry retained failures.

The cursor is not deletion authority. Eligibility/status/canonical identity are revalidated server-side for each candidate.

## J. Operator-safe partial-success feedback

A retained terminal row is a safety outcome, not silent failure. The UI should explain that the row remained because cleanup could not be proven or staging identity was inconsistent.

Raw R2 exceptions are not suitable operator output. Return stable safe codes/messages while logging/reporting detailed internal failures through existing server conventions where appropriate.

## K. History state isolation

SvelteKit page-level `form` data currently participates in package preview/start behavior. Reusing it for history actions risks clearing/replacing a valid package preview.

The existing page also has active resumable-processing state. History cleanup must not reuse a global in-flight flag that could pause, unlock, or incorrectly disable that loop.

Hence the contract requires three independent concerns: preview, resumable processing, and history mutation.

## L. Global eligibility and newest-10 backfill

Only displaying 10 jobs is a presentation decision. Cleanup eligibility is a global server fact.

After a visible removal, local filtering would leave fewer than 10 rows even when an 11th row exists. Returning the authoritative newest-10 snapshot after mutation fixes both backfill and off-screen eligibility.

## M. Protected non-goals

This PR does not add:

- Import Package v2;
- migrations or `import_jobs` schema changes;
- Production DB reads to decorate `use` content/hierarchy;
- Production R2 reads to compare idempotent create-Asset bytes;
- editing/approval/source-slide review on `/admin/import`;
- Preview Admin import authority;
- rollback/deletion of imported content;
- Review or learner-progress cleanup;
- teaching-image garbage collection;
- resumable chunk/lease redesign;
- background import execution;
- automatic clearing of failed jobs;
- a generic cross-object R2 deletion abstraction;
- a slide-review tooling refactor.

## N. Documentation and validation ownership

Implementation changes must be reconciled into the current repository authorities:

```text
docs/CONTENT_IMPORT_PACKAGES.md
docs/RESUMABLE_IMPORT_RUNTIME_SAFETY.md
docs/R2_COST_GUARDRAILS.md
docs/DOCUMENTATION_INDEX.md
```

`R2_COST_GUARDRAILS.md` matters because this PR adds a new terminal-history deletion authority over private import staging.

Final validation must include focused executable tests, repository-required checks, storage/runtime-specialized validation, and `npm run runtime:smoke` when applicable under current repository guidance.

Once implementation is complete on the Draft branch, this plan becomes the historical PR #167 planning record. Until merge, use precise status wording such as:

```text
implemented on Draft PR #167 branch
```

Do not mark the PR Ready until the deliberate implemented base→head review says it is ready.
