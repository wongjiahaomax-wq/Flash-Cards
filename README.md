# Flash-Cards

Flash-Cards is a case-based medical learning application built with SvelteKit, Cloudflare Workers, D1, private R2 media, Better Auth, and a Case-level FSRS learner scheduler.

**Repository visibility and application access are different things:** this GitHub repository is public; the deployed application is closed-enrollment/private and does not expose public self-registration.

_Last project-wide documentation reconciliation: 5 September 2026._

## Current repository baseline

Current `main` includes:

- Production/Admin content management for Cases, Questions, Shared Questions, Images, Systems/Topics, Tags, reviewed imports, learner retention controls, and learner analytics;
- one canonical Primary Topic per current Case plus zero or more Case Tags;
- System → Topic / exposed Tag / All learner navigation semantics;
- fixed images plus optional Alternative Sets with explicit Original semantics;
- Case-, stimulus-, Topic-, Tag-, and exact-Asset-scoped question sources;
- strict Import Package v1 and local slide-review/finalizer tooling;
- a local production-like D1/R2 development replica;
- the learner FSRS runtime cutover with Scheduled Study, Free Study, Again/Hard/Good/Easy ratings, 5/10/20/All run sizes, active Review snapshots, Reset Progress, Fresh FSRS Start, learner Progress, detailed-history retention, durable monthly Admin analytics, and retry-safe mature-account deletion;
- repository migrations through `0025_learner_fsrs_admin_analytics_deletion.sql`;
- repository-owned coding-agent routing, Draft-fast / Ready-full validation, specialized FSRS checks, dependency reuse via `npm run deps:ensure`, and compact-by-default local validation presentation.

The repository baseline is **not** a production deployment ledger. Keep these facts separate:

```text
merged on main
!= migration applied to Production D1
!= Worker deployed
!= feature enabled
!= learner rollout completed
!= behavior explicitly verified in Production
```

No current repository document should claim that FSRS migrations `0019`-`0025` are applied to Production merely because they are committed.

## Start here

Read [`docs/DOCUMENTATION_INDEX.md`](docs/DOCUMENTATION_INDEX.md) before relying on older plans, implementation prompts, or evidence files.

For most project-wide work, the living authority chain is:

1. [`docs/CURRENT_PRODUCT_ROADMAP.md`](docs/CURRENT_PRODUCT_ROADMAP.md) — current repository/Production status and next work;
2. [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md) — exact implemented domain/schema semantics;
3. the relevant subsystem authority listed in the documentation index;
4. [`docs/CURRENT_DESIGN.md`](docs/CURRENT_DESIGN.md) and [`docs/V1_SPEC.md`](docs/V1_SPEC.md) — concise product mental model/behavior summary;
5. historical plans/evidence only for decision history.

Coding agents should also read root [`AGENTS.md`](AGENTS.md) and use [`docs/AGENT_TASK_MAP.md`](docs/AGENT_TASK_MAP.md) for minimum-context routing.

## Current content model

```text
System
├── descendant Topics
└── explicitly exposed Tags

Case
├── exactly one behaviorally active Primary Topic
├── zero or more Case Tags
├── vignette
├── fixed Assets
├── zero or more Alternative Sets
│   └── one selected eligible option per active family
└── contextual Questions
```

Terminology:

- **System** — top-level learner navigation grouping.
- **Topic** — canonical educational home and direct Topic-question context for a Case.
- **Tag** — flat cross-cutting classification/discovery metadata.
- **System↔Tag exposure** — global learner-navigation curation; it does not make a Tag belong to a System.
- **Asset** — exact teaching-media identity, currently image-based.
- **Collection** — Image Library organisation only.
- **Question Prompt** — wording only; answers live where they remain semantically correct.
- **Shared Question** — reusable meaning gated by one explicit Case Reuse Scope Tag.
- **Reusable Image Question** — reusable meaning intrinsic to one exact Asset and explicitly opted into each exact stimulus usage.

Additional Study Topics are retired from current product behavior. Historical `case_concepts.role = 'secondary'` rows may remain physically stored as compatibility data but are not current authoring or learner classification.

## Learner Study / FSRS

Normal learner Study is owned by the FSRS/Free runtime, not the historical persisted `reviews` model.

Current repository behavior includes:

```text
Choose System
→ Scheduled Study or Free Study
→ choose 5 / 10 / 20 / All available Cases (default 10)
→ active Review snapshot freezes the presented Case/questions/media
→ reveal answers
→ Again / Hard / Good / Easy for Scheduled Study
→ completion advances FSRS state and durable Scheduled history
```

Free Study records exposure without advancing scheduled FSRS state.

Unfinished learner work is owned by:

```text
active_reviews
active_review_questions
active_review_assets
```

The physical legacy tables `reviews`, `review_questions`, and `review_assets` remain only as migration-history/cutover-sentinel structures. Current application schema/runtime code does not use them as the normal learner Review owner.

Reset Progress and Fresh FSRS Start invalidate stale active/browser work through generation/review-sequence boundaries. Learner Progress and Admin analytics read the durable FSRS model. Long-range monthly trends come from `learner_system_monthly_buckets`; they are not reconstructed from lifetime aggregates or optimizer evidence.

See [`docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`](docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md) for the current runtime boundary and [`docs/LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md`](docs/LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md) for the locked product plan.

## Administrator surfaces

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

Account Management v1 remains separate: PR #96 (password recovery/email foundation) and PR #97 (Admin account management) are still open draft PRs and are not part of current `main` merely because their design documents exist.

## Imports and source reconstruction

The Production application does not directly ingest arbitrary `.apkg`, PowerPoint, or PDF teaching sources.

```text
source material
→ semantic reconstruction outside Production
→ reviewable import bundle
→ local human review/finalization
→ strict Import Package v1
→ Production Admin importer
```

The executable Import Package validator and strict slide-review `review-map-v1.schema.json` own their respective formats. Do not copy obsolete fields from old extraction prompts.

## Development

Node 22 is the repository runtime contract.

Normal dependency preparation after switching/syncing branches is:

```sh
npm run deps:ensure
```

Use `npm run deps:ensure -- --force` only for known dependency damage/drift. The committed lockfile is authoritative.

Common local commands:

```sh
npm run dev
npm run preview
npm run local:stop
npm run agent:doctor
npm run agent:checks -- --compact
npm run validate:fast
npm run validate:full
```

Routine local repository validation is compact by default. Use explicit verbose variants only when compact failure evidence is insufficient; for example `npm run test:verbose -- <test-file>`, `npm run check:verbose`, `npm run build:verbose`, or `npm run validate:full -- --verbose`.

`npm run dev` / `npm run preview` use local bindings/state. Production deployment and remote D1 migration remain explicit operator operations governed by `docs/CLOUDFLARE.md`. CI, Preview, Production and deployment workflows deliberately select their own presentation rather than inheriting local compact defaults.

## Public-repository safety

Because this repository is public, never commit:

- Cloudflare API tokens or other credentials;
- Better Auth secrets;
- passwords or reset tokens;
- `.dev.vars`, `.wrangler/`, `.env*` secrets;
- Production D1 exports containing user/session/learner data;
- mirrored private R2 teaching-media bytes unless deliberately licensed and approved for publication.

See [`docs/OPEN_SOURCE_READINESS.md`](docs/OPEN_SOURCE_READINESS.md) for the current public-repository safety posture and [`docs/DOCUMENTATION_MAINTENANCE.md`](docs/DOCUMENTATION_MAINTENANCE.md) for documentation-lifecycle rules.
