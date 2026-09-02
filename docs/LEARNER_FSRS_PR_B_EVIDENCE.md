# Learner FSRS PR B — systems-first run-planning evidence

Status: **Implementation evidence for PR B only. No learner Review runtime cutover.**

Date: 2 September 2026

PR B starts from `main` after merged PR #130 / Part A:

```text
5a8d66d7c4b7c370002db74c97ae7df7dc2f3e9a
```

It implements the bounded **systems-first UX transplant + run planning** tranche from the learner FSRS design merged through PR #101.

## 1. Scope retained from PR #119

PR #119 remains a reference branch, not a merge dependency.

PR B selectively reuses its systems-first System → exact Topic / curated Tag chooser semantics, all-contributing-routes-selected default, OR/union Case selection, Case deduplication, exact Topic semantics, canonical Topic-over-Tag provenance, curated-Tag precedence, structural parent controls, exact/subtree counts, and route normalization/validation.

PR B deliberately does **not** port permanent selection tables, `study_selection_id`, persistent selection-route provenance, PR #119's migration, per-run Original / Expanded Learning selection, or Review creation/continuation behavior.

The reusable chooser accepts an explicit `scheduled` or `free` mode and has no question-set selector. Expanded Learning remains the persistent learner preference established by Part A.

## 2. Run descriptor ownership

For Scheduled Study, at one server-generated `runStartedAt`, the planner normalizes/resolves the selected scope, bootstraps the learner preference/profile boundary, reads learner FSRS and compact encounter state without an N+1 query, partitions selected Cases into Due/New/not-due, orders Due by lowest FSRS retrievability, orders New as shuffled unseen then shuffled previously-encountered groups, creates one authenticated run boundary, attaches authenticated Due/New membership evidence, and initializes repeat/completed/current-Review/consecutive-New browser state.

Currently not-due Cases are absent from the captured workload. Due/New preference and Expanded Learning values in the descriptor are convenience snapshots; D1 preferences remain the cross-device owner.

The Free descriptor contains the same normalized scope plus one deduplicated shuffled Case bag, position, current Review reference, and Expanded Learning preference snapshot. It does not initialize/read FSRS profile/state and contains no scheduler proof.

## 3. Authenticated Scheduled boundary and membership

Browser `localStorage` is not scheduling authority.

PR B uses versioned HMAC-SHA-256 proofs with domain-separated key derivation from a server proof secret. No D1 run/session row is introduced.

The run-boundary proof binds learner, run id, server start time, normalized scope fingerprint, FSRS generation, review-sequence epoch, parameter revision, scheduler revision/library version, and proof version.

Captured workload uses authenticated **64-entry membership chunks** rather than one capability per Case. Each chunk binds learner/run/scope/queue class and a digest of the authenticated run boundary. Due entries additionally authenticate Case id, captured `state_revision`, and captured Due timestamp; New entries authenticate captured Case membership.

Verification rejects wrong learner, bad signature, cross-run/boundary/scope replay, Due/New queue replay, and Case substitution outside the authenticated chunk. The later Scheduled-open PR still owns current profile/content/scope/state revalidation before work is opened.

## 4. 50-New guardrail

The descriptor initializes `consecutiveNewCompleted = 0`. This is browser UX state only. PR B adds no server counter, replay ledger, run/session row, or authorization dependence for the 50-New rule.

## 5. Browser/proof benchmark

PR B adds:

```bash
npm run fsrs:run-benchmark
```

It uses the actual proof implementation and actual systems-first selection resolver, comparing the chosen chunk representation with equivalent per-entry capabilities.

An implementation-time run of the exact proof/serialization code for 1,000 Due + 4,000 New (5,000 total) measured:

```text
64-entry chunks:
  descriptor bytes: 395,549
  proof count:       79
  proof bytes:       150,562
  max one proof:     3,016 bytes

one proof per entry:
  descriptor bytes: 1,824,809
  proof count:       5,000
  proof bytes:       1,556,000
  max one proof:     328 bytes

chunked/per-entry descriptor ratio: ~0.217
chunked/per-entry proof-byte ratio: ~0.097
```

The same run measured roughly 1 ms-class JSON serialization/parsing for the chunked descriptor in the implementation environment. These are Node UTF-8 serialization numbers, **not** a universal browser quota or Cloudflare latency claim. The executable benchmark also reports actual selection-resolver timing wherever it is run.

## 6. D1-compatible planning-read benchmark

PR B adds:

```bash
npm run fsrs:run-d1-benchmark
```

It uses migration `0019_learner_fsrs_foundation.sql` and measures the exact user-bounded reads used by PR B:

```text
learner_case_fsrs WHERE user_id = ?
learner_case_encounters WHERE user_id = ?
```

It records representative occupancy, returned rows, timings, SQLite query plans, and foreign-key violations. This avoids candidate-sized SQL parameter lists and per-Case N+1 reads. It is D1-compatible SQLite evidence, not Cloudflare rows-read billing/network-latency evidence.

## 7. Rollout boundary

PR B deliberately does **not** connect the new planner/chooser to the current learner `/study` Review runtime. The legacy Review start path remains until active-Review ownership/frozen-payload and Scheduled completion/cutover work exist.

Therefore PR B adds no learner runtime cutover, migration, Production mutation, deployment, active Review lifecycle, FSRS completion transaction, Free completion receipt, or Reset/Fresh behavior.

## 8. Focused implementation-time checks

Before the branch write, the proof module plus proof/representation benchmark tests were executed in an isolated Node mirror of the exact draft code: **5/5 passed**. The representative browser/proof benchmark above was also executed from that exact draft code.

This is not a claim that repository-wide validation ran locally. Remote GitHub CI remains authoritative for the branch; exact-head CI evidence should be appended after the Draft PR is checked.
