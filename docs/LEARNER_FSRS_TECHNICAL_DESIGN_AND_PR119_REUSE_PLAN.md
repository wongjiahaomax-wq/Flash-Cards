# Learner FSRS Technical Design and PR #119 Reuse Plan

Status: **Technical design companion to `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — planning only, not implementation authorization**

Date: 1 September 2026

This document records repository-grounded technical direction for the locked learner FSRS product plan. It is subordinate to `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` for product behavior.

The implementation agent must re-check actual `main`, dependency versions, migrations, Cloudflare limits, and relevant open PR state before coding.

---

## 1. Current repository and migration baseline

At this review point:

- current `main` is `b69f5d065fe558750cf001d5236fe9608946cd6e`;
- current `main` contains migrations through `0018_topic_deletion_provenance_indexes.sql`;
- Draft PR #119 contains a proposed `0019_system_study_selection.sql`, but **PR #119 will not be merged**;
- therefore #119's `0019` is not repository migration history;
- if no newer migration lands first, the FSRS work may use `0019`; otherwise use the next actual migration number found on `main`;
- never rewrite a migration that has already landed on `main`.

The current learner Review model permanently stores Review/question/asset snapshots and uses random Case selection. The FSRS programme replaces that long-term model with compact completed events, current learner × Case state, compact encounter/aggregate state, browser-local run queues, and temporary active-Review freezing.

---

## 2. PR #119 reuse boundary

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
- durable D1 rows used only to remember an ordinary Study run.

The final FSRS flow consumes start-of-run Case queues. Persisted route snapshots would reconstruct a changing candidate set and conflict with that contract.

PR #119's per-run Original/Expanded radio is also not retained. Expanded Learning is a global learner preference, default OFF.

---

## 3. Final Study entry boundary

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
start-of-run Due queue + New queue
        ↓
Due first by default
(fallback to New)
        ↓
server-backed active Review
```

Selection answers what material is in scope. FSRS answers when each Case should be scheduled. Run state answers where the learner is within the captured work. These are separate responsibilities.

---

## 4. FSRS library

Use **`ts-fsrs`** behind a repository-owned adapter, pinned to an explicitly reviewed version at implementation time.

The design review examined `ts-fsrs@5.4.2`. Before implementation, verify the then-current version/API rather than assuming 5.4.2 remains the correct pin.

Adapter requirements:

- Again / Hard / Good / Easy mapping;
- desired retention `0.90` initially;
- complete serializable scheduler parameter object;
- serialize/deserialize current card state without leaking library types throughout the application;
- expose retrievability for Due ordering;
- persist scheduler/library version where useful;
- deterministic completion behavior under retries, including deterministic fuzz/seed handling if fuzz is enabled;
- repository tests for serialization and rating transitions;
- avoid repository contracts centered on fields already marked deprecated by the library.

Parameter optimization is later work and stays out of ordinary Review requests.

---

## 5. Recommended persistence responsibilities

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
- full parameters JSON;
- scheduler/library version;
- detailed-history retention policy (`24m`, `36m`, `60m`, `indefinite`);
- optimization/cleanup timestamps as needed.

A separate generations table is not required for V1. Events retain their generation; the profile owns the current generation.

### `learner_case_fsrs`

One current row per learner × Case containing the state required by the pinned FSRS adapter, including due time, stability, difficulty, state, repetition/lapse/learning counters, last-review time, and generation/version fields actually needed by the selected library.

Index direction:

- primary/unique learner × Case;
- `(user_id, due_at, case_id)` or equivalent for Due discovery;
- only additional indexes justified by measured plans/lifecycle requirements.

### `learner_case_encounters`

One compact learner × Case row:

- `first_scheduled_completed_at` nullable;
- `free_first_seen_at` nullable;
- `free_last_seen_at` nullable;
- `free_times_studied`.

The scheduled marker preserves previously-encountered semantics after Reset/Fresh Start and after detailed events expire.

### `scheduled_review_events`

One compact row per successfully completed Scheduled Review:

- event/Review id;
- learner id;
- historical Case id;
- small `case_title_snapshot`;
- historical System id used at study time;
- completion timestamp;
- rating;
- Original/Expanded mode;
- FSRS generation;
- scheduler/library version.

Do not retain completed vignette/question/answer/media snapshots or permanent Topic/Tag run-selection routes.

Recommended index directions:

- `(user_id, completed_at, id)`;
- `(user_id, generation, completed_at, id)`;
- `(user_id, system_id, completed_at, id)` where detailed per-System history justifies it.

