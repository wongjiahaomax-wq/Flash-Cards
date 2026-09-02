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

## 2. One-active ownership and expiry

`active_reviews.user_id` has a database unique index, so one learner cannot own two active Reviews even when multiple devices race.

The active Review lifetime is seven days. Creation/discovery/cleanup use database write-boundary time rather than a browser timestamp. Creating a replacement batches:

```text
delete this learner's row only if expires_at <= database now
+
insert new active Review
+
insert all frozen child rows
```

as one D1 batch. If another device wins the unique ownership race, the losing request reads and returns the canonical winner instead of creating a second Review.

Ordinary Admin Case deactivation does not cancel an already-frozen active Review. New creation still revalidates current learner content eligibility at the actual insert boundary.

PR D remains responsible for putting the corresponding database-write-time expiry predicate inside its future atomic Scheduled completion transaction and for proving expiry-crossing completion rollback.

## 3. Scheduled creation authority

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

## 4. Current content and scope write-boundary guard

The insert trigger independently requires:

- a current active Production Case;
- an active primary Topic;
- an active selected System;
- current membership in at least one normalized selected route.

Exact Topic routes require the Case primary Topic itself and selected-System ancestry. Curated Tag routes preserve Part B semantics: the Case must currently carry the active Tag and that Tag must currently be curated into the selected System, even when the Case primary Topic belongs to another System.

This avoids a stale pre-read creating a Review after concurrent taxonomy/content changes while preserving the reviewed cross-System curated-Tag behavior.

## 5. Frozen content and Asset lifecycle

Active Review creation loads the exact current learner source once, applies the learner's current persistent Original/Expanded preference, performs the normal question/stimulus selection, and freezes the resulting learner content before progress begins.

Frozen question/answer text lives in `active_review_questions`. Frozen Asset storage key, caption, alt text, stimulus provenance, and display order live in `active_review_assets`.

`active_review_assets.asset_id` retains a restrictive live FK to the current Asset while the temporary Review exists. Therefore an R2-backed Asset cannot be permanently deleted while an active Review still needs it. Removing the active Review cascades the temporary reference, after which ordinary deletion policy can proceed.

## 6. D1-compatible active snapshot benchmark

PR C adds:

```bash
npm run fsrs:active-review-benchmark
```

and a dedicated path-filtered GitHub Actions workflow that also runs:

```bash
npm run db:check
```

The benchmark uses Node's SQLite implementation with the actual `0019` FSRS foundation migration plus new `0020` active Review migration. It records representation size, SQLite database bytes, create/read timing, row counts, text sizes, oversized behavior, and foreign-key violations. It is D1-compatible SQLite evidence, not a Cloudflare network-latency or billing measurement.

At implementation head:

```text
b45122ec6d83a17a76f38671197bab69472a08c3
```

**Learner FSRS active Review benchmark #1** passed and recorded:

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

SQLite/D1-compatible persistence
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

The production-like fixture is a dense current-model synthetic Case used to exercise normal content shape; it is not a claim that every future authored Case is smaller. The deliberately large fixture is fitted to the explicit support ceiling and is the support-boundary evidence.

Timing numbers are evidence for this GitHub runner/SQLite execution only. They are not a Cloudflare D1 latency guarantee.

## 7. Focused invariant coverage

Repository tests cover:

- database-enforced one-active ownership;
- expired replacement using database time;
- a second replacement attempt cannot consume the new unexpired winner;
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
- supported normalized snapshot persistence/read benchmark behavior.

PR D still owns the actual atomic Scheduled completion transaction, completion idempotency, FSRS rating transition, event write, active-Review deletion on successful completion, and completion-vs-expiry crossing tests.

## 8. Rollout boundary

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
