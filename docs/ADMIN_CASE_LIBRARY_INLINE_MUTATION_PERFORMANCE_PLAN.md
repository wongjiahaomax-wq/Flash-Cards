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
→ no blocking full-page invalidation
```

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

For the normal `select-topic` operation, return an authoritative projection sufficient for the Case Library UI to reconcile the affected Case after the server commit.

The successful interaction must no longer wait for a full `invalidateAll()` before closing.

The Case Library must immediately reflect whether the changed Case still belongs in the current filtered result set. In particular, under `system=unassigned`, assigning the Case to a Topic with a System ancestor must remove that Case from the visible list without waiting for a whole-page reload.

Use the smallest existing Svelte state/callback pattern that fits the current page. Do not add a client state library or generic mutation framework.

### 2. Bound the `promoteCaseTopic()` validation read model

Replace broad taxonomy loading in this mutation with only the rows needed to establish its invariants.

Reduce avoidable serial database phases where independent validation reads can safely be issued together.

Do not weaken the explicit Production Case guard or active-Topic validation.

Do not simply put the Primary Topic write and Case timestamp touch into one transactional batch if doing so would change the existing best-effort timestamp failure semantics.

Preserve the legacy-secondary promotion behavior.

### 3. Apply the same pattern to clearly row-local Case Tag mutations

Inspect the current inline Case Tag mutation path and remove blocking whole-page invalidation where the server can return enough authoritative data to reconcile the affected row safely.

Prioritize existing-Tag add/remove because those are unambiguously row-local.

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
| Classification no longer blocks on full Case Library reload | A successful `select-topic` closes/reconciles from the POST result without awaiting `invalidateAll()` | Focused executable UI/component behavior covering the real success path |
| Filter reconciliation is correct | On `system=unassigned`, moving a Case under a System removes it from the visible result set immediately | Focused executable Case Library interaction proof |
| Server response is authoritative | Client-visible Topic/System state comes from server-confirmed mutation data, not a speculative success assumption | Route/helper test plus UI behavior proof |
| Classification semantics are preserved | Active Production Case, exactly one canonical Primary Topic, active target Topic, and legacy-secondary behavior remain correct | Existing/focused DB tests |
| Timestamp remains best-effort | Timestamp-only failure cannot roll back or report failure for an already completed classification change | Existing/focused executable DB test |
| Common classification read path is bounded | `promoteCaseTopic()` no longer loads the complete taxonomy merely to change one Case classification | Focused DB/read-path proof at the appropriate helper/query layer |
| Row-local Tag edits avoid whole-page blocking reload | Existing-Tag add/remove updates the affected row without awaiting full Case Library invalidation | Focused executable inline Tag UI behavior proof |
| Global mutations remain correct | Shared taxonomy/global-option mutations still obtain authoritative page state where local reconciliation would be unsafe | Existing/focused tests for retained reload path |

Static/source-regex checks may supplement these tests but must not be the only proof for interaction behavior.

## Scope / non-goals

Do not add:

- schema changes or migrations;
- cache/KV/Redis infrastructure;
- client state-management libraries;
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

The first goal is therefore to reduce the interaction to the POST critical path. Bounded classification validation should then reduce additional D1 wait stages. Do not encode an exact production latency target as a test; production/network latency varies.

## Validation and handoff

Use current repository progressive retrieval and validation guidance.

During implementation, run the nearest focused tests for each coherent change. At checkpoint/final handoff, follow `agent:checks` and repository-required validation, including DB checks because the classification helper changes.

Before final handoff:

- inspect the complete intended-base → current-head diff;
- report focused behavior evidence for classification and inline Tag edits;
- report repository-required final validation actually run;
- keep this PR Draft unless explicitly instructed otherwise;
- reconcile this planning record/documentation status according to `docs/DOCUMENTATION_MAINTENANCE.md`.

Do not deploy Production or mutate Production D1 as part of implementation or validation.
