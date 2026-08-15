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

The archive may contain only `manifest.json` and media files declared by the manifest under `media/`. Paths are UTF-8, relative, slash-separated, and cannot contain `..`, empty segments, backslashes, absolute prefixes, or executable content. The current limits are 256 entries, 25 MiB compressed, 40 MiB decompressed, and 2 MiB for the manifest. Stored and deflated ZIP entries are supported; encrypted entries, data descriptors, ZIP64, and duplicate paths are rejected.

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

Every entry has a package-local `id` and an `operation`: `create` creates a new application object; `use` requires an explicitly identified `applicationId`; and `skip` requires an explicit `applicationId` and records no write. Relationships also accept these operations. All references are package-local IDs and are resolved internally; SQL and arbitrary table names are never accepted.

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

`use` and `skip` are the mechanism for known production collisions. A reviewed ECG package can point a Hypocalcemia or Hypercalcemia Case at its known application ID and mark it `use` or `skip`; a title match is never used to identify a Case.

## Validation and dry run

`/admin/import` is protected by the existing administrator route guard. The preview action parses and validates the complete ZIP without writing D1 or R2. It checks the supported version, strict fields, duplicate package IDs, references, topic relationships, selection configuration, explicit existing IDs and object types, archive safety, decompression limits, declared media, MIME/magic-byte agreement, JPEG/PNG support, and the existing 5 MiB per-image limit.

The preview reports Topic create/use/skip counts, Case create/use/skip counts, images, prompts, Case Questions, Topic Questions, Case↔Topic links, and Case↔Asset links. Validation errors fail closed and are shown to the administrator.

## Import safety and repeat submission

The administrator must select the package again and check an explicit confirmation box. Validation runs again immediately before writes. New object IDs and R2 keys are deterministic for package-local identifiers, so an intentional retry sees matching existing objects and does not duplicate them. A mismatching row at a deterministic ID is a conflict and stops the import. Explicit `use`/`skip` IDs are checked for existence and expected table type.

The importer uses the existing `concepts`, `cases`, `assets`, relationship, and question tables. It does not overwrite an existing row, infer relationships, add a migration, or create an Anki schema.

## R2/D1 failure boundary

Images are uploaded only through `putTeachingImage()` in `storage/media.js`, preserving JPEG/PNG checks, the 5 MiB image limit, the managed 5 GiB quota, Standard storage, and immutable keys. If any D1 operation fails after an upload, the importer attempts to delete the objects uploaded by that submission. Cleanup failures are logged and must be investigated before retrying. D1 batches are used where available; this is transactional for the D1 portion on Cloudflare, but R2 and D1 cannot be claimed as one atomic transaction.

The result reports the package ID, uploaded image count, and database operation count. A failed import is not described as fully rolled back. Retry only after checking the result and any cleanup warning; deterministic conflict checks prevent blind duplication.

## Preparing a package with external tooling

ChatGPT or another review tool may inspect an `.apkg` and produce a reviewed application-domain manifest plus media files. The review process must decide, outside this application, which material is a Topic, Case, Asset, Prompt, Case Question, or reusable Topic Question; the exact Topic relationships; explicit `use`/`skip` treatment for existing Cases; meaningful alt text and known provenance; and which answer-side images should be omitted or converted to text.

The tool must not copy arbitrary Anki fields into the manifest or ask the importer to perform OCR, diagnosis, taxonomy inference, or answer generation. An initial ECG migration should generally map one note to a Case, the front ECG to a Case Asset, and specific reviewed questions to Case Questions. It should not attach answer-side images as normal Case Assets merely because they were present in the source package.

## Administrator workflow and recovery

1. Open **Admin → Import package**.
2. Select the reviewed ZIP and run **Validate and preview**.
3. Resolve every validation error and review the counts.
4. Select the package again, check the confirmation box, and submit **Import reviewed package**.
5. Review the result and any R2/D1 failure message before retrying.

The feature does not import into production during tests. There is no general rollback command because D1/R2 cannot be atomically reversed. Recovery is by reviewed, explicit deactivation or corrective authoring, plus safe R2 cleanup for an orphaned object where necessary. Never use ad-hoc SQL or a raw Wrangler R2 shortcut.
