# Flash-Cards — V1 Implementation Plan

_Last updated: 24 August 2026_

This document tracks implementation state on current `main`. For the shortest verified-production-versus-current-main view read `CURRENT_PRODUCT_ROADMAP.md`; for exact semantics use `V1_DATA_MODEL.md` and subsystem contracts.

## Current implementation baseline

Current `main` includes:

- SvelteKit + Cloudflare Workers application scaffold;
- D1/Drizzle learning-domain model and Better Auth;
- learner Study/Review flow with immutable Prompt/answer/media snapshots;
- private R2 teaching-image pipeline;
- Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags, and reviewed imports;
- multi-Topic Case routing/authoring;
- optional Alternative Sets with set-wide/exact-option questions and coverage;
- Tagging Stage A/B;
- production-backed Preview Admin;
- Image Management V2 and Collections;
- Reusable Image Questions with explicit exact-stimulus opt-in;
- same-image higher-resolution Asset replacement/supersession;
- alternative-option **Remove from Case** archival state;
- Image Library Current/Historical only/Unused lifecycle classification;
- bounded Admin dashboard/Case-detail/Case-library/Question-library read models;
- Classic/Compact Case-editor UX and Compact fast-review audit;
- behavior-preserving Case-editor component decomposition;
- staged Preview backend decomposition through fixed-image operations;
- local production-like D1/R2 replica;
- local slide-review/deterministic-finalizer tooling;
- repository-owned coding-agent and validation workflow;
- first ECG corpus fully represented and verified in production: **66/66**.

Merge status, production migration application, Worker deployment, and explicit behavior verification remain separate facts.

## Milestone 0 — content contract

Status: **complete baseline; additive enrichment continues**.

