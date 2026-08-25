# Flash-Cards Import Packages

_Status: implemented and production-validated. PR #22 established strict reviewed-package import; PR #23 added resumable bounded execution. PR #53 adds a separate local slide-review/finalization layer. PR #90 keeps Package v1 shape compatibility while retiring non-empty Additional Study Topic declarations._

_Last updated: 25 August 2026_

## Purpose and boundary

Flash-Cards imports a **reviewed Flash-Cards Import Package v1**, not an arbitrary Anki/APKG, PowerPoint, PDF, review bundle, or source archive.

External tooling may recover source material, perform semantic reconstruction, and prepare a reviewed package, but the production application does not:

- parse arbitrary APKG semantics;
- interpret PPTX/PDF teaching content;
- OCR teaching slides;
- infer diagnoses/taxonomy;
- infer Tags;
- decide how source fields/slides map into the learning model;
- perform the human editorial review of reconstructed content.

Those decisions happen before the strict package reaches Production Admin.

The safety contract remains: strict package structure, hardened ZIP parsing, deterministic application identities/R2 teaching-image keys, explicit `create` / `use` / `skip`, fail-closed dependency checks, exact-ZIP SHA-256 confirmation, deterministic conflict handling, parent-first Topics, and R2 cleanup around D1 failure.

Resumable execution remains browser-driven request orchestration backed by durable D1/R2 state; it does not imply background continuation.

## Upstream source/review artifacts are not production packages

```text
Anki .apkg / PPTX / PDF
        ↓
source recovery / semantic reconstruction
        ↓
normalized source or Reviewable Import Bundle
        ↓
human review
        ↓
deterministic finalization
        ↓
Flash-Cards Import Package v1
        ↓
Production Admin importer
```

For slide material, the local reviewer consumes a review ZIP containing review-only metadata/previews and exports a production ZIP containing only:

```text
flashcards-import-v1.zip
├── manifest.json
└── media/
```

The local reviewer/finalizer performs no production D1/R2 writes. The production importer performs no source reconstruction or medical interpretation.

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

### Primary Topic compatibility rule

Package v1 historically included on each Case:

```text
primaryTopicId
secondaryTopicIds
```

Current Case classification is one canonical Primary Topic plus Case Tags. To avoid an unnecessary Package v1 schema-version bump, the field remains accepted only in this form:

```json
"secondaryTopicIds": []
```

A **non-empty** `secondaryTopicIds` array is now invalid reviewed input.

The guard exists at multiple supported runtime boundaries:

- hardened reviewed-package parsing/validation;
- resumable staging before immutable staging objects are written;
- staged execution-plan reads, so a previously staged legacy plan cannot resume after the invariant changes.

Import Package v1 does not currently encode Case Tags/System↔Tag exposure. Those are reviewed post-import authoring/curation layers.

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

A skipped Case cannot silently receive newly imported Case Questions or Assets through downstream dependencies.

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

Preview performs hardened ZIP/package/static validation. Database conflict validation runs in bounded durable job phases.

**All database validation phases must complete successfully before the first domain write.**

Once the job exists, the SHA-256 persisted on the D1 job and the immutable staged ZIP/server-derived plan are authoritative. The browser never supplies phase, cursor, IDs, storage keys, or a write plan.

## 4. Resumable architecture

```text
Administrator browser
        |
        | start once with exact confirmed ZIP
        v
D1 import_jobs + private staged ZIP/plan in R2
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
complete + remove staging
```

The browser is the **conductor**, not the source of truth.

D1 is authoritative for status, phase, cursor, progress, error, and lease state. Private R2 staging holds the exact confirmed package and server-derived execution sidecars while the job can resume.

If the browser closes, the laptop sleeps, connectivity drops, or the administrator presses Pause, no new request is sent. Completed chunks remain committed/checkpointed. Resume continues from persisted D1 state.

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

Database validation phases include:

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

Import phases include:

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

The historical `case_topics` phase name remains part of the Package v1/job execution contract. Under the current model it materializes only the Case's canonical Primary Topic relationship; non-empty secondary declarations cannot reach this phase through supported reviewed/resumable entry paths.

## 7. Request budget

Current orchestration uses:

```text
IMPORT_ITEMS_PER_REQUEST = 7
IMPORT_D1_OPERATION_BUDGET = 40
```

This is intentionally conservative. Regression instrumentation counts representative D1 operations so request growth remains visible.

Do not raise these limits casually merely to make large imports faster; bounded predictable requests are a safety feature.

External Cloudflare plan/limit values may change. Reverify provider documentation before making new numeric plan claims or changing request budgets.

## 8. Private R2 staging

Confirmed ZIPs are stored under server-derived immutable keys:

```text
imports/staging/<job-id>.zip
```

The runtime may also derive a normalized execution-plan sidecar and separately staged create-Asset media.

Staging objects:

- are not Asset rows;
- are not learner-served media;
- do not use the teaching-image `putTeachingImage()` path;
- remain subject to package/storage limits;
- are private operational state;
- use server-derived keys.

Before a snapshot is staged, current code verifies that its manifest cannot recreate Additional Study Topics. The same invariant is checked when reading a staged plan for processing.

Successful completion deletes staging. Cancellation removes staging because the job will no longer resume. Failed jobs retain staging for investigation/retry.

Successfully imported teaching images are not rolled back/deleted merely because a later package chunk fails or the job is cancelled after writes began.

## 9. Concurrency and leases

A short D1 lease prevents two browser tabs from processing the same checkpoint concurrently.

A process request conditionally claims the job only when no unexpired lease exists. A second tab receives a harmless busy result and stops its local loop.

The runtime renews/fences the exact lease token + phase + cursor before bounded side effects and checkpoint updates remain conditional on that same execution identity.

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

See `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` for focused runtime race/lease details.

## 11. Transaction/atomicity boundary

A resumable import spans many Worker invocations and is **not whole-package atomic**.

All database conflict validation completes before domain writes begin, but once import phases start, earlier chunks may already be committed when a later chunk fails.

On failure:

- status becomes `failed`;
- exact phase/cursor remain persisted;
- `last_error` records the problem;
- staged operational data remains for investigation/retry.

On cancellation before writes, no domain content has been committed and staging is removed.

On cancellation after writes begin, processing stops/staging is removed, but previously committed content remains. The UI must not describe cancellation as rollback.

## 12. Administrator workflow

1. Finalize a reviewed package outside production where applicable.
2. Open **Admin → Import package**.
3. Select the reviewed production ZIP and run **Validate and preview**.
4. Review package ID/counts and resolve static/package errors, including any non-empty `secondaryTopicIds` rejection.
5. Select the exact same ZIP again, confirm explicitly, and start the resumable job.
6. Keep the page open for automatic sequential continuation if convenient.
7. Watch status, phase, cursor, and progress.
8. Pause or close/refresh to stop browser continuation without losing D1 progress.
9. Resume later from persisted checkpoint.
10. On failure, inspect phase/error, correct the underlying conflict where appropriate, then Retry/resume.
11. Cancel only with the understanding that already committed chunks are not rolled back.

## 13. Security

Every `/admin/import` action requires production Admin authorization.

Job ID alone is never authorization.

Server-side state determines package SHA, storage key, status/phase/cursor, deterministic IDs, relationships, and writes.

The browser cannot submit an arbitrary execution plan.

Preview Admin does not gain unrestricted production import authority merely because it shares D1/R2 resources.

The local slide reviewer and local production-like replica do not grant or proxy production import authority.

## 14. Production validation — initial ECG migration complete

The reviewed/resumable import path has been exercised against the real ECG corpus.

Production verification on 18 August 2026 confirmed:

```text
Batch 01: 13 imported Cases/ECGs
Batch 02: 51 imported Cases/ECGs
Mapped pre-existing calcium Cases: 2
Total source notes represented: 66 / 66
```

Those completed historical jobs remain valid. The current primary-only rule governs future reviewed imports; it does not rewrite historical imported content or Reviews.

The exact production accounting/verification record is in `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md`.

## 15. Current import scope and deferred extensions

Keep Import Package v1 conservative unless real migrations justify expansion.

Current package intentionally does not directly encode later-stage authoring structures such as:

- Case Tags or System↔Tag exposure;
- Shared Questions;
- Reusable Image Questions;
- alternative stimulus groups;
- Image Collections;
- Asset supersession lineage.

Additional Study Topics are not a deferred enrichment target: they are retired. The legacy `secondaryTopicIds` field must remain empty.

Recommended source-to-package principle:

```text
faithfully reconstruct source content
→ human review
→ deterministic Import Package v1
→ production import
→ progressive authoring enrichment with Tags/reusable knowledge where proven
```

Do not make the production importer responsible for medical reconstruction merely because later authoring features exist.

## 16. Regression expectations

Coverage should continue protecting:

- exact-package digest safety;
- static skip/dependency safety;
- rejection of non-empty `secondaryTopicIds` before planning/writes;
- resumable staging refusal without partial staging side effects;
- refusal to execute previously staged legacy secondary-Topic plans;
- staging/checkpoint creation;
- multi-request validation;
- no domain writes before validation is complete;
- fresh-context resume;
- stale lease handling/fencing;
- deterministic retry;
- conditional R2 teaching-image creation;
- parent-first Topic ordering across chunks;
- R2 cleanup after Asset D1 failure;
- failed-job checkpoint/error retention;
- cancellation semantics;
- final staging cleanup;
- migration fresh/upgrade behavior;
- D1-operation-budget instrumentation;
- strict package tests;
- local slide finalizer → current reviewed `parseImportPackage()` compatibility.