Prefer application-level historical Case/System identifiers rather than FKs that unnecessarily prevent authored-content cleanup.

### `learner_aggregates`

One row per learner for durable counters such as Scheduled completions/rating counts and retained Free Study usage fields.

Do not store live Due count or coverage here.

### `learner_system_aggregates`

One row per learner × historical System for Scheduled usage/performance aggregates. Historical System attribution stays fixed to the System used at study time.

---

## 6. Active Review schema and generation capture

The active Review is temporary server-backed persistence for exact resume and safe completion.

Recommended `active_reviews` contract:

- Review id PK;
- learner id;
- one active learner Review at a time unless implementation evidence proves otherwise;
- Case id;
- `study_mode` Scheduled/Free;
- historical System id for current context;
- content mode Original/Expanded;
- queue class `due` / `new` / null;
- **`fsrs_generation` captured at Review creation for Scheduled Reviews**;
- versioned frozen payload containing exact vignette/question/answer selection required to resume;
- started/revealed/expiry timestamps;
- 7-day expiry.

For Free Study, `fsrs_generation` may be null because Free Study never mutates FSRS.

### `active_review_assets`

Keep active asset references normalized:

- active Review FK with cascade delete;
- live Asset reference/restriction while active;
- display order;
- frozen storage key/caption/alt as needed for exact resume.

This ensures resumable Reviews participate in R2/Asset lifecycle safety.

---

## 7. Scheduled run planner

At one `runStartedAt`:

1. validate the selected System/Topic/Tag routes using the retained #119 semantics;
2. resolve and deduplicate candidate Case IDs;
3. partition into Due and New from current learner × Case state;
4. construct both queues once;
5. return/store the run descriptor in browser `localStorage`.

### Due

Due iff current FSRS state exists and `due_at <= runStartedAt`.

Compute retrievability at `runStartedAt` through the adapter and sort lowest retrievability first. Use deterministic tie-breaks such as due time then Case id.

### New

New iff no current learner × Case FSRS state exists.

Order:

1. genuinely unseen;
2. previously encountered.

Shuffle each subgroup independently, then concatenate.

### Preference

Default: **Due first**. When Due is empty/exhausted, use New. If the learner selects New first, consume New first and fall back to Due.

Changing preference mid-run chooses between the existing captured queues; it does not recompute them.

---

## 8. Browser-local run state and trust boundary

Ordinary run state belongs in `localStorage`, not D1.

Scheduled descriptor may contain:

- user/account namespace;
- run id/version;
- run-start timestamp;
- selected System + Topic/Tag scope;
- Due IDs/order/position;
- New IDs/order/position;
- consecutive-completed-New counter;
- current active Review id.

Free Study similarly holds its selected scope and shuffle bag.

Local state is not authorization or eligibility authority. Before opening a queued Case, the server revalidates authenticated learner, active Production Case status, current route membership/scope, and other current eligibility. Stale Cases are skipped.

Do not add a D1 run/session table solely to make the 50-New counter tamper-proof.

---

## 9. Active Review lifecycle

Required behavior:

- exact content is frozen at Review creation;
- Resume / Discard are available;
- no ordinary per-question progress checkpoint is required;
- exact active content survives Admin edits;
- expiry is 7 days;
- frozen detail is deleted after completion/discard/expiry;
- active Review discovery allows recovery when localStorage is missing;
- Admin Study Preview does not create learner active Reviews.

For a Scheduled Review, creation must persist the learner's **current FSRS generation** into `active_reviews.fsrs_generation` in the same creation transaction/boundary that establishes the Review.

---

## 10. Critical concurrency invariant: consume active Review at write time

This is a hard implementation invariant, not an optional optimization.

A Scheduled completion must **not** rely only on a pre-write read such as:

1. read active Review/profile/state;
2. validate generation;
3. compute FSRS transition;
4. later write event/state/aggregates and delete the active Review.

That sequence has a TOCTOU race with Fresh Start, Reset Progress, Discard, and expiry cleanup. A final `DELETE active_reviews ...` that affects zero rows is **not a failure condition** and therefore is not a sufficient guard.

### Required invariant

A Scheduled completion may commit **only if, at write time inside the same D1 transaction as the event/state/aggregate writes**:

- the exact active Review still exists;
- it belongs to the authenticated learner;
- it is Scheduled;
- it is revealed/completable and not expired;
- its captured `fsrs_generation` equals the generation being written to the event/state;
- that generation still equals the learner profile's current generation.

