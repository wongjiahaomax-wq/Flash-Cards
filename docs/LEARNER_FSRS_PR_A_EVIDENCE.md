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

The package/runtime version contract is deliberately redundant and checked. `package.json` pins the install dependency, `package-lock.json` pins the resolved package artifact/integrity, and the repository adapter exports `FSRS_LIBRARY_VERSION`. A test fails if the declared dependency version and adapter metadata drift apart.

### Bundle compatibility

The existing structural/bundle smoke remains:

```bash
npm run fsrs:worker-smoke
```

It bundles the adapter through the repository Vite toolchain, rejects an external `ts-fsrs` or Node-builtin runtime dependency in the resulting scheduling bundle, imports that generated bundle in the Node test harness, and executes an actual transition. This proves the dependency is bundled into Worker-targeted JavaScript, but it is not by itself treated as proof that the scheduler executes inside workerd.

### Cloudflare Worker runtime compatibility

PR A therefore also adds:

```bash
npm run fsrs:workerd-smoke
```

and the dedicated path-filtered GitHub workflow:

```text
Learner FSRS workerd smoke
```

The smoke harness launches the repository-pinned Wrangler in `dev --local` mode using the repository `compatibility_date` and `nodejs_compat` flag. It creates a temporary Worker whose module imports the real repository `src/lib/server/learning/fsrs-scheduler.js`. The Worker itself constructs canonical default parameters/current Card state, performs a real `good` scheduling transition, and returns the scheduler library version, repository scheduler revision, resulting state and next-due timestamp over HTTP. The Node process only launches Wrangler and verifies the HTTP result; the FSRS transition is executed by the Worker runtime.

No Cloudflare credentials are required or exposed. The smoke explicitly removes Cloudflare account/API credential environment variables and runs locally without D1/R2 bindings or Production mutation.

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

## 8. Validation evidence

The dependency/version drift hardening checkpoint at exact head:

```text
4cea2d7d0e40ca9b2745919c1556eeb300be94a9
```

completed:

```text
CI #1555 — passed
Wrangler runtime smoke #241 — passed
```

After independent review identified that this did not execute the scheduler inside workerd, PR A added the dedicated runtime smoke described above. The corrected scheduler/runtime checkpoint at exact PR head:

```text
7a336183f36aa43d420261bdb49625f5bdd57e14
```

completed all three relevant workflows successfully:

```text
CI #1565 — passed
Wrangler runtime smoke #251 — passed
Learner FSRS workerd smoke #1 — passed
```

The FSRS workerd job output reported:

```text
compatibilityDate: 2026-08-14
schedulerLibraryVersion: 5.4.2
schedulerRevision: 1
ok: true
resultingState: 1
nextDueAt: 1788307800000
```

This is the first Part A checkpoint that directly proves a transition by the real repository adapter/pinned `ts-fsrs` executes under the repository-pinned Cloudflare local Worker runtime. The documentation commit recording this evidence moves the PR head again; final handoff/acceptance must therefore also require ordinary exact-head CI plus the two path-filtered runtime workflows to remain green on that final documentation head.
