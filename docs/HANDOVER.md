# Flash-Cards agent handover

_Refreshed: 16 August 2026_

## Current outcome

The project has a working D1-backed learner Study flow, protected R2 teaching images, a first-pass Admin CMS, optional alternative stimulus groups, multi-Topic learner routing/Admin authoring, and a reviewed package import path.

Important recent milestones:

```text
PR #18 — multi-Topic learner study routing — merged
PR #22 — Reviewed Content Package Importer — merged
PR #23 — resumable/chunked reviewed imports — current DRAFT PR
```

The historical “next milestone is multi-Topic authoring/importer” language is obsolete. PR #22 is already merged. The current import infrastructure milestone is PR #23: client-orchestrated resumable reviewed imports. After this PR, the expected next content milestone is using the reviewed-package workflow for the real ECG/Anki migration.

Do not deploy or mutate production content from PR #23.

## Read first

```text
docs/AUTHORING_MODEL.md
docs/V1_DATA_MODEL.md
docs/CONTENT_IMPORT_PACKAGES.md
docs/MULTI_TOPIC_STUDY_ROUTES.md
docs/STIMULUS_GROUPS_DESIGN.md
docs/IMPLEMENTATION_PLAN.md
```

## Authoring/content model

Product hierarchy remains:

```text
Topic
└── Case
    └── fixed / alternative stimulus
```

`concepts` are called Topics in Admin UI. A Case can have one primary/default Topic and zero or more additional Study Topics through `case_concepts`. Questions belong at the highest context where their answer remains correct: reusable Topic → Case → stimulus group → exact stimulus option.

No parallel `topics` table, Asset→Topic table, or Stimulus→Topic table is required for the current import milestone.

## Reviewed import state

PR #22 established `/admin/import` and the strict Flash-Cards Import Package v1 contract:

- hardened ZIP parsing and bounded archive/media limits;
- strict manifest fields/references;
- exact-ZIP SHA-256 preview/confirmation binding;
- deterministic application IDs and teaching-image R2 keys;
- explicit `create`, `use`, and `skip`;
- fail-closed skip dependencies;
- deterministic retry/conflict checks;
- database conflict rules;
- parent-first Topic ordering;
- R2 cleanup after D1 Asset failure.

The importer still does **not** interpret `.apkg`, perform OCR, infer diagnoses/taxonomy, or auto-tag content.

## PR #23 — resumable/chunked reviewed imports

The current DRAFT branch is:

```text
agent/resumable-chunked-imports
```

The architecture is deliberately client-orchestrated:

```text
browser starts confirmed package once
→ D1 import_jobs checkpoint + private R2 staged ZIP
→ browser requests one bounded process step
→ Worker validates/writes a bounded chunk
→ D1 cursor advances
→ browser requests next step
→ ...
→ complete + staged ZIP cleanup
```

There is no Cloudflare Queue, Durable Object, Cron, scheduled Worker, or paid-only dependency. The browser must remain active for automatic continuation. Closing/refreshing/sleeping simply stops new requests; it does not lose completed work. D1 is authoritative and the administrator can Resume later.

### Persistence

Migration:

```text
0004_resumable_import_jobs.sql
```

`import_jobs` stores package ID/SHA/staging key, status, phase/cursor, processed/total count, creator, timestamps/error, and a short lease. Better Auth user identity is stored as text only; there is no auth-table FK.

Statuses:

```text
validating · ready · importing · complete · failed · cancelled
```

### Exact job phases

Validation:

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

Import:

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

All database validation must finish before any domain writes begin.

### Request budget

```text
IMPORT_ITEMS_PER_REQUEST = 7
IMPORT_D1_OPERATION_BUDGET = 40
```

Cloudflare Workers Free currently permits 50 D1 queries per Worker invocation. Seven items keeps a parent-linked Topic create chunk, plus lease/checkpoint work, below the project's conservative internal budget rather than merely below the platform maximum.

### Private package staging

The exact confirmed ZIP is stored under:

```text
imports/staging/<job-id>.zip
```

It is private, not an Asset, never learner-served, and does not go through `putTeachingImage()`. It participates in the existing 5 GiB managed R2 ceiling and preserves the package-size limit. Staging keys are server-derived and immutable.

Successful completion removes the staged ZIP. Finalization can be retried safely if the response is lost after deletion because it does not require the package to be re-read. Cancel removes staging because the job is intentionally stopped. Failed jobs retain staging so Retry/Resume can safely use the original bytes.

### Idempotency/recovery

Every process request derives the plan from the stored package; the client supplies only the job ID. Local database invariants are rechecked immediately before writes. Deterministic IDs/keys make repeated writes converge when state matches and fail when state conflicts.

For imported images:

- matching D1 Asset already present → retry converges;
- deterministic R2 object present without expected D1 row → fail explicitly, do not overwrite;
- R2 upload followed by D1 failure → best-effort teaching-image cleanup.

Imports are not whole-package atomic. Earlier chunks may already be committed when a later chunk fails. `failed` retains the exact phase/cursor/error and staged package. Retry/Resume continues from the same checkpoint after the conflict is corrected. Cancel after writes begin is a stop operation, not rollback.

### Concurrency

A short D1 lease plus conditional phase/cursor checkpoint protects against two tabs processing the same job. A competing tab receives a harmless busy result and should stop its local processing loop. Cancellation also refuses to race an actively leased process request.

## Admin UI state

Main Admin CMS surfaces remain:

```text
Dashboard · Cases · Questions · Images · Topics · Import package
```

`/admin/import` now provides:

1. Validate and preview exact package;
2. explicit confirmation/start;
3. automatic one-request-at-a-time processing;
4. status/phase/completed-total progress;
5. client-local Pause;
6. Resume / Retry;
7. recent jobs;
8. Cancel/Discard with explicit no-rollback warning after writes start.

All import actions use the existing administrator permission model. A job ID is never sufficient authorization.

## Learner/Admin model boundaries

This import work does not redesign learner Study behaviour. Existing multi-Topic routing, stimulus selection, Review snapshots, prompt precedence, question-selection modes, protected image serving, and Admin content surfaces must remain regression-safe.

Question precedence remains:

```text
selected stimulus option
> stimulus group
> Case
> Study Topic/Concept
> nearest inheritable ancestor
> more distant eligible ancestor
```

## R2 and D1 guardrails

Teaching images remain immutable and are uploaded through `putTeachingImage()` with 5 MiB per-image and 5 GiB managed-bucket limits. External URLs are attribution only. Unknown provenance is valid; never invent attribution.

The staged import ZIP is operational data, not teaching content. It uses a separate narrow storage helper and never becomes an Asset row.

## Validation required before PR #23 handoff

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

Also verify `0004_resumable_import_jobs.sql` against both a fresh local SQLite/D1-equivalent database and an existing database upgraded through prior migrations. GitHub CI must be green.

## Next step after PR #23

Use the reviewed import-package workflow to prepare and migrate the real ECG/Anki material in reviewed batches/packages. The external conversion/review step should decide Topic/Case/Asset/Prompt relationships and `create`/`use`/`skip`; the production application should remain a deterministic reviewed-package importer rather than an APKG interpreter.
