# Flash-Cards — V1 Implementation Plan

_Last updated: 28 August 2026_

This document tracks the implemented V1 state on current `main`. For the shortest verified-production-versus-current-main view read `CURRENT_PRODUCT_ROADMAP.md`; for exact relationship/schema semantics use `V1_DATA_MODEL.md`, `AUTHORING_MODEL.md`, and the relevant subsystem contracts.

Do not use this document to infer production deployment. Merge state, production migration application, Worker deployment, content/taxonomy curation, learner rollout, and explicit production verification are separate facts.

## Current implementation baseline

Current `main` includes:

- SvelteKit + Cloudflare Workers application scaffold;
- D1/Drizzle learning-domain model and Better Auth;
- learner Study/Review flow with immutable Prompt/answer/media snapshots;
- private R2 teaching-image pipeline;
- Production Admin CMS for Cases, Questions, Shared Questions, Images, Systems/Topics, Tags, and reviewed imports;
- exactly one behaviorally active canonical **Primary Topic** per current Case plus zero or more **Case Tags**;
- contextual System → Topic / exposed Tag / All learner navigation behind rollout control;
- Original/Core versus Expanded Learning question-pool modes;
- fixed images plus optional Alternative Sets/options;
- Case, stimulus, Topic/ancestor, tag-shared, and exact-Asset reusable Question sources;
- Image Management V2 and Collections;
- Reusable Image Questions with explicit exact-stimulus opt-in;
- same-image higher-resolution Asset replacement/supersession;
- alternative-option **Remove from Case** archival state;
- Image Library Current/Historical only/Unused lifecycle classification;
- visual Systems & Topics taxonomy/Case-classification workspace;
- Production Case Active/Inactive lifecycle with validated restore;
- inline and bulk Case Tag curation plus bulk Primary Topic assignment;
- bounded Admin dashboard/Case-detail/Case-library/Question-library read models;
- targeted Case Library text-search/read-path performance improvement;
- Classic/Compact Case-editor UX and focused component ownership;
- production-backed Preview Admin retained as a safety-sensitive legacy subsystem;
- local production-like D1/R2 replica;
- local slide-review/deterministic-finalizer tooling;
- repository-owned coding-agent and validation workflow;
- Draft PR fast CI and Ready PR full CI through one shared validation contract;
- first ECG corpus fully represented and verified in production: **66/66 source notes**.

## Milestone 0 — current content contract

Status: **complete baseline; additive enrichment continues**.

```text
System
└── Topic hierarchy
    └── Case
        ├── exactly one Primary Topic relationship
        ├── zero or more Case Tags
        ├── fixed Assets
        ├── optional Alternative Sets/options
        └── contextual questions

Global reusable knowledge
├── Shared Question
│   └── eligibility by one matching Case Reuse Scope Tag
└── Reusable Image Question
    └── one exact Asset + explicit per-stimulus opt-in
```

Additional Study Topics are not a current authoring/learner feature. The physical `case_concepts.role = primary | secondary` compatibility shape remains, but current code treats stored secondary rows as legacy data rather than active Case classification.

Question Prompts store wording only; answers live at the context where they are correct.

## Milestone 1 — application scaffold

Status: **complete**.

SvelteKit, Workers adapter/runtime, protected routes, sign-in, CI, and production/Preview deployment infrastructure exist.

## Milestone 2 — D1 + Drizzle learning model

Status: **complete for current `main`; production application tracked separately**.

