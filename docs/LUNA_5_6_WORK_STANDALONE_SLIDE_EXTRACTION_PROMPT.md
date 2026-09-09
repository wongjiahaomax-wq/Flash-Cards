# Flash-Cards — Standalone Slide Extraction Prompt for GPT-5.6 Luna in Work

## TASK

You are the semantic extraction and source-reconstruction layer for a medical Flash-Cards workflow.

Convert the raw teaching source file(s) attached to this Work task directly into a **Reviewable Import Bundle**.

You have **no repository access** and must **not require any preprocessing**. Treat this prompt as the complete contract.

You may receive:
- PowerPoint `.pptx`;
- PDF;
- Word `.docx` containing slide screenshots/images;
- individual slide/page images;
- or a logical batch containing more than one of these.

Use the source files directly. Do not ask the user to run Slide Prep, export images, extract XML, create contact sheets, or provide repository files.

If one extraction method is unavailable, use the best available fallback and continue. Preserve uncertainty explicitly rather than failing the whole batch.

Do not browse the web to supplement or correct the teaching material.

---

# 1. REQUIRED OUTPUT

Produce one ZIP per logical source batch:

```text
<batch-name>-review.zip
│
├── manifest.json
│
├── media/
│   ├── case-001-image-01.png
│   ├── case-001-image-02.jpg
│   └── ...
├── review-map.json
└── source-previews/
    ├── source-001-page-0001.jpg
    ├── source-001-page-0002.jpg
    └── ...
```

Do NOT generate `preview.html`.

Do NOT include the original source files inside the review ZIP unless explicitly requested.

The ZIP is for human review. It is not itself the final production import ZIP.

The eventual production package will contain only:

```text
manifest.json
media/
```

Therefore `manifest.json` must already contain the actual production-shaped content being proposed for approval. `review-map.json` is provenance/review metadata only.

At completion, return the ZIP file(s) plus the summary specified near the end of this prompt.

---

# 2. CORE PRINCIPLE

> Faithfully reconstruct the source Case first. Curate and normalise it later.

The source material is authoritative for this extraction task.

Do NOT silently:
- add medical knowledge;
- complete missing answers;
- correct suspected errors;
- update guidelines;
- modernise terminology;
- infer additional investigations or management;
- reconcile contradictions using outside knowledge;
- merge similar Cases;
- deduplicate prompts or assets across Cases;
- solve final Topic taxonomy.

If the source is incorrect, outdated, inconsistent, incomplete, unreadable, or ambiguous:
1. preserve what the source supports;
2. add structured review warnings;
3. continue with the rest of the batch.

Partial reconstruction with explicit uncertainty is preferable to invented certainty.

---

# 3. DEFAULT CONTENT MODEL

Create exactly one temporary holding Topic per logical batch:

```text
Imported — <batch name> — Unsorted
```

Use a deterministic safe slug such as:

```text
imported-eye-ent-2026-unsorted
```

Default structure:

```text
Temporary holding Topic
└── Case
    ├── optional vignette
    ├── zero or more fixed learner images
    └── one or more Case Questions
```

Do NOT automatically create:
- Tags;
- Shared Questions;
- Additional Study Topics;
- alternative stimulus groups;
- stimulus-group questions;
- stimulus-option questions;
- Image Collections;
- Topic Questions.

All emitted Cases must use:
```json
"primaryTopicId": "topic-unsorted",
"secondaryTopicIds": [],
"questionSelectionMode": "all"
```

Do not include `questionCount`.

If a likely clinical Topic would help later curation, write it only in the Case `reviewNotes`, for example:

```text
Suggested later clinical Topic: Central Retinal Artery Occlusion
```

It has no production authority.

---

# 4. PACKAGE-LOCAL IDS

Use stable, readable, globally unique package-local IDs.

Recommended pattern:

```text
topic-unsorted

case-001
case-002
case-003

asset-001-01
asset-001-02

case-asset-001-01
case-asset-001-02

prompt-001-01
prompt-001-02

case-question-001-01
case-question-001-02

unresolved-question-001-03
```

Once assigned, do not renumber later Cases merely because an earlier Case is uncertain or rejected.

Use only conservative ASCII IDs. Avoid spaces.

Use a safe package ID such as:

```text
eye-ent-2026-review-001
```

---

# 5. EXACT `manifest.json` CONTRACT FOR THIS WORKFLOW

Top level must be exactly:

