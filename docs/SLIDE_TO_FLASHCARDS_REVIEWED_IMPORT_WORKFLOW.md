# Slide-to-Flash-Cards Reviewed Import Workflow

_Status: local review/finalization layer implemented in draft PR #53; ChatGPT source reconstruction remains a separate workflow._

_Last updated: 19 August 2026._

## 1. Purpose and boundary

Teaching material will often arrive as unstructured PPTX/PDF slides containing vignettes, images, question/answer slides, multi-slide Cases, tables and non-Case teaching material.

The application does **not** attempt to interpret arbitrary slides itself. The governing architecture remains:

> **ChatGPT reconstructs → human reviews the actual proposed manifest → deterministic code finalizes → existing importer writes production.**

There is one semantic AI step only. The local reviewer/finalizer performs no medical reasoning, source interpretation, taxonomy inference, Prompt rewriting or answer rewriting.

This implementation does **not** implement PPTX/PDF extraction, OCR or the ChatGPT reconstruction step.

## 2. Architecture

```text
Original PPTX / PDF
        ↓
      ChatGPT
        ↓
Reviewable Import Bundle
├── manifest.json
├── media/
├── review-map.json
└── source-previews/
        ↓
Reusable Local Review Previewer
        ↓
Reviewed Import Bundle
        ↓
Deterministic Finalizer
        ↓
flashcards-import-v1.zip
├── manifest.json
└── media/
        ↓
Existing Admin Importer
```

The core invariant is:

> **The manifest content the human approves is the content that the production importer receives.**

The proposed-import panel edits the actual in-memory Import Package-shaped manifest. There is no duplicate candidate content model and no second semantic conversion.

## 3. Implemented local tool

The reusable local tooling lives under:

```text
tools/slide-import-review/
├── index.template.html
├── README.md
├── schemas/
│   └── review-map-v1.schema.json
├── scripts/
│   ├── build.mjs
│   └── finalize.mjs
├── src/
│   ├── app.js
│   ├── core.js
│   └── core-v2.js
└── tests/
    └── core.test.js
```

Build once from the repository root:

```bash
npm run slide-review:build
```

Then open:

```text
tools/slide-import-review/dist/index.html
```

The build produces a standalone local HTML application. Routine review does not require Cloudflare, D1, R2, GitHub Pages, an internet connection, a hosted backend, or a development server.

Available package scripts are:

```bash
npm run slide-review:build
npm run slide-review:test
npm run slide-review:finalize -- reviewed.zip [output.zip]
```

No new npm dependency is required for the reviewer/finalizer.

## 4. Review bundle

The reviewer consumes:

```text
<batch>-review.zip
├── manifest.json
├── media/
├── review-map.json
└── source-previews/
```

This ZIP is intentionally **not** a production Import Package. Review-only paths remain rejected by the existing production parser.

The browser reads the ZIP selected or dropped by the user through File APIs. It does not fetch sibling files under `file://`, upload bundle contents, or automatically fetch `Asset.sourceUrl`.

## 5. Production-shaped manifest profile

The current Import Package v1 validator remains authoritative and is not weakened by this workflow.

Slide ingestion deliberately uses a conservative subset:

```text
one holding Topic
created Cases
created Assets
created CaseAssets
created QuestionPrompts
created CaseQuestions
topicQuestions = []
```

Created slide-derived Cases normally use:

```json
{
  "questionSelectionMode": "all",
  "secondaryTopicIds": []
}
```

All slide-ingested learner images initially remain fixed Case Assets and preserve source order through `caseAssets.displayOrder`.

The reviewer does not expose automatic taxonomy, Tags, Shared Questions, Additional Study Topics, alternative stimulus groups or Image Collections.

## 6. Review-map v1 contract

The machine-readable contract is frozen at:

```text
tools/slide-import-review/schemas/review-map-v1.schema.json
```

The browser/runtime validator in `src/core-v2.js` is also strict: unsupported versions, enum values, unknown object keys, duplicate identifiers and broken references fail with an explicit error rather than being coerced.

