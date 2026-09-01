# Learner FSRS PR A — foundation evidence

Status: **Implementation evidence for PR A only. No learner runtime cutover.**

Date: 2 September 2026

This record accompanies the locked learner FSRS product plan, technical design, and implementation-readiness contract. It records the concrete foundation selected by PR A without enabling learner FSRS behavior.

## 1. Implementation baseline

PR A started from exact `main`:

```text
0a399b9e97ace89bafd5ba43d7604415cc396eb1
```

At that baseline, repository migration history ended at:

```text
0018_topic_deletion_provenance_indexes.sql
```

PR A therefore uses the next actual migration number:

```text
0019_learner_fsrs_foundation.sql
```

The migration is additive. PR A does not drop or rewrite legacy learner Review tables, switch learner reads/writes, apply a Production migration, or deploy application code.

## 2. Scheduler dependency and revision boundary

Coding-time registry verification on 2 September 2026 found stable non-prerelease:

```text
ts-fsrs 5.4.2
```

PR A pins that exact version rather than a range.

Repository scheduler boundary:

```text
scheduler revision: 1
scheduler library version: 5.4.2
desired retention: 0.90
short-term scheduling: enabled
fuzz: disabled
```

Fuzz is disabled in scheduler revision 1 so a candidate transition is deterministic for the same persisted state, rating, parameter object, and completion timestamp. A later reviewed scheduler revision may adopt deterministic seeded fuzz if required.

The repository adapter lives at:

```text
src/lib/server/learning/fsrs-scheduler.js
```

It owns:

- Again / Hard / Good / Easy mapping;
- complete serializable parameter JSON;
- serializable current Card state;
- next-state / next-due computation;
- retrievability;
- repository scheduler revision and pinned library version.

It deliberately owns no database, authentication, session, route-selection, active-Review, or browser-state behavior.

Worker compatibility is checked by:

```bash
npm run fsrs:worker-smoke
```

The smoke check bundles the adapter through the repository Vite toolchain, rejects an external `ts-fsrs` or Node-builtin runtime dependency in the resulting scheduling bundle, imports that bundle, and executes an actual transition.

## 3. Persistence foundation

PR A adds the following learner-owned tables:

```text
learner_preferences
learner_fsrs_profiles
learner_case_fsrs
learner_case_encounters
scheduled_review_events
learner_optimizer_evidence
learner_aggregates
learner_system_aggregates
```

### Boundary values

`learner_fsrs_profiles` persists separate monotonic values for:

- `generation` — Fresh FSRS Start family boundary;
- `review_sequence_epoch` — Reset/Fresh continuous-history boundary;
- `parameter_revision` — exact persisted parameter object revision;
- `scheduler_revision` — repository scheduling-semantics revision.

`learner_case_fsrs.state_revision` is the per-learner × Case scheduling-state fingerprint. Later run/open/completion work can use it to reject stale Due/repeat work without comparing a full Card object.

### Historical attribution

Current learner × Case scheduling state and encounter rows reference live Cases and are deleted with the Case.

Completed Scheduled events and optimizer evidence keep historical Case identifiers without authored-content foreign keys. `scheduled_review_events.system_id` and `learner_system_aggregates.system_id` likewise remain historical identifiers rather than restrictive FKs. The later learner-runtime cutover remains responsible for registering every then-current durable System-attribution table with the centralized taxonomy deletion/provenance authority before normal Scheduled history is produced.

## 4. Optimizer sequence invariant

PR A uses a compact separate optimizer evidence ledger.

Each Scheduled event/evidence row carries:

```text
user_id
case_id
generation
review_sequence_epoch
sequence_no
event_id
completed_at
rating
```

Logical Review order is owned by `sequence_no`, not by wall-clock timestamp. `sequence_no` starts at 1 independently for every:

```text
(user_id, case_id, generation, review_sequence_epoch)
```

and is unique within that sequence.

The repository helper rejects a sequence that does not start at 1 or contains a gap. This makes a retention-truncated suffix fail closed instead of being presented to a later optimizer as a New-card history.

Reset/Fresh boundaries are therefore never bridged by optimizer grouping.

## 5. Clean-cutover preflight

PR A adds a reusable read-only command:

```bash
npm run fsrs:preflight
```

By default it checks local D1. It counts:

```text
reviews
review_questions reachable from reviews
review_assets reachable from reviews
```

and exits non-zero if any count is non-zero.

An explicit read-only remote check can later be run with:

```bash
npm run fsrs:preflight -- --remote
```

That command is a gate only. It does not delete, rewrite, migrate, or reinterpret legacy data. A non-zero result requires a separate reviewed migration/cutover decision.

PR A does not execute the remote check as part of normal CI and does not authorize the destructive learner-runtime cutover.

## 6. Reproducible D1-compatible benchmark harness

PR A adds:

```bash
npm run fsrs:benchmark
```

Default representative occupancy:

```text
2,000 learner × Case current states/encounters
10,000 Scheduled events
10,000 optimizer-evidence rows
50 representative Scheduled persistence write bundles
```

The harness records:

- SQLite database/page bytes;
- indexed Due-read timing and query plan;
- indexed optimizer-sequence read timing and query plan;
- aggregate read timing;
- representative Scheduled event + optimizer evidence + state + aggregate write-bundle timing;
- row counts;
- foreign-key violations.

This is deliberately described as a **D1-compatible SQLite baseline**, not Cloudflare latency/quota evidence. Later PRs must extend the benchmark as they make these costs executable:

- active Review create/load/expiry/consume;
- authenticated run descriptor/membership proof bytes;
- large systems-first selection resolution;
- browser localStorage serialization/parse behavior;
- Free-completion receipts;
- bounded detailed-history/optimizer cleanup;
- Reset/Fresh transactions;
- Cloudflare rows-read/written metadata where available.

PR A does not add denormalized selection membership tables or durable run/session rows based on unmeasured assumptions.

## 7. Explicitly deferred

PR A does **not** implement:

- systems-first learner chooser/run planning — PR B;
- active Reviews / frozen content / one-active ownership — PR C;
- Scheduled learner runtime cutover or FSRS completion transaction — PR D plus the explicit cutover checkpoint;
- Free Study completion receipts or Expanded preference runtime behavior — PR E;
- Reset/Fresh/retention UI and learner Progress — PR F;
- monthly analytics buckets, Admin history/trends, or mature-account deletion benchmarking — PR G;
- automatic optimizer execution/parameter replacement — later optimizer PR.

No learner-facing application behavior is switched by PR A.