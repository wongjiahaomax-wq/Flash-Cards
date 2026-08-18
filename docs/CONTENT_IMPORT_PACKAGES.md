# Flash-Cards Import Packages

_Status: implemented and production-validated. PR #22 established strict reviewed-package import; PR #23 added resumable bounded execution. The workflow has been used successfully for the complete initial ECG migration._

_Last updated: 18 August 2026_

## Purpose and boundary

Flash-Cards imports a **reviewed Flash-Cards Import Package v1**, not an arbitrary Anki/APKG file.

External tooling may interpret source cards and prepare a reviewed package, but the production application does not:

- parse arbitrary APKG semantics;
- OCR teaching slides;
- infer diagnoses/taxonomy;
- infer Tags;
- decide how Anki fields map into the learning model.

Those decisions happen before the strict package reaches Production Admin.

The safety contract from PR #22 remains authoritative: strict package structure, hardened ZIP parsing, deterministic application identities/R2 teaching-image keys, explicit `create` / `use` / `skip`, fail-closed dependency checks, exact-ZIP SHA-256 confirmation, deterministic conflict handling, parent-first Topics, and R2 cleanup around D1 failure.

PR #23 adds resumable execution without Cloudflare Queues, Durable Objects, Cron, or paid-only infrastructure.

## 1. Package v1 structure

A package contains only:

```text
flashcards-import-v1.zip
├── manifest.json
└── media/
    └── declared JPEG/PNG files
```

Current hardened limits include:

```text
25 MiB compressed package
40 MiB decompressed package
256 ZIP entries
2 MiB manifest
5 MiB per teaching image
```

ZIP path, compression, size, metadata consistency, MIME/magic-byte, undeclared-media, and duplicate-entry checks remain fail-closed.

Manifest sections are product objects/relationships rather than raw SQL/table instructions:

```text
version
packageId
topics
cases
assets
caseAssets
questionPrompts
caseQuestions
topicQuestions
```

The package never supplies application SQL or arbitrary table names.

Import Package v1 remains deliberately **Tag-free**. Tags, Additional Study Topics, stimulus alternatives, and Shared Questions can be curated after ingestion.

## 2. `create`, `use`, and `skip`

### `create`

- application identity is deterministic from package ID + package-local ID;
- teaching-image key is deterministic/immutable;
- absent content is created;
- matching retry is idempotent;
- conflicting existing state fails rather than being overwritten.

### `use`

- explicitly reuses a declared production object/relationship;
- existence and expected identity/type/relationship are validated;
- downstream imported content may depend on it.

### `skip`

- performs no domain write for the skipped object;
- non-skipped imported content may not depend on it;
- an existing object required by downstream content must be `use`, not `skip`.

A skipped Case, for example, cannot silently receive newly imported Case Questions or Assets through downstream dependencies.

## 3. Exact-ZIP review contract

Administrator flow:

```text
Validate and preview
        ↓
Review package counts/warnings
        ↓
Select the exact same ZIP again
        ↓
Explicit confirmation
        ↓
Start resumable import job
```

A successful preview stores a short-lived HttpOnly SHA-256 marker for the exact ZIP bytes.

Starting a job re-hashes the newly submitted bytes and fails before staging/domain writes unless they match the most recently successful preview.

Preview performs hardened ZIP/package/static validation and presents package counts. Database conflict validation intentionally runs in bounded durable job phases rather than forcing a large D1 dry run into the preview request.

**All database validation phases must complete successfully before the first domain write.**

Once the job exists, the SHA-256 persisted on the D1 job and the immutable staged ZIP are authoritative. The browser never supplies phase, cursor, IDs, storage keys, or a write plan.

## 4. Resumable architecture

```text
Administrator browser
        |
        | start once with exact confirmed ZIP
        v
D1 import_jobs + private staged ZIP in R2
        |
        | POST process-next (one at a time)
        v
one bounded validation/write chunk
        |
        | durable checkpoint in D1
        v
browser POST process-next
        |
       ...
        v
complete + remove staged ZIP
```

The browser is the **conductor**, not the source of truth.

D1 is authoritative for status, phase, cursor, progress, error, and lease state. R2 holds the exact confirmed package while the job can resume.

There is no background continuation. If the browser closes, the laptop sleeps, connectivity drops, or the administrator presses Pause, no new request is sent. Completed chunks remain committed/checkpointed. Resume continues from persisted D1 state.

## 5. Persistence

Migration `0004_resumable_import_jobs.sql` adds `import_jobs` with fields including:

```text
id
package_id
package_sha256
package_storage_key
status
phase
cursor
processed_count
total_count
created_by
created_at
updated_at
completed_at
last_error
lease_token
lease_expires_at
```

Statuses:

```text
validating
ready
importing
complete
failed
cancelled
```

`created_by` is a Better Auth user ID stored as text without a domain FK into auth tables.

Deterministic phase + cursor is sufficient for current resume semantics; a separate chunk-history table is not required.

## 6. Validation and import phases

Database validation phases:

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

Only after all validation passes can the job become `ready`.

Import phases:

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

Create-Topic work is topologically ordered before chunking so parents precede children even across request boundaries.

Case↔Topic relationships are flattened into bounded work rather than letting one heavily linked Case create an unbounded Worker request.

## 7. Request budget

Current import orchestration uses:

```text
IMPORT_ITEMS_PER_REQUEST = 7
IMPORT_D1_OPERATION_BUDGET = 40
```

This is intentionally conservative relative to the Worker/D1 query ceiling the feature was designed against. Normal import operation does not depend on Workers Paid.