Top level:

```json
{
  "version": 1,
  "bundleId": "bundle-001",
  "batchName": "SHP Eye/ENT 2026",
  "sourceFiles": [],
  "cases": [],
  "sourceCoverage": [],
  "unresolvedQuestions": [],
  "batchWarnings": []
}
```

### Review states

Exactly:

```text
pending
approved
needs_review
rejected
```

AI-generated material should arrive `pending` or `needs_review`. Human review changes it to `approved` or `rejected`.

### Confidence

Exactly:

```text
high
medium
low
```

Confidence remains review metadata and is never copied into the production manifest.

### Warnings

Shape:

```json
{
  "code": "missing_answer",
  "severity": "blocking",
  "message": "No reliable answer was identified in the source."
}
```

Severity is exactly:

```text
blocking
warning
info
```

Blocking warnings prevent readiness/finalization.

### Source references

```json
{
  "sourceId": "source-001",
  "pages": [17, 18]
}
```

References are validated against `sourceFiles[]`.

### Source files

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

Repository/path/ref may be null. `pageCount` must be positive.

### Case review record

```json
{
  "caseId": "case-001",
  "reviewStatus": "pending",
  "confidence": "high",
  "warnings": [],
  "sourceRefs": [{ "sourceId": "source-001", "pages": [1, 2] }],
  "caseBoundaryNotes": "Page 1 question; page 2 answer.",
  "assets": [],
  "questions": [],
  "reviewNotes": []
}
```

`caseId` must reference an actual manifest Case.

### Asset review record

```json
{
  "assetId": "asset-001-01",
  "reviewStatus": "pending",
  "confidence": "high",
  "warnings": [],
  "sourceRefs": [{ "sourceId": "source-001", "pages": [1] }],
  "extractionMethod": "embedded_original",
  "sha256": "...",
  "reviewNotes": []
}
```

The SHA-256 records the exact learner media bytes being reviewed.

### Emitted Question review record

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

The `CaseQuestion` points to its production `QuestionPrompt` through the manifest relationship.

## 7. Unresolved source questions

The production Import Package validator requires every created Case Question to have a non-empty answer. Therefore a source question with no reliable answer must **not** appear as an invalid `caseQuestions[]` record.

It remains in `review-map.json`:

```json
{
  "candidateId": "unresolved-question-001-03",
  "caseId": "case-001",
  "sourcePrompt": "What investigation would you perform next?",
  "proposedPrompt": "What investigation would you perform next?",
  "promptSourceRefs": [
    { "sourceId": "source-001", "pages": [17] }
  ],
  "answerSourceRefs": [],
  "reviewStatus": "needs_review",
  "confidence": "low",
  "warnings": [
    {
      "code": "missing_answer",
      "severity": "blocking",
      "message": "No reliable answer was found in the supplied source material."
    }
  ],
  "reviewNotes": [],
  "resolvedQuestionPromptId": null,
  "resolvedCaseQuestionId": null
}
```

### Resolving

The reviewer supplies a non-empty Prompt and answer and chooses **Create Prompt + Case Question**.

The implementation creates actual manifest objects deterministically:

```text
QuestionPrompt ID  = resolved-prompt:<candidateId>
CaseQuestion ID    = resolved-case-question:<candidateId>
```

No AI is called. The candidate remains in review history and is updated with the new manifest IDs. The newly emitted Question begins `pending` and must itself be approved.

### Rejecting

Rejecting an unresolved question sets:

```text
reviewStatus = rejected
```

No Prompt or Case Question is created. The candidate remains in editorial history and is no longer a finalization blocker.

An unresolved candidate that remains `pending` or `needs_review` blocks finalization.

## 8. Review UI

The primary view is side-by-side:

```text
┌─────────────────────────────┬─────────────────────────────┐
│ ORIGINAL SOURCE             │ PROPOSED IMPORT             │
│ source thumbnails           │ Admin-only title            │
│ selected source page        │ vignette                    │
│ evidence / warnings         │ fixed learner images        │
│                             │ Case Questions              │
│                             │ reveal answers              │
└─────────────────────────────┴─────────────────────────────┘
```