If any condition is false, the transaction must **abort with a database error / failed guard**, not continue after a zero-row mutation.

The concrete D1-safe mechanism may be chosen during implementation, for example a schema trigger/guard or another transactional SQL construct that raises/forces failure when the invariant is false. The important contract is that the guard executes in the same transaction as completion writes and failure rolls the entire transaction back.

A strong candidate is a guarded event insert whose database-level validation checks the matching active Review and current profile generation. Because the event insert is itself required, guard failure aborts before FSRS state/aggregate mutation. The implementation may use another equivalent mechanism if tests prove the same invariant.

### Concurrency ordering guarantee

The resulting behavior must be serializable in effect:

- if Fresh Start/Reset/Discard/expiry wins first, the stale completion fails and writes **no** event, old-generation state, encounter marker, or aggregate change;
- if completion wins first, it commits normally, removes the active Review, and a later Reset/Fresh operation acts on the newly committed state according to its own semantics;
- two concurrent completions cannot both succeed.

This invariant applies to completion races with every operation that invalidates/removes the active Review.

---

## 11. Scheduled completion transaction

Pre-transaction reads may load the active Review/profile/current Case state and compute the candidate FSRS transition, but those reads do not authorize the final write.

Recommended flow:

1. load active Review/profile/current learner × Case state;
2. validate ownership/mode/revealed/non-expiry and captured-generation consistency for early error handling;
3. capture one deterministic `completedAt`;
4. rebuild scheduler from persisted parameters and compute next card state;
5. execute one D1 transaction/batch containing the **write-time guard from section 10** and all completion writes:
   - guarded insert of compact `scheduled_review_events` using the active Review id as event id where practical;
   - upsert `learner_case_fsrs` for that same generation;
   - record `first_scheduled_completed_at` if absent;
   - update learner aggregates;
   - upsert learner × System aggregates;
   - remove the active Review so active assets cascade;
6. return success only after commit.

Use the active Review id as the completed-event id where practical. This is a natural idempotency key. Duplicate event insertion plus the write-time active/generation guard must prevent double counting.

Any failure rolls back event/state/encounter/aggregate/active-Review changes together.

---

## 12. Free Study completion transaction

Free Study completion has no generation-sensitive FSRS transition, but it still must safely consume the active Review rather than update learner data after that Review has been discarded/expired.

In one atomic transaction:

- validate/guard the exact active Free Review at write time;
- upsert Free encounter timestamps/counter;
- update retained learner-wide Free aggregate fields if used;
- delete/consume the active Review.

No rating, FSRS state, Scheduled event, System performance history, or optimizer input.

---

## 13. Reset, Fresh Start, Discard and expiry

These operations are all active-Review invalidators and must be concurrency-safe with completion.

### Reset Progress

Guarded/atomic operation:

- invalidate/delete active learner Review;
- delete all current learner × Case FSRS state;
- preserve current profile generation/parameters;
- preserve Scheduled events, encounter markers and aggregates.

### Fresh FSRS Start

Guarded/atomic operation:

- invalidate/delete active learner Review;
- delete all current learner × Case FSRS state;
- increment profile generation;
- reset full parameters to defaults including 90% desired retention;
- clear optimization metadata;
- preserve visible history, encounter markers and aggregates;
- older generations remain visible history but are excluded from optimizer input.

### Discard

Consumes/removes the exact active Review without creating Scheduled history or mutating FSRS.

### Expiry cleanup

May remove only Reviews that are actually expired at the cleanup write boundary. It must race safely with completion under the section 10 invariant.

Tests must exercise interleavings where completion reads before each invalidator commits and then attempts its write afterward.

---

## 14. 50-consecutive-New guardrail

Track in browser run state.

Increment only after server-confirmed successful Scheduled completion of an active Review originating from the New queue.

After 50 completed New Cases in that run:

- stop consuming more New entries;
- allow Due entries already captured;
- if no Due remains, report the run limit and allow an explicit new Scheduled run.

No persistent D1 run/session row solely for this rule.

---

## 15. Retention cleanup

Policy:

- default detailed Scheduled history 24 months;
- Admin overrides 36m / 60m / indefinite.

Cleanup must be bounded. Prefer limited per-user ordered deletion rather than an unbounded global delete.

Operational direction:

- opportunistic small cleanup after Scheduled completion only when due;
- per-profile cleanup marker to avoid cleanup every Review;
- later bounded scheduled maintenance/Cron as backstop;
- aggregates and encounter markers survive ordinary event expiry;
- account deletion removes all retained learner data regardless of retention choice;
- optimizer uses current generation and normally the same retained event window.

