# Flash-Cards — V1 Implementation Plan

_Last updated: 17 August 2026_

This document tracks current implementation state. Detailed content-model decisions live in `AUTHORING_MODEL.md`, `V1_DATA_MODEL.md`, `STIMULUS_GROUPS_DESIGN.md`, `MULTI_TOPIC_STUDY_ROUTES.md`, and `CONTENT_IMPORT_PACKAGES.md`. Preview infrastructure is documented in `PREVIEW_ADMIN_WORKSPACE.md`.

## Current product state

Implemented baseline includes:

- SvelteKit + Cloudflare Workers application scaffold;
- D1/Drizzle learning-domain model;
- Better Auth administrator/user boundary;
- D1-backed learner Study/Review flow;
- protected private R2 teaching-image pipeline;
- Admin CMS for Cases, Questions, Images, Topics and reviewed imports;
- optional alternative stimulus groups/options and contextual questions;
- multi-Topic Case learner routing/Admin authoring;
- resumable reviewed-package imports;
- Case and contextual Question tagging foundation.

The current infrastructure milestone is the **Production-backed Preview Admin workspace**. It adds safe visual testing of Admin UI PRs without a second D1/R2 dataset.

## Milestone 0 — V1 content contract

Status: **complete baseline; future extensions should remain additive/backward-compatible**.

```text
Topic/Concept
└── Case
    ├── fixed Assets
    ├── optional stimulus groups/options
    └── contextual questions
```

A Case can have one primary/default Topic and additional Study Topics through `case_concepts`. Questions belong at the highest context where their answer remains correct. Tags are cross-cutting metadata and do not replace the Topic/Case hierarchy.

## Milestone 1 — application scaffold

Status: **complete**.

- SvelteKit;
- Cloudflare Workers adapter/runtime;
- Wrangler configuration;
- sign-in/landing;
- protected `/study` and `/admin`;
- CI covering database checks, tests, Svelte checks, build and local auth smoke validation.

## Milestone 2 — D1 + Drizzle learning model

Status: **complete for current V1; Preview migration pending review/release**.

Current migration sequence:

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
0004_resumable_import_jobs.sql
0005_tag_foundation.sql
0006_preview_admin_workspace.sql   # current Preview infrastructure PR
```

`0006` adds Preview Sessions, explicit Preview ownership on Cases/Question Prompts/Assets, indexes and safety triggers. It does not add a second D1 resource.

Do not apply `0006` during PR review.

## Milestone 3 — authentication/permissions

Status: **production auth complete; Preview capability pending review/release**.

Production completed:

- Better Auth direct D1 persistence;
- disabled public signup;
- protected Study/Admin routes;
- local auth smoke test;
- production administrator bootstrap.

Preview adds a distinct `preview_admin` role that only has authority on a runtime with `PREVIEW_MODE=true`. It must not satisfy normal production Admin authorization.

## Milestone 4 — learner Study flow

Status: **complete for current V1**.

Learner routing supports valid Case Topics, fixed/alternative stimuli, contextual question precedence, Automatic/All/Fixed selection, per-stimulus coverage, durable Review snapshots, and whole-Case Again/Good rating.

Preview infrastructure adds a central production-ownership filter so Preview Cases/Prompts/Assets are never eligible for normal learner Reviews. A D1 trigger rejects Review creation against a Preview Case as defense in depth.

## Milestone 5 — protected R2 teaching images

Status: **complete for current V1; Preview isolated prefix pending review/release**.

Teaching images are private, immutable, JPEG/PNG only, limited to 5 MiB each, and governed by the 5 GiB managed R2 ceiling. Runtime serving is authenticated. External source URLs are attribution/reference only.

Preview uploads use the same R2 bucket but only under:

```text
preview/<preview-session-id>/...
```

They remain subject to the same central media guardrails. Reset deletes only verified Preview-owned keys.

Reviewed import staging remains separate operational data and is not an Asset.

## Milestone 6 — Admin CMS

Status: **complete baseline**.

Production surfaces:

```text
/admin
/admin/cases
/admin/questions
/admin/images
/admin/topics
/admin/import
```

Normal Cases/Questions/Images libraries are required to exclude disposable Preview-owned rows.

Topic hierarchy editing, broad WYSIWYG authoring, sophisticated deletion and advanced analytics remain deferred.

## Milestone 7 — content/model validation

Status: **in progress**.

Representative content should continue to exercise ECG/Cardiology, ENT, Eye, Dermatology, multi-image Cases, alternative stimuli, reusable Topic questions, image-specific questions, tags and multi-Topic routes.

Migration strategy remains progressive enrichment: reviewed material can begin as ordinary Topic/Case/Asset/questions and gain alternate routes/stimulus grouping/tags later when useful.

## Milestone 7C — reviewed package importer

Status: **merged baseline**.

Safety guarantees include strict package validation, hardened ZIP parsing, exact-ZIP hash binding, deterministic IDs/keys, explicit create/use/skip, dependency checks, database conflicts, parent-first Topics, and R2 cleanup after D1 metadata failure.

The production application does not interpret `.apkg`, perform OCR, infer diagnoses/taxonomy or auto-generate clinical answers.

## Milestone 7D — resumable reviewed imports

Status: **merged baseline**.

Large reviewed packages are processed through bounded sequential requests with D1 checkpoints and private R2 staging rather than requiring one long Worker request. Browser state is disposable; D1 is authoritative. Pause/browser close stops new requests but does not roll back completed chunks.

There is no Queue/Durable Object/Cron requirement for this workflow.

## Milestone 7E — Production-backed Preview Admin workspace

Status: **current DRAFT implementation**.

### Goal

Enable visual testing of Admin UI PRs against current real teaching content while preserving one D1 and one R2.

```text
Production Worker -> production D1/R2
Preview Worker    -> same D1/R2
                    + dedicated Preview Admin
                    + disposable Preview-owned records
