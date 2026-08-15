# Flash-Cards — V1 Implementation Plan

_Last updated: 16 August 2026_

This document tracks current implementation state. Detailed content-model decisions live in `AUTHORING_MODEL.md`, `V1_DATA_MODEL.md`, `STIMULUS_GROUPS_DESIGN.md`, and `MULTI_TOPIC_STUDY_ROUTES.md`. Reviewed-import behaviour lives in `CONTENT_IMPORT_PACKAGES.md`.

## Current product state

Implemented and merged:

- SvelteKit + Cloudflare Workers application scaffold;
- D1/Drizzle learning-domain model;
- Better Auth administrator/user boundary;
- D1-backed learner Study/Review flow;
- protected private R2 teaching-image pipeline;
- Admin CMS for Cases, Questions, Images, and Topics;
- optional alternative stimulus groups/options and contextual questions;
- multi-Topic Case learner routing and Admin authoring;
- reviewed Flash-Cards Import Package v1 importer from PR #22.

PR #22 is **already merged**. Historical text describing the reviewed importer as a future milestone is obsolete.

The current infrastructure milestone is PR #23 — resumable/chunked reviewed imports. Its purpose is to make a large reviewed package processable as many bounded Worker requests while keeping D1/R2 authoritative, without Cloudflare Queues or a paid-only dependency.

## Milestone 0 — V1 contract

Status: **complete baseline; future extensions should remain additive/backward-compatible**.

Core product model:

```text
Topic/Concept
└── Case
    ├── fixed Assets
    ├── optional stimulus groups/options
    └── contextual questions
```

A Case can have one primary/default Topic and additional learner Study Topics through `case_concepts`. Do not add a second Topic table or Asset→Topic/Stimulus→Topic relationship unless real content demonstrates the need.

## Milestone 1 — application scaffold

Status: **complete**.

- SvelteKit;
- Cloudflare Workers adapter/runtime;
- Wrangler configuration;
- public sign-in/landing;
- protected `/study` and `/admin`;
- CI covering database checks, tests, Svelte checks, build, and local auth smoke validation.

## Milestone 2 — D1 + Drizzle learning model

Status: **complete for current V1**.

Includes Topics/Concept hierarchy, Cases, Case↔Topic roles, Assets/Case Assets, reusable Question Prompts, Topic/Case questions, stimulus groups/options and contextual questions, Reviews, Review Questions, and Review Assets.