```json
{
  "version": 1,
  "packageId": "batch-review-001",
  "topics": [],
  "cases": [],
  "assets": [],
  "caseAssets": [],
  "questionPrompts": [],
  "caseQuestions": [],
  "topicQuestions": []
}
```

Do not add top-level fields.

For this workflow:
```json
"topicQuestions": []
```

Use only `"operation": "create"`.

Do not add `applicationId`.

## 5.1 Topic

Use this shape:

```json
{
  "id": "topic-unsorted",
  "operation": "create",
  "name": "Imported — EYE ENT 2026 — Unsorted",
  "slug": "imported-eye-ent-2026-unsorted",
  "descriptionMd": null,
  "parentTopicId": null,
  "isActive": true
}
```

Allowed keys are only:
```text
id
operation
name
slug
descriptionMd
parentTopicId
isActive
```

## 5.2 Case

Use this shape:

```json
{
  "id": "case-001",
  "operation": "create",
  "title": "Central retinal artery occlusion",
  "vignetteMd": "A 38-year-old woman presents with sudden painless loss of vision...",
  "primaryTopicId": "topic-unsorted",
  "secondaryTopicIds": [],
  "questionSelectionMode": "all",
  "isActive": true
}
```

Allowed keys are only:
```text
id
operation
title
vignetteMd
primaryTopicId
secondaryTopicIds
questionSelectionMode
isActive
```

`vignetteMd` may be `null` when the source Case genuinely has no vignette.

The Case title is Admin-facing and may contain the diagnosis.

The learner-facing vignette must not reveal an answer unless the source genuinely presents that information before the question.

## 5.3 Asset

Use:

```json
{
  "id": "asset-001-01",
  "operation": "create",
  "path": "media/case-001-image-01.png",
  "mimeType": "image/png",
  "originalFilename": "Fundoscopy image",
  "altText": "Fundus photograph used in the clinical case",
  "sourceLabel": null,
  "sourceUrl": null,
  "licence": null,
  "isActive": true
}
```

Allowed keys are only:
```text
id
operation
path
mimeType
originalFilename
altText
sourceLabel
sourceUrl
licence
isActive
```

Requirements:
- actual file must exist at `path`;
- only `image/jpeg` or `image/png`;
- every image must be <= 5 MiB;
- `altText` must be non-empty;
- learner-facing alt text must not reveal the answer;
- do not invent provenance.

If no explicit source provenance exists:
```json
"sourceLabel": null,
"sourceUrl": null,
"licence": null
```

## 5.4 CaseAsset

Use:

```json
{
  "id": "case-asset-001-01",
  "operation": "create",
  "caseId": "case-001",
  "assetId": "asset-001-01",
  "displayOrder": 0,
  "captionMd": null
}
```

Allowed keys are only:
```text
id
operation
caseId
assetId
displayOrder
captionMd
```

`displayOrder` must be a non-negative integer.

Preserve the intended image order from the source.

## 5.5 QuestionPrompt

Use:

```json
{
  "id": "prompt-001-01",
  "operation": "create",
  "promptMd": "What is the diagnosis?",
  "isActive": true
}
```

Allowed keys are only:
```text
id
operation
promptMd
isActive
```

The prompt contains wording only. Do not put the answer into the prompt.

Create separate prompts per Case even if wording is identical across Cases.

## 5.6 CaseQuestion

Use:

```json
{
  "id": "case-question-001-01",
  "operation": "create",
  "caseId": "case-001",
  "questionPromptId": "prompt-001-01",
  "answerMd": "Central retinal artery occlusion.",
  "isActive": true
}
```

Allowed keys are only:
```text
id
operation
caseId
questionPromptId
answerMd
isActive
```

Every emitted CaseQuestion must have a non-empty, source-supported answer.

Never use placeholder answers such as:
```text
Unknown
TODO
Needs review
Not provided
```

If the answer cannot be established, do not emit the Prompt/CaseQuestion pair into `manifest.json`; use `unresolvedQuestions[]` in `review-map.json` instead.

---

# 6. CASE RECONSTRUCTION

Do NOT assume one slide/page equals one Case.

A Case may span:

```text
question slide
→ answer slide
```

or:

```text
question slide
→ answer slide
→ explanation slide
```

or:

```text
vignette + image + questions
→ same slide with answers added
```

or:

```text
vignette
→ investigation
→ questions
→ answers
```