```

### Safety model

The design is:

```text
read real content
→ clone selected Case into explicit Preview ownership
→ mutate only that disposable graph
→ Reset deletes the graph
```

It is explicitly **not** a production rollback/undo journal.

### Preview Session/ownership

V1 supports one live session per Preview Admin, 24-hour expiry, `active`/`cleanup_required`/`cleaned` state, and explicit `preview_session_id` on Preview-owned Cases, Question Prompts and Assets.

Ownership is validated by server/data helpers for each mutation and is immutable at the database level.

### Clone scope

A Preview copy includes:

- Case row/settings;
- Case↔Topic relationships;
- Case Tags;
- fixed Asset relationships/captions/order;
- Case questions + contextual Question Tags;
- stimulus groups/options;
- group-/option-specific questions;
- contextual Question Prompt clones.

Production Assets are reused read-only. Global Topic, production Asset metadata and production Question Prompt editing remain unavailable.

### Reset/session recovery

Reset deletes only records owned by the current session and verified R2 keys under the current Preview prefix. Cleanup is idempotent and retryable. Failure marks `cleanup_required` and keeps enough state to retry.

Normal Preview logout performs Reset before sign-out. Expired/abandoned sessions are recovered on later access before a new workspace is created.

### Preview Worker

Wrangler named environment:

```text
preview
```

Worker:

```text
flash-cards-preview
```

It repeats the existing D1/R2 bindings rather than creating new resources and sets `PREVIEW_MODE=true` plus its Preview `BETTER_AUTH_URL`. A separate Preview `BETTER_AUTH_SECRET` is an operator-managed release configuration.

### Manual PR deployment

GitHub Actions workflow **Deploy PR to Preview** is manual (`workflow_dispatch`). It accepts a PR number, requires the head repo to be this repo, resolves/uses the exact head SHA, blocks schema-changing PRs, validates the PR, and deploys only with `--env preview`.

It never runs a remote D1 migration and does not use the D1 write token.

### Residual risk

Because the Preview Worker has production D1/R2 bindings, this is application-level isolation rather than hard resource isolation. Deploy only trusted same-repository PRs and keep Preview capabilities narrow.

### Release boundary

During this PR:

- do not apply `0006` remotely;
- do not deploy production;
- do not deploy the Preview Worker;
- do not create the Preview Worker secret;
- do not bootstrap the Preview Admin;
- do not merge.

After review, follow `PREVIEW_ADMIN_WORKSPACE.md`.

## Milestone 8 — real ECG/Anki reviewed migration

Status: **active content work**.

Prepare real Anki/ECG material outside the production app, review its semantic mapping, produce reviewed import packages/batches, and progressively enrich the resulting Cases with alternate routes, stimuli and tags where useful.

## Milestone 9 — learner accounts / role acceptance

Status: **planned**.

Implement the smallest administrator learner-account workflow and verify learner access cannot reach production Admin or Preview Admin.

## Milestone 10 — basic learner progress administration

Status: **planned**.

Initial scope: learner list, recent Reviews, filters, Again/Good summaries, repeated Again flags. Avoid sophisticated analytics until needed.

## Deferred work

- Asset/Stimulus→Topic relationships;
- finding ontology;
- Deck/Collection unless curriculum use requires it;
- FSRS/scheduling controls;
- advanced analytics;
- rich WYSIWYG authoring;
- complex hierarchy editor;
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

For the Preview Admin workspace PR, additionally require regression coverage for cloning, ownership authorization, learner/Admin isolation, Reset/retry/expiry, R2 prefix/deletion safety, Preview logout, and manual deployment/schema-change blocking. GitHub CI must be green before merge consideration.