---

## 16. Analytics ownership

### Derive live

- Due count;
- New count;
- coverage;
- Due/not-due memory status;
- per-System current Due/coverage.

These derive from current authored Case eligibility + current FSRS state.

### Incrementally aggregate

- learner Scheduled completion/rating totals;
- learner Free Study totals/activity;
- per-System Scheduled completion/rating totals;
- first/last activity where useful.

### Read detailed events only for detail

- recent learner timeline;
- time-windowed rating distributions;
- Admin individual history;
- debugging;
- optimizer input.

Do not scan detailed events for ordinary counters already owned by aggregates.

---

## 17. Authored-content deletion and historical identifiers

Separate live references from historical identifiers.

Live state may use physical FKs/restrictions where source survival is required while active, for example active Review → Case and active Review asset → Asset.

Completed history retains:

- historical Case id;
- small Case-title snapshot;
- historical System id used at study time.

It does not retain permanent Topic/Tag selection routes and should not reproduce #119's Topic-selection deletion guard.

No permanent System-title snapshot is currently required: stable System identity is sufficient for the described historical attribution contract, and this can be revisited if future history UX demonstrates a real need.

---

## 18. Better Auth account deletion

Prefer Better Auth Admin hard delete as the identity root, with learner-owned application tables referencing Better Auth user using `ON DELETE CASCADE` where appropriate.

Before shipping:

- integration/contract test against the repository's pinned Better Auth version and D1 schema;
- prove cascade through all learner-owned application rows;
- prove session invalidation semantics;
- explicitly characterize verification/token records not covered by FK cascade;
- namespace browser run state by user id so stale local data cannot be used by a different/new account.

---

## 19. Preliminary synthetic benchmark evidence

Directional planning benchmark only; **not** the required final D1 benchmark.

Representative local SQLite workload: 10,000 completed Reviews, about 2,000 distinct Cases, representative question/asset text and indexes.

Approximate post-vacuum sizes:

- current permanent Review/question/asset snapshot model: **59.33 MB**;
- proposed compact event/state/encounter/aggregate model: **2.73 MB**;
- approximately **21.7× smaller** under the synthetic assumptions.

Representative compact-model observations:

- about 222 KB event-table/index storage per 1,000 Scheduled completions;
- about 154 bytes per learner × Case FSRS state including representative indexes;
- about 86 bytes per learner × Case encounter row including representative indexes.

For 1,000 simultaneously active Reviews, current and proposed temporary frozen representations were both roughly of the same order (~5 MB). The main storage gain therefore comes from deleting active frozen detail after completion/discard/expiry, not from extreme compression of a single active Review.

A separate ~20,000-Case synthetic selection workload produced indexed set-based query plans and local timings in the tens of milliseconds. These are not Cloudflare D1 latency/quota measurements.

Do not convert these numbers into production capacity promises.

---

## 20. Required D1 benchmark gate

Before persistence architecture is implementation-complete, run a reproducible local D1-compatible benchmark against the actual candidate schema and representative data.

Measure at minimum:

- storage bytes and index footprint;
- rows read/written per Scheduled completion;
- rows written per Free completion;
- large systems-first selection resolution;
- Due/New queue construction;
- queued-Case revalidation;
- active Review load/render;
- aggregate update/read cost;
- retention-delete cost;
- query plans;
- D1 metadata including rows read/written where available.

The main quota/performance risk to test is large start-of-run candidate resolution and accidental N+1 behavior. Do not introduce a denormalized membership table without measured evidence that indexed union/dedup is insufficient.

Reuse #119's bounded route/chunking lessons where useful without retaining its durable selection tables.

---

## 21. Cloudflare transaction/operational requirements

At implementation time re-check D1/Workers limits and behavior.

Design principles:

- indexed set-based queries;
- no N+1 selection path;
- D1 transaction/batch semantics for atomic completion/reset/fresh/discard operations;
- database-level write-time guard for active Review/generation validity;
- bounded Worker CPU;
- no parameter optimizer in the Review request path;
- bounded retention cleanup;
- rows read/written treated as first-class cost metrics.

The concurrency tests are as important as the happy-path transaction tests because D1 atomicity alone does not fix a stale pre-transaction authorization read.

---

## 22. Implementation decomposition

Do not implement the programme in one PR. Every implementation PR starts from actual current `main`; PR #119 is only a source/reference branch.

