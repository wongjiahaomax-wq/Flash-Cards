# Flash-Cards — V1 Implementation Plan

_Last updated: 18 August 2026_

This document tracks current implementation state. For the shortest merged-versus-pending view, read `CURRENT_PRODUCT_ROADMAP.md` first. Detailed architecture lives in `AUTHORING_MODEL.md`, `V1_DATA_MODEL.md`, `STIMULUS_GROUPS_DESIGN.md`, `MULTI_TOPIC_STUDY_ROUTES.md`, `TAGGING_MODEL_DECISIONS.md`, `TAGGING_STAGE_B_BEHAVIOR.md`, `CONTENT_IMPORT_PACKAGES.md`, `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`, `IMAGE_MANAGEMENT_V2_PLAN.md`, and `PREVIEW_ADMIN_WORKSPACE.md`.

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
- Tagging Stage B schema foundation from `0008_tag_shared_questions.sql`, already applied to production D1;
- Tagging Stage B behavior/Admin authoring from PR #43, merged and deployed: Case-Tag eligibility, Shared Question Admin, Prompt deduplication, normal count-mode integration, and `tag_shared` Review provenance;
- initial real ECG/Anki migration fully imported and production-verified: 13 Batch 01 + 51 Batch 02 + 2 pre-existing mapped calcium Cases = 66/66 source notes represented.

Real ECG/Anki work now continues as curation/enrichment rather than source ingestion.

The Admin shell intentionally provides a wide responsive desktop workspace for content-management surfaces. Image grids should adapt to the available width with useful minimum card sizes, while form-heavy Admin pages may constrain their own readable widths.

## Milestone 0 — V1 content contract

Status: **complete baseline; extensions remain additive/backward-compatible**.

```text
Topic/Concept
└── Case
    ├── fixed Assets
    ├── optional stimulus groups/options
    └── contextual questions

Global reusable knowledge
└── Shared Question
    ├── reusable Question Prompt wording
    ├── reusable answer
    ├── one Reuse Scope Tag
    └── optional descriptive Tags
```

A Case can have one primary/default Topic and additional Study Topics through `case_concepts`. Questions belong at the highest context where the answer remains correct. Tags are cross-cutting metadata and do not replace Topic/Case ownership.

## Milestone 1 — application scaffold

Status: **complete**.

SvelteKit, Cloudflare Workers adapter/runtime, Wrangler configuration, protected Study/Admin routes, sign-in/landing and CI are established.

## Milestone 2 — D1 + Drizzle learning model

Status: **complete for the current Stage B model**.

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

Migration `0006_preview_admin_workspace.sql` was applied successfully to production D1 on 17 August 2026. Migration `0007_image_collections.sql` landed with Image Management V2. Migration `0008_tag_shared_questions.sql` is the Tagging Stage B schema foundation and was applied to production D1 before PR #43 implementation began.

PR #43 is intentionally schema-free: no new migration is required and no production migration or Worker deployment belongs in the behavior/authoring PR.

## Milestone 3 — authentication/permissions

Status: **production and Preview baseline complete**.

Better Auth direct D1 persistence, disabled public signup, protected Study/Admin, production Admin bootstrap, `preview_admin` gated by `PREVIEW_MODE=true`, combined `admin,preview_admin` owner-role support, Preview route hard blocks and learner-policy boundaries are implemented.

Production and Preview Workers use separate `BETTER_AUTH_SECRET` values even when the same Better Auth identity is used for both roles.

## Milestone 4 — learner Study flow

Status: **complete current V1 including deployed Tag-shared eligibility from PR #43**.

Learner routing supports valid Case Topics, fixed/alternative stimuli, contextual-question precedence, Automatic/All/Fixed selection, stimulus-specific coverage, durable Review snapshots and whole-Case Again/Good rating.

Preview-owned Cases/Prompts/Assets are excluded from normal learner Review construction, with D1 trigger defense in depth for Preview Cases and for Preview Prompts being attached to global Shared Questions.

Stage B adds eligible Shared Questions to the existing learner resolver when the selected production Case has an active Tag matching the Shared Question's active `reuse_scope_tag_id`. Descriptive `shared_question_tags` do not affect eligibility. Topic ancestry does not infer Tag eligibility.