```text
Topic
└── Case
    ├── fixed Assets
    ├── optional Alternative Sets/options
    └── contextual questions

Global reusable knowledge
├── Shared Question
│   └── eligibility by one Reuse Scope Tag
└── Reusable Image Question
    └── one exact Asset + explicit per-stimulus opt-in
```

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
```

Explicitly recorded production application exists for earlier migrations such as Preview foundation and Tagging Stage B foundation. Do not mark later migrations applied merely because they are on `main`.

`0012` adds relationship archival for removed alternative options. `0013` adds the Asset-leading Review-Asset index used by lifecycle/historical queries; it does not create new domain semantics.

## Milestone 3 — authentication/permissions

Status: **production/Preview baseline complete**.

Current role behavior includes:

```text
Preview Worker /admin/**          blocked
Preview Worker /study/**          blocked
Preview Worker Auth Admin API     blocked
preview-only preview_admin on production Study blocked
combined admin,preview_admin on production Study allowed
```

Production and Preview Workers use separate Better Auth secrets/sessions.

## Milestone 4 — learner Study flow

Status: **complete current-main behavior; deployment of later merged extensions verified separately**.

Learner routing supports multi-Topic Cases, fixed/alternative stimuli, active/non-removed option selection, contextual/reusable question precedence, Automatic/All/Fixed selection, stimulus-specific coverage, and immutable Review snapshots.

Current-main precedence:

```text
selected exact stimulus-option question
> explicitly reused Asset Question
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest inheritable ancestor Topic
> more distant ancestors
```

Removed options are excluded from current selection. Existing Reviews remain historical truth.

## Milestone 5 — protected R2 teaching images

Status: **complete baseline; lifecycle/replacement semantics merged**.

Teaching images are private JPEG/PNG objects under central type/size/storage guardrails. Production object keys are immutable.

Same-image higher-resolution replacement creates a new object/new Asset and retains the old object for historical Review media. Physical deletion remains a separate future workflow.

## Milestone 6 — Admin CMS baseline

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

Routine Case editor order remains:

```text
Topics → Case → Images → Case questions → Preview
```

Current authoring includes:

- inline primary/additional Study Topic management;
- whole-Case vs exact-image/stimulus question scope;
- transparent fixed-image conversion when exact-option semantics require it;
- Case-specific vs Reusable Image Question distinction;
- explicit reusable-image opt-in;
- option Move, Deactivate, and distinct Remove from Case;
- Compact/Classic presentation and Compact fast-review audit.

PR #78 changed implementation ownership, not product semantics: the route is now a coordinator over focused `src/lib/components/case-editor/` components. Preview still reuses the production editor.

## Milestone 7 — content/model validation

Status: **ongoing curation**.

Representative content should exercise multi-image Cases, multiple Alternative Sets, Reusable Image Questions, Shared Questions, Tags, multiple Study Topics, option removal/restoration, replacement/history, and overlapping Prompt precedence.

## Milestone 7A — multi-Topic Case routing

Status: **merged baseline**.

One Case may have one primary/default Topic and Additional Study Topics. Review provenance preserves canonical primary plus actual route.

## Milestone 7B — Tagging Stage A/B

Status: **implemented; Stage B explicitly recorded deployed in the verified production baseline**.

Flat Tags, Case/contextual Question Tags, tag-scoped Shared Questions, resolver integration, and Review provenance are established.

## Milestone 7C/7D — reviewed/resumable imports

Status: **merged baseline**.

Strict Import Package v1 validation, exact package confirmation, deterministic create/use/skip semantics, R2 safeguards, resumable browser-orchestrated bounded processing, D1 checkpoints, and lease safety are implemented.

## Milestone 7E — production-backed Preview Admin

Status: **merged/deployed baseline; internal implementation refactor ongoing on current `main`**.

Architecture remains one shared production D1/R2 with explicit Preview ownership and hard route/data boundaries.

The public backend API remains `src/lib/server/db/preview-workspace.js`. Current internal owners are:

```text
session.js      → Session lookup/create/TTL
ownership.js    → ownership/security guards
errors.js/input.js → shared primitives
case.js         → Case discovery, complete clone transaction, Case lifecycle/Topics
fixed-images.js → ongoing fixed-image editor reads/mutations
```

Alternative Set operations, question-domain operations, `ensurePreviewWorkspace()`, and workspace-wide cleanup remain in the façade for later focused extraction.

## Milestone 7F/7G — Image authoring and Image Management V2

Status: **merged baseline; lifecycle extensions merged on current `main`**.

Image Library supports bounded server pages, exact counts, Collections, cross-page selection, bounded mutations, same-Case option Move, and derived lifecycle classification.

Current relationship/lifecycle distinctions:

```text
option Deactivate
option Remove from Case
Asset Active/Inactive
Asset Current/Historical only/Unused
same-image higher-resolution replacement
```

These are deliberately not aliases for one another.

## Milestone 7H — Reusable Image Questions

Status: **merged on current `main`**.

Canonical `asset_questions` belong to one exact Asset. Each exact stimulus usage explicitly opts in. Existing Case-specific exact-image questions remain contextual and are not automatically promoted.

## Milestone 7I — Asset quality replacement

Status: **merged on current `main`**.

Narrow same-underlying-image replacement preserves historical Review media, stable Stimulus Option IDs, current Case captions/order, and reusable-question semantics while creating immutable new Asset/R2 identity.

## Milestone 7J — alternative-option archive/removal

Status: **merged on current `main`**.

`removed_from_case` excludes an option from current authoring/learner usage while retaining relational history. Re-add may restore the original option where invariants permit.

## Milestone 8 — real ECG migration / curation

Status: **initial migration complete; curation in progress**.

Production accounting is 13 Batch 01 + 51 Batch 02 + 2 mapped existing calcium Cases = **66/66** source notes represented.

Next work is Tags/reuse/Topic/stimulus/content curation rather than re-ingestion.

## Milestone 9 — performance/read models

Status: **Passes 1–2 merged**.

Implemented:

- dashboard-specific aggregate/bounded reads;
- exact Case-detail read;
- 60-row SQL-filtered Case Library;
- 60-row bounded Question Library with Unicode-aware search preservation;
- lightweight server timing.

Remaining:

```text
Pass 3 — Better Auth short-lived session cookie-cache investigation
Pass 4 — learner Study/startReview read-model optimisation
Pass 5 — Case-editor server read/lazy-loading boundaries
Later  — thumbnails and measured EXPLAIN/index tuning
```

PR #78's component split improves code ownership but does not itself implement Pass 5.

## Milestone 10 — coding-agent/local developer workflow

Status: **implemented repository tooling**.

Current repository workflow includes:

- root/scoped `AGENTS.md` and `AGENT_TASK_MAP.md`;
- capability-based Local / Remote GitHub / Hybrid execution;
- Node 22 contract;
- `agent:doctor` environment check;
- `agent:checks` changed-file validation advisor;
- shared `validate:fast` / `validate:full` ordinary validation authority with PR CI;
- repository-pinned Wrangler + runtime smoke;
- deterministic local dev/preview launchers and repository-local Wrangler/XDG state;
- production-like local replica and slide-review specialized checks.

## Next product/admin work

```text
curate real content
→ observe friction
→ targeted maintainability/performance follow-up
→ learner-account administration
→ basic learner-progress administration
```

## Deferred

Do not add for conceptual completeness:

- compound Shared Question reuse scopes;
- Tag hierarchy/aliases or Study-by-Tag;
- Asset Tags;
- generic Asset-family/version system;
- permanent Asset/R2 deletion without a conservative safety design;
- FSRS/advanced analytics;
- broad non-image media types;
- complex WYSIWYG authoring;
- AI-generated clinical metadata without a reviewed workflow.

## Validation guidance

Do not maintain a second static validation command list here. Coding agents should use root `AGENTS.md` + `AGENT_TASK_MAP.md`: `agent:checks` classifies changed subsystems, `validate:full` is the ordinary local pre-handoff contract, and specialized runtime/slide-review checks are added when relevant.
