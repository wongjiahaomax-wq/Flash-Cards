# Flash-Cards — V1 Implementation Plan

_Last updated: 17 August 2026_

This document tracks current implementation state. For the shortest merged-versus-pending view, read `CURRENT_PRODUCT_ROADMAP.md` first. Detailed architecture lives in `AUTHORING_MODEL.md`, `V1_DATA_MODEL.md`, `STIMULUS_GROUPS_DESIGN.md`, `MULTI_TOPIC_STUDY_ROUTES.md`, `TAGGING_MODEL_DECISIONS.md`, `CONTENT_IMPORT_PACKAGES.md`, `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`, `IMAGE_MANAGEMENT_V2_PLAN.md`, and `PREVIEW_ADMIN_WORKSPACE.md`.

## Current product state

Implemented baseline includes:

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
- merged PR #29 Admin image-authoring baseline.

The two next major product-facing implementation tracks are:

1. **Image Management V2** — scalable library selection/pagination and explicit safe Case-scoped image reorganisation;
2. **Tagging Stage B** — shared/tag-reusable Questions and learner resolver integration.

Real ECG/Anki migration and curation continue in parallel as content work.

## Milestone 0 — V1 content contract

Status: **complete baseline; future extensions should remain additive/backward-compatible**.

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

- SvelteKit;
- Cloudflare Workers adapter/runtime;
- Wrangler configuration;
- sign-in/landing;
- protected `/study` and `/admin`;
- CI covering database checks, tests, Svelte checks, build and local auth smoke validation.

## Milestone 2 — D1 + Drizzle learning model

Status: **complete for the current V1 baseline**.