Implemented duplicate-Prompt precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Concept
> tag-shared Question
> nearest inheritable ancestor Concept
> more distant inheritable ancestors
```

The final pool is deduplicated by `question_prompt_id`. Automatic/All/Fixed operate on that normal deduplicated pool; Shared Questions do not bypass selection or Fixed count limits.

Selected Shared Questions snapshot Prompt/answer content and persist `source_type = tag_shared` plus `source_shared_question_id`. Tag IDs are not snapshotted.

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
/admin/shared-questions
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

Stage B Shared Question Admin authoring supports list/create/edit/archive/reactivate, reuse of an existing active production Question Prompt or creation of new production Prompt wording, one required active Reuse Scope Tag, and zero-or-more independent descriptive Tags. UI copy explicitly states that only the Reuse Scope Tag controls Case eligibility.

The existing Questions detail/editor includes Shared Question Prompt usages in its global-wording blast-radius/stale-edit guard.

## Milestone 7 — content/model validation

Status: **in progress**.

Representative content should continue to exercise ECG/Cardiology, ENT, Eye, Dermatology, multi-image Cases, alternative stimuli, reusable Topic questions, image-specific questions, Tags, Shared Questions and multi-Topic routes.

Migration strategy remains progressive enrichment: reviewed material can begin as ordinary Topic/Case/Asset/questions and gain alternate routes, stimulus grouping, Tags and tag-shared reusable knowledge later.

## Milestone 7A — multi-Topic Case routing

Status: **merged baseline**.

One Case may have one primary/default Topic plus additional Study Topics. Learner routing deduplicates Case eligibility and persists canonical primary Topic plus actual Study Topic provenance.

## Milestone 7B — Tagging Stage A

Status: **merged**.

Canonical flat Tags, Case↔Tag, contextual `case_questions`↔Tag, Admin curation/filtering are implemented without automatic Case Tag→Question inheritance, Tags on `question_prompts`, or learner resolver changes in Stage A itself.

## Milestone 7C — reviewed package importer

Status: **merged baseline**.

Strict package validation, hardened ZIP parsing, exact-ZIP hash binding, deterministic IDs/keys, explicit create/use/skip, dependency checks, database conflict checks, parent-first Topics and R2 cleanup safeguards are implemented.

## Milestone 7D — resumable reviewed imports

Status: **merged baseline**.

Large reviewed packages run through bounded sequential requests with D1 checkpoints/private R2 staging. Browser state is disposable; D1 is authoritative. No Queue/Durable Object/Cron is required.

## Milestone 7E — Production-backed Preview Admin workspace

Status: **merged and deployed**.

Architecture remains one production D1/R2 shared by production and Preview Workers, with explicit Preview ownership and clone-then-mutate isolation. Deploy PR to Preview validates an exact trusted PR head and blocks schema/migration/`wrangler.jsonc` candidate changes. Restore Main to Preview returns the Preview Worker to current `main`.

Stage B Shared Questions remain global production-curated objects and do not gain Preview ownership. PR #43 adds no Preview Shared Question mutation authority. Because PR #43 is schema-free, it may later be manually deployed to Preview for human UI inspection only if the operator chooses to run the existing workflow; opening the PR does not deploy anything.

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

Status: **complete/deployed for the agreed V1 Stage B scope**.

### Stage B schema foundation — `0008_tag_shared_questions.sql`

Implemented and applied before PR #43:

- `shared_questions` with reusable `question_prompt_id`, `answer_md`, exactly one `reuse_scope_tag_id`, active/archive state and timestamps;
- `shared_question_tags` with many descriptive Tags per Shared Question;
- reuse scope and descriptive Tags remain independent;
- partial uniqueness: at most one active Shared Question per `question_prompt_id`, while inactive historical rows can coexist;
- `review_questions.source_shared_question_id` nullable FK with `ON DELETE RESTRICT`;
- `source_type = tag_shared` accepted;
- conservative `review_questions` rebuild preserving existing historical data;
- no `preview_session_id` on Shared Questions because they are global production-curated knowledge objects;
- D1 trigger protection preventing Preview-owned Prompts from being used by Shared Questions.

### Stage B behavior/authoring — PR #43

Merged and deployed without another migration:

1. production Admin Shared Question list/create/edit/archive/reactivate;
2. explicit one Reuse Scope Tag versus independent descriptive Tags;
3. exact active Case Tag matching for eligibility;
4. no descriptive-Tag or Topic-ancestry eligibility inference;
5. integration into the current resolver using the agreed precedence;
6. final Prompt-ID deduplication with higher-priority context winning;
7. normal Automatic/All/Fixed integration;
8. Review Prompt/answer snapshots plus `tag_shared` and `source_shared_question_id` provenance;
9. no Review Tag snapshots;
10. Shared Question usage included in Question Prompt global-edit guards;
11. focused resolver/database/Admin-safety regression tests.

See `TAGGING_STAGE_B_BEHAVIOR.md` for the exact contract.

Deferred unless separately justified: compound ANY/ALL reuse scope, Tag hierarchy, aliases/synonyms, Study-by-Tag, Review Tag snapshots, automatic inference and Asset Tags.

## Milestone 8 — real ECG/Anki reviewed migration

Status: **initial deck migration complete and production-verified; curation/enrichment active**.

The initial 66-note ECG source deck is fully accounted for in production: 13 Batch 01 imports, 51 Batch 02 imports and 2 pre-existing mapped calcium Cases. Both import jobs are complete with their reviewed package SHA-256 values, and exact production verification confirmed all 64 imported Cases/ECG Assets/Case↔ECG links plus the two active image-backed mapped Cases.

Continue progressive enrichment of those Cases with alternate Study Topics, stimuli, Tags and Shared Questions. Initial ingestion did not wait for complete ontology/tagging; Image Management V2 and Stage B now provide the curation layer for the imported corpus.

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
- Preview application of unmerged migrations;
- multiple/compound Shared Question reuse scopes;
- Tag hierarchy/aliases and learner Study-by-Tag;
- Review Tag snapshots.

## Validation required for implementation PRs

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

GitHub PR CI covers this exact validation set. PR #43 is merged and deployed. Its final CI passed 240/240 tests; no additional Stage B migration is pending.
