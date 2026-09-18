# Admin Case Library inline-mutation performance plan

_Status: Draft PR planning record. This PR owns both implementation and validation; do not create a follow-up implementation PR._

## Background

Production Admin classification saves on `/admin/cases?system=unassigned` are visibly slow.

Measured evidence from one representative `select-topic` save:

- classification POST: ~2.22 s total in the browser;
- matching Cloudflare Worker event: ~847 ms wall time, ~19 ms CPU;
- after the POST, the client awaits `invalidateAll()`;
- the resulting `/admin/cases/__data.json` request: ~1.44 s total;
- that reload exposed `admin-case-library-read;dur=695.0`.

The existing Case Library read timing and D1 Insights indicate that the delay is dominated by awaited I/O and repeated read phases rather than CPU-heavy JavaScript or one obviously expensive SQL statement.

Current code trace for the common `select-topic` path shows:

1. Production Case guard;
2. Case relationship read + broad taxonomy read;
3. separate target Topic validation read;
4. Primary Topic relationship write;
5. separate best-effort Case `updated_at` write;
6. response;
7. blocking full Case Library invalidation/reload before the editor closes.

The broad taxonomy read is unnecessary for this single-Case mutation, and the target Topic is validated separately after taxonomy has already been loaded. The write path must nevertheless preserve the existing best-effort timestamp semantics: a timestamp-only failure must not turn an already successful classification mutation into a user-visible failure.

The same UI anti-pattern also exists in at least the inline Case Tag editor: a row-local POST is followed by `invalidateAll()`, causing the whole Case Library read model to rerun.

## Objective

Make row-local Case Library mutations fast by design:

```text
row-local mutation
→ server validates and commits
→ response returns enough authoritative changed data
→ affected UI reconciles locally
→ done, with no Case Library reload when the current list remains authoritative

only when current filter/sort/page composition requires server reconciliation
→ trigger a non-blocking authoritative refresh
```

For the common `select-topic` path on an ordinary Case Library view whose membership/order is unaffected by classification, the intended steady state is one POST plus one local row update and **no `invalidateAll()` at all**.

At the same time, reduce avoidable D1 round trips in the classification write path without changing classification semantics or introducing new architecture.

## Preserve

- Exactly one behaviorally active canonical Primary Topic per Case.
- Case Tags remain the cross-cutting classification mechanism; do not reintroduce Additional Study Topics.
- Production/Preview ownership guards remain intact.
- The target classification Topic must still be an active Topic, not a System.
- Legacy secondary `case_concepts` rows remain inert compatibility data; selecting one as the new canonical Topic must continue to avoid duplicate relationships.
- A successful substantive classification mutation must remain successful even if the best-effort Case `updated_at` touch fails.
- Case Library filtering, sorting, pagination, selection, persisted URL state, and Admin authorization remain unchanged.
- Global taxonomy hierarchy changes may continue to use authoritative reload/invalidation when multiple visible rows/options can change.

## Implementation plan

### 1. Classification response + local reconciliation

For the normal `select-topic` operation, the server response must return an authoritative mutation outcome plus enough current Case Library classification projection to reconcile the affected Case after the commit. That projection must contain enough server-authoritative Topic/System context to decide current Topic/System filter membership using the same active-taxonomy semantics as the Case Library. Do not use potentially stale page taxonomy metadata for correctness-sensitive membership decisions, and do not reintroduce a complete taxonomy read solely to build the response. Existing page metadata may still be reused for presentation where it cannot affect correctness.

The mutation result must also make timestamp outcome explicit. Return an `updatedAt` value only when the best-effort Case timestamp touch actually succeeds. Do not fabricate a fresh timestamp when that touch fails, and do not report a changed timestamp for a substantive no-op such as selecting the already-current canonical Topic. Return enough changed/no-op outcome data for the client to reconcile without guessing.

The successful interaction must no longer wait for a full `invalidateAll()` before closing.

The Case Library must immediately reflect whether the changed Case still belongs in the current filtered result set according to the active Topic/System filters. This must not be implemented as an `unassigned`-only special case. For example, under `system=unassigned`, assigning the Case to a Topic with a System ancestor must remove that Case from the visible list immediately; under one representative named Topic or System filter, the Case must likewise remain visible or be removed correctly when classification changes. Authoritative page backfill remains the background refresh's job.

Do **not** refresh the Case Library after `select-topic` when the current page remains authoritative after the local row update. This is the default/common path.

