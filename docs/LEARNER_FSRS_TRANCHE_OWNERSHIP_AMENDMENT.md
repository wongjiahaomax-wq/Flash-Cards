# Learner FSRS Tranche Ownership Amendment

Status: **Normative implementation-readiness amendment to the merged PR #101 technical design/readiness contract. Planning/implementation contract only; no product-behavior change and no deployment authorization.**

Date: 2 September 2026

This amendment reconciles one tranche-boundary inconsistency between:

- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md`; and
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md`.

The underlying lifecycle, concurrency, expiry, deactivation, idempotency, and Reset/Fresh invariants remain required. This amendment changes **which focused implementation tranche must establish each side of those invariants** so a tranche is not required to implement a later tranche's operation merely to prove a cross-operation race.

For tranche ownership only, this amendment supersedes the conflicting assignment language described below. It does not supersede the locked product plan or weaken any invariant required before learner runtime cutover.

## 1. Superseded PR-C assignment language

In the technical design's `PR C — active Review lifecycle + ownership primitive` decomposition, these PR-C bullets are too broad as tranche acceptance criteria:

- `write-time consume/expiry guard`;
- `creation-vs-Reset/Fresh and completion concurrency tests`.

In the readiness contract's `PR C — temporary active Review lifecycle` checklist, these statements are cross-tranche programme invariants rather than requirements that PR C itself implement later operations:

- `completion/replacement/cleanup expiry serialization`;
- `frozen Review remains completable after ordinary Admin deactivation`.

Likewise, any PR-C checklist/example that requires the actual Scheduled completion transaction, completion idempotency/rating conflict resolution, completion-after-expiry rollback, or the Reset/Fresh writer is reassigned below to the tranche that owns that operation.

The general design sections describing the desired final serialized outcomes remain valid. Only the focused PR ownership is corrected.

## 2. PR C — temporary active Review lifecycle

PR C owns and must establish/prove:

- database-enforced one-active Review ownership per learner;
- atomic active-Review creation with write-boundary checks for current authenticated run/profile/scheduler/scope/classification state and captured/repeat membership;
- creation-side stale-boundary rejection, including rejection when a Reset/Fresh/profile-boundary change has already committed;
- non-mutating discovery plus Resume / Discard primitives;
- exact frozen content and active Asset lifecycle protection;
- ordinary Admin deactivation not deleting, rewriting, or invalidating an already-frozen Review for later completion;
- synchronous expired-row replacement using database write-boundary time;
- multi-device expired replacement serialization;
- database-time expiry cleanup;
- the measured frozen-payload support envelope and clean oversized rejection.

PR C proves the **creation/replacement/cleanup side** of the cross-operation lifecycle contract. Because PR C does not expose a learner completion path and does not implement Reset/Fresh, it is not required to manufacture those later writers solely to test their side of a race.

## 3. PR D — Scheduled completion

PR D owns and must establish/prove the Scheduled completion side, including:

- the actual atomic Scheduled completion transaction;
- a database-write-boundary guard proving the exact active Review still exists, belongs to the learner, and is unexpired when completion commits;
- atomic active-Review consume together with Scheduled event/state/optimizer/encounter/aggregate writes;
- full completion-versus-expiry/replacement/cleanup serialization;
- expiry-crossing rollback with no partial completion writes;
- successful completion of an already-frozen Scheduled Review after ordinary Admin Case deactivation, without re-reading current Case eligibility as authority to cancel that frozen Review;
- Scheduled idempotency, same-rating replay, different-rating conflict semantics, and competing completion/rating races;
- successful committed completion as the normal issuer of authenticated same-run repeat-origin evidence.

Thus the readiness-contract requirement that a frozen Review "remains completable" is completed by PR C preserving the frozen Review and PR D proving the actual Scheduled completion path over that preserved snapshot.

## 4. PR E — Free completion

PR E owns the corresponding Free-completion side for Free Study:

- atomic encounter/receipt update plus active-Review consume;
- database-write-boundary active-Review expiry/existence guard;
- exactly-once retry behavior;
- completion of a valid frozen Free Review without ordinary Admin deactivation retroactively cancelling the frozen Review.

PR E may reuse a shared consume/expiry primitive established during PR D if that keeps one authoritative transaction boundary, but it must preserve Free Study's no-FSRS-transition semantics.

## 5. PR F — Reset Progress / Fresh FSRS Start

PR F owns the Reset/Fresh writer and therefore the full two-sided creation-vs-Reset/Fresh concurrency proof:

- if Reset/Fresh commits first, PR C's creation-side boundary guard must make stale Scheduled creation fail;
- if active-Review creation commits first, Reset/Fresh must atomically invalidate/delete the active Review together with the relevant generation/sequence/state boundary change;
- after Reset/Fresh commits, no active Review may survive on a stale generation/sequence boundary.

PR C's stale-boundary creation guard is a prerequisite for this invariant, but PR F is the tranche that can complete the race proof because PR F owns the Reset/Fresh operation itself.

## 6. Cross-tranche acceptance rule

A focused tranche may be accepted without implementing a later tranche's operation when:

1. it implements and proves its own side of the shared invariant;
2. the later side is explicitly assigned here to its owning tranche;
3. learner runtime cutover remains blocked until all required sides are implemented and proven.

Therefore PR C can be complete after proving active ownership, creation, freeze, Resume/Discard, replacement, cleanup, and its write-boundary creation guards. PR D/E/F remain responsible for the completion and Reset/Fresh sides above before those capabilities or the eventual learner cutover may be considered complete.

No Production D1/R2 mutation, migration application, deployment, or learner runtime enablement is authorized by this amendment.
