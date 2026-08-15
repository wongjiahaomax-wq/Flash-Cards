# Flash-Cards Import Packages

_Last updated: 16 August 2026_

## Purpose and boundary

Flash-Cards imports a **reviewed Flash-Cards Import Package v1**, not an arbitrary Anki/APKG file. External tooling may interpret source cards and prepare a reviewed package, but the production application does not perform OCR, infer diagnoses/taxonomy, auto-tag medical content, or guess how an Anki field should map into the learning model.

PR #22 — Reviewed Content Package Importer — is merged. Its safety contract remains the basis of this workflow: strict package structure, hardened ZIP parsing, deterministic application identities/R2 teaching-image keys, explicit `create` / `use` / `skip`, fail-closed skip dependencies, exact-ZIP SHA-256 confirmation, deterministic conflict handling, parent-first Topics, and R2 cleanup around D1 failure.

This follow-up adds a resumable execution layer for large reviewed packages without Cloudflare Queues, Durable Objects, Cron, or a paid-only infrastructure dependency.

## Package v1

A package is a ZIP containing only:

```text
flashcards-import-v1.zip
├── manifest.json
└── media/
    └── declared JPEG/PNG files
```

The existing hardened parser remains authoritative. Current package limits remain 25 MiB compressed, 40 MiB decompressed, 256 ZIP entries, 2 MiB manifest, and 5 MiB per teaching image. ZIP path, compression, size, metadata consistency, MIME/magic-byte, undeclared-media, and duplicate-entry checks remain fail-closed.

The manifest still contains:

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

No application SQL/table name is supplied by the package.

## `create`, `use`, and `skip`

These meanings are unchanged from PR #22.

### `create`

- application ID is deterministic from package ID + package-local ID;
- teaching-image key is deterministic and immutable;
- absent content is created;
- a matching retry is idempotent;
- conflicting existing state fails rather than being overwritten.

### `use`

- explicitly reuses the declared production object/relationship;
- existence and expected identity/type/relationship are validated;
- downstream imported content may depend on it.

### `skip`

- performs no domain write for the skipped object;
- non-skipped imported content may **not** depend on it;
- an existing object required by downstream imported content must be `use`, not `skip`.

In particular, a skipped Case cannot receive newly imported Case Questions or Assets indirectly.

## Exact-ZIP review contract

The administrator flow remains:

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

A successful preview stores a short-lived HttpOnly SHA-256 marker for the exact ZIP bytes. Starting a job hashes the newly submitted bytes and fails before staging/domain writes unless they match that most recent successful preview.

The preview performs hardened ZIP/package/static validation and presents the package counts. Database conflict validation now runs inside the durable job in bounded phases. This is intentional: a very large package must not have to execute its entire D1 dry run in the preview request. **All database validation phases still have to complete successfully before the first domain write.**

Once the job exists, the SHA-256 stored on the D1 job and the immutable staged ZIP become authoritative. The browser never supplies phase, cursor, application IDs, storage keys, or a write plan.

## Resumable architecture

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
        | durable phase/cursor checkpoint in D1
        v
browser POST process-next
        |
       ...
        v
