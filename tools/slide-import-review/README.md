# Local Slide Import Reviewer

This tool implements the human-review and deterministic-finalization layer for slide ingestion. It is deliberately separate from the production SvelteKit Admin application.

## Build and routine use

Build once from the repository root:

```bash
npm run slide-review:build
```

Then open:

```text
tools/slide-import-review/dist/index.html
```

The built reviewer is a standalone local HTML file. Routine review does not require a development server, Cloudflare, D1, R2, GitHub Pages, or internet access.

Workflow:

```text
open dist/index.html
→ choose/drop <batch>-review.zip
→ compare source previews with the actual manifest-backed proposed import
→ edit / approve / reject
→ Export Reviewed Bundle
→ Finalize Import ZIP
```

The browser never uploads review-bundle contents or automatically fetches source URLs.

## Input bundle

```text
<batch>-review.zip
├── manifest.json
├── media/
├── review-map.json
└── source-previews/
```

This is intentionally not accepted by the production Import Package parser because the review-only paths are outside the production package contract.

## `review-map.json` version 1

Top-level keys are exact and unknown keys fail validation:

```json
{
  "version": 1,
  "bundleId": "stable-review-bundle-id",
  "batchName": "Human-readable batch name",
  "sourceFiles": [],
  "cases": [],
  "sourceCoverage": [],
  "unresolvedQuestions": [],
  "batchWarnings": []
}
```

Allowed review statuses are exactly:

```text
pending
approved
needs_review
rejected
```

Allowed confidence values are exactly:

```text
high
medium
low
```

Allowed warning severities are exactly:

```text
blocking
warning
info
```

Warning shape:

```json
{
  "code": "missing_answer",
  "severity": "blocking",
  "message": "No reliable answer was identified in the source."
}
```

Source reference shape:

```json
{
  "sourceId": "source-001",
  "pages": [17, 18]
}
```

### `sourceFiles[]`

```json
{
  "sourceId": "source-001",
  "filename": "teaching-deck.pdf",
  "repository": "wongjiahaomax-wq/source-material",
  "path": "slides/teaching-deck.pdf",
  "ref": "commit-sha-or-ref",
  "pageCount": 63
}
```

`repository`, `path`, and `ref` may be null. `pageCount` is a positive integer.

### `cases[]`

```json
{
  "caseId": "case-001",
  "reviewStatus": "pending",
  "confidence": "high",
  "warnings": [],
  "sourceRefs": [{ "sourceId": "source-001", "pages": [1, 2] }],
  "caseBoundaryNotes": "Page 1 question, page 2 answer.",
  "assets": [],
  "questions": [],
  "reviewNotes": []
}
```

`caseId` must reference a manifest Case.

### `cases[].assets[]`

```json
{
  "assetId": "asset-001-01",
  "reviewStatus": "pending",
  "confidence": "high",
  "warnings": [],
  "sourceRefs": [{ "sourceId": "source-001", "pages": [1] }],
  "extractionMethod": "embedded_original",
  "sha256": "lowercase-or-uppercase-hex-digest",
  "reviewNotes": []
}
```

`assetId` must reference a manifest Asset. The SHA-256 is review metadata and is checked against the exact learner bytes before finalization.

### `cases[].questions[]`

```json
{
  "caseQuestionId": "case-question-001-01",
  "reviewStatus": "pending",
  "confidence": "high",
  "warnings": [],
  "promptSourceRefs": [{ "sourceId": "source-001", "pages": [1] }],
  "answerSourceRefs": [{ "sourceId": "source-001", "pages": [2] }],
  "reviewNotes": []
}
```

`caseQuestionId` must reference a manifest Case Question. The linked Question Prompt is obtained from the manifest relationship.

### `sourceCoverage[]`

```json
{
  "sourceId": "source-001",
  "page": 17,
  "classification": "case",
  "caseIds": ["case-007"],
  "notes": "Question slide.",
  "previewPath": "source-previews/source-001-page-017.jpg"
}
```

Every `sourceId` and Case reference is validated. A non-null `previewPath` must exist in the selected review ZIP. Duplicate `(sourceId, page)` rows are rejected.

### `unresolvedQuestions[]`

A source question with no reliable answer must not be emitted as an invalid production Case Question. It stays review-only:

```json
{
  "candidateId": "unresolved-question-001-03",
  "caseId": "case-001",
  "sourcePrompt": "What investigation would you perform next?",
  "proposedPrompt": "What investigation would you perform next?",
  "promptSourceRefs": [{ "sourceId": "source-001", "pages": [17] }],
  "answerSourceRefs": [],
  "reviewStatus": "needs_review",
  "confidence": "low",
  "warnings": [{
    "code": "missing_answer",
    "severity": "blocking",
    "message": "No reliable answer was found in the supplied source material."
  }],
  "reviewNotes": [],
  "resolvedQuestionPromptId": null,
  "resolvedCaseQuestionId": null
}
```

