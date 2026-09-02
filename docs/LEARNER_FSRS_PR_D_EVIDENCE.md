# Learner FSRS PR D — Scheduled Study / FSRS completion evidence

Status: **Implementation evidence for PR D only. No learner runtime cutover, Free Study completion, Reset/Fresh writer, optimizer execution, deployment, or Production D1/R2 mutation.**

Date: 2 September 2026

PR D starts from `main` after merged PR #132 / Part C:

```text
68d5870d7e9c550c781f98965fe62b15e0a45a8a
```

It implements the bounded **Scheduled Study / FSRS completion** tranche assigned by the learner FSRS design merged through PR #101 and the normative tranche-ownership amendment.

## 1. Completion transaction

`completeScheduledReview()` owns the Scheduled completion boundary. One native D1 atomic batch writes:

```text
scheduled_review_events
+
learner_optimizer_evidence
+
learner_case_fsrs
+
learner_case_encounters
+
learner_aggregates
+
learner_system_aggregates
+
active Review consume
```

The completed Scheduled event uses the active Review ID as the durable idempotency receipt. The event stores only compact completion/run provenance needed to reconstruct the committed response and authenticate a later same-run repeat; it does not persist an ordinary Study session or Topic/Tag route snapshot.

Migration `0021_learner_fsrs_scheduled_completion.sql` adds that compact retry/proof context and database triggers that independently enforce the active Scheduled Review, reveal state, profile/scheduler boundary, current captured Case state, and database-time expiry at the write boundary.

## 2. FSRS transition and four ratings

Scheduled completion uses the repository-owned pinned `ts-fsrs` adapter for:

- Again;
- Hard;
- Good;
- Easy.

The transition is prepared from the exact active Review boundary and the current learner × Case state. New completion requires that no current learner FSRS state has appeared. Due/repeat completion requires the exact captured `state_revision`, Due time, generation, review-sequence epoch, parameter revision, scheduler revision, and scheduler library version.

The successful write increments the Case state revision once and records the resulting state and next Due time in the durable event.

The real workerd + local-D1 validation owns all three Scheduled completion queue branches:

- **New** — initializes the learner × Case state at revision 1;
- **Due** — starts from a pre-existing mature FSRS state, advances optimizer sequence 1 → 2, updates the existing learner × Case row at revision 1 → 2, records matching event result state/Due evidence, and consumes the active Review exactly once;
- **Repeat** — starts from a pre-existing matured short-term FSRS state, advances optimizer sequence 1 → 2, updates that same learner × Case row at revision 1 → 2, records matching event result state/Due evidence, and consumes the active Review exactly once.

The Due/Repeat smoke seeds the durable footprint of an earlier Scheduled completion while deliberately omitting its human-readable event row, which is a legitimate retained-state shape after detailed-history pruning. The compact optimizer evidence, encounter marker, lifetime aggregates, and current FSRS state therefore prove the writer's update path rather than a second New initialization.

## 3. Frozen Review and expiry authority

Ordinary Admin Case deactivation after the Review was frozen does not retroactively cancel that Review. Scheduled completion therefore does not re-read current Case eligibility as authority to invalidate already-frozen content.

Expiry is different: the active Review must still be unexpired at database write time. `0021` checks expiry before event insertion and again at final active-Review consume. The focused SQLite regression deliberately crosses expiry between those two boundaries and proves the transaction rolls back with no durable Scheduled event.

PR C continues to own creation/replacement/cleanup semantics. PR D owns the completion side and proves that completion serializes coherently against expiry, explicit Discard, and expired cleanup.

## 4. Idempotency and competing completion semantics

The durable Scheduled event is the completion receipt.

- A same-rating retry returns the previously committed result and never performs a second FSRS transition.
- A different-rating retry returns the committed result with `payloadMismatch = true`; it does not apply the newly requested rating.
- Two same-rating completion requests racing on one active Review produce exactly one committed completion and one replayed result.
- Two **different** ratings racing on one active Review produce exactly one committed rating/transition; the losing request reconciles to that committed outcome and reports payload mismatch.

The workerd + local-D1 smoke checks the durable counts after those races and requires exactly one event, optimizer row, Case state, encounter row, learner aggregate increment, and System aggregate increment, with no active Review left.

## 5. Completion versus Discard / cleanup

The actual D1 writer smoke also races completion against `discardActiveReview()`.

Allowed serialized outcomes are intentionally narrow:

```text
completion wins
→ one complete atomic Scheduled mutation
→ active Review consumed
→ Discard reports no row to delete

Discard wins
→ active Review deleted
→ completion rejects
→ zero Scheduled event/state/evidence/aggregate mutation
```

