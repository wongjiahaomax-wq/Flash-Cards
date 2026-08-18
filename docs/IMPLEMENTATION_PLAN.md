# Flash-Cards — V1 Implementation Plan

_Last updated: 18 August 2026_

This document tracks current implementation state. For the shortest merged-versus-pending view, read `CURRENT_PRODUCT_ROADMAP.md` first. Detailed architecture lives in `AUTHORING_MODEL.md`, `V1_DATA_MODEL.md`, `STIMULUS_GROUPS_DESIGN.md`, `MULTI_TOPIC_STUDY_ROUTES.md`, `TAGGING_MODEL_DECISIONS.md`, `CONTENT_IMPORT_PACKAGES.md`, `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`, `IMAGE_MANAGEMENT_V2_PLAN.md`, and `PREVIEW_ADMIN_WORKSPACE.md`.

## Current product state

Implemented/merged baseline includes:

- SvelteKit + Cloudflare Workers application scaffold;
- D1/Drizzle learning-domain model;
- Better Auth administrator/user boundary;
- D1-backed learner Study/Review flow;
- protected private R2 teaching-image pipeline;
- Admin CMS for Cases, Questions, Images, Topics, Tags and reviewed imports;
- optional alternative stimulus groups/options and contextual questions;
- multi-Topic Case learner routing/Admin authoring;
- resumable reviewed-package imports;
- Tagging Stage A: Case Tags and contextual Case Question Tags;
- Production-backed Preview Admin workspace;
- Preview Admin role reuse for an existing production Admin identity;
- manual Deploy PR to Preview and Restore Main to Preview workflows;
- PR #29 Admin image-authoring baseline;
- Image Management V2 from PR #34;
- wide responsive Admin desktop workspace from PR #40;
- Tagging Stage B **schema foundation**: `shared_questions`, `shared_question_tags`, and future `tag_shared` Review provenance.

Tagging Stage B learner eligibility/resolution and Shared Question Admin authoring are **not implemented yet**. They are the next product-facing PR after migration `0008_tag_shared_questions.sql` is merged and applied to production D1.

Real ECG/Anki migration and curation continue in parallel as content work.

The Admin shell now intentionally provides a wide responsive desktop workspace for content-management surfaces. Image grids should adapt to the available width with useful minimum card sizes, while form-heavy Admin pages may constrain their own readable widths.

## Milestone 0 — V1 content contract

Status: **complete baseline; extensions remain additive/backward-compatible**.

```text
Topic/Concept
└── Case
    ├── fixed Assets
    ├── optional stimulus groups/options
    └── contextual questions
```

A Case can have one primary/default Topic and additional Study Topics through `case_concepts`. Questions belong at the highest context where the answer remains correct. Tags are cross-cutting metadata and do not replace Topic/Case ownership.

## Milestone 1 — application scaffold

Status: **complete**.

SvelteKit, Cloudflare Workers adapter/runtime, Wrangler configuration, protected Study/Admin routes, sign-in/landing and CI are established.

## Milestone 2 — D1 + Drizzle learning model

