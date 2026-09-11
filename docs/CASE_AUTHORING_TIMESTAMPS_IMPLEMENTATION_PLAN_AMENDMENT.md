# Case Added / Last Edited Metadata — Concurrency-Safe Compensation Amendment

_Status: normative planning amendment for Draft PR #176 after the post-first-amendment implementation-readiness review. This supplements `docs/CASE_AUTHORING_TIMESTAMPS_IMPLEMENTATION_PLAN.md`; where the base plan's compensation wording conflicts with this file, this amendment controls. Feature implementation is still pending._

## Why this amendment exists

The amended base plan correctly requires both:

- monotonic `cases.updated_at`; and
- truthful rollback/compensation when a Case-local authoring transition is reverted.

One remaining concurrency conflict exists if compensation is interpreted as an unconditional write of the pre-operation timestamp.

Example:

```text
Case updated_at = T0
operation A persists tentative Case-local state and touches to T1
operation B then performs a real Case edit and touches to T2, where T2 > T1
operation A later fails its postcondition and compensates its own authored state
```

A blind `updated_at = T0` compensation for A would erase B's newer edit time and violate the monotonicity contract. A simple `max(current, T0)` is also insufficient because, when no B exists, it would leave A's own T1 behind after A was fully compensated and would falsely report a Case edit.

A scalar timestamp therefore must not be treated as a unique operation/version token.

## Controlling compensation rule

For a Case-local authoring operation that can require post-write compensation:

1. **Never unconditionally restore the pre-operation `updated_at`.** Compensation must not overwrite a newer concurrent Case timestamp.
2. **Do not assume equality with an operation timestamp uniquely identifies this operation.** Distinct operations can have equal millisecond timestamps; timestamp equality alone is not a safe ownership/CAS token.
3. Prefer eliminating the timestamp-compensation ambiguity by making the operation's existing concurrency/postcondition fence part of the **same atomic D1 unit** as the authored-state transition and monotonic Case touch, so a failed fence rolls back both before either becomes durable.
4. An implementation may retain a compensation model only if it has an equally strong concurrency-safe condition that can distinguish the state written by this operation from later independent Case edits without introducing an audit/version subsystem. The final timestamp after compensation must be exactly the newest truthful Case-local authoring time that remains represented by persisted state.
5. Preserve the current user-visible all-set/concurrency behavior. Strengthening the atomic fence is allowed when it replaces a post-write compensate-on-conflict implementation with equivalent or stronger all-or-nothing behavior; do not broaden atomicity across intentionally independent operations such as separate Save All drafts.
6. If a current writer's scalar state cannot support safe timestamp compensation under interleaving, **do not guess**. Restructure only that writer's existing verification/fence so the original authored-state change + timestamp + concurrency sentinel either all commit or all roll back.

This is not authorization to add a new schema column, revision counter, audit event table, general transaction framework, or application-wide optimistic-locking system.

## Interaction with monotonicity and partial persistence

The final invariant is:

```text
successful durable Case-local transition
→ content and monotonic timestamp become durable together

failed atomic/concurrency fence
→ neither this transition nor its timestamp becomes durable

intentionally independent earlier transition followed by later failure
→ earlier content and its truthful timestamp both remain durable

compensation/interleaving with a later independent Case edit
→ compensation may undo only its own authored state; it must never lower or erase the later edit's timestamp
```

The existing Save All contract remains unchanged: each draft is an independently durable logical operation. This amendment does not make the whole Save All request transactional.

## Required executable proof

Add focused deterministic failure/interleaving coverage for at least one current Production writer that today uses post-write verification/compensation or an equivalent concurrency-sensitive path.

The proof must establish:

```text
A starts from T0
A attempts a Case-local transition using controlled T1
B performs a later real Case-local edit using controlled T2 > T1
A's conflict/failure path runs
→ B's durable authored state is not incorrectly reverted by A
→ final Case updated_at is not lower than T2
→ A does not leave a false timestamp if its own Case-local state is fully rolled back
```

Where the implementation replaces post-write compensation with an in-batch concurrency sentinel, prove the equivalent race/failure outcome: the conflicting A batch rolls back its authored state and touch together while the independent newer operation remains authoritative.

Also retain the base plan's two-direction atomic failure proof and deterministic-clock requirements. Do not use sleeps, schema-default timing, or production failure switches.

## Final planning-review conclusion

After adding this concurrency-safe compensation rule, the planning contract resolves the remaining conflict found in the post-amendment review:

- Case-local content/timestamp atomicity is explicit;
- intentionally partial persistence remains truthful;
- compensation cannot blindly regress a newer concurrent timestamp;
- DB-side monotonic-max semantics remain required;
- every current Production Admin mutation entrypoint must still be classified before/final handoff;
- Case Question reorder, option→supporting conversion, Case Tags and Case-Question-Tags are explicit;
- no-op validation/error semantics are preserved;
- timestamp tests are deterministic.

No additional High or Medium implementation-planning gap was identified in this review. Implementation may begin only after the coding agent reads both the base plan and this controlling amendment and re-establishes the actual current PR/base/head.

## Luna 5.6 handoff delta

When implementation starts, add this sentence to the base plan's handoff contract:

> `CASE_AUTHORING_TIMESTAMPS_IMPLEMENTATION_PLAN_AMENDMENT.md` is controlling for compensation: never blindly restore a prior timestamp or use timestamp equality as an operation token. Prefer an in-batch concurrency/postcondition fence so conflicting Case-local state + touch roll back together; any retained compensation must preserve later concurrent edits and their newer timestamps. Add deterministic interleaving proof.
