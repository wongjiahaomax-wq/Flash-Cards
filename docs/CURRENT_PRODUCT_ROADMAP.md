# Flash-Cards — Current Product Roadmap

_Last updated: 3 September 2026_

This is the short status map for what is **explicitly verified in Production**, what the **current repository architecture** owns, and what remains product/engineering work. Detailed semantics live in `HANDOVER.md`, `V1_DATA_MODEL.md`, `AUTHORING_MODEL.md`, and the relevant subsystem contracts.

For the learner FSRS cutover, also read `LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md`. That document records the post-cutover runtime ownership and supersedes the readiness contract's pre-cutover observation that then-current `main` still used persisted legacy Reviews.

## Status boundary

Keep these facts separate:

```text
merged on main
≠ migration applied to Production D1
≠ Worker deployed
≠ learner feature enabled
≠ behavior explicitly verified in Production
```

A repository change may be correct and merged without being deployed or enabled. Do not infer Production state from merge state.

## Explicitly verified Production baseline

The recorded verified Production baseline includes:

- D1-backed learner Study/Review flow from the pre-FSRS Production runtime;
- protected private R2 teaching images;
- Better Auth Production Admin and Preview Admin boundaries;
- Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags, and reviewed imports;
- optional stimulus groups/options with exact-option and set-wide contextual questions;
- Tagging Stage A/B;
- Production-backed Preview Admin workspace;
- Image Management V2 with Collections and bounded operations;
- wide responsive Admin workspace;
- first ECG/Anki source deck fully represented and verified in Production: **66/66 source notes**.

The repository contains later FSRS code and migrations beyond this verified Production baseline. Treat those as repository behavior until separate deployment evidence exists.

The Production-backed Preview Admin still exists, but local clone + local production-like D1/R2 remains the primary development/integration verification path.

## Current repository learner architecture

The learner repository architecture is now Systems-first and FSRS-owned:

- learner Study selects a System and contributing Topic/Tag routes;
- Scheduled Study and Free Study are explicit run modes;
- run-size choices are **5 / 10 / 20 / All**;
- Expanded Learning is a learner preference rather than a legacy per-Review continuation runtime;
- unfinished learner work is owned by `active_reviews`, `active_review_questions`, and `active_review_assets`;
- Scheduled completion writes durable FSRS state/events through the Scheduled completion owner;
- Free completion remains non-scheduling learner exposure with its own completion receipt/state owner;
- active Review media, not legacy `review_assets`, owns frozen unfinished learner media;
- browser run state is convenience state only and cannot mint scheduler authority;
- server-authenticated run/scope/work proofs protect Scheduled captured-work membership and repeat origin.

The physical legacy tables `reviews`, `review_questions`, and `review_assets` remain migration-history / zero-data cutover sentinels only. They are not exported by the current application Drizzle schema and are not a supported learner runtime mode.

Production rollout is guarded by the zero-legacy-Review preflight. Unexpected Production legacy rows stop the cutover; the gate is not a deletion mechanism.

## Current Admin/content model

```text
System
└── Topic hierarchy
    └── Case
        ├── exactly one Primary Topic relationship
        ├── zero or more Case Tags
        ├── fixed Assets
        ├── zero or more Alternative Sets
        └── contextual questions
```

Systems are top-level learner-navigation groupings. Cases attach to Topics, never Systems. Tags remain flat cross-cutting metadata; System↔Tag exposure is a separate global learner-navigation curation operation.

Current Admin surfaces include:

```text
Dashboard
Cases
Questions
Shared Questions
Images
Systems & Topics
Tags
Import package
Admin Study Preview
```

Admin Study Preview resolves current learner content without writing learner preferences, FSRS state, active Reviews, completion receipts, or legacy Review rows. The retained local FSRS regression preview remains a separate local-only engineering surface.

Additional Study Topics remain retired from current product behavior. Historical `case_concepts.role = 'secondary'` rows may remain as compatibility data, but current authoring/read/import/Preview/learner paths do not create or use them as active Case classification.

## Repository migration boundary

The repository now contains the FSRS foundation, active Review, Scheduled completion, Free Study, and subsequent learner FSRS migrations. D1 trigger migrations must remain compatible with the repository remote-statement splitter contract; the current parser-safe trigger form is part of that migration contract.

Historical migrations are immutable history. Their existence does not make the old learner Review model a current application schema owner.

## Durable learner history and taxonomy safety

