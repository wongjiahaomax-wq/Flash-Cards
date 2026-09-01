# Learner FSRS Technical Design and PR #119 Reuse Plan

Status: **Technical design companion to `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — planning only, not implementation authorization**

Date: 2 September 2026

This document records repository-grounded technical direction for the locked learner FSRS product plan. It is subordinate to `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` for product behavior.

Implementation must re-check actual `main`, dependency versions/dist-tags, migrations, Cloudflare limits, Better Auth behavior, Production cutover preconditions, and relevant open PR state before coding or deployment.

---

## 1. Current repository and migration baseline

At this review point:

- current incorporated `main` is `a855a52c59888af1a93efa774693d1df928cc1eb`;
- current `main` contains migrations through `0018_topic_deletion_provenance_indexes.sql`;
- Draft PR #119 contains a proposed `0019_system_study_selection.sql`, but **PR #119 will not be merged**;
- therefore #119's `0019` is not repository migration history;
- if no newer migration lands first, FSRS work may use `0019`; otherwise use the next actual migration number found on `main`;
- never rewrite a migration that has already landed on `main`.

The current learner Review model permanently stores Review/question/asset snapshots and uses random Case selection. The FSRS programme replaces that long-term model with compact completed events, current learner × Case state, compact encounter/aggregate state, browser-local run queues, temporary active-Review freezing, explicit reset sequence boundaries, durable optimizer sequence evidence, and bounded completion-idempotency receipts.

---

## 2. Clean persistence cutover and zero-data safety gate

FSRS launch is intended to be a **clean persistence cutover, not a legacy learner-history migration**.

The implementation does not need to:

- convert old `reviews` rows into FSRS events;
- convert `review_questions` / `review_assets` snapshots into learner history;
- seed previously-encountered state from legacy Review rows;
- use legacy Review sequences as optimizer input;
- maintain a dual-read compatibility layer for old and new learner Review persistence;
- retain historical R2 objects solely because of nonexistent legacy learner Review snapshots.

### Mandatory destructive-cutover gate

Before any migration or deployment that drops, clears, or makes the legacy Review persistence unreachable, verify Production contains **zero learner-owned legacy Review/history data**.

At minimum prove:

- zero learner Review rows in the legacy `reviews` model;
- zero `review_questions` rows reachable from learner Reviews;
- zero `review_assets` rows reachable from learner Reviews.

If the legacy tables are entirely learner-owned at cutover time, zero total rows is an acceptable stronger assertion. If they contain another legitimate class of row, distinguish that class explicitly rather than weakening the learner-data check.

**If any unexpected learner row exists, stop the cutover.** Do not silently delete it, reinterpret it as FSRS history, or invent an automatic migration. A separate explicit data-migration decision is then required.

This gate converts the current deployment assumption into an implementation/deployment invariant.

### R2 consequence

After the zero-data gate succeeds and the new persistence model is live, Review-related media retention no longer needs to preserve legacy `review_assets.storage_key_snapshot` history. The Review-specific retention requirement becomes:

- current authored Asset references; plus
- temporary `active_review_assets` references while an unfinished Review is resumable.

Any R2 cleanup redesign must still preserve all other repository-owned Asset/reference safety rules; this section removes only the nonexistent learner-history migration requirement.

---

## 3. PR #119 reuse boundary

Treat PR #119 as a **reference/source branch**, not a merge dependency.

### Preserve/selectively transplant

- systems-first Study entry;
- choose System, then exact Topics and curated Tags;
- all contributing areas selected by default;
- Topic hierarchy controls including zero-exact structural parents;
- exact Topic route semantics;
- curated Tag validation within the selected System;
- Topic + Tag OR/union semantics;
- Case deduplication;
- deterministic effective provenance where still needed for the active Case;
- Case-count/read-model work;
- shared learner/Admin chooser where appropriate;
- Production Admin Study Preview UX and authorization boundary;
- retained regression tests for those semantics.

### Do not transplant

- `study_selections`;
- `study_selection_routes`;
- `reviews.study_selection_id`;
- immutable selection triggers;
- permanent Topic-selection deletion provenance;
- reverse indexes used solely for permanent selection history;
- Next/Expanded behavior that re-reads a persisted `studySelectionId`;
- durable D1 rows used only to remember an ordinary Study run;
- the per-run Original/Expanded selector.

The final flow consumes captured Case workload plus FSRS-generated in-run repeats. Persisted route snapshots would reconstruct a changing candidate set and conflict with that contract. Expanded Learning is a global learner preference, default OFF.

---

## 4. Final Study entry and run boundary

```text
#119-derived systems-first UX
        ↓
System + exact Topics + curated Tags
        ↓
server-side selection validator/resolver
        ↓
OR / union + Case deduplication
        ↓
FSRS run planner
        ↓
authenticated captured Due queue + captured New queue
        ↓
Due first by default
(fallback to New)
        ↓
server-backed active Review
        ↓
FSRS completion
        ↓