### PR A — FSRS foundation + benchmark harness

- pin/adapt `ts-fsrs`;
- candidate preferences/profile/state/event/encounter/aggregate schema;
- active Review generation field/guard design if active schema is introduced here, otherwise explicitly reserve it for PR C;
- next actual migration number;
- scheduler serialization/transition tests;
- executable local D1 benchmark harness;
- no learner behavior switch.

### PR B — systems-first UX transplant + run planning

Selectively port #119 systems-first chooser, exact Topic hierarchy, curated Tags, counts/read model, route validation/resolution and relevant tests.

Do not port permanent selection tables or `study_selection_id`. Remove per-run Original/Expanded control. Build start-of-run Scheduled/Free descriptors from the resolved Case set.

### PR C — temporary active Review lifecycle

- `active_reviews` / `active_review_assets`;
- Scheduled `fsrs_generation` captured at creation;
- Resume / Discard / 7-day expiry;
- exact content freeze;
- one-active-review ownership;
- asset lifecycle integration;
- **write-time consume/guard primitive** used by completion/discard/expiry/reset/fresh operations;
- concurrency tests for that primitive.

### PR D — Scheduled Study / FSRS completion

- four ratings;
- lowest-retrievability Due ordering;
- unseen-before-seen New ordering;
- default Due-first with New fallback;
- guarded atomic event + state + encounter + aggregate + active consume;
- 50-New behavior;
- stale queued-Case skip;
- duplicate-completion and Reset/Fresh/Discard/expiry race tests.

### PR E — Free Study + Expanded preference

- Free shuffle bag;
- no rating/FSRS/Scheduled event;
- accumulated encounter update;
- guarded active consume;
- global Expanded OFF by default;
- Scheduled and Free both respect preference;
- Admin Preview contamination tests.

### PR F — reset/fresh/retention/learner Progress

- Reset Progress;
- Fresh generation handling;
- bounded cleanup;
- learner Progress/aggregate-backed views;
- retention controls.

### PR G — Admin analytics/history + account deletion

- read-only detailed history;
- aggregate views;
- per-learner retention override;
- Better Auth hard deletion and cascade/session contract tests.

### Later optimizer PR

Only after sufficient real Scheduled history exists; current generation + retained Scheduled events only; Free Study excluded.

---

## 23. Required invariant tests

At minimum protect:

- one current FSRS state per learner × Case;
- Scheduled active Review captures the current FSRS generation at creation;
- stale completion after Fresh Start cannot recreate old-generation state;
- stale completion after Reset cannot recreate deleted state;
- stale completion after Discard/expiry cannot write history/state/aggregates;
- two concurrent completions cannot both succeed;
- write-time guard failure aborts the entire completion transaction;
- Free completion never mutates FSRS or writes Scheduled history;
- Admin Study Preview never mutates learner state/history/aggregates/preferences;
- Due/New queues are captured once and not silently rebuilt mid-run;
- Due-first default falls back to New;
- lowest-retrievability Due ordering;
- unseen New before previously encountered New;
- Topic/Tag OR selection deduplicates Cases;
- retained #119 exact Topic/curated Tag semantics;
- stale queued Cases skip safely on server revalidation;
- Expanded completion satisfies the same Case schedule;
- Reset preserves history/encounter semantics;
- Fresh Start increments generation and excludes older events from optimizer input;
- retention expiry does not corrupt aggregates/encounter semantics;
- active asset references prevent unsafe cleanup while Review is resumable;
- account deletion removes learner-owned data and auth/session state as intended;
- stale localStorage cannot cross account identity.

---

## 24. Final design position

The final system has three primary layers:

1. **#119-derived UX/selection layer** — chooses and validates material scope;
2. **FSRS/run layer** — snapshots Due/New work and schedules Cases;
3. **Review persistence/history layer** — temporarily freezes active content, consumes the active Review with a write-time concurrency guard, atomically records compact outcomes, and retains only necessary history/aggregates.

The time spent on PR #119 is therefore retained where it provides product value: systems-first interaction, Topic hierarchy, curated Tag semantics, union/dedup selection, shared chooser work and regression coverage.

What is intentionally discarded is the persistence design that became obsolete after start-of-run FSRS queues were locked: permanent immutable study selections and persisted-selection-driven continuation.

Do not merge PR #119 merely to preserve that work. Selectively transplant its useful pieces in the focused implementation PRs.

This document remains planning/documentation only. It does not authorize deployment, Production D1/R2 mutation, migration application, or learner rollout.