Trigger a non-blocking authoritative Case Library refresh only when the mutation can change server-owned list composition or ordering that cannot be kept correct by the single-row update alone. Examples include an active Topic/System filter that changes row membership, Topic/System/Last-edited sorting that may reposition the row across the bounded page, or a local row removal that requires authoritative total-count/page-backfill reconciliation. Apply the immediate local membership correction first, then refresh in the background. When that local correction removes a row, immediately remove that Case ID from `selectedCaseIds` and clear/reconcile any stale selection anchor so bulk counts/forms cannot retain an invisible Case. Do not await the refresh on the save critical path, and failure of the background refresh must not convert the already-successful mutation into a save error or reopen the editor.

For an ordinary unfiltered Case Library view sorted by Case title (or another sort unaffected by classification), update the matching row's canonical Topic/System and successfully written Last-edited value locally and stop there: no full Case Library reload.

Use the smallest existing Svelte state/callback pattern that fits the current page. Do not add client pagination ownership, a client state library, or a generic mutation framework.

### 2. Bound the `promoteCaseTopic()` validation read model

Replace broad taxonomy loading in this mutation with only the rows needed to establish its invariants.

Reduce avoidable serial database phases where independent validation reads can safely be issued together.

Do not weaken the explicit Production Case guard or active-Topic validation.

Do not put the Case timestamp touch into the substantive classification transaction/batch. A timestamp-only failure must remain best-effort and must not roll back or convert an already completed classification change into a user-visible failure.

Preserve legacy-secondary promotion semantics specifically: when promoting a Topic that already exists as a legacy secondary relationship, keep the secondary-delete + primary-update transition atomic/batched as one substantive mutation, then perform the Case timestamp touch afterward as a separate best-effort operation. The returned mutation outcome must report the timestamp only if that later touch succeeds.

### 3. Apply the same pattern to clearly row-local Case Tag mutations

Inspect the current inline Case Tag mutation path and remove blocking whole-page invalidation where the server can return enough authoritative data to reconcile the affected row safely.

Prioritize existing-Tag add/remove because those are unambiguously row-local. Their JSON result must return enough authoritative mutation outcome/projection for the client to reconcile without guessing, and must return `updatedAt` only when the best-effort Case timestamp touch actually succeeds. Do not fabricate `updatedAt` for timestamp-only failure or for no-op removal where the relationship was already absent. If a successful add/remove changes whether the Case matches the currently active Tag filter, update visible membership immediately rather than leaving the Case incorrectly visible/hidden until a later navigation.

For existing-Tag add/remove, likewise do not refresh by default when the current page remains authoritative after the local row update. If the active Tag filter, Tag sort, `edited-asc` / `edited-desc` Last-edited sort, row removal, pagination/backfill, or other server-owned list state is affected, apply the immediate local correction and then use a non-blocking authoritative refresh. When the local correction removes a row, immediately reconcile `selectedCaseIds` and any stale selection anchor before the background refresh.

For operations that create global selectable metadata, such as creating a new Tag, use the simplest correct behavior. A targeted local update is acceptable if it can keep all visible option state authoritative without new architecture; otherwise retain an authoritative refresh outside the critical interaction path.

Do not expand this PR into a repository-wide elimination of `invalidateAll()`.

### 4. Keep global/shared mutations conservative

Operations such as moving a shared Topic subtree can affect many Cases and selector options. They do not need to adopt row-local reconciliation in this PR.

Likewise, inline Topic creation should only lose its full refresh if the existing page state can be reconciled simply and correctly. Correct global option state is more important than forcing every operation through the same local path.

### 5. Performance observability

Retain the existing `admin-case-library-read` timing.

If the implementation needs durable mutation-side observability, add only a narrow total classification-write timing signal using the existing performance timing conventions. Do not add a new tracing framework, query middleware, or production logging architecture.

No production deployment or production D1 mutation is part of this PR.

## Executable acceptance contract