The proposed-import side renders from the current in-memory manifest.

Implemented navigation includes Previous/Next, Case position, review status, filters/counts and keyboard shortcuts:

```text
A             approve
R             needs review
X             reject
Left Arrow    previous Case
Right Arrow   next Case
Space         reveal/hide answers
```

Shortcuts are ignored while focus is inside an input, textarea, select or contenteditable element.

Answers are hidden by default and the Case title is clearly identified as Admin-only.

## 9. Direct manifest editing

The reviewer directly edits:

```text
Case.title
Case.vignetteMd
Asset.originalFilename
Asset.altText
Asset.sourceLabel
Asset.sourceUrl
Asset.licence
CaseAsset.captionMd
CaseAsset.displayOrder
QuestionPrompt.promptMd
CaseQuestion.answerMd
```

These are the actual manifest fields later finalized. There is no post-review semantic conversion.

## 10. Image review and replacement

Each learner Asset is shown as the actual learner-facing image together with source references, extraction method, confidence, warnings and SHA-256 state.

Replacement workflow:

```text
Replace image
→ select local JPEG/PNG
→ verify file size and magic bytes
→ keep manifest media path
→ replace exact bytes
→ update manifest MIME/original filename
→ recompute SHA-256
→ mark extractionMethod = human_replacement
→ move Asset to needs_review
```

The current production per-image limit is enforced. The tool does not silently recompress, resize or degrade diagnostically meaningful images.

`Asset.altText` is directly editable. A `possible_answer_leakage` warning remains visually prominent and blocking when marked blocking.

## 11. Case/component review semantics

Review status is represented independently for:

```text
Cases
Assets
emitted Questions
unresolved Questions
```

A clean Case approval may approve clean child Asset/Question records, but blocking warnings are never overridden automatically.

A rejected Case remains represented in `review-map.json` editorial history but is excluded from the production output.

At finalization the dependency selector removes the rejected Case plus relationships/entities/media no longer referenced by approved Cases. References are evaluated before pruning; referenced entities are not deleted merely because another Case was rejected.

## 12. Source Coverage

`sourceCoverage[]` accounts for source pages/slides with:

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

The Source Coverage view displays source file, page/slide, classification, linked Cases, notes and preview state, and highlights uncertain/broken coverage conditions.

A referenced preview path must exist in the selected ZIP; broken Case/source references fail validation.

## 13. Local persistence

Review work is persisted in IndexedDB keyed by `bundleId`, including edited manifest/review metadata and replacement learner media.

This protects against accidental page closure, but browser persistence is not the portable source of truth.

Use **Export Reviewed Bundle** for the durable editorial/audit artifact.

## 14. Reviewed bundle export

The explicit export is:

```text
<batch>-reviewed.zip
├── manifest.json
├── media/
├── review-map.json
└── source-previews/
```

It preserves human edits, statuses, warnings, source evidence, rejected metadata, unresolved-question history and source coverage.

## 15. Deterministic finalizer

The browser and CLI use the same finalization core.

Conceptually:

```text
Reviewed Bundle
      ↓
review-state validation
      ↓
dependency selection
      ↓
production-shaped manifest validation
      ↓
media/hash validation
      ↓
ZIP/package-limit validation
      ↓
flashcards-import-v1.zip
```

The finalizer performs no medical interpretation and never regenerates package-local IDs.

It includes only approved Cases and their required dependency closure:

```text
required holding/parent Topics
approved Cases
required CaseAssets
referenced Assets
required CaseQuestions
referenced QuestionPrompts
```

For the slide profile:

```text
topicQuestions = []
```

Rejected Cases, unresolved review candidates, review history and source previews are excluded.

## 16. Finalizer output and ZIP compatibility

Successful output is exactly:

```text
flashcards-import-v1.zip
├── manifest.json
└── media/
```

No other path is emitted.

The ZIP writer deliberately uses the strictest simple compatibility subset supported by the production parser:

```text
compression method 0 (stored)
no encryption
no data descriptors
unique safe paths
root manifest.json
only declared media paths
```

The reviewer does not modify `src/lib/server/import/content-package.js` or weaken any production validation rule.

Browser-safe production constraints are mirrored in the local core and a regression test imports the real production constants so drift fails the test.

Most importantly, the compatibility regression test executes:

```text
valid reviewed bundle
→ deterministic finalizer
→ flashcards-import-v1.zip
→ real current parseImportPackage()
→ succeeds
```

It also checks the current hardened reviewed-package facade.

The CLI additionally invokes the real production parser before writing its output.

## 17. Media validation

Before final output, selected learner media are checked for:

```text
declared path exists
JPEG/PNG only
magic bytes match manifest MIME
per-image size limit
non-empty alt text
matching review SHA-256
```

Only selected declared media are included in the production ZIP. Media belonging exclusively to rejected Cases are pruned.

The reviewed input bundle itself rejects undeclared `media/` paths.

## 18. Referential and package validation

Finalization fails on broken references such as:

```text
Case → missing Topic
CaseAsset → missing Case
CaseAsset → missing Asset
CaseQuestion → missing Case
CaseQuestion → missing QuestionPrompt
```

Package-local IDs must remain unique and syntactically valid.

Current production Import Package limits are mirrored from the actual implementation and regression-tested for drift, including archive bytes, decompressed bytes, entry count, manifest bytes and individual image bytes.

No image is silently degraded to satisfy package limits.

## 19. Fail-closed behavior

Examples that block finalization include:

```text
Case pending / needs_review
unresolved Question pending / needs_review
approved Case missing required production fields
blank created Prompt or answer
unapproved required Asset or Question
blocking warning
missing learner media
SHA-256 mismatch
MIME/magic-byte mismatch
unsupported image format
oversized image
broken reference
duplicate package-local ID
undeclared reviewed media
manifest/package limit violation
production parser incompatibility in regression/CLI validation
```

Errors are shown as actionable grouped failures. The code does not guess a medical or editorial repair.

If a stored final package exceeds the current compressed-size limit, split the review batch rather than reducing image quality automatically.

## 20. Existing production importer remains authoritative

The generated production ZIP is still selected in the existing Admin Import Package v1 workflow and follows its established validation, preview/confirmation and resumable import path.

This local tooling adds an editorial review layer before production import; it does not create a new production Admin route or bypass D1/R2/import safety controls.

## 21. Security

Bundle content is untrusted.

The reviewer does not execute vignette, Prompt, answer, caption, notes, slide text or source attribution as HTML/JavaScript. Dynamic UI text is escaped; no review-bundle source URL is automatically fetched.

All routine bundle handling remains on the local machine.

## 22. Tests

The dedicated suite covers:

```text
review-map v1 and enum validation
broken source/Case/Asset/Question/preview references
duplicate metadata IDs
unresolved-question promotion/rejection
stable deterministic IDs
direct manifest edits
three fixed-image ordering/media finalization
rejected-Case dependency pruning
pending/needs-review blockers
blank Prompt/answer
unapproved Asset
blocking warnings
missing media
hash mismatch
MIME mismatch
unsupported media
oversized image
broken manifest references
duplicate package-local IDs
undeclared media
manifest/package limit failure
reviewed-bundle round trip
production parseImportPackage compatibility
```

The normal repository commands remain part of the acceptance boundary:

```bash
npm run check
npm test
npm run build
```

## 23. Remaining scope

This PR implements the reusable human-review and deterministic-finalization layer only.

Still separate/future work includes:

```text
PPTX extraction
PDF extraction
OCR
ChatGPT source reconstruction orchestration
medical correction
automatic taxonomy
Tags
Shared Questions
Additional Study Topics
alternative stimulus groups
Image Collections
cross-Case deduplication
hosted review infrastructure
```

Therefore the full slide-ingestion pipeline must **not** be described as fully automated or fully implemented merely because the local reviewer/finalizer exists.
