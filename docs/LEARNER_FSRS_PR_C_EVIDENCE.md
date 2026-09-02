# Learner FSRS PR C — temporary active Review lifecycle evidence

Status: **Implementation evidence for PR C only. No learner Review runtime cutover and no Scheduled completion transaction.**

Date: 2 September 2026

PR C starts from `main` after merged PR #131 / Part B:

```text
e549332e8a7cb4334e86a75ce0124625864a31d9
```

It implements the bounded **temporary active Review lifecycle** tranche from the learner FSRS design merged through PR #101.

## 1. Physical snapshot decision

PR C chooses the reviewed **normalized active snapshot** representation:

```text
active_reviews
  compact ownership/run/scope/scheduler metadata
  frozen Case title + vignette

active_review_questions
  exact frozen selected question/answer content + source provenance

active_review_assets
  exact frozen learner asset ordering/storage metadata
  live restrictive Asset reference for R2 deletion safety
```

The temporary child rows cascade when the active Review is completed, discarded, or expired. This is intentionally not durable learner history; later durable completion/event rows remain separate responsibilities.

The active Review support envelope is fixed at:

- **512 KiB** for the exact serialized frozen Case/question/asset content envelope before persistence;
- **256 frozen questions** maximum;
- **64 learner assets** maximum.

Content above any boundary is rejected before the active Review is created. Vignette, prompt, answer, caption, alt text, and provenance content are never silently truncated to fit the limit.

## 2. One-active ownership and expiry serialization

`active_reviews.user_id` has a database unique index, so one learner cannot own two active Reviews even when multiple devices race.

The active Review lifetime is seven days. Resume discovery is deliberately **non-mutating**: it uses database time and returns only an unexpired active Review. An expired row is unavailable for Resume but remains physically owned until either explicit cleanup or a replacement create consumes it.

Replacement creation uses one native D1 `batch` containing:

```text
delete this learner's row only if expires_at <= database now
+
insert the new active Review parent
+
insert all frozen questions through json_each(?)
+
insert all frozen assets through json_each(?)
```

The expired ownership row is therefore not deleted during an earlier read/discovery step. It is consumed in the same atomic database batch that establishes the replacement and its frozen children. If another device establishes an unexpired winner first, the uniqueness boundary prevents a second active owner and the losing request reads and returns the canonical winner.

Explicit cleanup also evaluates expiry from database time. Ordinary Admin Case deactivation does not cancel an already-frozen active Review. New creation still revalidates current learner content eligibility at the actual insert boundary.

PR D remains responsible for putting the corresponding database-write-time expiry predicate inside its future atomic Scheduled completion transaction and for proving expiry-crossing completion rollback.

## 3. D1 write-shape boundary

The normalized representation does not issue one bound parameter per frozen child column. D1 has a per-query bound-parameter ceiling, so PR C serializes each child collection once and expands it inside SQLite/D1 with `json_each(?)`.

The create batch therefore uses at most four statements:

1. expired-owner conditional delete;
2. parent insert;
3. question child insert with one JSON collection binding;
4. asset child insert with one JSON collection binding.

The parent statement has a bounded fixed binding count; each child statement has one collection binding regardless of whether the supported fixture contains one child or the maximum 256 questions / 64 assets. This keeps the advertised support envelope independent of a multi-row prepared-statement parameter explosion while preserving one atomic D1 batch.

## 4. Scheduled creation authority

Browser state is not scheduling authority.

Scheduled active Review creation requires the Part B authenticated run-boundary token plus either:

- captured Due/New membership proof from the authenticated run; or
- authenticated same-run repeat-origin proof.

Before persistence, application code revalidates the normalized selected scope, current candidate membership, current learner FSRS profile boundary, and current Case state. The migration also has write-boundary triggers that independently reject stale profile/state or content/scope changes that race those reads.

The active Review captures:

- run ID and normalized scope fingerprint/JSON;
- FSRS generation;
- review-sequence epoch;
- parameter revision;
- scheduler revision and scheduler library version;
- expected Case `state_revision` and Due timestamp where applicable;
- server run start for Scheduled work.

Due creation requires the captured/current Due time to have been due at authenticated run start and still due at request/write time. Repeat creation requires the committed resulting state proof and server-clock maturity. New creation fails if any learner FSRS state now exists for that Case.

PR C defines the repeat-origin proof primitive because active Review creation must be able to verify it. PR D is the only normal learner flow intended to issue that proof, after a successful committed Scheduled completion.

## 5. Current content and scope write-boundary guard

The insert trigger independently requires:

- a current active Production Case;
- an active primary Topic;
- an active selected System;
- current membership in at least one normalized selected route.

Exact Topic routes require the Case primary Topic itself and selected-System ancestry. Curated Tag routes preserve Part B semantics: the Case must currently carry the active Tag and that Tag must currently be curated into the selected System, even when the Case primary Topic belongs to another System.

This avoids a stale pre-read creating a Review after concurrent taxonomy/content changes while preserving the reviewed cross-System curated-Tag behavior.

## 6. Frozen content and Asset lifecycle

Active Review creation loads the exact current learner source once, applies the learner's current persistent Original/Expanded preference, performs the normal question/stimulus selection, and freezes the resulting learner content before progress begins.

