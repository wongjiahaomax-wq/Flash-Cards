# Flash-Cards — Current Product Roadmap

_Last updated: 28 August 2026_

This is the short status map for what is **explicitly verified in production**, what is **merged on current `main`**, and what remains product/engineering work. Detailed semantics live in `HANDOVER.md`, `V1_DATA_MODEL.md`, `AUTHORING_MODEL.md`, and the relevant subsystem contracts.

## Status boundary

Keep these facts separate:

```text
merged on main
≠ migration applied to production D1
≠ Worker deployed
≠ taxonomy/content curation completed
≠ learner feature enabled
≠ behavior explicitly verified in production
```

A repository change may be correct and merged without being deployed or enabled. Do not infer production state from merge state.

## Explicitly verified production baseline

The recorded verified production baseline includes:

- D1-backed learner Study/Review flow;
- protected private R2 teaching images;
- Better Auth production Admin and Preview Admin boundaries;
- Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags, and reviewed imports;
- optional stimulus groups/options with exact-option and set-wide contextual questions;
- Tagging Stage A/B;
- production-backed Preview Admin workspace;
- Image Management V2 with Collections and bounded operations;
- wide responsive Admin workspace;
- first ECG/Anki source deck fully represented and verified in production: **66/66 source notes**.

The repository contains later merged code and migrations beyond this verified production baseline. Treat those as current-main behavior unless separate deployment evidence exists.

The production-backed Preview Admin still exists, but since 25 August 2026 it is no longer part of the normal development/testing workflow. Local clone + local production-like D1/R2 is the primary application verification path.

## Current `main` — merged baseline