Current repository migrations:

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
0004_resumable_import_jobs.sql
0005_tag_foundation.sql
0006_preview_admin_workspace.sql
0007_image_collections.sql
0008_tag_shared_questions.sql
0009_reusable_image_questions.sql
0010_reusable_image_reactivation_guard.sql
0011_asset_supersession.sql
0012_archive_stimulus_options.sql
0013_review_assets_asset_lookup.sql
0014_review_question_pool_mode.sql
0015_contextual_system_topic_tag_navigation.sql
```

Migration `0003` remains historical schema/provenance context; it does not mean Additional Study Topics are still active product behavior. PR #90 intentionally retired that behavior without adding another migration.

## Milestone 3 — authentication/permissions

Status: **production/Preview baseline complete; Account Management v1 implementation remains separate**.

Current role concepts include:

```text
admin
user
preview_admin
```

Production and Preview Workers use separate Better Auth secrets/sessions. Public self-registration remains disabled.

`ACCOUNT_MANAGEMENT_PLAN.md` is the merged design record for password recovery, transactional email, and routine production account administration. Its implementation prompts are not proof that those implementation PRs have merged.

## Milestone 4 — learner Study flow

Status: **complete current-main behavior; rollout/deployment verified separately**.

Current learner behavior supports:

- canonical Primary Topic routing;
- contextual System → Topic / exposed Tag / All reachability where enabled;
- fixed/alternative stimuli with active/non-removed selection;
- Original/Core and Expanded Learning source modes;
- contextual/reusable question precedence;
- Automatic/All/Fixed Case question-count selection;
- stimulus-specific coverage;
- immutable Review snapshots/provenance.

Current duplicate-Prompt precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for the selected option
> stimulus group
> Case
> exact Primary Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

Removed options are excluded from current selection. Historical Reviews remain historical truth.

## Milestone 5 — protected R2 teaching images

Status: **complete baseline; lifecycle/replacement semantics merged**.

Teaching images are private JPEG/PNG objects under central type/size/storage guardrails. Production object keys are immutable.

Same-image higher-resolution replacement creates a new Asset/R2 object and retains the superseded object for historical provenance. Permanent Asset/R2 deletion remains deliberately separate.

## Milestone 6 — Admin CMS and authoring

Status: **complete current-main content-management baseline**.

Routes include:

```text
/admin
/admin/cases
/admin/questions
/admin/shared-questions
/admin/images
/admin/topics
/admin/tags
/admin/import
```

Routine Case authoring is conceptually:

```text
Primary Topic + Case Tags
→ Case details
→ Images / Alternative Sets
→ contextual questions
→ Preview
```

Current authoring includes:

- Primary Topic selection/replacement and inline Topic creation;
- Case Tag add/remove;
- whole-Case vs exact-image/stimulus question scope;
- transparent fixed-image conversion when exact-option semantics require it;
- Case-specific vs Reusable Image Question distinction;
- explicit reusable-image opt-in;
- option Move, Deactivate, and distinct Remove from Case;
- Compact/Classic presentation and fast-review audit.

The shared editor is decomposed under `src/lib/components/case-editor/`; Preview reuses the production editor surface rather than maintaining a copy.

### Case Library

Current Case Library capabilities include:

- bounded server-side filtering/sorting/pagination;
- explicit text-filter submission rather than auto-navigation while typing;
- Active / Inactive lifecycle views;
- validated single/bulk deactivate and restore;
- bulk Primary Topic assignment;
- inline Case Tag editing;
- bulk Case Tag add/remove/create-and-add;
- lifecycle-correct Tag filter context.

### Systems & Topics workspace

PR #99 replaced the duplicated pre-existing flat taxonomy/hierarchy presentation with one visual tree + inspector workspace.

Current workspace supports:

- Systems as top-level roots and arbitrarily nested Topics;
- contextual System/Topic creation;
- staged Topic hierarchy moves with drag/drop and `Move to…` fallback;
- staged Case Primary Topic changes, including bounded bulk operations;
- staged Case Tag additions/removals;
- stale-state preflight before canonical mutation functions;
- separate mutation domains rather than falsely claiming one cross-domain atomic transaction.

System↔Tag exposure remains a separate global System-level concern.

## Milestone 7 — content/model validation and curation

Status: **ongoing curation**.

Representative content should exercise multi-image Cases, Alternative Sets, Reusable Image Questions, Shared Questions, Case Tags, option removal/restoration, Asset replacement/history, contextual System/Tag reachability, and overlapping Prompt precedence.

Do not create new secondary Case↔Topic relationships for testing. If historical secondary rows are needed for compatibility coverage, treat them explicitly as legacy fixtures.

## Milestone 7A — historical multi-Topic schema/provenance

Status: **historical/superseded product behavior; compatibility retained**.

Migration `0003_multi_topic_study_routing.sql` and older Reviews explain why `secondary` relationships and `study_concept_id != primary_concept_id` may exist historically.

Current product behavior is one Primary Topic + Case Tags. `MULTI_TOPIC_STUDY_ROUTES.md` is a historical decision record, not a current authoring contract.

## Milestone 7B — Tags / Shared Questions

Status: **implemented; Stage B explicitly recorded in the verified production baseline**.

Flat Tags, Case/contextual Question Tags, tag-scoped Shared Questions, resolver integration, Review provenance, and contextual System↔Tag exposure are established.

Case Tags are also the current cross-cutting Case-classification mechanism after PR #90.

## Milestone 7C/7D — reviewed/resumable imports

Status: **merged baseline**.

Strict Import Package v1 validation, exact package confirmation, deterministic create/use/skip semantics, R2 safeguards, resumable browser-orchestrated bounded processing, D1 checkpoints, and lease safety are implemented.

Package v1 retains `secondaryTopicIds` only as an empty compatibility array; non-empty values are rejected by current reviewed/staged runtime boundaries.

## Milestone 7E — production-backed Preview Admin

Status: **retained legacy capability; normal development path is local-first**.

Architecture remains one shared production D1/R2 with explicit Preview ownership and hard route/data boundaries.

The Preview backend was decomposed through Session/ownership foundations, Case lifecycle/cloning, and fixed-image operations in PRs #80/#82/#83. Further staged decomposition was intentionally paused after PR #92 documented the local-first workflow decision. Do not resume the old PR2D/PR2E/PR2F sequence merely for completeness.

## Milestone 7F/7G — Image authoring and Image Management V2

Status: **merged baseline**.

Image Library supports bounded server pages, exact counts, Collections, cross-page selection, bounded mutations, same-Case option Move, derived lifecycle classification, and narrow same-image quality replacement.

Keep these distinct:

```text
option Deactivate
option Remove from Case
Asset Active/Inactive
Asset Current/Historical only/Unused
same-image higher-resolution replacement
```

## Milestone 7H — Reusable Image Questions

Status: **merged**.

Canonical `asset_questions` belong to one exact Asset. Each exact stimulus usage explicitly opts in. Existing Case-specific exact-image questions remain contextual and are not automatically promoted.

## Milestone 8 — real ECG migration / curation

Status: **initial migration complete; curation in progress**.

Production accounting is 13 Batch 01 + 51 Batch 02 + 2 mapped existing calcium Cases = **66/66** source notes represented.

Next work is Tags/reuse/Topic/stimulus/content curation rather than re-ingestion.

## Milestone 9 — performance/read models

Status: **bounded read-model work plus targeted Case Library improvement merged**.

Implemented:

- dashboard-specific aggregate/bounded reads;
- exact Case-detail read;
- 60-row SQL-filtered Case Library;
- 60-row bounded Question Library with Unicode-aware search preservation;
- lightweight server timing;
- Case Library text filters no longer navigate on every typing pause;
- active Case Library no longer performs the previous duplicate Concept-taxonomy supporting read;
- inactive Case Library does not construct active Topic assignment options it cannot use.

Remaining performance work should be measurement-driven rather than cache/index-first.

## Milestone 10 — coding-agent/local developer workflow

Status: **implemented repository tooling**.

Current repository workflow includes:

- root/scoped `AGENTS.md` and `AGENT_TASK_MAP.md`;
- capability-based Local / Remote GitHub / Hybrid execution;
- Node 22 contract;
- `agent:doctor` environment check;
- `agent:checks` changed-file validation advisor;
- shared `validate:fast` / `validate:full` validation authority;
- Draft PR → fast ordinary CI;
- Ready-for-Review PR → full ordinary CI;
- Draft → Ready full validation without requiring a new commit;
- same-PR superseded-run cancellation with cross-PR independence;
- repository-pinned Wrangler + runtime smoke;
- deterministic local dev/preview launchers and repository-local Wrangler/XDG state;
- production-like local replica and slide-review specialized checks.

## Next product/admin work

```text
curate real content and taxonomy
→ user-test merged Admin workflows
→ finish Account Management v1 implementation
→ basic learner-progress administration
→ targeted maintainability/performance work where evidence justifies it
```

## Deferred

Do not add for conceptual completeness:

- Additional Study Topic revival;
- compound Shared Question reuse scopes;
- Tag hierarchy/aliases or standalone Study-by-Tag outside contextual exposure;
- Asset Tags;
- generic Asset-family/version system;
- permanent Asset/R2 deletion without a conservative safety design;
- FSRS/advanced analytics;
- broad non-image media types;
- complex WYSIWYG authoring;
- AI-generated clinical metadata without a reviewed workflow.

## Validation guidance

Do not maintain a second static validation command list here. Coding agents should use root `AGENTS.md` + `AGENT_TASK_MAP.md`; the repository-owned validation contract is authoritative. Draft/Ready CI mode selection belongs to `.github/workflows/ci.yml` + `scripts/validate-ci.mjs`, while fast/full check composition belongs to `scripts/validation-contract.mjs`.