Status: **complete for current V1 baseline; Stage B schema migration pending production application**.

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
```

Migration `0006_preview_admin_workspace.sql` was applied successfully to production D1 on 17 August 2026. Migration `0007_image_collections.sql` landed with Image Management V2. Migration `0008_tag_shared_questions.sql` is the Tagging Stage B schema foundation and must be applied to production D1 **after this schema PR merges and before the Stage B behavior PR is deployed or Preview-tested against the production-backed database**.

This schema PR itself must not apply the production migration or deploy a Worker.

## Milestone 3 — authentication/permissions

Status: **production and Preview baseline complete**.

Better Auth direct D1 persistence, disabled public signup, protected Study/Admin, production Admin bootstrap, `preview_admin` gated by `PREVIEW_MODE=true`, combined `admin,preview_admin` owner-role support, Preview route hard blocks and learner-policy boundaries are implemented.

Production and Preview Workers use separate `BETTER_AUTH_SECRET` values even when the same Better Auth identity is used for both roles.

## Milestone 4 — learner Study flow

Status: **complete for current V1; Tag-shared eligibility not yet active**.

Learner routing supports valid Case Topics, fixed/alternative stimuli, contextual-question precedence, Automatic/All/Fixed selection, stimulus-specific coverage, durable Review snapshots and whole-Case Again/Good rating.

Preview-owned Cases/Prompts/Assets are excluded from normal learner Review construction, with D1 trigger defense in depth for Preview Cases.

The Stage B schema foundation does not query `shared_questions`, does not change Question eligibility, and does not create `tag_shared` Review Questions during normal Study.

## Milestone 5 — protected R2 teaching images

Status: **complete for current V1**.

Teaching images are private, immutable, JPEG/PNG only, limited to 5 MiB each and governed by the managed R2 ceiling. Preview uploads use the same bucket under the isolated Preview prefix and remain subject to central media guardrails.

Image Management V2 does not rename/delete production R2 objects or change media limits.

## Milestone 6 — Admin CMS baseline

Status: **complete baseline; product refinements continue**.

Production surfaces include:

```text
/admin
/admin/cases
/admin/questions
/admin/images
/admin/topics
/admin/tags
/admin/import
```

The Case editor order is:

```text
Topics → Case → Images → Case questions → Preview
```

Normal Admin read models exclude disposable Preview ownership.

There is currently **no Shared Question Admin UI**. That belongs to the Stage B behavior/authoring PR after `0008` is applied to production D1.

## Milestone 7 — content/model validation

Status: **in progress**.

Representative content should continue to exercise ECG/Cardiology, ENT, Eye, Dermatology, multi-image Cases, alternative stimuli, reusable Topic questions, image-specific questions, Tags and multi-Topic routes.

Migration strategy remains progressive enrichment: reviewed material can begin as ordinary Topic/Case/Asset/questions and gain alternate routes, stimulus grouping and Tags later.

## Milestone 7A — multi-Topic Case routing

Status: **merged baseline**.

One Case may have one primary/default Topic plus additional Study Topics. Learner routing deduplicates Case eligibility and persists canonical primary Topic plus actual Study Topic provenance.

## Milestone 7B — Tagging Stage A

Status: **merged**.

Canonical flat Tags, Case↔Tag, contextual `case_questions`↔Tag, Admin curation/filtering are implemented without automatic Case Tag→Question inheritance, Tags on `question_prompts`, or learner resolver changes.

## Milestone 7C — reviewed package importer

Status: **merged baseline**.

Strict package validation, hardened ZIP parsing, exact-ZIP hash binding, deterministic IDs/keys, explicit create/use/skip, dependency checks, database conflict checks, parent-first Topics and R2 cleanup safeguards are implemented.

## Milestone 7D — resumable reviewed imports

Status: **merged baseline**.

Large reviewed packages run through bounded sequential requests with D1 checkpoints/private R2 staging. Browser state is disposable; D1 is authoritative. No Queue/Durable Object/Cron is required.

## Milestone 7E — Production-backed Preview Admin workspace

Status: **merged and deployed**.

Architecture remains one production D1/R2 shared by production and Preview Workers, with explicit Preview ownership and clone-then-mutate isolation. Deploy PR to Preview validates an exact trusted PR head and blocks schema/migration/`wrangler.jsonc` candidate changes. Restore Main to Preview returns the Preview Worker to current `main`.

Because Preview uses production D1, schema-changing PRs such as the Stage B foundation are intentionally not Preview-deployable before their migration is merged and applied normally.

## Milestone 7F — Admin image-authoring baseline

Status: **merged in PR #29**.

PR #29 established:

- large contain-fit Case image previews and enlargement;
- compact alternative-set thumbnails;
- bounded server-backed Case Asset picker;
- upload from Case authoring;
- checkbox/Ctrl/Cmd/Shift/touch selection in `/admin/images`;
- server-safe Add to alternative set;
- 30-Asset maximum per relationship-write request;
- Preview-compatible shared image workflow.

This remains the foundation beneath V2 rather than being replaced by it.

## Milestone 7G — Image Management V2

Status: **merged/deployed baseline from PR #34**.

Implemented with migration `0007_image_collections.sql` and without learner stimulus semantic changes.

### Scalable library

- server-backed pages of 60 Assets;
- exact matching result count;
- current page/total pages and predictable out-of-range normalization;
- deterministic sort order with stable Asset-ID tie-breakers;
- search/filter/sort preserved across Previous/Next;
- changed search/filter/sort starts at page 1;
- only the current bounded Asset page is loaded for rendering.

### Cross-page selection

- explicit selected IDs persist across page navigation for the same canonical query context;
- search, Topic, usage, status, source or sort change clears selection;
- page number alone does not clear it;
- Ctrl/Cmd and touch Select mode remain explicit-ID operations;
- Shift-range is intentionally current-page/current-order only;
- Clear selection clears all cross-page IDs.

### Exact all-matching selection

- server resolves exact matching IDs when count is `<=300`;
- `>300` is refused with a request to refine filters;
- no silent truncation and no partial set labelled “all matching”.

### Bounded bulk execution

- the 30-Asset server mutation limit is unchanged;
- larger selections are split into sequential <=30-ID requests;
- one request is in flight at a time;
- every request independently revalidates authorization, Assets, target ownership/conflicts and coverage;
- progress is visible;
- first failed chunk stops later chunks;
- completed chunks remain committed and failed/unprocessed IDs remain selected where practical;
- no persistent bulk-job table is introduced.

### Same-Case option Move

Schema inspection confirmed identity-preserving reparenting is safe because `stimulus_group_options.id` is stable and exact-option questions reference that ID.

The Case editor therefore supports:

```text
existing option in Case A / Set 1
→ Case A / Set 2
```

by updating the existing option's parent group in place. It preserves option ID, Asset, Case-specific caption, active state and exact-option questions. Group-level questions stay with their existing groups. Target order is assigned safely.

Move rejects cross-Case, inactive/missing, duplicate/conflicting, ownership-invalid and coverage-invalid changes. Production Admin rejects Preview ownership; Preview Move is limited to current-session Preview-owned Case/group/option relationships.

Fixed image conversion remains a distinct explicit operation; Case Questions are not inferred/re-scoped automatically.

### V2 non-goals retained

- no global Asset folders/albums beyond Image Collections;
- no Asset Tags;
- no generic library-wide Asset Move;
- no learner stimulus semantic change;
- no Review snapshot/provenance semantic change from image management;
- no R2 object identity change.

See `IMAGE_MANAGEMENT_V2_PLAN.md` and `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` for final behaviour.

## Milestone 7H — Tagging Stage B / shared tag-reusable Questions

Status: **schema foundation landed; behavior/authoring is next**.

### Stage B schema foundation — `0008_tag_shared_questions.sql`

Implemented in the schema-foundation PR:

- `shared_questions` with reusable `question_prompt_id`, `answer_md`, exactly one `reuse_scope_tag_id`, active/archive state and timestamps;
- `shared_question_tags` with many descriptive Tags per Shared Question;
- reuse scope and descriptive Tags remain independent;
- partial uniqueness: at most one active Shared Question per `question_prompt_id`, while inactive historical rows can coexist;
- `review_questions.source_shared_question_id` nullable FK with `ON DELETE RESTRICT`;
- future `source_type = tag_shared` accepted;
- conservative `review_questions` rebuild preserving all existing IDs, Prompt IDs, display order, Concept/stimulus provenance, prompt snapshots and answer snapshots;
- no `preview_session_id` on Shared Questions because they are global production-curated knowledge objects.

Not implemented by the schema-foundation PR:

- learner matching by Case Tags;
- learner resolver changes;
- Shared Question Admin UI;
- production seed content;
- production D1 migration application;
- Worker deployment.

### Exact next step after schema merge

1. apply `0008_tag_shared_questions.sql` to production D1 using the normal reviewed migration path;
2. only after the production schema is current, open the separate Stage B behavior/authoring PR;
3. implement Case eligibility from matching Tags, Shared Question Admin authoring, Prompt deduplication, learner resolver integration and Review creation provenance.

Agreed future precedence:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> eligible ancestor Topic
```