authenticated optional in-run repeat due later
```

Selection answers what material is in scope. FSRS answers when each Case should be scheduled. Run state answers where the learner is within the captured work and which short-term repeats were generated by Cases already studied in that run.

The run snapshot is a snapshot of **initial unrelated workload**, not a prohibition on FSRS-controlled learning/relearning steps for Cases just reviewed inside the run. Browser possession of an eligible Case ID is not proof that the Case belonged to the captured workload; authenticated membership/origin evidence is required as specified below and in the readiness contract.

---

## 5. FSRS scheduling library and version policy

Use **`ts-fsrs`** behind a repository-owned adapter.

Do **not** hard-code the earlier planning reference to `ts-fsrs@5.4.2` as package authority. At the time of this correction, npm's official versions surface identifies:

- `5.4.1` as the `latest` stable dist-tag;
- `6.0.0-beta.7` as the `beta` dist-tag.

Other npm surfaces may briefly expose newly published versions before the stable dist-tag changes. Therefore implementation must:

1. query the actual npm registry/dist-tags at coding time;
2. select an explicitly reviewed **stable, non-prerelease** version;
3. pin that exact version in the repository;
4. record the scheduler/library version with persisted state/history where useful;
5. require separate review before adopting a beta/prerelease scheduler.

Adapter requirements:

- Again / Hard / Good / Easy mapping;
- desired retention `0.90` initially;
- short-term scheduling enabled and honored according to the selected library's supported model;
- complete serializable scheduler parameter object;
- serialize/deserialize current card state without leaking library types throughout the application;
- expose retrievability for captured Due ordering;
- expose next card state and next due time after every Scheduled completion;
- deterministic completion behavior under retries, including deterministic fuzz/seed handling if fuzz is enabled;
- repository tests for serialization, rating transitions, short-term due output, and repeated same-run transitions;
- avoid repository contracts centered on fields the selected library already marks deprecated.

Do not replace the library's short-term output with hard-coded local learning/relearning delays.

The scheduling library may run in the ordinary learner request path only after a repository/Workers compatibility smoke test proves that the pinned build bundles and executes correctly there.

---

## 6. Parameter optimizer execution boundary

Parameter optimization is later work and is **not** part of ordinary learner Review requests.

Do not assume the eventual optimizer can run inside the normal Cloudflare Worker. The currently documented `@open-spaced-repetition/binding` optimizer uses native/WASI machinery and its default WASI route explicitly does not support edge runtimes.

Therefore:

- V1 stores portable optimizer evidence and portable parameter JSON;
- the learner Worker continues to use the lightweight scheduling library only;
- a later optimizer PR must select an execution environment proven to support the then-selected optimizer;
- acceptable directions include an offline/admin job, CI/controlled maintenance job, or a separate compute path;
- do not add native/WASI optimizer machinery to the learner Review request path merely to avoid a separate execution environment;
- optimizer output is applied through an explicit guarded parameter-update operation described below.

If future optimizer tooling becomes edge-compatible, that is evidence for a later design change, not an assumption in V1.

---

## 7. Recommended persistence responsibilities

Names may change; responsibilities should not be collapsed.

### `learner_preferences`

One row per learner:

- Better Auth `user_id` PK/FK with `ON DELETE CASCADE`;
- `expanded_learning`, default false;
- `scheduled_order`, default `due_first`.

### `learner_fsrs_profiles`

One row per learner:

- user id PK/FK cascade;
- current FSRS `generation`;
- current `review_sequence_epoch` or equivalent monotonic sequence-boundary value;
- current **`parameter_revision`**, monotonically increasing whenever the persisted parameter object changes;
- full parameters JSON;
- scheduler/library version;
- detailed-history retention policy (`24m`, `36m`, `60m`, `indefinite`);
- optimization/cleanup timestamps as needed.

These three boundary values have different meanings:

- `generation` = parameter-generation family; Fresh FSRS Start changes it;
- `review_sequence_epoch` = continuous per-Case Review-history segment; Reset and Fresh change it;
- `parameter_revision` = exact revision of the persisted parameter object within a generation; later optimizer updates change it.

Reset Progress increments sequence epoch without changing generation or parameters. Fresh FSRS Start increments generation and sequence epoch, resets parameters, and starts a new parameter revision. Later optimization stays in the same generation/epoch but increments parameter revision.

### `learner_case_fsrs`

One current row per learner × Case containing the state required by the pinned adapter, including:

- due time;
- stability/difficulty/state;
- repetition/lapse/learning counters required by the adapter;
- last Review time;
- current generation;
- current review-sequence epoch;
- current parameter revision used to produce/reschedule the state where relevant;
- a monotonic **`state_revision`** incremented on every successful Scheduled completion/reschedule that changes the Case's scheduling state;
- scheduler/version fields actually required.

Index direction:

- primary/unique learner × Case;
- `(user_id, due_at, case_id)` or equivalent for Due discovery;
- only additional indexes justified by measured query/lifecycle requirements.

`state_revision` is the preferred inexpensive fingerprint for proving that a captured Due/repeat item still represents the same outstanding scheduling state when it is opened later or on another device.

### `learner_case_encounters`

One compact learner × Case row:

- `first_scheduled_completed_at` nullable;
- `free_first_seen_at` nullable;
- `free_last_seen_at` nullable;
- `free_times_studied`.

The Scheduled marker preserves previously-encountered semantics after Reset/Fresh Start and after detailed display events expire.

### `scheduled_review_events`

One compact human-readable detailed-history row per successfully completed Scheduled Review while inside the learner's detailed-history retention policy:

- event/Review id;
- learner id;
- historical Case id;
- small `case_title_snapshot`;
- historical System id used at study time;
- completion timestamp;
- rating;
- Original/Expanded mode;
- FSRS generation;
- review-sequence epoch;
- parameter revision;
- scheduler/library version;
- resulting Case `state_revision`;
- resulting `next_due_at` or equivalent minimal completion-result field needed for an idempotent retry response.

The event id should normally equal the active Review id and acts as the durable Scheduled-completion idempotency receipt.

Do not retain completed vignette/question/answer/media snapshots or permanent Topic/Tag run-selection routes.

Recommended index directions:

- `(user_id, completed_at, id)`;
- `(user_id, generation, completed_at, id)` where useful for retained detailed history;
- `(user_id, system_id, completed_at, id)` where detailed per-System history justifies it.

Prefer application-level historical Case/System identifiers rather than FKs that unnecessarily prevent authored-content cleanup. **Historical System identity is the exception to arbitrary authored-content deletion:** because the design intentionally does not snapshot a System title into every event, a System concept with retained learner-history attribution must remain present and classified as a System until no durable attribution remains.

### Optimizer sequence evidence

Future optimization requires truthful ordered per-Case Review sequences even after Reset boundaries and after human-readable history pruning.

Physical implementation may use a separate compact ledger or an equivalent compacted representation of old Scheduled events. Do not lock a table name yet. Required logical fields are at least:

- learner id;
- historical Case id;
- completion timestamp/order;
- rating;
- FSRS generation;
- review-sequence epoch;
- stable event id/tie-break.

This evidence is not a second history UI. It exists only to reconstruct valid optimizer sequences.

For the current optimizer-eligible generation, cleanup must preserve enough sequence evidence that grouping by `(case_id, generation, review_sequence_epoch)` never mistakes a retained suffix for a first-ever Review.

### Free-completion idempotency receipts

Free Study must not create permanent per-encounter history, but completion still needs retry safety.

Use a **short-lived minimal receipt** keyed by active Review/completion id, conceptually containing only:

- receipt/review id;
- learner id;
- Case id;
- completion timestamp;
- expiry/cleanup timestamp;
- minimal result fields needed to return the same success on retry, if any.

This receipt:

- is written atomically with the Free encounter increment and active-Review consume;
- is not analytics/history/optimizer data;
- must be unique by Review id so duplicate completion cannot increment twice;
- can be deleted by bounded TTL cleanup after a short retry window (for example aligned with the active-Review expiry horizon unless implementation evidence supports a shorter safe window).

A committed Free completion followed by a lost HTTP response must therefore be distinguishable from discard/expiry and must return success rather than incrementing again.

### `learner_aggregates`

One row per learner for durable lifetime counters such as Scheduled completions/rating counts and retained Free Study usage fields. Do not store live Due count or coverage here.

### `learner_system_aggregates`

One row per learner × historical System for durable lifetime Scheduled usage/performance totals. Historical System attribution stays fixed to the System used at study time. While such retained ownership exists, the referenced System identity cannot be reclassified away or permanently deleted.

Lifetime rows are **not** sufficient to support time-series trend analytics after detailed events expire; see the analytics section.

---

## 8. Active Review ownership and creation

The active Review is temporary server-backed persistence for exact resume and safe completion.

Recommended `active_reviews` contract:

- Review id PK;
- learner id;
- **database-enforced uniqueness for one active Review per learner**;
- Case id;
- `study_mode` Scheduled/Free;
- historical System id for current context;
- content mode Original/Expanded;
- queue class `due` / `new` / `repeat` / null;
- captured FSRS generation for Scheduled Reviews;
- captured review-sequence epoch for Scheduled Reviews;
- captured parameter revision for Scheduled Reviews;
- captured expected Case `state_revision` for Due/repeat Reviews where applicable;
- versioned frozen payload required to resume exact vignette/question/answer selection;
- started/revealed/expiry timestamps;
- 7-day expiry.

For Free Study, scheduler boundary fields may be null because Free Study never mutates FSRS.

### Database ownership invariant

One-active ownership is a database invariant, not an application pre-check.

Creating a new active Review must use a write-time guarded transaction/statement that proves:

- no other active Review exists for the learner;
- the authenticated local Scheduled run boundary still matches current generation/sequence epoch/parameter revision where applicable;
- the requested queue entry has valid authenticated captured-work membership/origin for that run;
- the requested queue entry still has valid current scheduler classification/state;
- the Case is currently eligible active Production content in the selected scope.

If another device creates an active Review first, creation loses cleanly and the caller receives Resume/Discard state rather than a second active Review.

### Creation vs Reset/Fresh race

Creation, Reset Progress and Fresh FSRS Start must be serializable in effect:

- if Reset/Fresh wins first, stale Scheduled creation fails because the run boundary no longer matches;
- if creation wins first, Reset/Fresh subsequently invalidates/deletes that active Review atomically with its boundary/state change;
- no active Review may survive with a stale generation/epoch after Reset/Fresh commits.

A read-then-insert flow without a write-time boundary/ownership guard is insufficient.

### `active_review_assets`

Keep active asset references normalized:

- active Review FK with cascade delete;
- live Asset reference/restriction while active;
- display order;
- frozen storage key/caption/alt as needed for exact resume.

This makes active unfinished Reviews part of R2/Asset lifecycle safety without retaining media snapshots after completion.

---

## 9. Scheduled run planner, authenticated membership, run invalidation, and in-run repeats

At one server-generated `runStartedAt`:

1. validate/normalize selected System/Topic/Tag routes using retained #119 semantics;
2. resolve/deduplicate candidate Case IDs;
3. read current FSRS profile boundary including scheduler revision;
4. partition into captured Due and captured New;
5. establish a run ID and authenticated run-boundary token/equivalent binding learner, server `runStartedAt`, scheduler revision, generation, epoch, parameter revision, normalized scope fingerprint, and token/schema version;
6. capture per-Due `state_revision` (or equivalent exact scheduling fingerprint);
7. construct both captured queues once;
8. attach/derive server-verifiable authenticated membership evidence for every captured Due/New item;
9. initialize an empty in-run repeat lane;
10. return/store the descriptor in browser `localStorage`.

The authenticated work-membership representation is deliberately implementation-flexible. It may be a compact per-entry signed/MACed capability or another measured equivalent such as an authenticated descriptor/root plus compact membership proof. It must prove membership without requiring a persistent D1 run/session row.

At minimum, a Due/New membership proof must bind the authenticated learner, run ID, Case ID, queue class, run-boundary/revision identity, normalized scope fingerprint, proof/schema version, and relevant captured-state metadata.

### Entire-run invalidation across devices

Before opening **any** Scheduled queue entry, the server must verify the run boundary/token and compare its captured:

- scheduler revision/version;
- generation;
- review-sequence epoch;
- parameter revision;

with the current learner profile. It must also verify that the request's normalized effective scope matches the authenticated scope identity.

If any boundary differs, the entire local Scheduled run is stale. Do not continue consuming its old Due/New classifications. Invalidate/discard that local run and return the learner to a fresh systems-first start/resolution path.

Therefore Reset/Fresh on another device invalidates the old run through epoch/generation change, a later optimizer parameter change invalidates old run planning through parameter revision, and a scheduler revision change invalidates the old run through scheduler mismatch.

### Captured Due

Due iff current FSRS state exists and `due_at <= authenticated runStartedAt` when captured.

Compute retrievability at `runStartedAt` through the adapter and sort lowest retrievability first, with deterministic tie-breaks such as due time then Case id.

When opening a captured Due item, server revalidation requires:

- valid run-boundary token;
- valid authenticated captured-Due membership evidence for this learner/run/Case;
- run boundary still current;
- current learner × Case state still exists;
- current `state_revision` equals the captured revision/fingerprint;
- current unchanged state's `due_at <= authenticated runStartedAt`;
- current unchanged state's `due_at <= requestNow`;
- current content/scope eligibility remains valid.

If another device already reviewed/rescheduled the Case, its state revision changes and this captured Due entry is skipped. If a same-scope Case was not actually captured, current eligibility/Due state alone cannot substitute it into this run. Do not dynamically substitute unrelated post-start Due work.

### Captured New

New iff no current learner × Case FSRS state existed when captured.

Order:

1. genuinely unseen;
2. previously encountered.

Shuffle each subgroup independently, then concatenate.

When opening a captured New item, server revalidation requires valid authenticated captured-New membership evidence, no current FSRS state, current run/scope boundary validity, and current content/scope eligibility. If another device has since introduced the Case into SRS, skip the old New entry. Another currently-New same-scope Case that lacks this run's membership proof cannot be substituted into the captured queue.

### In-run repeat lane

After every successful Scheduled completion, the server returns authoritative resulting `state_revision` and `nextDueAt` **plus authenticated repeat-origin evidence bound to the same learner/run/Case and committed resulting state**.

If the same run remains active:

- register/update one local repeat entry for that Case with `{caseId, dueAt, expectedStateRevision, repeatProof}` or an equivalent authenticated representation;
- do not add the repeat until the prior completion has committed;
- the proof binds learner, run ID, Case ID, resulting state revision, due time, run boundary/scope identity, and proof/schema version;
- when `dueAt <= requestNow`, it becomes a matured repeat;
- matured repeats take priority before choosing another captured Due/New item;
- multiple mature repeats use deterministic ordering such as earliest due time then Case id;
- opening the repeat creates active Review queue class `repeat`;
- repeat opening requires valid authenticated repeat-origin evidence from a committed completion in this same run, current `state_revision == expectedStateRevision`, current due time matured, current run boundary unchanged, and content/scope still eligible;
- after repeat completion, replace/remove the repeat entry using the newly committed result/proof;
- if another device reviews/reschedules that Case first, revision mismatch causes the local repeat to skip;
- if the run ends before the due time matures, discard the local repeat entry; server FSRS state remains authoritative for later runs.

Only Cases already completed in this run may enter this lane. A Case elsewhere in scope that merely becomes Due after `runStartedAt` is not dynamically added and cannot be forged into the repeat lane by submitting its Case ID/current due state.

### Preference

When no matured repeat exists:

- default Due first;
- fall back to New when captured Due is empty/exhausted;
- New-first preference consumes captured New first and falls back to captured Due.

Changing preference mid-run chooses between existing captured queues; it does not recompute them and does not override a matured repeat.

---

## 10. Browser-local state is convenience, never scheduling authority

Scheduled local descriptor may contain:

- user/account namespace;
- run id/version;
- authenticated run-boundary token/equivalent;
- `runStartedAt` display/convenience value;
- selected System + Topic/Tag scope;
- generation / review-sequence epoch / parameter revision / scheduler revision;
- captured Due entries, state revisions, and membership proofs;
- captured New IDs/order/position and membership proofs;
- in-run repeat entries with due/revision/authenticated origin metadata;
- set/reference of Cases completed in this run where useful for repeat recovery;
- consecutive-New counter;
- current active Review id.

Free Study similarly stores selected scope and shuffle bag.

Losing localStorage may lose run convenience state but cannot lose committed learner progress. Browser state never grants authorization or scheduler eligibility. For Scheduled work, the server verifies authenticated run scope/boundary and authenticated work membership/origin before ordinary current-state/content revalidation.

Do not add a durable D1 run/session row solely to make the 50-New counter, captured queues, membership proofs, or repeat lane tamper-proof.

The **50-consecutive-New count is a browser-enforced learner UX guardrail in V1, not a security/data-integrity authorization boundary**. Normal clients enforce it, but V1 does not add a replay-resistant server-side monotonic counter solely for this rule. Tampering with the counter may bypass the UX limit; it must not permit work outside the authenticated captured workload, cross-run proof reuse, fake repeats, a second active Review, or bypass of current scheduler/content/state validation.

---

## 11. Active Review lifecycle

Required behavior:

- exact content frozen at Review creation;
- Resume / Discard;
- no ordinary per-question progress checkpoint;
- active content survives Admin edits;
- 7-day expiry;
- frozen detail deleted after completion/discard/expiry;
- active Review discovery works even if localStorage is missing;
- Admin Study Preview does not create learner active Reviews.

Scheduled creation captures current generation, review-sequence epoch, parameter revision, scheduler revision, relevant Case state revision, and sufficient authenticated run/work identity to prove that the active Review originated from valid captured/repeat work.

---

## 12. Critical completion concurrency invariant

Scheduled completion may not rely only on:

1. read active Review/profile/state;
2. validate;
3. compute FSRS transition;
4. later write event/state/aggregates;
5. `DELETE active_review` affecting zero rows.

That has a TOCTOU race with Reset, Fresh Start, Discard, expiry, parameter replacement, and competing completion.

### Required write-time guard

A Scheduled completion may commit only if, **inside the same D1 transaction as all outcome writes**:

- exact active Review still exists;
- it belongs to authenticated learner;
- it is Scheduled, revealed/completable and not expired at transactionally authoritative database write time;
- captured scheduler revision remains valid;
- captured generation equals event/state generation and current profile generation;
- captured review-sequence epoch equals event/state epoch and current profile epoch;
- captured parameter revision equals the revision used to compute the transition and current profile revision;
- for Due/repeat Reviews, expected Case state revision still matches the current state being transitioned;
- uniqueness/idempotency conditions prove this Review has not already been completed by another request.

Guard failure must abort/rollback the transaction rather than continue after a zero-row mutation.

The concrete D1-safe mechanism may be a trigger/guarded required insert or equivalent transactionally failing construct. Implementation may choose the mechanism; tests must prove the invariant.

### Serializable effect

- if Reset/Fresh/Discard/expiry wins first, stale completion writes nothing;
- if a parameter update somehow wins first, stale old-revision completion writes nothing;
- if completion wins first, it commits once, removes the active Review, and later invalidators act on the new state;
- two concurrent completions cannot both succeed.

---

## 13. Scheduled completion transaction and retry semantics

Pre-transaction reads may load data and compute a candidate transition, but do not authorize the write.

Recommended flow:

1. accept active Review id as the completion request/idempotency key plus requested rating;
2. **first check for an existing `scheduled_review_events` receipt with that id for the learner**; if present, compare its stored rating with the request and return the committed result, using explicit payload-mismatch semantics rather than claiming a different rating was applied;
3. otherwise load active Review/profile/current Case state;
4. validate early for useful errors;
5. capture one deterministic request/scheduler `completedAt` proposal;
6. rebuild scheduler from the captured/current parameter revision and compute next card state / `nextDueAt`;
7. execute one D1 transaction/batch containing the database-write-time lifecycle guard and:
   - guarded insert of `scheduled_review_events` with Review id as event id;
   - atomically preserve optimizer sequence evidence;
   - upsert learner × Case FSRS state and increment its `state_revision`;
   - record `first_scheduled_completed_at` if absent;
   - update learner aggregate;
   - update learner × System lifetime aggregate;
   - update any required time-bucket aggregate once that analytics layer exists;
   - consume/delete active Review so active assets cascade;
8. return success only after commit, including event id, stored rating, resulting state revision, next due time, and authenticated repeat-origin evidence for that same run where the committed result should enter the run's repeat lane.

The durable Scheduled event is also the retry receipt. A lost HTTP response followed by retry therefore returns the same committed outcome rather than producing another Review event or transition. Same Review + same rating replays success; same Review + different rating returns the committed outcome with explicit idempotency/payload-mismatch semantics and performs no further mutation.

If the Case was subsequently reviewed again elsewhere before an old request is retried, return the original event receipt as historical success; the client must still revalidate current state before registering/using any repeat lane entry, and stale repeat-origin evidence cannot reopen a later state revision.

Any failure rolls back event/state/optimizer evidence/encounter/aggregate/active-Review changes together.

---

## 14. Free Study completion transaction and retry semantics

Free Study has no FSRS transition/rating/Scheduled event, but its encounter counter must still be exactly-once per completed active Review.

Recommended flow:

1. accept active Review id as completion request/idempotency key;
2. first check for an unexpired Free-completion receipt; if present, return the original success;
3. otherwise execute one atomic transaction that:
   - write-time guards the exact active Free Review;
   - inserts the unique short-lived completion receipt;
   - upserts Free encounter timestamps and increments `free_times_studied` exactly once;
   - updates retained learner-wide Free aggregate fields if used;
   - consumes/deletes the active Review;
4. return success only after commit.

A receipt unique-key conflict / existing receipt is success for the same learner/review id, not another increment.

No rating, FSRS state, Scheduled event, System performance history, sequence-epoch change, or optimizer input.

---

## 15. Reset, Fresh Start, parameter replacement, Discard and expiry

These operations share the active-Review/run-boundary concurrency model.

### Reset Progress

Guarded/atomic operation:

- invalidate/delete active learner Review;
- delete all current learner × Case FSRS state;
- preserve current generation/parameter object/parameter revision;
- increment profile review-sequence epoch;
- preserve Scheduled display events, optimizer sequence evidence, encounter markers and aggregates.

Old browser Scheduled runs become stale because their epoch no longer matches.

Pre/post Reset events in the same generation may both train future parameters, but they are independent Case × epoch sequences.

### Fresh FSRS Start

Guarded/atomic operation:

- invalidate/delete active learner Review;
- delete all current learner × Case state;
- increment generation;
- increment review-sequence epoch;
- reset full parameters to defaults including 90% desired retention;
- increment/reset parameter revision to a new unique monotonic revision;
- clear optimization metadata;
- preserve visible history/encounter markers/aggregates;
- older generations remain visible while retained but are excluded from optimizer input.

Old browser Scheduled runs become stale through generation/epoch/revision mismatch.

### Later parameter replacement / optimization

Parameter update is a deliberate guarded operation, not a blind profile write.

V1 schema must include `parameter_revision` even though automatic optimization is later.

Recommended later semantics:

- optimizer computes candidate parameters outside the learner request path;
- before applying them, verify learner still has the generation/revision on which optimization was based;
- **do not replace parameters while a Scheduled active Review exists**; defer/retry optimization instead of making an open Review straddle two parameter objects;
- apply new parameter JSON and increment `parameter_revision` atomically;
- if the selected FSRS integration reschedules existing current Case states after parameter optimization, do that in the same controlled maintenance operation or an explicitly staged bounded job with its own invariants;
- old browser Scheduled runs are invalidated by parameter-revision mismatch and must be replanned;
- a Scheduled active Review never needs a duplicated full parameter snapshot merely to survive a concurrent optimizer update because the update is blocked while it exists.

### Discard

Consumes exact active Review without Scheduled history or FSRS mutation. Free/Scheduled completion receipts are not created by discard.

### Expiry cleanup

May remove only Reviews actually expired at the cleanup write boundary. It must race safely with completion under the same write-time guard.

---

## 16. 50-consecutive-New guardrail

Track in browser run state as a learner-facing UX guardrail.

Rules:

- increment only after confirmed completion of queue class `new`;
- repeat completion does not increment and does not reopen New capacity;
- completed captured Due Review resets the consecutive-New counter;
- merely opening/revealing/abandoning New does not increment.

After 50 consecutive New introductions:

- normal clients stop consuming further captured New entries;
- allow captured Due entries;
- allow matured in-run repeats;
- if neither remains, report the run limit and allow explicit new Scheduled run.

No persistent D1 run/session row or replay-resistant server counter solely for this rule. This limit is not relied upon for authorization, data integrity, FSRS correctness, or captured-work membership; authenticated work proofs and server revalidation own those invariants.

---

## 17. Detailed-history retention and optimizer sequence continuity

Human-readable detailed Scheduled history:

- default 24 months;
- Admin override 36m / 60m / indefinite.

Cleanup must be bounded and must not corrupt optimizer sequences.

### Hard optimizer invariant

When human-readable events are pruned, never feed a retained suffix to the optimizer as if its first surviving Review were a New-card first Review.

For the current optimizer-eligible generation, preserve minimal ordered rating/timestamp evidence required to reconstruct complete independent histories by `(case_id, generation, review_sequence_epoch)`.

Acceptable shapes include:

- separate compact optimizer ledger written atomically with completion; or
- compaction of old detailed events into optimizer-only form while preserving the same sequence evidence.

Do not rely on a parameter-dependent memory-state checkpoint unless the selected optimizer explicitly supports initial-state conditioning and tests prove semantic equivalence.

Operational direction:

- opportunistic small detailed-history cleanup after Scheduled completion only when due;
- per-profile cleanup marker rather than cleanup every Review;
- bounded scheduled maintenance/Cron backstop;
- aggregates/encounter markers survive detailed-history expiry;
- current-generation optimizer evidence may survive longer than human-readable detail;
- after Fresh Start, older-generation optimizer-only evidence can be pruned because it is permanently excluded from future optimization;
- account deletion removes all retained learner data.

Optimizer preparation must never bridge Reset epochs or retention-truncated prefixes.

---

## 18. Analytics ownership and time-series contract

### Derive live

- Due count;
- New count;
- coverage;
- Due/not-due memory status;
- per-System current Due/coverage.

These derive from current authored Case eligibility + current FSRS state.

### Lifetime aggregates

Maintain compact lifetime aggregates for:

- learner Scheduled completion/rating totals;
- learner Free Study totals/activity;
- learner × System Scheduled completion/rating totals;
- first/last activity where useful.

### Detailed retained events

Use retained detailed events for:

- recent learner timeline;
- time-windowed detail/rating distributions within the retained window;
- Admin individual history;
- debugging where retained detail suffices.

### Cohort/System trends after detailed-event expiry

`Cohort/System trends` means a real **time series**, not merely lifetime totals rendered as a chart.

The product/technical contract is:

- Admin trend data uses bounded calendar-time buckets, initially **monthly** unless PR G presents a reviewed reason for another granularity;
- per-System monthly buckets must survive ordinary detailed-event expiry so long-range System trends remain available;
- when a cohort view is implemented, cohort membership should use a stable definition such as learner account-created month (or another explicitly reviewed stable cohort key), and its time-series measures use the same bounded monthly principle;
- do not attempt to reconstruct expired time series from lifetime `learner_system_aggregates`;
- do not prematurely add the physical bucket table in PR A solely because this contract exists.

PR G owns the final bucket schema/index/retention design and must benchmark its cost. Any bucket that durably attributes learner history to a System must register that System dependency with the same centralized taxonomy deletion/provenance authority used by earlier FSRS historical tables. Until PR G ships, the system may expose only trend views supported by the data actually retained; it must not imply lifetime time-series fidelity from a single lifetime row.

### Optimizer evidence boundary

Optimizer-only evidence is not an analytics/history surface and should not be queried to reconstruct Admin trend charts.

---

## 19. Authored-content deletion and historical identifiers

Separate live references from historical identifiers.

Live state may use physical FKs/restrictions where source survival is required while active, e.g. active Review → Case and active Review Asset → Asset.

Completed display history retains:

- historical Case id;
- small Case-title snapshot;
- historical System id used at study time.

Optimizer evidence contains only minimal stable id/rating/time/boundary fields and should not create authored-content deletion restrictions.

Neither representation retains permanent Topic/Tag selection routes or reproduces #119's persistent Topic-selection deletion guard.

### Historical System survival

No permanent System-title snapshot is currently required because the design relies on stable System identity. That identity must therefore remain present and classified as a System while any retained durable learner-history attribution depends on it.

At minimum, System→Topic reclassification and permanent System removal are blocked while referenced by retained:

- `scheduled_review_events` System attribution;
- learner × System aggregate ownership;
- monthly System/cohort trend buckets when those are introduced;
- any later durable learner-history representation that relies on the System identity.

Current `main` exposes permanent Topic deletion through a centralized server-side eligibility/writer path and does not expose System deletion there. FSRS implementation must **extend that existing taxonomy deletion/provenance authority** for new historical dependencies rather than introduce an independent FSRS-only deletion rule. The learner runtime cutover must register every then-current FSRS System-history table with that authority before Scheduled history becomes normal production data. Later PRs, including PR G, extend the same authority when they add another durable System-attribution table.

Account deletion or retention cleanup does not by itself make a System deletable/reclassifiable unless no retained historical attribution remains anywhere.

---

## 20. Better Auth account deletion

Prefer Better Auth Admin hard delete as identity root, with learner-owned application tables referencing Better Auth user via `ON DELETE CASCADE` where appropriate.

Before shipping:

- integration/contract test against pinned Better Auth version/D1 schema;
- prove cascade through all learner-owned application rows including optimizer evidence and temporary Free receipts;
- prove session invalidation semantics;
- characterize verification/token records not covered by FK cascade;
- namespace browser state by user id so stale local data cannot cross account identity.

PR G must additionally benchmark worst-supported mature-learner deletion. Direct cascade remains acceptable only if measured safely bounded; otherwise use the readiness contract's retry-safe staged-deletion path with access revoked first.

---

## 21. Preliminary synthetic benchmark evidence

Directional planning benchmark only; **not** the required final D1 benchmark.

Earlier representative local SQLite workload: 10,000 completed Reviews, ~2,000 distinct Cases, representative question/asset text and indexes.

Approximate post-vacuum sizes from the earlier candidate model:

- current permanent Review/question/asset snapshot model: **59.33 MB**;
- earlier compact event/state/encounter/aggregate model: **2.73 MB**;
- approximately **21.7× smaller** under those assumptions.

Earlier compact-model observations:

- ~222 KB event-table/index storage per 1,000 Scheduled completions;
- ~154 bytes per learner × Case FSRS state including representative indexes;
- ~86 bytes per learner × Case encounter row including representative indexes.

For 1,000 simultaneously active Reviews, old/new temporary frozen representations were both roughly same order (~5 MB). Main storage gain comes from deleting active detail after completion/discard/expiry.

A separate ~20,000-Case synthetic selection workload produced indexed set-based plans and local timings in tens of milliseconds; these are not Cloudflare D1 latency/quota measurements.

The earlier 2.73 MB figure did **not** include:

- review-sequence epoch;
- state revisions;
- parameter revision;
- optimizer-evidence retention;
- temporary Free-completion receipts;
- future monthly analytics buckets.

The required D1 benchmark must include the V1 costs that are actually implemented before any capacity claim is made.

---

## 22. Required D1/browser benchmark gate

Before persistence/run architecture is implementation-complete, run reproducible local D1-compatible and browser-descriptor benchmarks against actual candidate schema/representative data.

Measure at minimum:

- storage bytes/index footprint;
- rows read/written per Scheduled completion including optimizer evidence;
- rows written per Free completion including receipt;
- one-active Review creation/guard cost;
- large systems-first selection resolution;
- captured Due/New queue construction;
- authenticated run-boundary and captured-membership proof bytes;
- repeat-origin proof bytes;
- browser serialized descriptor bytes, localStorage write/read/parse behavior, and response payload size;
- classification/state-revision/membership revalidation;
- in-run repeat bookkeeping/revalidation;
- active Review load/render and worst-supported frozen payload size;
- aggregate update/read cost;
- detailed-history cleanup cost;
- optimizer-evidence storage/cleanup cost;
- temporary Free-receipt storage/cleanup cost;
- Reset/Fresh boundary update cost;
- query plans;
- D1 metadata including rows read/written where available.

Main quota/performance risk remains large start-of-run candidate resolution and accidental N+1 behavior. Long-lived current-generation optimizer evidence is the main newly explicit storage risk. Authenticated per-item proof overhead is a browser/payload risk that PR B must measure rather than assume negligible.

Do not introduce denormalized membership tables or persistent run/session tables without measured evidence the existing indexed/browser-local architecture is insufficient.

Reuse #119 bounded route/chunking lessons without retaining durable selection tables.

---

## 23. Cloudflare transaction/operational requirements

At implementation time re-check D1/Workers behavior/limits.

Keep the guarded transaction direction. D1 batch/transaction rollback semantics are compatible with the design provided a required guard statement actually fails when an invariant is false; a harmless zero-row write is not enough.

Design principles:

- indexed set-based queries;
- no N+1 selection path;
- atomic completion/reset/fresh/discard/create operations;
- database-level write-time guard for active ownership and generation/epoch/revision validity;
- authenticated browser-run boundary and work-membership/origin without persistent D1 run state;
- bounded Worker CPU;
- short-term repeat selection from committed FSRS state plus authenticated same-run origin;
- no optimizer in learner Review request path;
- bounded cleanup;
- rows read/written and browser bytes as first-class cost metrics.

---

## 24. Implementation decomposition

Do not implement the programme in one PR. Every implementation PR starts from actual current `main`; PR #119 is source/reference only.

### PR A — FSRS foundation + benchmark harness

- verify/pin stable `ts-fsrs` dist-tag/version and Worker compatibility;
- preferences/profile/state/event/encounter/aggregate schema;
- generation + review-sequence epoch + parameter revision + scheduler revision;
- learner × Case state revision;
- optimizer-sequence evidence representation/invariant;
- temporary Free-completion receipt design if not deferred to PR E;
- clean-cutover preflight/check command for zero learner legacy Review data;
- next actual migration number;
- scheduler serialization/transition/short-term tests;
- executable local D1 benchmark including new overhead;
- no learner behavior switch.

### PR B — systems-first UX transplant + run planning

Selectively port #119 systems-first chooser, Topic hierarchy, curated Tags, counts/read model, route validation/resolution and relevant tests.

Do not port permanent selection tables/`study_selection_id`. Remove per-run Original/Expanded. Build captured Scheduled/Free descriptors. Scheduled descriptor must include the authenticated run boundary and server-verifiable captured Due/New membership evidence; benchmark per-entry capabilities versus any equivalent compact representation. No D1 run/session row solely for this protection.

PR B also records explicitly that the 50-New counter remains a browser UX guardrail rather than a server authorization invariant.

### PR C — active Review lifecycle + ownership primitive

- `active_reviews` / `active_review_assets`;
- database UNIQUE one active Review per learner;
- atomic creation guard against existing active Review and stale run boundary/classification;
- verify authenticated captured/repeat membership before Scheduled creation;
- capture generation/epoch/parameter/scheduler revision/state revision and run/work origin needed for completion safety;
- queue class due/new/repeat;
- Resume / Discard / 7-day expiry;
- exact content freeze with measured bounded-JSON-vs-normalized physical choice;
- Asset lifecycle integration;
- write-time consume/expiry guard;
- creation-vs-Reset/Fresh and completion concurrency tests.

### PR D — Scheduled Study / FSRS completion

- four ratings;
- lowest-retrievability captured Due ordering;
- unseen-before-seen captured New ordering;
- Due-first default/New fallback;
- run-boundary invalidation across devices;
- authenticated Due/New membership validation;
- New/Due/repeat classification/state-revision revalidation;
- FSRS in-run repeat registration/maturation/priority;
- authenticated repeat-origin proof returned only after committed completion;
- guarded atomic event + optimizer evidence + state + encounter + aggregates + active consume;
- database-write-time expiry guard;
- durable Scheduled idempotency receipt behavior including rating mismatch;
- 50-New normal-client UX behavior/repeat neutrality;
- duplicate/lost-response and Reset/Fresh/Discard/expiry race tests.

### PR E — Free Study + Expanded preference

- Free shuffle bag;
- no rating/FSRS/Scheduled event;
- accumulated encounter update;
- short-lived unique Free completion receipts and retry behavior;
- guarded active consume;
- global Expanded OFF default;
- Scheduled/Free respect same preference;
- Admin Preview contamination tests.

### Learner runtime cutover checkpoint — legacy removal + historical-System deletion protection

After Scheduled + Free behavior is complete and validated:

- run zero-data Production gate;
- switch learner Review creation/resume/completion/media/runtime paths;
- retire legacy learner Review writers/readers/tables as appropriate;
- update Asset/R2 lifecycle references and local replica/reset/tooling/schema exports/tests/docs;
- register every then-current durable FSRS historical System-attribution table with the repository's centralized taxonomy deletion/provenance authority;
- prove a System with retained learner historical attribution cannot be reclassified away or permanently deleted;
- prove no legacy learner Review rows can be recreated.

### PR F — reset/fresh/retention/learner Progress

- Reset increments epoch not generation;
- Fresh increments generation + epoch and resets parameters/revision;
- bounded detailed-history cleanup;
- optimizer-prefix preservation / old-generation optimizer cleanup;
- learner Progress/aggregate-backed views;
- retention controls.

### PR G — Admin analytics/history + account deletion

- read-only detailed history;
- lifetime aggregate views;
- monthly System trend buckets and reviewed cohort definition/buckets if cohort view ships;
- register any new durable System-attribution bucket with centralized taxonomy deletion/provenance authority;
- per-learner retention override;
- Better Auth account deletion/session tests including optimizer evidence and temporary receipts;
- worst-supported mature-learner deletion benchmark and evidence-based direct-cascade vs retry-safe staged-deletion choice.

### Later optimizer PR

Only after sufficient real Scheduled history exists:

- choose execution environment proven compatible with optimizer;
- current generation only;
- group sequences by Case + review-sequence epoch;
- never bridge Reset/Fresh boundaries;
- never treat retention-truncated suffix as New-card history;
- Free Study excluded;
- apply parameters through guarded parameter-revision update;
- defer update while Scheduled active Review exists;
- invalidate old local runs through parameter revision.

---

## 25. Required invariant tests

At minimum protect:

- zero-data destructive cutover stops on any unexpected learner legacy Review/history rows;
- no legacy Review rows are silently converted into FSRS history/encounters/optimizer input;
- exactly one active Review per learner enforced by DB under concurrent creation;
- active Review creation races safely with Reset/Fresh;
- Scheduled run authenticates learner/run ID/server start/scheduler-generation-epoch-parameter boundary/scope;
- Reset/Fresh/parameter/scheduler update invalidates old browser Scheduled runs;
- one current FSRS state per learner × Case;
- state revision increments on each committed state transition/reschedule;
- captured New must have valid authenticated membership and still be New at open;
- another same-scope currently-New Case without membership proof is rejected;
- captured Due must have valid authenticated membership, match captured outstanding state revision, have been Due at authenticated run start, and still be Due at open;
- another same-scope Due Case without membership proof is rejected;
- captured membership proof cannot be replayed across learner/run/queue-class/scope/boundary identities;
- repeat must have authenticated same-run committed origin, match expected revision and be due at open;
- a same-scope currently-Due Case without same-run repeat origin cannot be forged into repeat work;
- another-device Review makes stale captured/repeat work skip rather than double-study;
- Scheduled active Review captures required boundary/work origin and expected state revision;
- stale completion after Fresh cannot recreate old-boundary state;
- stale completion after Reset cannot recreate deleted old-epoch state;
- stale completion after Discard/expiry cannot write outcomes;
- pre-read-valid completion whose database write begins after expiry rolls back all outcome writes;
- parameter update cannot race through an active Scheduled Review;
- two concurrent Scheduled completions cannot both succeed;
- Scheduled retry after lost response returns same event receipt without another transition/count;
- same Review with a different requested rating returns committed outcome plus mismatch semantics without another transition;
- Free retry after lost response returns same temporary receipt without double increment;
- write-time guard failure rolls back entire completion transaction;
- Free completion never mutates FSRS or writes Scheduled/optimizer history;
- Admin Study Preview never mutates learner state/history/aggregates/preferences;
- captured Due/New queues built once and unrelated post-start Cases not silently added;
- Case completed in run can re-enter only with authenticated same-run repeat origin when FSRS short-term due matures;
- matured repeats take priority;
- repeated same-run transitions use latest committed state;
- repeat does not increment New-introduction counter;
- captured Due completion resets consecutive-New streak in normal client UX;
- browser counter tampering cannot manufacture additional Scheduled work outside authenticated captured membership;
- Due-first default falls back to New;
- lowest-retrievability captured Due ordering;
- unseen New before previously encountered New;
- Topic/Tag OR selection deduplicates Cases;
- #119 exact Topic/curated Tag semantics retained;
- Expanded completion satisfies same Case schedule;
- Reset preserves generation/parameters, increments epoch, and keeps pre/post sequences independent;
- Fresh increments generation/epoch and excludes older generations from optimizer input;
- optimizer groups by Case + generation + epoch;
- retention cleanup cannot make truncated Case history appear to start from New;
- active Asset refs prevent unsafe media cleanup while resumable;
- monthly trend contract is not falsely derived from lifetime-only rows;
- System→Topic reclassification is blocked after learner historical attribution exists;
- permanent System deletion/removal is blocked while retained Scheduled events, learner × System aggregates, or later historical buckets depend on that identity;
- new durable System-attribution tables extend centralized taxonomy deletion/provenance ownership;
- account deletion removes learner data, optimizer evidence, receipts and auth/session state;
- worst-supported learner deletion proves direct cascade is bounded or staged deletion is retry/access-safe;
- stale localStorage cannot cross account identity.

---

## 26. Final design position

The final system has three primary layers:

1. **#119-derived UX/selection layer** — chooses and validates material scope;
2. **FSRS/run layer** — authenticates the run boundary and actual captured Due/New membership, revalidates classification across devices, and issues authenticated repeat origin only for Cases successfully completed in that run;
3. **Review persistence/history layer** — enforces one active Review per learner, freezes active content temporarily, consumes active Reviews with write-time boundary/state guards, atomically records compact outcomes and retry receipts, preserves truthful optimizer sequences, and retains necessary long-term display/aggregate data while protecting historical System identity.

FSRS launch is a clean persistence cutover only after the zero-legacy-learner-data gate passes and the then-current learner-history System dependencies are registered with centralized taxonomy deletion/provenance authority. There is no dual-read learner-history migration path by default.

The time spent on PR #119 is retained where it provides product value: systems-first interaction, Topic hierarchy, curated Tag semantics, union/dedup selection, shared chooser work and regression coverage.

What is intentionally discarded is #119's now-obsolete persistence design: permanent immutable study selections and persisted-selection-driven continuation.

Do not merge PR #119 merely to preserve that work. Selectively transplant its useful pieces in focused implementation PRs.

This document remains planning/documentation only. It does not authorize deployment, Production D1/R2 mutation, migration application, destructive cutover, or learner rollout.
