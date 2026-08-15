# Flash-Cards Import Packages

## Purpose and boundary

The importer provides a repeatable path from material that has already been semantically reviewed outside Flash-Cards into the existing application-domain model. It deliberately imports a reviewed Flash-Cards package, not an arbitrary Anki/APKG file. External tooling may interpret source cards, but the application does not guess clinical meaning, taxonomy, citations, licences, question placement, or answer-image behaviour.

No Anki IDs, Anki tables, or import-provenance tables are added to the learning schema.

## ZIP layout

```text
flashcards-import-v1.zip
├── manifest.json
└── media/
    ├── ecg-001.png
    └── ...
```

The archive may contain only `manifest.json` and media files declared by the manifest under `media/`. Paths are UTF-8, relative, slash-separated, and cannot contain `..`, empty segments, backslashes, absolute prefixes, or executable content. The current limits are 256 entries, 25 MiB compressed, 40 MiB decompressed, 2 MiB for the manifest, and 5 MiB for each individual image. Stored and deflated ZIP entries are supported; encrypted entries, data descriptors, ZIP64, multi-disk archives, duplicate paths, inconsistent local/central metadata, and unexpected trailing ZIP structures are rejected.

The administrator path uses a hardened ZIP preflight before the domain parser. The central directory is checked against the 2 MiB manifest limit and 5 MiB per-image limit before any entry is materialized. Deflated entries are then decompressed as a counted stream during preflight, and processing aborts as soon as an entry exceeds its declared decompressed size. The aggregate declared and verified decompressed sizes must remain within the 40 MiB package limit. This prevents forged size metadata or a single oversized entry from turning the later in-memory parser into an unbounded decompression step.

## Manifest v1

`manifest.json` is strict JSON with these required top-level keys:

```json
{
  "version": 1,
  "packageId": "ecg-reviewed-2026-08",
  "topics": [],
  "cases": [],
  "assets": [],
  "caseAssets": [],
  "questionPrompts": [],
  "caseQuestions": [],
  "topicQuestions": []
}
```

Every entry has a package-local `id` and an `operation`: `create` creates a new application object; `use` explicitly reuses an existing application object and requires its `applicationId`; and `skip` records no write for that object. A non-skipped object or relationship may not depend on a skipped Topic, Case, Asset, or Question Prompt. If the package needs to attach content to an existing production object, that object must be marked `use`, not `skip`. Relationships also accept these operations. All references are package-local IDs and are resolved internally; SQL and arbitrary table names are never accepted.

The supported entry shapes are:

```json
{
  "topics": [{"id":"topic-ecg","operation":"create","name":"ECG Findings","slug":"ecg-findings","descriptionMd":null,"parentTopicId":null,"isActive":true}],
  "cases": [{"id":"case-001","operation":"create","title":"Reviewed ECG case","vignetteMd":"A reviewed stem.","primaryTopicId":"topic-ecg","secondaryTopicIds":[],"questionSelectionMode":"automatic","questionCount":null,"isActive":true}],
  "assets": [{"id":"asset-001","operation":"create","path":"media/ecg-001.png","mimeType":"image/png","originalFilename":"ecg-001.png","altText":"A reviewed ECG tracing","sourceLabel":null,"sourceUrl":null,"licence":null,"isActive":true}],
  "caseAssets": [{"id":"case-asset-001","operation":"create","caseId":"case-001","assetId":"asset-001","displayOrder":0,"captionMd":null}],
  "questionPrompts": [{"id":"prompt-001","operation":"create","promptMd":"Describe this ECG.","isActive":true}],
  "caseQuestions": [{"id":"case-question-001","operation":"create","caseId":"case-001","questionPromptId":"prompt-001","answerMd":"The reviewed answer.","isActive":true}],
  "topicQuestions": [{"id":"topic-question-001","operation":"create","topicId":"topic-ecg","questionPromptId":"prompt-001","answerMd":"A reusable reviewed answer.","inheritToDescendants":false,"isActive":true}]
}
```

A new Case must declare exactly one primary Topic; secondary Topics are explicit and cannot duplicate it. Question selection is `automatic`, `all`, or `fixed` with a positive `questionCount` only for `fixed`. Assets must provide meaningful alt text. Unknown provenance is represented by null `sourceLabel`, `sourceUrl`, and `licence`; the importer never invents attribution.

`use` and `skip` are the mechanism for known production collisions, but they have deliberately different meanings. A reviewed ECG package can point a Hypocalcemia or Hypercalcemia Case at its known application ID and mark it `use` when new imported questions/assets should attach to that Case. Marking the Case `skip` means the package must not write through it; any non-skipped downstream relationship that references it is rejected. A title match is never used to identify a Case. Reused Case Questions and Topic Questions are also checked against the declared owner and Question Prompt rather than being accepted merely because an application ID exists.

## Validation and dry run