Frozen question/answer text lives in `active_review_questions`. Frozen Asset storage key, caption, alt text, stimulus provenance, and display order live in `active_review_assets`.

`active_review_assets.asset_id` retains a restrictive live FK to the current Asset while the temporary Review exists. Therefore an R2-backed Asset cannot be permanently deleted while an active Review still needs it. Removing the active Review cascades the temporary reference, after which ordinary deletion policy can proceed.

## 7. Representation/storage benchmark

PR C retains:

```bash
npm run fsrs:active-review-benchmark
```

The benchmark uses Node's SQLite implementation with the actual `0019` FSRS foundation migration plus new `0020` active Review migration. It records representation size, SQLite database bytes, create/read timing, row counts, text sizes, oversized behavior, and foreign-key violations.

At the original implementation checkpoint, **Learner FSRS active Review benchmark #1** recorded:

```text
Limits
  frozen content envelope: 524,288 bytes
  frozen questions:        256
  learner assets:          64

Production-like current-model fixture
  serialized frozen bytes: 111,400

Deliberately large supported fixture
  serialized frozen bytes: 523,776
  headroom to ceiling:          512
  question rows:                256
  asset rows:                    64

SQLite representation/storage persistence
  database bytes before:    249,856
  database bytes after:     806,912
  database bytes delta:     557,056
  create:                      4.206 ms
  resume read:                 0.795 ms
  max prompt chars/row:          865
  max answer chars/row:          865
  foreign-key violations:          0

Oversized fixture
  serialized frozen bytes: 802,907
  rejected before creation: yes
```

The production-like fixture is a dense current-model synthetic Case used to exercise normal content shape; it is not a claim that every future authored Case is smaller. The deliberately large fixture is fitted to the explicit support ceiling.

These Node SQLite measurements remain representation/storage evidence only. They are not the sole D1 writer-compatibility proof and are not Cloudflare network-latency or billing guarantees.

## 8. Actual workerd + local D1 writer proof

PR C also adds:

```bash
npm run fsrs:active-review-d1-smoke
```

The dedicated active-Review workflow applies the real repository migrations to an isolated **local** Wrangler D1 database, starts the bundled Worker under workerd, seeds a maximum-count Case, and calls the actual `createFreeActiveReview()` lifecycle primitive.

The smoke fixture contains:

- 256 questions;
- 64 assets;
- dense prompt/answer content comfortably above a trivial fixture size while remaining under the 512 KiB active-snapshot envelope.

At correction head `0ccb18d2d5537118c3629f2b22a84d70fadbc1e3`, **Learner FSRS active Review benchmark #6** passed the real writer path and recorded:

```text
runtime:                              workerd + local D1 binding
compatibility date:                   2026-03-23
maximum questions:                    256
maximum assets:                        64
initial frozen snapshot bytes:    446,565
replacement frozen snapshot bytes:446,565
discovery preserved expired owner:    true
replacement created new owner:        true
```

The smoke performs three lifecycle checks through the actual implementation:

1. create and read the maximum-count supported active Review through the D1 binding;
2. expire it using database state, verify `getActiveReview()` hides it **without deleting it**, and verify the physical ownership row remains;
3. call the real create helper again, verify the expired row is replaced by a different active Review ID, and verify exactly one ownership row remains.

This is local workerd/D1 execution evidence for the production writer boundary. It does not mutate remote or Production D1 and is not a Cloudflare network-latency measurement.

## 9. Focused invariant coverage

Repository validation now covers:

- database-enforced one-active ownership;
- non-mutating Resume discovery hiding expired ownership by database time;
- real create-helper replacement consuming the expired owner only inside the create batch;
- a second replacement attempt cannot consume a new unexpired winner;
- actual maximum-count 256-question / 64-asset persistence through local workerd + D1;
- active Review child cascade cleanup;
- live active-Review Asset references blocking permanent Asset deletion;
- an already-frozen Review surviving ordinary Admin Case deactivation;
- stale Scheduled profile boundary rejection;
- stale Due/Repeat Case-state rejection;
- New rejection after concurrent FSRS state creation;
- current content/scope write-boundary rejection;
- curated Tag cross-System scope parity with Part B;
- authenticated repeat-origin proof owner/run/boundary/Case binding;
- oversized exact-content rejection without truncation;
- supported normalized snapshot representation/storage benchmark behavior.

PR D still owns the actual atomic Scheduled completion transaction, completion idempotency, FSRS rating transition, event write, active-Review deletion on successful completion, and completion-vs-expiry crossing tests.

The authoritative tranche-ownership chain is documented in `DOCUMENTATION_INDEX.md` and `LEARNER_FSRS_TRANCHE_OWNERSHIP_AMENDMENT.md`. The locked product plan remains superior for product behavior; the amendment controls only conflicting focused-PR ownership assignments.

## 10. Rollout boundary

PR C deliberately does **not** connect these primitives to the current learner `/study` runtime. The legacy Review runtime remains in place until Scheduled completion/cutover work exists.

Therefore this PR performs no:

- learner runtime cutover;
- FSRS rating/completion transition;
- durable Scheduled event write;
- Free completion receipt;
- Reset/Fresh behavior;
- retention/Progress/Admin analytics work;
- Production D1/R2 mutation;
- deployment;
- merge or Ready-for-Review transition.

The PR remains Draft for independent review.