Use the complete source sequence and all available evidence:
- slide/page order;
- headings;
- case/question numbering;
- repeated vignette;
- repeated image;
- repeated question wording;
- answer additions;
- text position and formatting;
- colour;
- tables;
- diagrams;
- speaker notes when available;
- section transitions.

Colour is evidence but is never sufficient by itself to define a Case boundary.

When uncertain:
- make the best source-supported reconstruction;
- set `reviewStatus` to `needs_review`;
- lower confidence appropriately;
- add `uncertain_case_boundary` or another specific warning.

Do not silently guess.

---

# 7. DIRECT RAW-FILE HANDLING — NO PREPROCESSING

## PowerPoint `.pptx`

Work directly from the original presentation.

Inspect, where accessible:
- rendered slide appearance;
- slide order;
- visible text;
- tables;
- charts;
- embedded images;
- shapes and annotations;
- text colour/formatting;
- speaker notes;
- source attribution.

Render every slide into `source-previews/`.

Do not rely only on raw `ppt/media` images because educational meaning may depend on PowerPoint composition.

When a learner stimulus is a clean embedded image and the slide adds no required visual context, prefer the embedded original.

When layout, labels, tables, or multiple elements form one educational stimulus, use a crop or rendered composite.

If speaker notes are not accessible in the current environment, continue without them and add an appropriate warning only when their absence creates material uncertainty.

## PDF

Prefer native/selectable text when available.

Render every page into `source-previews/`.

Use the rendered page for visual interpretation and crops.

Use OCR only when necessary because the text cannot otherwise be read reliably.

## DOCX containing slide screenshots

Treat the slide screenshots/images in document order as the source slide sequence.

Do not treat surrounding Word layout, page headers, or document chrome as learner content.

Render/extract each source slide screenshot into `source-previews/`.

If multiple screenshots clearly represent separate slides, assign each a sequential source page number.

If one screenshot is split across Word pages or duplicated, reconstruct conservatively and document the issue in source coverage.

## Individual slide images

Treat each image as one source page in the supplied order.

Copy or render each into `source-previews/` using the standard naming convention.

---

# 8. VIGNETTES

Extract the learner-facing clinical stem.

Minor wording cleanup is allowed when it preserves meaning, for example:

```text
38yo lady presents...
```

may become:

```text
A 38-year-old woman presents...
```

Do not add:
- diagnosis;
- answer text;
- teaching explanation;
- marks;
- source attribution;
- boilerplate.

If wording is materially cleaned or condensed, preserve the original wording in the Case `reviewNotes`.

---

# 9. QUESTIONS AND ANSWERS

Treat explicit source questions as Case Questions by default.

Map each question to its answer using source evidence.

Answers may incorporate source-supported explanatory content when it is clearly intended as the answer/explanation to that question, but do not add outside knowledge.

Preserve clinically meaningful lists, distinctions, thresholds, or wording from the source.

Do not silently resolve a contradiction between visible slide content and speaker notes or another slide. Flag it.

## Examination marks

Source:
```text
Describe 2 fundoscopy findings (2 marks)
```

Learner prompt may become:
```text
Describe two fundoscopy findings.
```

Record the original wording in the question review `reviewNotes`.

Do not expose marks unless the marks themselves are pedagogically meaningful.

## Missing answer

If a source question has no reliable answer:
- do not create its QuestionPrompt or CaseQuestion in the manifest;
- add it to `review-map.json.unresolvedQuestions`;
- use a blocking `missing_answer` warning.

---

# 10. LEARNER IMAGES

All learner-facing images in this ingestion workflow are fixed Case Assets.

Do NOT create stimulus groups.

A Case may have:
- no learner image;
- one learner image;
- multiple learner images.

If a Case contains ECG + CXR + clinical photograph, create three Assets and three CaseAssets in source display order.

## Educational asset boundaries

PowerPoint object boundaries are not automatically learner Asset boundaries.

Keep one composite Asset where layout matters, including:
- A/B comparison panels;
- labelled multi-panel figures;
- PowerPoint-built lab tables;
- graphs assembled from shapes;
- paired images explicitly compared by a question.

Use separate Assets when the images are genuinely independent stimuli.

Record a non-obvious choice in the asset or Case `reviewNotes`.

## Extraction method

For each learner Asset, use one of:

```text
embedded_original
crop
rendered_composite
```

Use `null` only if the extraction method genuinely cannot be determined.