Durable learner-history System attribution is centrally protected. Current durable attribution includes Scheduled Review events and learner System aggregates. Application taxonomy writers and defensive database triggers prevent permanent System deletion/reclassification while that durable attribution exists.

Any future durable System-attribution table must be registered with the same provenance authority.

## Real ECG/Anki migration

Production verification on 18 August 2026 recorded:

```text
Batch 01 imported Cases/ECGs:      13
Batch 02 imported Cases/ECGs:      51
Pre-existing mapped calcium Cases:  2
                         ----
Source notes represented:          66 / 66
```

Initial ingestion is complete. Remaining ECG work is curation/enrichment, not re-ingestion.

## Current product work

### 1. Complete FSRS cutover validation and rollout

Before normal Production rollout:

- keep the runtime-cutover PR on current `main`;
- obtain green exact-head repository validation plus specialized FSRS runtime/D1 checks;
- run the Production zero-legacy-Review preflight before any deployment/migration step;
- deploy/migrate only through a separately executed Production operation;
- explicitly verify learner Scheduled, Free, resume/discard, run continuation, active media, and Admin Preview isolation after rollout.

### 2. Curate the real corpus and learner taxonomy

Use real Cases to refine canonical Primary Topics, Case Tags, System↔Tag exposure, Shared Questions, Reusable Image Questions, and stimulus variants. Promote reusable knowledge only when Prompt/answer semantics remain reliably correct across the intended scope.

### 3. Validate newer Admin workflows with real use

The taxonomy workspace, Case lifecycle/recovery surfaces, bulk Topic assignment, inline/bulk Tag editing, Case Library search changes, and Admin Study Preview should continue to be exercised with normal local/manual UX testing before adding another classification model or broad redesign.

### 4. Account Management v1 implementation

`ACCOUNT_MANAGEMENT_PLAN.md` is merged design context. Password-recovery/email foundation and routine Production account administration remain separate implementation work until their implementation PRs merge and are deployed.

Public self-registration remains disabled unless a separately reviewed product decision changes that contract.

### 5. Learner-progress administration

Build learner progress/admin reporting on the durable FSRS model rather than the retired persisted Review model. Start with useful learner/state/recent-event views and only add sophisticated analytics when real usage establishes requirements.

### 6. Continue measurement-driven performance work

Completed work includes bounded Admin read models and targeted Case Library search/read-path improvements.

Remaining work should stay evidence-driven:

```text
Better Auth short-lived session cookie-cache investigation
learner FSRS Study/run-planning/read-model optimisation
Case-editor server read/lazy-loading boundaries
image thumbnails and measured EXPLAIN/index tuning
```

Do not add caches or indexes merely because they are common performance techniques; measure the active bottleneck first.

## Developer/tooling baseline

The repository provides:

- capability-based Local / Remote GitHub / Hybrid agent execution guidance;
- scoped `AGENTS.md` files plus `AGENT_TASK_MAP.md`;
- Node 22 contract;
- `agent:doctor`, `agent:checks`, `validate:fast`, `validate:full`;
- repository-owned ordinary CI/local validation definitions;
- Draft PR fast validation and Ready PR full validation through the same shared contract;
- same-PR CI concurrency cancellation without cross-PR cancellation;
- repository-pinned Wrangler/workerd runtime with dedicated runtime smoke;
- FSRS-specific D1/runtime/benchmark workflows;
- deterministic local `npm run dev` / `npm run preview` launchers using repository-local Wrangler/XDG state;
- Production-like read-production/write-local development replica;
- local slide-review/finalizer tooling.

Normal development remains local-first:

```text
npm run local:refresh   # when fresh production-derived content is needed
npm run dev             # fast iteration / hot reload
npm run local:stop
npm run preview         # production-style local verification
repository validation / GitHub CI
```

Remote Preview deployment is retained as an optional capability, not a required integration gate.

## Deliberately deferred / separated

Unless concrete evidence creates a need, keep separate or deferred:

- revival of Additional Study Topics;
- further Preview backend decomposition merely to finish an old sequence;
- remote Preview Admin decommissioning without a dedicated assessment;
- compound Shared Question reuse scopes;
- Tag hierarchy/aliases;
- automatic/AI clinical classification without reviewed workflow;
- generic Asset-family/version systems;
- permanent Asset/R2 deletion without conservative safety design;
- broad non-image media types;
- rich WYSIWYG authoring.

## Implementation principle

Prefer real-content curation, observed learner/Admin friction, focused maintainability work in actively changed paths, and measured performance evidence over speculative schema expansion or preservation of obsolete runtime compatibility layers.