Regression instrumentation counts representative D1 operations so request growth remains visible.

Do not raise these limits casually to make large imports “faster”; bounded predictable requests are a core safety feature.

## 8. Private R2 staging

Confirmed ZIPs are stored under server-derived immutable keys:

```text
imports/staging/<job-id>.zip
```

The browser cannot choose the key.

Staged ZIPs:

- are not Asset rows;
- are not learner-served media;
- do not use the teaching-image `putTeachingImage()` path;
- remain subject to package size limits;
- count toward the managed R2 ceiling;
- fail if the immutable job-specific staging key unexpectedly already exists.

Every normal processing request loads the package by job ID, verifies stored SHA-256, parses through the hardened package reader, and derives the plan server-side.

Successful completion deletes staging. Finalization is retry-safe if a response is lost after deletion.

Cancellation removes staging because the job will no longer resume. Failed jobs retain staging for investigation/retry.

Successfully imported teaching images are not rolled back/deleted merely because a later package chunk fails or the job is cancelled after writes began.

## 9. Concurrency and leases

A short D1 lease prevents two browser tabs from processing the same checkpoint concurrently.

A process request conditionally claims the job only when no unexpired lease exists. A second tab receives a harmless busy result and stops its local loop.

Checkpoint updates compare persisted phase/cursor/lease token.

Cancellation must not race an actively leased processing request; pause/allow the active lease/request to finish before cancellation.

## 10. Idempotency and crash recovery

Every chunk is designed for retry:

- deterministic object IDs and teaching-image keys;
- matching existing rows converge as prior successful/retried writes;
- conflicts fail closed;
- item-local invariants are rechecked immediately before writes;
- progress advances only after a bounded chunk succeeds;
- lost HTTP responses may cause safe re-execution of the same checkpoint.

Teaching-image object creation is conditional (`If-None-Match: *`) so stale-lease races cannot overwrite an already-created deterministic R2 object.

For a new Asset:

- matching D1 row → retry converges without touching R2;
- D1 row absent but deterministic R2 object already exists → fail explicitly as unsafe orphan rather than overwrite;
- R2 upload succeeds but D1 Asset insert fails → best-effort R2 cleanup preserves the established safety contract.

See `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` for the focused runtime race/lease details.

## 11. Transaction/atomicity boundary

A resumable import spans many Worker invocations and is **not whole-package atomic**.

All database conflict validation completes before domain writes begin, but once import phases start, earlier chunks may already be committed when a later chunk fails.

On failure:

- status becomes `failed`;
- exact phase/cursor remain persisted;
- `last_error` records the problem;
- staged ZIP remains;
- Retry/resume starts from that checkpoint after correction.

On cancellation before writes, no domain content has been committed and staging is removed.

On cancellation after writes begin, processing stops/staging is removed, but previously committed content remains. The UI must not describe cancellation as rollback.

## 12. Administrator workflow

1. Open **Admin → Import package**.
2. Select the reviewed ZIP and run **Validate and preview**.
3. Review package ID/counts and resolve static/package errors.
4. Select the exact same ZIP again, confirm explicitly, and start the resumable job.
5. Keep the page open for automatic sequential continuation if convenient.
6. Watch status, phase, cursor, and completed/total progress.
7. Pause or close/refresh to stop browser continuation without losing D1 progress.
8. Resume later from persisted checkpoint.
9. On failure, inspect phase/error, correct the underlying conflict where appropriate, then Retry/resume.
10. Cancel only with the understanding that already committed chunks are not rolled back.

## 13. Security

Every `/admin/import` action requires production Admin authorization.

Job ID alone is never authorization.

Server-side state determines package SHA, storage key, status/phase/cursor, deterministic IDs, relationships, and writes.

The browser cannot submit an arbitrary execution plan.

Preview Admin does not gain unrestricted production import authority merely because it shares D1/R2 resources; import routes remain governed by the production Admin/Preview boundary.

## 14. Production validation — initial ECG migration complete

The reviewed/resumable import path has now been exercised against the real ECG corpus.

Production verification on 18 August 2026 confirmed:

```text
Batch 01: 13 imported Cases/ECGs
Batch 02: 51 imported Cases/ECGs
Mapped pre-existing calcium Cases: 2
Total source notes represented: 66 / 66
```

Both reviewed import jobs are `complete`, reached `phase = finalize`, match their recorded reviewed-package SHA-256 values, and have `last_error = null`.

The exact production accounting/verification record is in `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md`.

Therefore the next content milestone is **curation/enrichment**, not “try the importer on the ECG deck”.

## 15. Current import scope and deferred extensions

Keep Import Package v1 conservative unless real migrations justify expansion.

Current package intentionally does not require:

- Tags;
- Shared Questions;
- compound reuse rules;
- Image Collections;
- inferred alternative stimulus groups;
- automatic medical taxonomy generation.

Those can be curated after import. A future additive package version may carry already-reviewed metadata when repeated migrations demonstrate value.

## 16. Regression expectations

Coverage should continue protecting:

- exact-package digest safety;
- static skip/dependency safety;
- staging/checkpoint creation;
- multi-request validation;
- no domain writes before validation is complete;
- fresh-context resume;
- stale lease handling;
- deterministic retry;
- conditional R2 teaching-image creation;
- parent-first Topic ordering across chunks;
- R2 cleanup after Asset D1 failure;
- failed-job checkpoint/error retention;
- cancellation semantics;
- final staging cleanup;
- migration fresh/upgrade behavior;
- D1-operation-budget instrumentation;
- PR #22 strict package tests.