Prefer `embedded_original` when it is:
- clean;
- complete;
- high quality;
- unannotated;
- free of answer leakage.

Use `crop` or `rendered_composite` when educational layout or slide-built content must be preserved.

---

# 11. ANSWER LEAKAGE — BLOCKING REQUIREMENT

If:

```text
question slide:
unannotated ECG

answer slide:
same ECG + arrows + diagnosis
```

the learner Asset must come from the unannotated question-side version.

Never expose answer-only:
- diagnosis labels;
- arrows;
- highlights;
- circles;
- coloured answer annotations;
- explanatory overlays;
- answer tables.

If you cannot confidently determine that the learner Asset is clean, add:

```json
{
  "code": "possible_answer_leakage",
  "severity": "blocking",
  "message": "..."
}
```

and set the affected record to `needs_review`.

Do not conceal this uncertainty.

---

# 12. TABLES

Distinguish:

```text
learner stimulus table
```

from:

```text
answer/explanation table
```

A lab results table needed to answer the Case may become learner media.

A table that appears only during the answer phase and reveals diagnosis, management, differential, or explanation should normally inform `answerMd`, not become learner media.

If a table is visually complex and cannot be reconstructed faithfully, preserve a source preview and add `complex_table`.

---

# 13. SOURCE PREVIEWS

Create one preview for every source slide/page.

Naming:

```text
source-previews/source-001-page-0001.jpg
source-previews/source-001-page-0002.jpg
...
```

Use JPEG previews unless there is a compelling reason otherwise.

They must be legible enough for a human reviewer to inspect:
- text;
- images;
- annotations;
- layout;
- answer additions.

Source previews are review evidence, not learner Assets.

Every source page must have exactly one source-coverage row.

No source page may silently disappear.

---

# 14. EXACT `review-map.json` CONTRACT

`review-map.json` is strict.

Do not add fields not listed below.

Top level:

```json
{
  "version": 1,
  "bundleId": "bundle-001",
  "batchName": "Human-readable batch name",
  "sourceFiles": [],
  "cases": [],
  "sourceCoverage": [],
  "unresolvedQuestions": [],
  "batchWarnings": []
}
```

All eight top-level keys are required.

## 14.1 Common values

Review status may be:
```text
pending
approved
needs_review
rejected
```

For initial AI output, use only:
```text
pending
needs_review
```

Never set `approved`.

Confidence must be exactly:
```text
high
medium
low
```

Warning severity must be exactly:
```text
blocking
warning
info
```

Warning object must be exactly:

```json
{
  "code": "missing_answer",
  "severity": "blocking",
  "message": "No reliable answer was found in the supplied source material."
}
```

No extra warning keys.

Source reference must be exactly:

```json
{
  "sourceId": "source-001",
  "pages": [3, 4]
}
```

`pages` contains integers >= 1.

## 14.2 `sourceFiles[]`

Use:

```json
{
  "sourceId": "source-001",
  "filename": "EYE ENT Slides.pdf",
  "repository": null,
  "path": null,
  "ref": null,
  "pageCount": 60
}
```

Allowed keys only:
```text
sourceId
filename
repository
path
ref
pageCount
```

Required:
```text
sourceId
filename
pageCount
```

For this standalone workflow, normally set:
```json
"repository": null,
"path": null,
"ref": null
```

Do not add `type`.

Do not create a nested repository object.

## 14.3 `cases[]`

Use:

```json
{
  "caseId": "case-001",
  "reviewStatus": "pending",
  "confidence": "high",
  "warnings": [],
  "sourceRefs": [
    {
      "sourceId": "source-001",
      "pages": [3, 4]
    }
  ],
  "caseBoundaryNotes": "Question slide followed by matching answer slide.",
  "assets": [],
  "questions": [],
  "reviewNotes": [
    "Suggested later clinical Topic: Central Retinal Artery Occlusion"
  ]
}
```

Allowed keys only:
```text
caseId
reviewStatus
confidence
warnings
sourceRefs
caseBoundaryNotes
assets
questions
reviewNotes
```

Required:
```text
caseId
reviewStatus
confidence
warnings
sourceRefs
assets
questions
reviewNotes
```

`caseBoundaryNotes` may be a non-empty string or `null`.

## 14.4 `assets[]` inside each Case review

Use:

```json
{
  "assetId": "asset-001-01",
  "reviewStatus": "pending",
  "confidence": "high",
  "warnings": [],
  "sourceRefs": [
    {
      "sourceId": "source-001",
      "pages": [3]
    }
  ],
  "extractionMethod": "embedded_original",
  "sha256": "<actual SHA-256 of learner media bytes>",
  "reviewNotes": []
}
```

Allowed and required keys are exactly:
```text
assetId
reviewStatus
confidence
warnings
sourceRefs
extractionMethod
sha256
reviewNotes
```

`extractionMethod` and `sha256` may be `null`, but compute a real SHA-256 whenever the Asset file exists.

Do NOT add `caseAssetId`.

## 14.5 `questions[]` inside each Case review

Use:

```json
{
  "caseQuestionId": "case-question-001-01",
  "reviewStatus": "pending",
  "confidence": "high",
  "warnings": [],
  "promptSourceRefs": [
    {
      "sourceId": "source-001",
      "pages": [3]
    }
  ],
  "answerSourceRefs": [
    {
      "sourceId": "source-001",
      "pages": [4]
    }
  ],
  "reviewNotes": [
    "Original source wording: Describe 2 fundoscopy findings (2 marks)"
  ]
}
```

Allowed and required keys are exactly:
```text
caseQuestionId
reviewStatus
confidence
warnings
promptSourceRefs
answerSourceRefs
reviewNotes
```

Do NOT add:
```text
questionPromptId
sourcePrompt
```

The linked QuestionPrompt is resolved through the manifest.

## 14.6 `unresolvedQuestions[]`

Use exactly:

```json
{
  "candidateId": "unresolved-question-001-03",
  "caseId": "case-001",
  "sourcePrompt": "What investigation would you perform next?",
  "proposedPrompt": "What investigation would you perform next?",
  "promptSourceRefs": [
    {
      "sourceId": "source-001",
      "pages": [17]
    }
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

Allowed and required keys are exactly:
```text
candidateId
caseId
sourcePrompt
proposedPrompt
promptSourceRefs
answerSourceRefs
reviewStatus
confidence
warnings
reviewNotes
resolvedQuestionPromptId
resolvedCaseQuestionId
```

`sourcePrompt` may be `null` only when the original wording genuinely cannot be recovered.

For initial extraction:
```json
"resolvedQuestionPromptId": null,
"resolvedCaseQuestionId": null
```

## 14.7 `sourceCoverage[]`

Every source page must have exactly one row:

```json
{
  "sourceId": "source-001",
  "page": 3,
  "classification": "case",
  "caseIds": ["case-001"],
  "notes": null,
  "previewPath": "source-previews/source-001-page-0003.jpg"
}
```

Allowed and required keys are exactly:
```text
sourceId
page
classification
caseIds
notes
previewPath
```

`notes` and `previewPath` may be `null`, but when a preview file exists use its actual path.

Use a stable classification vocabulary:

```text
case
title_slide
section_heading
reference_material
teaching_summary
answer_continuation
administrative
source_attribution
duplicate
uncertain
other
```

Do not create duplicate `(sourceId, page)` rows.

A source page may reference more than one Case in the single row only when genuinely necessary.

## 14.8 `batchWarnings[]`

Use the same exact warning object:

```json
{
  "code": "other",
  "severity": "warning",
  "message": "..."
}
```

Useful warning codes include:

```text
missing_answer
uncertain_case_boundary
uncertain_title
uncertain_stimulus
possible_answer_leakage
complex_table
source_medical_inconsistency
possible_duplicate_case
possible_duplicate_image
unresolved_provenance
source_content_omitted
other
```

Codes are conventions, not a closed enum. Prefer these established codes when they fit.

---

# 15. PROVENANCE

Do not invent:
- source URL;
- publisher;
- licence;
- image origin.

If slide text or speaker notes explicitly provide attribution, preserve it in the Asset manifest fields when it clearly applies to that learner Asset.

Otherwise use `null`.

---

# 16. BOILERPLATE

Do not convert repeated non-educational material into learner content.

Examples:
- slide numbers;
- institution logos;
- repeated confidentiality labels;
- repeated footer text;
- presenter names;
- course branding;
- copyright footer.

These remain visible in source previews where present but should not normally enter vignette, prompts, answers, or learner media.

---

# 17. NO AGGRESSIVE DEDUPLICATION

During extraction:
- do not merge Cases because they look similar;
- do not share learner Assets between Cases merely because the same image appears;
- do not reuse QuestionPrompt records across Cases;
- do not create Shared Questions.

If something appears duplicated, preserve source fidelity and add a warning or review note.

Normalisation happens later.

---

# 18. SIZE / FORMAT CONSTRAINTS

Design the production-shaped `manifest.json` + `media/` subset so it can satisfy:

```text
final production ZIP compressed size: <= 25 MiB
final production uncompressed size: <= 40 MiB
final production archive entries: <= 256
manifest.json: <= 2 MiB
each learner image: <= 5 MiB
learner image formats: JPEG or PNG only
```

The review ZIP also contains source previews, so its total size may be larger than the eventual production ZIP. Do not degrade diagnostically meaningful learner images unnecessarily.

If one logical source batch cannot reasonably fit the production constraints, split it into multiple logically named review bundles and report that split clearly.

---

# 19. VALIDATION BEFORE RETURNING THE ZIP

Perform these checks before completion.

## Manifest integrity

Confirm:
- `version` is exactly `1`;
- all required top-level collections exist;
- exactly one holding Topic exists per bundle;
- all package-local IDs are globally unique;
- every Case references the holding Topic;
- every Case has `secondaryTopicIds: []`;
- every Case has `questionSelectionMode: "all"`;
- no Case has `questionCount`;
- every CaseAsset references an existing Case and Asset;
- every CaseQuestion references an existing Case and QuestionPrompt;
- `topicQuestions` is `[]`;
- every emitted created CaseQuestion has a non-empty answer;
- no unsupported fields have been added.

## Media integrity

Confirm:
- every declared Asset path exists;
- every learner Asset is valid JPEG/PNG;
- declared MIME type matches actual bytes;
- every learner Asset is <= 5 MiB;
- alt text is non-empty;
- alt text does not reveal the answer;
- answer-side annotations are not exposed;
- review-map SHA-256 matches actual learner media bytes.

## Review-map integrity

Confirm:
- all required fields are present;
- no unknown fields are present;
- initial statuses are only `pending` or `needs_review`;
- confidence is only `high`, `medium`, or `low`;
- warning severity is only `blocking`, `warning`, or `info`;
- every Case review points to a manifest Case;
- every Asset review points to a manifest Asset;
- every Question review points to a manifest CaseQuestion;
- unresolved questions are not also emitted as manifest questions.

## Source integrity

Confirm:
- every source slide/page has a preview;
- every source slide/page has exactly one sourceCoverage row;
- every Case is traceable to source page(s);
- every emitted answer is traceable to source evidence;
- every learner image is traceable to source evidence;
- no unresolved medical answer was invented.

---

# 20. STOP / ESCALATE CONDITIONS

Do not guess when:
- Case boundaries are genuinely indeterminate;
- a question cannot be matched to an answer;
- an answer is absent;
- visible material contradicts speaker notes;
- image annotations may reveal the answer;
- a meaningful learner image cannot be extracted safely;
- a complex table cannot be reconstructed faithfully;
- a slide/page is unreadable;
- source relationships are unclear.

Instead:
```text
preserve evidence
+ flag uncertainty
+ continue with the remainder of the batch
```

A blocking warning does not mean stop processing the rest of the source. It means the affected item requires human reconciliation before approval.

---

# 21. REQUIRED COMPLETION SUMMARY

After creating the ZIP, report:

```text
Batch:
Source files:
Source slides/pages:

Candidate Cases:

Cases without learner images:
Cases with one learner image:
Cases with multiple learner images:

Learner Assets:
Manifest Case Questions:
Unresolved questions held outside manifest:

Cases needing review:
Missing answers:
Possible answer leakage:
Uncertain Case boundaries:
Other blocking warnings:

Source pages accounted for:
Unresolved source pages:
```

Also list the generated review ZIP file(s).

Do not call any Case approved.

Do not give a long narrative unless there is a material blocking issue.

---

# 22. EXECUTION PRIORITY

When processing the source, prioritise work in this order:

1. establish source page order and render previews;
2. reconstruct Case boundaries;
3. extract vignette/questions/answers;
4. identify clean learner images;
5. build production-shaped manifest records;
6. build strict review/provenance records;
7. compute SHA-256 for learner media;
8. verify source coverage;
9. validate cross-references and package constraints;
10. return the completed review ZIP and summary.

Do not stop to ask for repository access, schemas, preprocessing, or manual extraction.

The governing principle is:

> AI reconstructs. Human approves. Deterministic code validates. The existing importer writes production.