Migrations currently include:

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
```

PR #23 adds the additive operational migration:

```text
0004_resumable_import_jobs.sql
```

This table stores import execution state only and does not change learner content relationships.

## Milestone 3 — authentication/permissions

Status: **substantially complete**.

Completed: Better Auth, direct D1 persistence, Admin plugin, disabled public signup, protected Study/Admin routes, local auth smoke test, production administrator bootstrap.

Later: smallest learner-account Admin workflow and explicit learner role-boundary acceptance test.

## Milestone 4 — learner Study flow

Status: **complete for current V1**.

Learner routing supports any attached valid Case Topic, deterministic Study-Concept resolution, fixed/alternative stimuli, contextual question precedence, Automatic/All/Fixed selection, per-stimulus coverage, durable Review snapshots, and whole-Case Again/Good rating.

This import milestone must not redesign Study flow.

## Milestone 5 — protected R2 teaching images

Status: **complete for current V1**.

Teaching images are private, immutable, JPEG/PNG only, limited to 5 MiB each, and governed by the 5 GiB application-managed R2 ceiling. Runtime image serving is authenticated. External source URLs are attribution/reference only.

PR #23 adds a separate private operational staging prefix for reviewed package ZIPs. A ZIP is not an Asset and is never learner-served.

## Milestone 6 — Admin CMS

Status: **complete for current V1 content administration**.

Implemented surfaces:

```text
/admin
/admin/cases
/admin/questions
/admin/images
/admin/topics
/admin/import
```

Topic hierarchy editing, broad WYSIWYG authoring, sophisticated deletion, and advanced analytics remain deferred.

## Milestone 7 — pilot content/model validation

Status: **in progress**.

Representative content should continue to exercise ECG/Cardiology, ENT, Eye, Dermatology, multi-image Cases, alternative stimuli, reusable Topic questions, image-specific questions, and multi-Topic learner routes.

The intended migration strategy is progressive enrichment: imported reviewed material can begin as ordinary Topic/Case/Asset/questions, then gain alternate routes/stimulus grouping later when genuinely useful.

## Milestone 7C — reviewed package importer (PR #22)

Status: **merged**.

Safety guarantees now part of the current baseline:

- strict Import Package v1;
- hardened ZIP parser;
- exact-ZIP SHA-256 preview binding;
- deterministic application IDs and teaching-image keys;
- explicit `create`, `use`, `skip`;
- fail-closed skip dependency semantics;
- database conflict checks;
- parent-first Topics;
- R2 cleanup after D1 failure;
- regression tests.

The production application deliberately does not parse `.apkg` or infer medical semantics.

## Milestone 7D — resumable/chunked reviewed imports (PR #23)

Status: **current DRAFT implementation**.

### Goal

Replace the requirement that one large reviewed import completes inside one Worker request with:

```text
browser conductor
→ Worker bounded chunk
→ D1 checkpoint
→ browser next request
→ ...
```

No Cloudflare Queue, Durable Object, Cron, scheduled background worker, or paid-only infrastructure dependency.

### Durable state

`import_jobs` stores:

- package ID, exact SHA-256, private staging key;
- `validating` / `ready` / `importing` / `complete` / `failed` / `cancelled`;
- deterministic phase/cursor;
- processed/total progress;
- creator/timestamps/error;
- short D1 processing lease.

D1 is authoritative. Browser state is disposable.

### Temporary R2 package

After exact-ZIP confirmation, the package is stored privately at:

```text
imports/staging/<job-id>.zip
```

It is immutable, server-keyed, subject to the package-size limit and existing 5 GiB managed R2 ceiling, and has no Asset row/public serving path.

### Validation phases

```text
validate_topics
validate_question_prompts
validate_cases
validate_assets
validate_case_topics
validate_case_assets
validate_case_questions
validate_topic_questions
```

No domain writes begin until all validation phases complete.

### Import phases

```text
import_topics
import_question_prompts
import_cases
import_assets
import_case_topics
import_case_assets
import_case_questions
import_topic_questions
finalize
```

Topics remain parent-first even across request boundaries.

### Chunk budget

```text
IMPORT_ITEMS_PER_REQUEST = 8
IMPORT_D1_OPERATION_BUDGET = 40
```

Cloudflare currently documents a 50 D1-query limit per Worker invocation on Workers Free. The implementation leaves headroom for job claim/checkpoint operations and uses tests that instrument representative worst-case D1 operation counts. The goal is predictable bounded work rather than throughput.

### Pause/resume

Automatic processing occurs only while the Admin page is actively sending sequential process requests. **Pause**, refresh, browser close, sleep, or network loss merely stops new requests. Returning later loads the persisted job and Resume continues from its D1 checkpoint.

A short conditional D1 lease prevents two tabs from processing the same cursor simultaneously.

### Failure/atomicity

Whole-package atomicity is not promised. Earlier import chunks may already be committed when a later chunk fails. Every item uses deterministic identities, matching-state retry semantics, local pre-write invariant checks, and durable checkpointing.

A failed job records phase/cursor/error and keeps its staged package for Retry/Resume. Cancel stops future processing and removes staging; after writes begin it does not roll back committed content.

For teaching-image writes, an orphaned deterministic R2 object without the expected D1 Asset row fails explicitly rather than being overwritten. R2 upload followed by D1 failure retains the existing cleanup path.

### Completion

Completion marks the job complete, records completion time/final progress, and removes only the staged ZIP. Successfully imported teaching-image Assets remain.

## Milestone 8 — real ECG/Anki reviewed migration

Status: **next expected content step after PR #23**.

Prepare the real Anki/ECG source outside the production app, review its semantic mapping, produce Import Package v1, preview it, then run it through the resumable reviewed-package workflow.

Out of scope for the application:

- APKG parsing;
- OCR;
- diagnosis/taxonomy inference;
- auto-tagging;
- automatic clinical answer generation.

## Milestone 9 — learner accounts / role acceptance

Status: **planned**.

Implement the smallest administrator learner-account workflow, then verify learner can study and cannot access `/admin`.

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
- Cloudflare Queue-based import processing for this milestone.

## Validation required for implementation PRs

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

For PR #23, additionally verify migration `0004` on a fresh database and an existing database upgraded through prior migrations, and require green GitHub CI before merge.