complete + remove staged ZIP
```

The browser is the **conductor**, not the source of truth. D1 is authoritative for status, phase, cursor, progress, error, and lease state. R2 holds the exact confirmed package while the job is resumable.

There is intentionally no background continuation. If the browser closes, the laptop sleeps, the internet disconnects, or the administrator presses **Pause**, no new processing request is sent. Already completed chunks remain committed and checkpointed. Returning later and pressing **Resume import** continues from D1.

No Cloudflare Queue, Durable Object, Cron trigger, scheduled Worker, or paid-only service is used.

## Persistence

Migration `0004_resumable_import_jobs.sql` adds the additive `import_jobs` table. It stores:

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

Statuses are:

```text
validating
ready
importing
complete
failed
cancelled
```

`created_by` is a Better Auth user ID stored as plain text; there is deliberately no foreign key from this domain/operational table into Better Auth tables.

A separate chunk-history table is not required. The current deterministic phases plus cursor are sufficient to resume safely.

## Exact phases

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

Only after the last validation phase succeeds does the job enter `ready`.

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

Create-Topic work is topologically ordered before chunking, so parent Topics are inserted before child Topics even when the relationship crosses a request boundary. Case↔Topic relationships are flattened into bounded relationship work rather than allowing one Case with many secondary Topics to create an unbounded request.

## Request budget and Cloudflare limits

The implementation uses:

```text
IMPORT_ITEMS_PER_REQUEST = 8
IMPORT_D1_OPERATION_BUDGET = 40
```

Cloudflare's current D1 limits document a 50-query-per-Worker-invocation limit on Workers Free. The request budget deliberately stays below that ceiling. Representative worst-case phases perform local invariant checks plus at most one create per item, while job claim/checkpoint work consumes additional D1 operations. Regression instrumentation counts D1 operations for a representative worst-case request and asserts the configured 40-operation budget.

The objective is predictable small requests, not maximum throughput. Normal operation does not depend on Workers Paid.

## Private R2 staging

Confirmed ZIPs are stored only under server-derived immutable keys:

```text
imports/staging/<job-id>.zip
```

The browser cannot choose the key. Staged ZIPs:

- are not Asset rows;
- are never served through the learner Asset endpoint;
- do not pass through `putTeachingImage()`;
- retain the existing maximum compressed package size;
- participate in the existing 5 GiB application-managed R2 ceiling;
- fail if the immutable job-specific staging key already exists.

Every processing request loads the package by the job ID, verifies the stored SHA-256, runs it through the existing hardened parser, and derives the plan server-side.

On successful completion, the staged ZIP is deleted. On cancellation it is deleted because the job is no longer resumable. A failed job keeps the staged ZIP so that it can be investigated/corrected and safely retried. Teaching images that were successfully imported are not removed during normal finalization/cancellation.

## Concurrency and leases

A short D1 lease prevents two browser tabs from processing the same checkpoint concurrently. A process request conditionally claims the job only when no unexpired lease exists. A second tab receives a harmless busy result and stops its local loop.

Checkpoint updates also compare the persisted phase/cursor/lease token. The browser cannot advance a stale cursor.

## Idempotency and crash recovery

Every chunk is designed for retry:

- deterministic object IDs and teaching-image keys are unchanged from PR #22;
- matching existing rows are treated as the result of a prior successful/retried write;
- conflicting rows fail closed;
- item-local invariants are rechecked immediately before each write;
- cursor/progress advances only after the bounded chunk succeeds;
- a lost HTTP response can cause the same chunk to run again without duplicating matching content.

For a new teaching image, the importer first checks the expected D1 Asset row. If the matching D1 row already exists, the retry converges without touching R2. If the D1 row is absent but the deterministic teaching-image object already exists, the importer treats that as an unsafe orphan and **fails explicitly rather than overwriting it**.

If R2 upload succeeds but the D1 Asset insert fails, the uploaded teaching-image object is deleted on a best-effort cleanup path, preserving the PR #22 safety behaviour.

## Transaction/atomicity boundary

A resumable import spans many Worker invocations. It is therefore **not whole-package atomic**.

All database conflict validation completes before domain writes start, but once import phases begin, earlier chunks may already be committed when a later chunk fails. This is acceptable for this administrator migration workflow because writes are deterministic/idempotent and progress is durable.

On failure:

- job status becomes `failed`;
- exact phase/cursor are retained;
- the error is recorded in `last_error`;
- the staged ZIP is retained;
- **Retry / resume** starts from that same checkpoint after the underlying problem is corrected.

On cancellation before writes, no domain content has been committed and staging is removed. On cancellation after writes have begun, processing stops and staging is removed, but already committed content remains. The UI explicitly says this is not rollback.

## Administrator workflow

1. Open **Admin → Import package**.
2. Select the reviewed ZIP and run **Validate and preview**.
3. Review the package ID/counts and resolve static/package errors.
4. Select the exact same ZIP again, check the explicit confirmation box, and press **Start resumable import**.
5. Keep the page open for automatic continuation. Only one process request is sent at a time.
6. Watch status, phase, cursor, and completed/total progress.
7. **Pause** stops only the browser loop. Refresh/closing the browser has the same effect.
8. Return later and press **Resume import** to continue from the persisted D1 checkpoint.
9. If a job fails, inspect the recorded phase/error, correct the conflict where appropriate, then use **Retry / resume**.
10. Cancel/discard only with the understanding that content from earlier import chunks is not rolled back once writes have started.

## Security

Every `/admin/import` action continues to require the existing administrator permission model. Job ID alone is never authorization. The server verifies the job exists and that its status permits the requested operation; server-side state determines package SHA, storage key, phase, cursor, deterministic IDs, relationships, and writes.

## Tests and next step

Regression coverage includes static skip safety, initial staging/checkpoint creation, multi-request validation, no writes before validation is fully ready, fresh-context resume, stale lease handling, deterministic retry, parent-first Topics across chunk boundaries, R2 cleanup after Asset D1 failure, failed-job checkpoint/error recording, cancellation, final staging cleanup, migration fresh/upgrade behaviour, and D1-operation-budget instrumentation. Existing PR #22 tests remain part of the normal `npm test` suite.

The expected next product/content milestone after this PR is to use this reviewed-package workflow for the real ECG/Anki migration. APKG interpretation and clinical review remain outside the production application.
