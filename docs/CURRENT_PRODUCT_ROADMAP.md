# Flash-Cards — Current Product Roadmap

_Last reconciled: 4 September 2026._

This is the shortest current status map. It separates verified Production facts from repository state and future work.

## Status boundary

Always keep these facts distinct:

```text
merged on main
!= migration applied to Production D1
!= Worker deployed
!= feature enabled
!= learner rollout completed
!= behavior explicitly verified in Production
```

This reconciliation was prepared from `main` after merged PR #142. The implemented repository migration boundary is `0025_learner_fsrs_admin_analytics_deletion.sql`.

The GitHub repository is public. The application remains closed-enrollment/private; public self-registration is disabled on current repository code.

## Explicitly verified Production baseline

The durable project record verifies a Production baseline that predates the FSRS rollout and includes:

- authenticated D1-backed learner Study/Review from the pre-FSRS runtime;
- private R2 teaching-image delivery;
- Better Auth Production/Preview role boundaries;
- Production Admin CMS for Cases, Questions, Shared Questions, Images, Systems/Topics, Tags, and reviewed imports;
- Image Management V2 and Collections;
- Tagging Stage A/B;
- Production-backed Preview Admin;
- the first ECG/Anki corpus represented and verified in Production: 66/66 source notes.

The repository now contains substantially newer FSRS code/migrations. Do **not** relabel those as Production-deployed without separate release/migration evidence.

## Current repository learner architecture

Normal `/study` is FSRS/Free owned:

- learner entry is Systems-first;
- modes are Scheduled Study and Free Study;
- run sizes are 5 / 10 / 20 / All available Cases, default 10;
- Scheduled ratings are Again / Hard / Good / Easy;
- Expanded Learning is a learner preference/content-mode choice, not the old persisted-Review continuation architecture;
- unfinished learner work is `active_reviews` / `active_review_questions` / `active_review_assets`;
- Scheduled completion advances FSRS state and writes durable Scheduled events/aggregates;
- Free completion records non-scheduling exposure with its own receipt/aggregate ownership;
- browser run state is convenience state only and cannot mint scheduler authority;
- server-authenticated run/scope/work proofs protect captured run membership;
- Reset Progress and Fresh FSRS Start invalidate stale active/browser work through generation/review-sequence boundaries;
- learner Progress is implemented;
- detailed Scheduled-history retention supports 24m / 36m / 60m / indefinite;
- Admin learner retention controls are implemented;
- durable monthly Admin analytics and stable account-created-month cohort trends are implemented;
- mature learner account deletion uses retry-safe staged deletion rather than an unbounded one-shot cascade.

Legacy `reviews`, `review_questions`, and `review_assets` remain only as physical migration-history/cutover-sentinel tables. They are not the current learner runtime owner.

## Current Admin/content model

```text
System
└── Topic hierarchy
    └── Case
        ├── exactly one Primary Topic relationship
        ├── zero or more Case Tags
        ├── fixed Assets
        ├── zero or more Alternative Sets
        └── contextual Questions
```

Systems are top-level learner navigation. Cases attach to Topics, never directly to Systems. Tags are flat cross-cutting classification; System↔Tag exposure is separate global navigation curation.

Additional Study Topics are retired from current behavior. Historical `case_concepts.role = 'secondary'` rows may remain as inert compatibility data.

Current repository Admin navigation includes:

```text
Dashboard
Cases
Questions
Shared Questions
Images
Systems & Topics
Tags
Learner analytics
Learner retention
Import package
Admin Study Preview
```

Admin Study Preview must remain outside learner persistence.

## FSRS programme state

Completed repository tranches:

- Parts A–E — foundation, run/proof, active Review, Scheduled completion, Free Study;
- PR #137 — real `/study` runtime cutover and legacy Review retirement;
- PR #139 / PR F — Reset Progress, Fresh FSRS Start, detailed-history retention/control, learner Progress;
- PR #141 / PR G — durable monthly Admin analytics, stable cohort trends, System provenance extension, mature-account-deletion scale gate and staged deletion path.

Still outside the implemented PR G scope:

- automatic FSRS optimizer execution;
- automatic parameter replacement/rescheduling from optimizer results.

Those are not implicitly authorized by the presence of optimizer evidence/storage.

## Current product/engineering priorities

### 1. Production FSRS rollout and verification

The next operational FSRS step is not more repository cutover implementation. It is controlled Production rollout when separately authorized:

- establish the exact reviewed release commit;
- run the Production zero-legacy-Review preflight;
- apply the required Production D1 migrations in order through the intended boundary;
- deploy the reviewed Worker;
- explicitly verify Scheduled Study, Free Study, active Review resume/media, run continuation, Reset/Fresh, Progress, Admin retention, Admin analytics, and Admin Study Preview isolation;
- preserve stop/fail-closed decisions when any preflight invariant fails.

No documentation-only PR authorizes those Production operations.

### 2. Account Management v1

Account Management design is committed, but implementation is not on the reconciliation base:

- PR #96 — open draft: password recovery and transactional-email foundation;
- PR #97 — open draft: Production Admin account management, stacked on #96.

Do not call those features merged until the PRs actually merge.

### 3. Real-corpus taxonomy and content curation

Continue refining:

- canonical Primary Topics;
- Case Tags;
- System↔Tag exposure;
- Shared Questions;
- Reusable Image Questions;
- curated Original/Alternative stimulus families.

Use real content evidence rather than introducing another classification model prematurely.

### 4. Measurement-driven performance work

Continue only from measured bottlenecks. Candidate areas include:

- Better Auth short-lived session/cookie behavior;
- FSRS Study/run-planning read paths;
- Case-editor server read/lazy-loading boundaries;
- image thumbnail delivery;
- query/index tuning backed by measurements/EXPLAIN.

Do not add caches/indexes solely because they are conventional.

### 5. Documentation and agent-context hygiene

Keep living authorities concise and current. Historical plans/evidence should remain historical rather than competing with current docs. Use `DOCUMENTATION_MAINTENANCE.md` to prevent future status/migration/runtime drift and reduce coding-agent context load.

## Developer/tooling baseline

Current repository tooling includes:

- Node 22;
- `npm run deps:ensure` for dependency reuse after branch sync;
- `agent:doctor`, `agent:checks`, `validate:fast`, `validate:full`;
- Draft-fast / Ready-full ordinary CI;
- same-PR concurrency cancellation;
- pinned Wrangler/workerd runtime smoke;
- specialized FSRS D1/runtime/benchmark workflows;
- local production-like content replica;
- local slide-review/finalizer tooling.

The repository-installed dependencies and committed lockfile are authoritative. Production deployment remains governed by `CLOUDFLARE.md`.