## Promoting an unresolved question

The reviewer supplies a non-empty Prompt and answer, then chooses **Create Prompt + Case Question**.

No AI is called. IDs are deterministic from `candidateId`:

```text
resolved-prompt:<candidateId>
resolved-case-question:<candidateId>
```

The actual in-memory production manifest receives one `questionPrompts[]` create record and one `caseQuestions[]` create record. The unresolved candidate is retained in review history and points to the new manifest IDs. The new emitted Question starts `pending` and must itself be approved.

Rejecting an unresolved candidate changes only its review state to `rejected`; no manifest object is created.

## Direct manifest editing

The proposed-import panel renders from `manifest.json` in memory. Editing these controls changes that same manifest object directly:

- `Case.title`
- `Case.vignetteMd`
- `Asset.originalFilename`
- `Asset.altText`
- `Asset.sourceLabel`
- `Asset.sourceUrl`
- `Asset.licence`
- `CaseAsset.captionMd`
- `CaseAsset.displayOrder`
- `QuestionPrompt.promptMd`
- `CaseQuestion.answerMd`

There is no later semantic conversion model.

## Image replacement

**Replace image** accepts local JPEG/PNG only. The reviewer:

1. validates the selected MIME and image magic bytes;
2. enforces the current production per-image byte limit;
3. keeps the existing manifest media path;
4. replaces the in-memory media bytes;
5. updates manifest MIME/original filename;
6. recomputes SHA-256;
7. records `human_replacement` as extraction method;
8. moves the Asset to `needs_review`.

No recompression or image-quality reduction is performed.

## Local persistence

Browser persistence uses IndexedDB keyed by `bundleId`. It stores the edited manifest, review map, and learner media replacements. This protects against accidental tab/window closure.

Browser persistence is not the portable audit record. Use **Export Reviewed Bundle** for durable transfer/backup.

## Reviewed bundle export

```text
<batch>-reviewed.zip
├── manifest.json
├── media/
├── review-map.json
└── source-previews/
```

This preserves human edits, source evidence, review states, warnings, rejected metadata, unresolved-candidate history, and source coverage.

## Finalization rules

Finalization is deterministic and fail-closed. It performs no medical reasoning, taxonomy inference, Prompt rewriting, answer rewriting, or ID regeneration.

Every Case must be `approved` or `rejected`. Every unresolved candidate must have been promoted/resolved or rejected. Approved Cases require valid production fields, approved child Assets/Questions, non-blocking metadata, valid references, and matching media hashes/MIME.

Selection keeps only approved Cases and their required dependency closure:

```text
holding/required Topics
approved Cases
CaseAssets referenced by approved Cases
Assets referenced by those CaseAssets
CaseQuestions referenced by approved Cases
QuestionPrompts referenced by those CaseQuestions
```

Rejected Cases and orphaned entities/media are pruned only after actual references are evaluated.

The output is exactly:

```text
flashcards-import-v1.zip
├── manifest.json
└── media/
```

The writer uses ZIP **stored** entries (compression method 0), no encryption, no data descriptors, unique safe paths, and `manifest.json` at root. This deliberately fits the current production parser's strict ZIP behavior.

Browser-side limits are pinned to the production constants and regression-tested against the real exports. The mandatory compatibility test finalizes a fully reviewed bundle and then calls the repository's real `parseImportPackage()` on the resulting bytes.

## CLI

For automation/testing:

```bash
npm run slide-review:finalize -- reviewed.zip [output.zip]
```

The CLI uses the same finalizer core as the browser and then runs the real current `parseImportPackage()` before writing the output.

## Recovery from a failure

Finalization errors are grouped and actionable. Fix the reviewed content rather than bypassing validation. Examples include:

- Case still pending/needs review;
- unresolved question still open;
- blank Prompt/answer/title;
- unapproved Asset or Question;
- blocking warning;
- missing media;
- SHA-256 mismatch;
- JPEG/PNG MIME mismatch;
- image too large;
- broken Case/Topic/Asset/Prompt relationship;
- duplicate package-local ID;
- manifest/package size violation.

If the final stored ZIP exceeds the current compressed archive limit, split the review batch. The tool does not silently degrade images to fit.

## Non-goals

This tool does not implement PPTX/PDF extraction, OCR, medical AI/correction, automatic taxonomy, Tags, Shared Questions, additional Study Topics, alternative stimulus groups, Image Collections, cross-Case deduplication, hosted review infrastructure, production Admin routes, or database schema changes.