`/admin/import` is protected by the existing administrator route guard. The preview action parses and validates the complete ZIP without writing D1 or R2. It checks the supported version, strict fields, duplicate package IDs, references, topic relationships, selection configuration, explicit existing IDs and object types, archive safety, per-entry declared size limits before materialization, streaming decompression bounds, declared media, MIME/magic-byte agreement, JPEG/PNG support, and the existing 5 MiB per-image limit.

The dry run also checks constraints that would otherwise fail only during the D1 batch: duplicate Topic slugs, duplicate Case/Asset display positions, duplicate Case/Prompt and Topic/Prompt create relationships, conflicting existing display positions, deterministic Asset storage-key identity, and existing Topic slug/storage-key collisions. Topic parent cycles fail closed without entering recursive core validation. Any non-skipped Topic, Case, Case Asset, Case Question, or Topic Question that depends on a skipped object also fails closed. Newly created Topics are ordered parent-first before the D1 batch so a child cannot be inserted before a newly created parent.

The preview reports Topic create/use/skip counts, Case create/use/skip counts, images, prompts, Case Questions, Topic Questions, Case↔Topic links, and Case↔Asset links. Validation errors fail closed and are shown to the administrator.

## Import safety and repeat submission

A successful preview records a short-lived, HttpOnly SHA-256 digest marker for the exact ZIP that was reviewed. The administrator must select the package again and check an explicit confirmation box. The confirm action hashes the submitted bytes and refuses the import unless they match the most recent successful preview. The preview marker is consumed before validation/writes, so every import attempt requires a fresh matching preview.

Validation runs again immediately before writes. New object IDs and R2 keys are deterministic for package-local identifiers, so an intentional retry after a fresh preview sees matching existing objects and does not duplicate them. A mismatching row at a deterministic ID is a conflict and stops the import. Deterministic Asset retries include the expected R2 `storageKey`, not only the metadata columns. Explicit `use`/`skip` IDs are checked for existence and expected table type, and Question relationship IDs must identify the declared owner/prompt pair. `skip` cannot be used as an indirect way to modify an otherwise excluded object; use `use` whenever downstream imported content intentionally depends on an existing object.

The importer uses the existing `concepts`, `cases`, `assets`, relationship, and question tables. It does not overwrite an existing row, infer relationships, add a migration, or create an Anki schema.

The current implementation is synchronous and is intended for modest reviewed packages. Larger migrations should be processed over multiple bounded Worker requests rather than relying on one very large import invocation. The planned resumable import-job workflow can orchestrate those chunks from the administrator's browser while keeping authoritative progress/checkpoints in Cloudflare. Until that follow-up is implemented, split unusually large migrations into modest reviewed packages rather than depending on a single oversized request.

## R2/D1 failure boundary

Images are uploaded only through `putTeachingImage()` in `storage/media.js`, preserving JPEG/PNG checks, the 5 MiB image limit, the managed 5 GiB quota, Standard storage, and immutable keys. If any D1 operation fails after an upload, the importer attempts to delete the objects uploaded by that submission. Cleanup failures are logged and must be investigated before retrying. D1 batches are used where available; this is transactional for the D1 portion on Cloudflare, but R2 and D1 cannot be claimed as one atomic transaction.

The result reports the package ID, uploaded image count, and database operation count. A failed import is not described as fully rolled back. Before retrying, review the failure/cleanup result and run a fresh dry-run preview of the same reviewed ZIP. Deterministic conflict checks prevent blind duplication.

## Preparing a package with external tooling

ChatGPT or another review tool may inspect an `.apkg` and produce a reviewed application-domain manifest plus media files. The review process must decide, outside this application, which material is a Topic, Case, Asset, Prompt, Case Question, or reusable Topic Question; the exact Topic relationships; explicit `use`/`skip` treatment for existing Cases; meaningful alt text and known provenance; and which answer-side images should be omitted or converted to text.

The tool must not copy arbitrary Anki fields into the manifest or ask the importer to perform OCR, diagnosis, taxonomy inference, or answer generation. An initial ECG migration should generally map one note to a Case, the front ECG to a Case Asset, and specific reviewed questions to Case Questions. It should not attach answer-side images as normal Case Assets merely because they were present in the source package.

## Administrator workflow and recovery

1. Open **Admin → Import package**.
2. Select the reviewed ZIP and run **Validate and preview**.
3. Resolve every validation error and review the counts.
4. Within the preview window, select the exact same ZIP again, check the confirmation box, and submit **Import reviewed package**.
5. If the file differs from the previewed bytes, the import is rejected before parsing/writes.
6. Review the result and any R2/D1 failure message. Run a fresh preview before any retry.

The feature does not import into production during tests. There is no general rollback command because D1/R2 cannot be atomically reversed. Recovery is by reviewed, explicit deactivation or corrective authoring, plus safe R2 cleanup for an orphaned object where necessary. Never use ad-hoc SQL or a raw Wrangler R2 shortcut.