An already-expired Review is also raced against `cleanupExpiredActiveReviews()`. Completion must reject and cleanup must leave zero partial completion state. Together with the deterministic expiry-crossing rollback regression, this establishes the PR-D side of completion-versus-expiry/replacement/cleanup serialization without reimplementing PR C's replacement writer inside PR D.

## 6. Authenticated in-run repeat

Only a **committed** Scheduled completion may issue authenticated same-run repeat-origin evidence.

A result enters the browser-local repeat lane only when the resulting FSRS state is one of the adapter's short-term learning/relearning states. The proof binds the authenticated run boundary, Case, resulting state revision, and Due time.

Repeat maturity is evaluated using a server-supplied timestamp. There is deliberately no browser-clock fallback. Matured authenticated repeats take priority over captured Due/New work.

The real Repeat-completion D1 fixture begins from a matured short-term FSRS state rather than a New card, so migration `0021`'s existing-state `queue_class = 'repeat'` guard and the writer's update branch are exercised end to end.

## 7. Browser-local run behavior

`src/lib/scheduled-study-run.js` keeps ordinary navigation state browser-local and bounded:

- Due-first is the default with New fallback;
- New-first preference is supported with Due fallback;
- only the captured Due/New queues are consumed as unrelated work;
- matured authenticated repeats pre-empt captured Due/New work;
- future repeats produce an explicit waiting state;
- 50 consecutive committed New introductions block another New introduction but do not block Due or matured repeat work;
- committed Due resets the New streak;
- repeat completion is neutral to the New streak;
- completion replay after the local descriptor already advanced is harmless;
- skip advances/removes only the authenticated current queue item.

The 50-New limit remains a normal-client UX guardrail, not server authorization.

## 8. Validation ownership

The dedicated workflow `.github/workflows/learner-fsrs-scheduled-completion.yml` runs:

```bash
npm run db:check
node --test test/learner-fsrs-scheduled-completion.test.js test/learner-fsrs-scheduled-run.test.js
node scripts/learner-fsrs-scheduled-completion-d1-smoke.mjs
node scripts/learner-fsrs-scheduled-due-repeat-d1-smoke.mjs
```

The first D1 smoke applies the complete repository migration history to an isolated **local** D1 database, bundles the real implementation under workerd, invokes the actual New Scheduled completion writer, and verifies idempotency plus completion-versus-Discard/cleanup race behavior.

The second D1 smoke independently applies the same migration chain and invokes the actual writer for **Due and Repeat over pre-existing FSRS state**. It requires:

- event `queue_class` to match the completed branch;
- optimizer `sequence_no` to advance from 1 to 2;
- resulting event and current-state `state_revision` to advance from 1 to 2;
- durable event state and Due time to equal the returned committed result;
- exactly one current learner × Case row and encounter row;
- lifetime and System Scheduled aggregates to advance from 1 to 2;
- zero active Reviews after successful completion.

Because the lifecycle-race smoke directly imports `discardActiveReview()` and `cleanupExpiredActiveReviews()`, `src/lib/server/db/active-reviews.js` is explicitly included in the specialized workflow path filter. A later lifecycle-writer change therefore reruns the Part-D completion-versus-Discard/cleanup integration rather than relying only on the Part-C workflow.

General CI, the repository Wrangler runtime smoke, and the learner FSRS browser benchmark remain additional handoff checks for this tranche.

No validation command in this document authorizes a remote migration, deployment, or Production D1/R2 mutation.

## 9. Documentation authority during staged FSRS implementation

`V1_DATA_MODEL.md` still describes the currently cut-over learner runtime model and predates the staged FSRS migrations. Parts A–D deliberately have not switched the learner runtime to FSRS yet.

Until the explicit learner-runtime cutover tranche updates the living V1 model, exact staged-FSRS implementation facts are read in this order:

1. current code, committed migrations, executable tests, and workflows;
2. the locked FSRS product plan plus technical/readiness/tranche-ownership contracts for intended behavior;
3. `LEARNER_FSRS_PR_A_EVIDENCE.md`, `LEARNER_FSRS_PR_B_EVIDENCE.md`, `LEARNER_FSRS_PR_C_EVIDENCE.md`, and this PR-D evidence for implemented staged boundaries.

This is an interim implementation-record rule only. It does not claim that migrations `0019`–`0021` are deployed to Production or that the learner runtime has been cut over.

## 10. Deliberate exclusions

PR D does **not** implement:

- learner `/study` runtime cutover;
- Free Study completion / short-lived Free receipt;
- Reset Progress or Fresh FSRS Start;
- optimizer execution or parameter replacement;
- retention cleanup / learner Progress / Admin analytics;
- legacy Review persistence removal;
- Production migration application or deployment.

Those remain owned by later reviewed tranches and the explicit cutover/deployment gates.