Deferred unless separately justified: compound ANY/ALL reuse scope, Tag hierarchy, aliases/synonyms, Study-by-Tag, Review Tag snapshots, automatic inference and Asset Tags.

## Milestone 8 — real ECG/Anki reviewed migration

Status: **active content work**.

Prepare real Anki/ECG material outside the production app, review semantic mapping, produce reviewed import packages/batches and progressively enrich resulting Cases with alternate Study Topics, stimuli and Tags.

Initial ingestion should not wait for complete ontology/tagging. Image Management V2 is designed to make later image-corpus curation safer as volume grows.

## Milestone 9 — learner accounts / role acceptance

Status: **planned**.

Implement the smallest administrator learner-account workflow and verify learner access cannot reach production or Preview Admin.

## Milestone 10 — basic learner progress administration

Status: **planned**.

Initial scope: learner list, recent Reviews, filters, Again/Good summaries and repeated Again flags. Avoid sophisticated analytics until real use justifies it.

## Deferred work

- Asset/Stimulus→Topic relationships unless real content requires them;
- global Asset folders/groups unless corpus-management evidence justifies a separate architecture decision;
- finding ontology;
- Deck/Collection unless curriculum use requires it;
- FSRS/scheduling controls;
- advanced analytics;
- rich WYSIWYG authoring;
- complex Topic hierarchy editor;
- broad non-image upload types;
- AI classification/content generation;
- general workflow engine;
- multiple simultaneous Preview workspaces;
- Preview editing of global production objects;
- automatic Preview deployment of every PR;
- Preview application of unmerged migrations.

## Validation required for implementation PRs

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

For Admin UI PRs intended for Preview inspection, also require the shared-editor/Preview-adapter contracts and production-vs-Preview ownership regression coverage. GitHub CI must be green before human merge consideration.