Current migration sequence:

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
0004_resumable_import_jobs.sql
0005_tag_foundation.sql
0006_preview_admin_workspace.sql
```

Migration `0006_preview_admin_workspace.sql` was applied successfully to production D1 on 17 August 2026 as part of the Preview Admin rollout.

Future schema changes should remain additive and separately reviewed. Image Management V2 is expected to avoid a migration unless a concrete blocker proves one is required.

## Milestone 3 — authentication/permissions

Status: **production and Preview baseline complete**.

Completed:

- Better Auth direct D1 persistence;
- disabled public signup;
- protected Study/Admin routes;
- local auth smoke test;
- production administrator bootstrap;
- dedicated `preview_admin` authorization gated by `PREVIEW_MODE=true`;
- ability to grant an existing non-banned production Admin the combined role `admin,preview_admin` while preserving the existing credential/password;
- Preview Worker hard blocks for `/admin/**`, `/study/**`, and `/api/auth/admin/**`;
- production Study denial for identities carrying `preview_admin` under the current safety policy.

Production and Preview Workers use separate `BETTER_AUTH_SECRET` values even when the same Better Auth identity is used for both roles.

See `PREVIEW_ADMIN_IDENTITY.md`.

## Milestone 4 — learner Study flow

Status: **complete for current V1**.

Learner routing supports valid Case Topics, fixed/alternative stimuli, contextual question precedence, Automatic/All/Fixed selection, per-stimulus coverage, durable Review snapshots, and whole-Case Again/Good rating.

Preview-owned Cases/Prompts/Assets are excluded from normal learner Review construction, with D1 trigger defense in depth for Preview Cases.

Tag-aware shared Question eligibility is not part of this completed milestone; that belongs to Tagging Stage B.

## Milestone 5 — protected R2 teaching images

Status: **complete for current V1**.

Teaching images are private, immutable, JPEG/PNG only, limited to 5 MiB each, and governed by the managed R2 ceiling. Runtime serving is authenticated. External source URLs are attribution/reference only.

Preview uploads use the same R2 bucket under:

```text
preview/<preview-session-id>/...
```

and remain subject to the same central media guardrails. Reset deletes only verified Preview-owned objects. Reviewed import staging remains separate operational data and is not an Asset.

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

Normal Admin read models exclude disposable Preview ownership.

The merged image-authoring baseline now presents the Case editor as:

```text
Topics → Case → Images → Case questions → Preview
```

with large image inspection, fixed/alternative image authoring, a bounded Asset picker, image-library multi-select and safe bulk add-to-alternative-set.

This baseline must not be mistaken for completion of Image Management V2.

## Milestone 7 — content/model validation

Status: **in progress**.

Representative content should continue to exercise ECG/Cardiology, ENT, Eye, Dermatology, multi-image Cases, alternative stimuli, reusable Topic questions, image-specific questions, tags and multi-Topic routes.

Migration strategy remains progressive enrichment: reviewed material can begin as ordinary Topic/Case/Asset/questions and gain alternate routes, stimulus grouping and Tags later when useful.

## Milestone 7A — multi-Topic Case routing

Status: **merged baseline**.

One Case may have one primary/default Topic plus additional Study Topics. Learner routing deduplicates Case eligibility and persists both canonical primary Topic and actual Study Topic provenance.

## Milestone 7B — Tagging Stage A

Status: **merged**.

Implemented:

- canonical flat Tags;
- Case↔Tag relationships;
- contextual `case_questions`↔Tag relationships;
- Admin Tag curation;
- Case/Question filtering by Tag;
- no automatic Case Tag → Question Tag inheritance;
- no Tags on `question_prompts`;
- no learner resolver change.

See `STAGE_A_TAG_FOUNDATION.md`.

## Milestone 7C — reviewed package importer

Status: **merged baseline**.

Safety guarantees include strict package validation, hardened ZIP parsing, exact-ZIP hash binding, deterministic IDs/keys, explicit create/use/skip, dependency checks, database conflict checks, parent-first Topics, and R2 cleanup after D1 metadata failure.

The production application does not interpret `.apkg`, perform OCR, infer diagnoses/taxonomy or auto-generate clinical answers.

## Milestone 7D — resumable reviewed imports

Status: **merged baseline**.

Large reviewed packages are processed through bounded sequential requests with D1 checkpoints and private R2 staging rather than one long Worker request. Browser state is disposable; D1 is authoritative. Pause/browser close stops new requests but does not roll back completed chunks.

There is no Queue/Durable Object/Cron requirement for this workflow.

## Milestone 7E — Production-backed Preview Admin workspace

Status: **merged and deployed**.

Architecture:

```text
Production Worker -> production D1/R2
Preview Worker    -> same D1/R2
                    + Preview Admin authorization
                    + disposable Preview-owned records
```

The safety model remains:

```text
read real content
→ clone selected Case into explicit Preview ownership
→ mutate only that disposable graph
→ Reset deletes the graph
```

The Preview Worker is deployed with a separate Better Auth secret. Migration `0006` is applied. Live unauthenticated boundary smoke tests have verified the expected Preview blocks and sign-in reachability.

Manual **Deploy PR to Preview** validates a trusted same-repository PR and deploys its exact head SHA only to the Preview Worker. Schema/migration-changing PRs and `wrangler.jsonc` changes are blocked from this workflow.

**Restore Main to Preview** is also merged for returning Preview code to current `main` after inspection.

Normal lifecycle:

```text
main on Preview
→ Deploy PR to Preview
→ inspect PR
→ Reset Preview Workspace
→ Restore Main to Preview
→ next PR
```

See `PREVIEW_ADMIN_WORKSPACE.md`, `PREVIEW_ADMIN_IDENTITY.md`, and the handover.

## Milestone 7F — Admin image-authoring baseline

Status: **merged in PR #29**.

Implemented baseline:

- large contain-fit Case image previews;
- reusable enlargement dialog;
- compact alternative-set thumbnails;
- bounded server-backed Case Asset picker;
- image upload from Case authoring;
- checkbox, Ctrl/Cmd, Shift-range and touch Select mode in `/admin/images`;
- server-safe bulk Add to alternative set;
- 30-Asset limit per relationship-write action;
- Preview-compatible image workflow and production/Preview isolation hardening.

Deliberately deferred from this baseline:

- pagination/scalable Image Library contract;
- exact `Select all N matching` across pages;
- bounded multi-request execution for selections larger than 30;
- defined safe Move/reorganisation semantics for existing stimulus options;
- any global Asset folder/group model.

See `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`.

## Milestone 7G — Image Management V2

Status: **planned next product milestone**.

Implement the bounded design in `IMAGE_MANAGEMENT_V2_PLAN.md`.

Primary goals:

- server-backed pagination and exact match counts;
- exact bounded all-matching selection rather than browser-only approximation;
- client-orchestrated chunks of at most 30 IDs per server mutation request;
- explicit same-Case alternative-option Move semantics only if current schema can preserve relationship identity and teaching context safely;
- Preview parity/isolation for all new shared UI/actions;
- no schema migration by default.

The implementation must preserve captions, exact-option questions, activation/order and stimulus-group coverage when a supported move occurs. If current schema cannot preserve those invariants safely, defer Move rather than implementing delete/recreate behaviour.

## Milestone 7H — Tagging Stage B / shared tag-reusable Questions

Status: **planned**.

Implement the agreed architecture from `TAGGING_MODEL_DECISIONS.md`:

- dedicated shared-knowledge Question entity;
- answer/medical meaning separate from reusable `question_prompts` wording;
- descriptive Tags on shared Questions;
- exactly one reuse-scope Tag per shared Question initially;
- matching Case Tag makes the Question eligible, not mandatory;
- deduplication by Question Prompt;
- learner resolver precedence:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> eligible ancestor Topic
```

- interaction with Automatic/All/Fixed selection;
- Review snapshot/provenance regression coverage.

Deferred unless separately justified: compound ANY/ALL reuse scope, Tag hierarchy, aliases/synonyms, Study-by-Tag, Review Tag snapshots, automatic inference, Asset Tags.

## Milestone 8 — real ECG/Anki reviewed migration

Status: **active content work**.

Prepare real Anki/ECG material outside the production app, review its semantic mapping, produce reviewed import packages/batches, and progressively enrich resulting Cases with alternate Study Topics, stimuli and Tags where useful.

Initial ingestion should not wait for complete ontology/tagging or image reorganisation. Image Management V2 and Tagging Stage B are intended to make later curation of the growing corpus more efficient.

## Milestone 9 — learner accounts / role acceptance

Status: **planned**.

Implement the smallest administrator learner-account workflow and verify learner access cannot reach production Admin or Preview Admin.

## Milestone 10 — basic learner progress administration

Status: **planned**.

Initial scope: learner list, recent Reviews, filters, Again/Good summaries and repeated Again flags. Avoid sophisticated analytics until needed.

## Deferred work

- Asset/Stimulus→Topic relationships unless real content requires them;
- global Asset folders/groups unless library-management needs justify a separate architecture decision;
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
- Preview application of unmerged production migrations.

## Validation required for implementation PRs

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

For Admin UI PRs intended for Preview inspection, also require the existing shared-editor/Preview-adapter contracts and production-vs-Preview ownership regression coverage. GitHub CI must be green before merge consideration.
