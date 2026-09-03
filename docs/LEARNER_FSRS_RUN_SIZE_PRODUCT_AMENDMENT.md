# Learner FSRS Run Size and Continuous Run Amendment

Status: **Normative product-behavior amendment to `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` for run sizing and between-Case navigation. Planning/implementation contract only; no deployment authorization.**

Date: 3 September 2026

This amendment records a product decision made after the locked learner FSRS baseline. For the specific behavior covered here, it updates the locked plan. All other scheduling, lifecycle, concurrency, persistence, idempotency, server-revalidation, retention, Reset/Fresh, and analytics rules in the existing FSRS authority chain remain unchanged.

The local `/fsrs-preview` route is the first executable surface used to exercise this rule. The rule is **not preview-only**: the eventual learner FSRS runtime cutover must preserve the same semantics. The current production `/study` runtime remains unchanged until that separately reviewed cutover.

## 1. Learner-selected run size

Scheduled Study and Free Study expose these run-size choices:

- **5 Cases**;
- **10 Cases**;
- **20 Cases**;
- **All available**.

Default: **10 Cases**.

The selected target belongs to the browser-local run descriptor. It does not require a D1 study-session/run row or a migration.

## 2. What the target counts

The target counts **distinct Cases introduced/completed in that run**.

A Case consumes at most one target slot even when FSRS schedules that same Case again inside the run. A short-term in-run repeat therefore never consumes another distinct-Case slot.

For Scheduled Study, the existing completed-in-run Case identity set is the distinct-count authority for browser navigation. For Free Study, each bag position represents one distinct Case in that run cycle.

## 3. Scheduled Study at the target

Existing Scheduled queue semantics remain authoritative:

- a matured authenticated in-run repeat still takes priority before captured Due/New work;
- Due/New ordering still follows the learner's existing Due-first/New-first preference with fallback;
- server revalidation still occurs before opening queued work;
- the 50-consecutive-New safety guardrail remains independent and unchanged.

Once the distinct-Case target has been reached:

1. do **not** introduce another captured Due or New Case;
2. if an already-counted Case has a matured required in-run repeat, run it;
3. if an already-counted Case has a future required in-run repeat, keep the run open in the explicit waiting state until that repeat matures or the learner deliberately leaves/stops;
4. only when no required in-run repeat remains is the run complete.

`All available` keeps consuming the captured workload until the existing run semantics end it. In that mode the 50-consecutive-New guardrail can still stop further New introductions while allowing Due and required repeat work exactly as before.

## 4. Free Study at the target

Free Study keeps its shuffled, deduplicated browser-local bag and no-FSRS-transition semantics.

- 5 / 10 / 20 stop after that many distinct bag entries, or earlier if fewer eligible Cases exist.
- All available consumes the full current bag.
- Free completion continues to update only the existing compact Free encounter/receipt owners.

## 5. Continuous between-Case navigation

A run is a continuous Case sequence rather than a sequence of one-Case mini-runs.

After a Scheduled or Free Case successfully completes, the client immediately asks the existing server open boundary for the next item using the **advanced browser descriptor**. If the server opens another eligible Review, navigate directly to that Review without returning to System selection between Cases.

Return to the preview/run screen only when the run cannot immediately continue because it is:

- complete;
- waiting for a required FSRS in-run repeat;
- stopped by the 50-consecutive-New guardrail;
- blocked by an existing/resumable Review or recoverable run-state problem; or
- deliberately left/stopped by the learner.

The browser may perform the completion-to-next-open navigation automatically, but it must not duplicate scheduler, eligibility, active-Review, or completion authority. The existing server-side open/revalidation and Part C–E completion owners remain authoritative.

## 6. Lost-response and idempotency invariant

Continuous navigation must not weaken exactly-once completion behavior.

A matching learner-owned browser descriptor must still reach the receipt-owning Scheduled/Free completion service before active-Review lookup so an identical completion retry remains safe after the first transaction committed and its HTTP response was lost.

Only after a successful completion response has advanced the browser descriptor may the client request the next Review. Failure to open the next Review must not manufacture a second completion or alter the committed scheduler/encounter result.

## 7. Persistence and rollout boundary

Run-size/navigation state remains browser-local. Do not add a persistent D1 run/session row merely for this UX.

This amendment does not authorize:

- changing the current `/study` runtime;
- Production D1/R2 mutation;
- a migration;
- deployment; or
- learner runtime cutover.

Those remain separate reviewed steps under the existing FSRS authority chain.
