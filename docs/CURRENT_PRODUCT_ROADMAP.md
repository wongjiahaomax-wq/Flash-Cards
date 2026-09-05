# Flash-Cards — Current Product Roadmap

_Last reconciled: 5 September 2026._

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

This reconciliation includes current `main` through merged PR #147 (Multi-System Runtime v2) plus the repository implementation of the subsequent Multi-System UX learner cutover. Use Git/GitHub for the exact current PR/merge state. The implemented repository migration boundary is `0026_multi_system_active_review_scope_v2.sql`; the UX tranche adds no migration.

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

The repository now contains substantially newer FSRS and Multi-System Runtime v2 code/migrations. Do **not** relabel those as Production-deployed without separate release/migration evidence.

## Current repository learner architecture

Normal `/study` is FSRS/Free owned. In the Multi-System UX implementation represented by this roadmap:

- learner entry allows one or more Systems in one combined run;
- each selected System means all eligible content by default and may be narrowed to its existing Topics and curated Tags;
- whole-System selection uses the canonical Runtime v2 `mode: 'all'` contract rather than materializing every route;
- the combined eligible Case count is resolved server-side with the same union/deduplication semantics as the authoritative multi-System planner;
- modes are Scheduled Study and Free Study;
- run sizes are 5 / 10 / 20 / All available Cases, default 10, across the combined unique pool;
- plan → first Case and completion → next Case remain continuous, including transitions between Systems;
- Scheduled ratings are Again / Hard / Good / Easy;
- Expanded Learning is a learner preference/content-mode choice, not the old persisted-Review continuation architecture;
- unfinished learner work is `active_reviews` / `active_review_questions` / `active_review_assets`;
- Scheduled completion advances FSRS state and writes durable Scheduled events/aggregates;
- Free completion records non-scheduling exposure with its own receipt/aggregate ownership;
- browser run state is convenience state only and cannot mint scheduler authority;
- server-authenticated Runtime v2 run/scope/work proofs protect captured run membership;
- there is still one learner × Case FSRS state regardless of which selected System exposed the Case;
- Reset Progress and Fresh FSRS Start invalidate stale active/browser work through generation/review-sequence boundaries;
- learner Progress is implemented;
- detailed Scheduled-history retention supports 24m / 36m / 60m / indefinite;
- Admin learner retention controls are implemented;
- durable monthly Admin analytics and stable account-created-month cohort trends are implemented;
- mature learner account deletion uses retry-safe staged deletion rather than an unbounded one-shot cascade.

There is no balanced/equal per-System quota, synthetic `Mixed` System, or per-System FSRS state in the current design.

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

Completed repository foundations/tranches represented on current `main` include:

- Parts A–E — foundation, run/proof, active Review, Scheduled completion, Free Study;
- PR #137 — real `/study` runtime cutover and legacy Review retirement;
- PR #139 / PR F — Reset Progress, Fresh FSRS Start, detailed-history retention/control, learner Progress;
- PR #141 / PR G — durable monthly Admin analytics, stable cohort trends, System provenance extension, mature-account-deletion scale gate and staged deletion path;
- PR #147 — Multi-System Runtime v2 scope/proof/D1/cutover foundation.

The subsequent Multi-System UX learner cutover is implemented in the repository branch/PR represented by `MULTI_SYSTEM_UX_IMPLEMENTATION.md`; use GitHub to establish whether that PR is still under review or has merged.

Still outside the implemented FSRS/Multi-System scope:

- automatic FSRS optimizer execution;
- automatic parameter replacement/rescheduling from optimizer results;
- equal/balanced System quotas or a separate mixed-System sampling algorithm.

Those are not implicitly authorized by the presence of optimizer evidence/storage or by multi-System eligibility.

## Current product/engineering priorities

### 1. Production FSRS / Runtime v2 rollout and verification

The next operational learner-runtime step is controlled Production rollout when separately authorized, not an implicit consequence of repository implementation:

- establish the exact reviewed release commit;
- follow the Runtime v2 fenced exact-zero cutover path when it is still required;
- apply required Production D1 migrations through the intended boundary using the reviewed workflow;
- deploy the reviewed Worker;
- explicitly verify multi-System counts/selection, Scheduled Study, Free Study, cross-System run continuation, active Review resume/media, Reset/Fresh, Progress, Admin retention, Admin analytics, and Admin Study Preview isolation;
- preserve stop/fail-closed decisions when any preflight invariant fails.

No documentation or ordinary feature PR authorizes those Production operations.

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
- multi-System chooser/count latency only if measurements justify optimization;
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
- dedicated Multi-System Runtime v2 acceptance/benchmark CI;
- local production-like content replica;
- local slide-review/finalizer tooling.

The repository-installed dependencies and committed lockfile are authoritative. Production deployment remains governed by `CLOUDFLARE.md`.