Current `main` is at merge commit `31eac90c0a6dd472d747a7ec0be94cd9ad3eae9d` (PR #106) at the time of this refresh.

Core current behavior includes:

- one canonical behaviorally active **Primary Topic** per current Case;
- zero or more flat **Case Tags** for cross-cutting classification/contextual discovery;
- contextual **System → Topic / exposed Tag / All** learner navigation behind rollout control;
- learner-selectable **Original questions** versus **Expanded Learning** Review modes;
- fixed images plus Alternative Sets/options;
- Case, Topic, stimulus, tag-shared, and exact-Asset reusable Question sources with deterministic precedence/deduplication;
- strict reviewed Import Package v1 plus resumable/chunked execution;
- local/offline slide review and deterministic finalization;
- private R2 image lifecycle, Collections, same-image higher-resolution replacement, and historical media preservation;
- bounded Admin read models and repository-owned performance timing;
- local-first development with repository-owned validation and pinned Wrangler runtime.

### Important post-PR-#90 merged changes

- **PR #92** — documents local-first development and pauses the unfinished Preview backend decomposition sequence; remote Preview remains retained/optional rather than the normal integration gate.
- **PR #93** — improves desktop Case-editor layout/density for Topic/Tag authoring.
- **PR #95** — records the Account Management v1 product/security plan. This is documentation/design only; the corresponding PR-A/PR-B implementations are not part of current `main` merely because the plan is merged.
- **PR #98** — adds bulk Case Primary Topic assignment while preserving the one-Primary-Topic model.
- **PR #99** — implements the visual Systems & Topics taxonomy/Case-classification workspace, where hierarchy, Case Primary Topic, and Case Tag changes may coexist in one staged review and are submitted through one unified workspace apply action. All requested preflight checks complete before the first canonical write; the underlying canonical writers remain separate and are not one cross-domain serializable transaction.
- **PR #100** — adds Production Case lifecycle UX (**Active → Deactivate → preserved Inactive → validated Restore**) plus inline and bulk Case Tag curation in the Case Library.
- **PR #102** — removes search-on-every-keystroke from Case/Topic/System Case Library text filters and removes the duplicate taxonomy supporting read on the active library path.
- **PR #106** — makes ordinary PR CI state-aware: Draft PRs run repository fast validation; Ready-for-Review PRs run full validation; Draft → Ready triggers full validation on the same head; superseded runs for the same PR are cancelled.

Additional Study Topics remain retired from current product behavior. Historical `case_concepts.role = 'secondary'` rows may still exist as compatibility data, but current authoring/read/import/Preview/learner paths do not create or use them as active Case classification.

## Repository migration boundary

Current repository migrations extend through:

```text
0015_contextual_system_topic_tag_navigation.sql
```

Important recent migrations:

```text
0014_review_question_pool_mode.sql
→ persisted Original/Core versus Expanded Review question-pool provenance

0015_contextual_system_topic_tag_navigation.sql
→ System/Topic taxonomy, System↔Tag exposure, and System-route Review provenance
```

There is intentionally no migration solely to retire Additional Study Topics. PR #90 changed current behavior/read/write paths while retaining the physical compatibility shape.

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
```

The Case Library now supports Active/Inactive lifecycle views, validated deactivate/restore, inline/bulk Case Tag curation, bulk Primary Topic assignment, bounded filtering/pagination, and explicit text-search submission rather than navigation during typing.

The Systems & Topics page is now the visual taxonomy/classification workspace implemented by PR #99 rather than the pre-#99 duplicated flat taxonomy + separate hierarchy-manager experience. Its three staged mutation domains share one review/apply surface and a fail-before-first-write preflight boundary, without claiming one rollback/serializable transaction across the canonical writers.

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

### 1. Curate the real corpus and learner taxonomy

Use real Cases to refine canonical Primary Topics, Case Tags, System↔Tag exposure, Shared Questions, Reusable Image Questions, and stimulus variants. Promote reusable knowledge only when Prompt/answer semantics remain reliably correct across the intended scope.

Before learner System navigation is enabled, explicitly review clinically useful alternate discovery through Case Tags + System↔Tag exposure. Do not infer Topic→Tag conversion merely from matching labels or from historical secondary Topic rows.

### 2. Validate the newer Admin workflows with real use

The taxonomy workspace, Case lifecycle/recovery surfaces, bulk Topic assignment, inline/bulk Tag editing, and Case Library search changes are merged. Use normal local/manual UX testing to identify concrete friction before adding another classification model or broad redesign.

### 3. Account Management v1 implementation

`ACCOUNT_MANAGEMENT_PLAN.md` is merged design context. Password-recovery/email foundation and routine production account administration are still separate implementation work until their implementation PRs actually merge.

Public self-registration remains disabled unless a separately reviewed product decision changes that contract.

### 4. Basic learner-progress administration

After the smallest useful account-administration baseline exists, add learner list/recent Review views and simple Again/Good/repeated-Again signals. Defer sophisticated analytics until real usage establishes requirements.

### 5. Continue measurement-driven performance work

Completed work includes bounded Admin read models and the targeted Case Library search/read-path improvement in PR #102.

Remaining planned work should stay evidence-driven:

```text
Better Auth short-lived session cookie-cache investigation
learner Study/startReview read-model optimisation
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
- deterministic local `npm run dev` / `npm run preview` launchers using repository-local Wrangler/XDG state;
- repository-scoped `npm run local:stop`;
- production-like read-production/write-local development replica;
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
- further Preview backend decomposition merely to finish the old sequence;
- remote Preview Admin decommissioning without a dedicated assessment;
- compound Shared Question reuse scopes;
- Tag hierarchy/aliases;
- automatic/AI clinical classification without reviewed workflow;
- generic Asset-family/version systems;
- permanent Asset/R2 deletion without conservative safety design;
- FSRS/advanced analytics;
- broad non-image media types;
- rich WYSIWYG authoring.

## Implementation principle

The platform architecture is a working baseline. Prefer real-content curation, observed learner/Admin friction, focused maintainability work in actively changed paths, and measured performance evidence over speculative schema expansion or completion of obsolete implementation sequences.