| Invariant | Required behavior | Required proof |
| --- | --- | --- |
| Common classification path performs no Case Library reload | A successful `select-topic` on an ordinary view whose membership/order is unaffected updates the row and closes from the POST result with no `invalidateAll()` call at all | Focused Playwright regression against the real Case Library interaction |
| Conditional authoritative reconciliation is correct | When Topic/System filtering, classification-sensitive sorting, row removal, or bounded-page composition requires server reconciliation, the immediate local correction occurs first and any authoritative refresh is non-blocking; refresh failure cannot convert the committed save into an error | Focused Playwright proof for representative conditional reconciliation, including `system=unassigned` and one named Topic/System case without requiring an exhaustive matrix |
| Local removal clears selection state | If filter reconciliation removes the edited Case, that Case is immediately removed from `selectedCaseIds` and any stale selection anchor is cleared/reconciled before background refresh | Focused executable proof in one filtered-removal interaction |
| Server projection is current and bounded | The POST returns enough current server-authoritative Topic/System context to decide Case Library membership under active-taxonomy semantics without relying on potentially stale page taxonomy metadata and without restoring a complete-taxonomy read | Route/helper proof plus the bounded-read proof below; browser proof uses the returned projection |
| Classification semantics are preserved | Active Production Case, exactly one canonical Primary Topic, active target Topic, and legacy-secondary behavior remain correct; legacy-secondary delete + primary update remain atomic/batched | Existing/focused DB tests |
| Timestamp/result contract remains authoritative and best-effort | Classification and existing-Tag add/remove return `updatedAt` only when the timestamp touch succeeds and never fabricate it for timestamp failure/no-op; timestamp-only failure cannot roll back or report failure for the substantive mutation; legacy-secondary promotion timestamps only after the atomic substantive transition | Focused executable DB/route tests covering timestamp-only failure, no-op outcome, and legacy-secondary timestamp-only failure |
| Common classification read path is bounded | `promoteCaseTopic()` no longer loads the complete taxonomy merely to change one Case classification | Focused DB/read-path proof at the appropriate helper/query layer |
| Row-local Tag edits avoid unnecessary reloads | Existing-Tag add/remove updates the affected row with no full reload when the list remains authoritative; when active Tag filtering, Tag sorting, `edited-asc` / `edited-desc`, or page composition is affected, visible membership/selection is corrected immediately and any authoritative refresh is non-blocking | Focused executable no-refresh inline Tag proof plus filtered-Tag and Last-edited-sort conditional-refresh proof |
| Global mutations remain correct | Shared taxonomy/global-option mutations still obtain authoritative page state where local reconciliation would be unsafe | Existing/focused tests for retained reload path |

Static/source-regex checks and helper/component tests may supplement these tests but must not be the only proof for the real Case Library interaction. Add a focused Playwright regression that exercises the real Case Library UI and proves both: (1) the common `select-topic` path updates locally with no Case Library refresh request, and (2) representative conditional reconciliation applies the immediate local correction before any non-blocking authoritative refresh.

## Scope / non-goals

Do not add:

- schema changes or migrations;
- cache/KV/Redis infrastructure;
- client state-management libraries;
- client-owned pagination/backfill architecture;
- WebSockets or background synchronization architecture;
- optimistic success before the server confirms the write;
- a generic transaction abstraction;
- speculative indexes;
- a broad Case Library rewrite;
- repository-wide `invalidateAll()` removal;
- unrelated Admin UX changes.

Prefer the simplest implementation that meets the acceptance contract and preserves existing behavior.

## Expected performance effect

The immediately proven saving is removal of the ~1.44 s blocking Case Library reload from the classification interaction.

Current representative perceived path:

```text
classification POST ~2.22 s
+ blocking reload    ~1.44 s
≈ ~3.66 s perceived
```

The first goal is therefore to reduce the common interaction to the POST critical path **without issuing the follow-up Case Library reload at all**. Conditional background reconciliation remains available only where current filter/sort/page composition requires it. Bounded classification validation should then reduce additional D1 wait stages. Do not encode an exact production latency target as a test; production/network latency varies.

## Validation and handoff

Use current repository progressive retrieval and validation guidance.

During implementation, run the nearest focused tests for each coherent change. At checkpoint/final handoff, follow `agent:checks` and repository-required validation, including DB checks because the classification helper changes.

Before final handoff:

- inspect the complete intended-base → current-head diff;
- run the focused Case Library Playwright regression once and report its result separately from repository-required validation;
- report focused behavior evidence for classification and inline Tag edits, including timestamp-only failure and filtered-removal selection reconciliation;
- report repository-required final validation actually run;
- keep this PR Draft unless explicitly instructed otherwise;
- reconcile this planning record/documentation status according to `docs/DOCUMENTATION_MAINTENANCE.md`.

Do not deploy Production or mutate Production D1 as part of implementation or validation.
