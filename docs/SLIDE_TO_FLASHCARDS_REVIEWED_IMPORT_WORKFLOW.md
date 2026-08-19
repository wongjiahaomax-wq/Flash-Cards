# Slide-to-Flash-Cards Reviewed Import Workflow

_Status: agreed design; not yet implemented._

_Last updated: 19 August 2026._

## 1. Purpose

After the remaining Anki decks are migrated, much of the source teaching material for Flash-Cards will arrive as unstructured PowerPoint/PDF teaching slides.

These slide sets commonly contain:

- clinical vignettes;
- images;
- tables;
- question slides;
- answer slides;
- multi-slide Cases;
- speaker-note material;
- teaching/reference slides that should not become Cases.

The application should **not** attempt to interpret arbitrary teaching slides itself.

Instead, ChatGPT performs the unstructured semantic reconstruction, a human reviews the result locally, and the existing strict Flash-Cards importer remains the production safety boundary.

The guiding principle is:

> **AI interprets the source; the human approves the actual proposed import; deterministic code validates and packages it.**

---

# 2. Final architecture

```text
Original PPTX / PDF
stored as source/reference
        │
        ▼
      ChatGPT
        │
        │ interpret slides
        │ reconstruct Cases
        │ extract/crop learner images
        │
        ▼
Reviewable Import Bundle
├── manifest.json
├── media/
├── review-map.json
└── source-previews/
        │
        ▼
Reusable Local Review Previewer
        │
        │ source vs proposed import
        │ human edits manifest content
        │ approve / reject / flag
        │
        ▼
Reviewed Import Bundle
        │
        ▼
Fixed Finalizer / Validator
        │
        │ validate approval state
        │ validate manifest/media
        │ remove review-only files
        │
        ▼
flashcards-import-v1.zip
├── manifest.json
└── media/
        │
        ▼
Existing Production Admin Importer
        │
        ├── D1 content
        └── R2 teaching images
```

There is only one semantic AI step.

There is no second ChatGPT pass required after human review.

---

# 3. Key design decision: review the final import representation

ChatGPT should construct the content directly in the existing **Flash-Cards Import Package v1 manifest structure**.

The human reviewer therefore reviews the same Case, Asset, Prompt and Case Question content that will ultimately be submitted to the existing importer.

There is no pipeline such as:

```text
candidate schema
→ semantic converter
→ Import Package schema
```

Instead:

```text
ChatGPT
→ Import Package-shaped manifest
→ human edits/approves that manifest
→ deterministic validation/finalisation
```

The key invariant is:

> **What the human reviewer approves is what the production importer receives.**

---

# 4. Reviewable Import Bundle

ChatGPT produces one review bundle per logical source batch.

Example:

```text
shp-eye-ent-2026-review.zip
│
├── manifest.json
│
├── media/
│   ├── case-001-image-01.png
│   ├── case-001-image-02.png
│   ├── case-007-image-01.jpg
│   └── ...
│
├── review-map.json
│
└── source-previews/
    ├── source-001-page-001.jpg
    ├── source-001-page-002.jpg
    ├── source-001-page-003.jpg
    └── ...
```

The bundle contains both production-shaped material and review-only material.

---

# 5. `manifest.json`

`manifest.json` should conform to the current Flash-Cards Import Package v1 contract.

The current Import Package v1 product sections include:

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

The exact current implementation and validator remain authoritative.

For slide ingestion, the workflow should deliberately use a conservative subset.

Normally generate:

```text
topics
cases
assets
caseAssets
questionPrompts
caseQuestions
```

Do not automatically generate Topic Questions.

Do not extend Import Package v1 merely to support slide ingestion.

---

# 6. Holding Topic

Final Topic taxonomy is deliberately deferred.

ChatGPT does not need to determine the permanent Topic for every Case.

Each logical source batch should initially use one holding Topic such as:

```text
Imported — SHP EYE/ENT 2026 — Unsorted
```

or:

```text
Imported — SHP Abnormal Labs 2026 — Unsorted
```

Every imported Case initially uses the batch holding Topic as its primary/default Topic.

Cases are manually moved into the proper Topic taxonomy later through the normal Admin workflow.

ChatGPT may record suggested clinical Topics in review-only metadata, but those suggestions must not automatically create production Topics.

---

# 7. Conservative Case reconstruction

The source should initially be translated using the simplest application representation that faithfully reproduces how the original Case was constructed.

Default:

```text
Holding Topic
└── Case
    ├── vignette
    ├── zero or more fixed images
    └── one or more Case Questions
```

Do not automatically infer:

```text
Additional Study Topics
Tags
Shared Questions
alternative stimulus groups
stimulus-group questions
stimulus-option questions
Image Collections
```

These are later enrichment/curation features.

---

# 8. All slide-ingested images are initially fixed

Every learner-facing image belonging to the source Case is initially represented as a **fixed Case Asset**.

If the source Case contains:

```text
vignette
+ ECG
+ chest radiograph
+ four questions
```

the initial imported Case should contain:

```text
vignette
+ fixed ECG
+ fixed chest radiograph
+ four Case Questions
```

Do not convert the images into alternative stimulus groups during ingestion.

This reflects the fact that the source author intentionally constructed the Case with those images present together.

---

# 9. Multiple fixed images are supported

One Case may contain:

```text
0..many fixed Assets
```

Their source presentation order must be preserved through `caseAssets.displayOrder`.

For example:

```text
Case
├── Image 1 — ECG
├── Image 2 — chest X-ray
└── Image 3 — clinical photograph
```

should retain that order unless the human reviewer changes it.

---

# 10. Composite versus separate images

PowerPoint/PDF visual object boundaries do not automatically define Flash-Cards Asset boundaries.

Keep material as one composite Asset when layout itself carries educational meaning.

Examples:

```text
A/B comparison panel
PowerPoint-built laboratory table
multiple labelled diagrams forming one question stimulus
chart assembled from several slide objects
```

Use separate fixed Assets when the images are genuinely independent stimuli that all belong to the Case.

The human reviewer must see the proposed final Asset, not merely an instruction describing which source object should be extracted.

---

# 11. Actual media files are created before review

ChatGPT is responsible for producing the proposed learner-facing JPEG/PNG files inside:

```text
media/
```

The human reviewer approves the actual image that would enter R2.

Image extraction may use:

```text
embedded original
crop from rendered source page
rendered composite
```

Prefer the clean original embedded image where practical.

Use rendered crops/composites when layout must be preserved.

---

# 12. Answer leakage is blocking

If the source contains:

```text
question slide:
unannotated image

answer slide:
same image + arrows / labels / diagnosis
```

the learner Asset must come from the question version.

Answer-bearing annotations must not accidentally enter the learner-facing Asset.

Possible answer leakage is a blocking review warning.

---

# 13. Tables

Distinguish between:

```text
question/stimulus table
```

and:

```text
answer/explanation table
```

A laboratory results table required to solve the Case may become a fixed learner Asset.

A differential-diagnosis or management table that appears as the answer should normally be converted into answer content rather than exposed as a learner stimulus.

---

# 14. Questions are initially Case Questions

Every question reconstructed from a source Case should initially be represented as a Case Question.

For example:

```text
Question Prompt
"What is the diagnosis?"

Case Question
Case 017
→ "Central retinal artery occlusion."
```

The current application rule remains important:

> `questionPrompts` contains reusable wording only; the answer belongs to the contextual relationship.

Slide ingestion must not place a universal clinical answer on a Question Prompt.

Promotion to Topic Questions, Shared Questions or other reusable scopes is deferred until later curation.

---

# 15. Source fidelity

ChatGPT should reconstruct what the teaching source actually says.

It must not silently:

- complete missing medical answers;
- update old guidelines;
- correct suspected errors;
- add management steps;
- infer diagnoses that the source does not support.

If source material appears incorrect, incomplete or outdated:

```text
preserve source-supported content
+
flag for human review
```

A missing answer remains missing until resolved by the human reviewer.

---

# 16. `review-map.json`

The production manifest should not be polluted with editorial metadata that the Import Package does not support.

Review-only information therefore lives in:

```text
review-map.json
```

Its purpose is to connect production-shaped manifest objects back to source evidence.

It may record:

```text
source file
source slide/page numbers
Case-boundary evidence
question source slide
answer source slide
image source slide
image extraction method
confidence
warnings
suggested Topic
human review status
human review notes
```

It does not define production medical content independently of `manifest.json`.

The manifest remains the proposed import.

---

# 17. Example review mapping

Conceptually:

```json
{
  "caseLocalId": "case-017",

  "source": {
    "sourceId": "eye-ent-2026",
    "pages": [20, 21, 22]
  },

  "caseBoundary": {
    "confidence": "high",
    "notes": "Page 20 is the question slide; pages 21-22 contain matching answers."
  },

  "assets": {
    "asset-017-01": {
      "sourcePage": 20,
      "extractionMethod": "crop",
      "confidence": "high",
      "warnings": []
    }
  },

  "questions": {
    "question-017-01": {
      "promptPage": 20,
      "answerPages": [21],
      "confidence": "high",
      "warnings": []
    }
  },

  "reviewStatus": "pending",
  "reviewNotes": []
}
```

The exact review-map schema should be defined before implementation.

---

# 18. `source-previews/`

The review bundle contains rendered previews of original source slides/pages.

These are not production Assets.

They exist so that the local reviewer can compare:

```text
ORIGINAL SOURCE
vs
ACTUAL PROPOSED IMPORT
```

without needing to constantly switch back to PowerPoint/PDF.

The original source itself remains the authoritative source material and may be retained in GitHub for reference.

---

# 19. Source-file provenance

Where the original teaching material is retained in GitHub, review metadata should record where possible:

```text
repository
path
commit/ref
filename
slide/page
```

An exact commit SHA is preferable when practical.

This allows an imported Case to remain traceable back to the precise source version from which it was reconstructed.

---

# 20. Every source page must be accounted for

ChatGPT must not silently ignore source material.

Every slide/page should be classified as either:

```text
part of one or more reconstructed Cases
```

or explicitly non-Case material such as:

```text
title slide
section heading
teaching/reference material
answer continuation
administrative content
source attribution
duplicate
uncertain
other
```

The local previewer should provide a Source Coverage view so the reviewer can identify omitted or uncertain source pages.

---

# 21. Reusable local previewer

The local previewer is a **single reusable component**.

ChatGPT does not regenerate it for each batch.

It should run locally on the administrator's laptop and consume the Reviewable Import Bundle.

No production infrastructure is required.

Preferred workflow:

```text
open local previewer
        ↓
choose/drop review ZIP
        ↓
review source vs import
        ↓
edit/approve/reject
        ↓
export reviewed bundle
```

It should not upload medical content to an external service merely to display it.

---

# 22. Previewer primary view

The main review surface should be:

```text
┌─────────────────────────┬─────────────────────────┐
│ ORIGINAL SOURCE         │ PROPOSED IMPORT         │
│                         │                         │
│ source page(s)          │ vignette                │
│                         │                         │
│ question slide          │ learner Asset(s)        │
│ answer slide            │                         │
│                         │ questions               │
│                         │                         │
│                         │ reveal answers          │
└─────────────────────────┴─────────────────────────┘
```

The right side represents the actual content currently encoded in the manifest.

---

# 23. The previewer edits the proposed import directly

When the reviewer changes:

```text
Case title
vignette
question wording
answer
image caption
image ordering
```

the resulting exported bundle should contain the corresponding updated production-shaped manifest content.

There must not be another semantic conversion step after approval.

Again:

> **The content being reviewed is the content that will be imported.**

---

# 24. Human review states

Review-only state may include:

```text
pending
approved
needs_review
rejected
```

The previewer should support rapid:

```text
Approve
Needs review
Reject
```

navigation and filtering.

Approval state belongs in review metadata, not the production manifest.

---

# 25. Fixed finalizer

After human review, a deterministic finalizer script consumes the reviewed bundle.

The finalizer performs **no medical or semantic interpretation**.

Its responsibilities are limited to validation and packaging.

Conceptually:

```text
Reviewed Import Bundle
        ↓
validate review state
        ↓
validate manifest
        ↓
validate media
        ↓
validate references/hashes
        ↓
run existing Import Package v1 validation
        ↓
discard review-only material
        ↓
flashcards-import-v1.zip
```

---

# 26. Finalizer fail-closed rules

The script should reject inconsistent content rather than repair it.

Examples:

```text
approved Case contains a missing answer
→ FAIL
```

```text
approved manifest references a missing media file
→ FAIL
```

```text
recorded image hash differs from the reviewed image
→ FAIL
```

```text
Case/Asset/Question reference is invalid
→ FAIL
```

```text
manifest violates Import Package v1
→ FAIL
```

No AI is required to resolve these failures.

The reviewer/source bundle must be corrected explicitly.

---

# 27. Finalizer output

The successful output is exactly:

```text
flashcards-import-v1.zip
├── manifest.json
└── media/
```

The finalizer removes:

```text
review-map.json
source-previews/
other review-only metadata
```

from the production package.

---

# 28. Existing importer remains authoritative

The final ZIP is still submitted through the existing Admin workflow:

```text
Validate and preview
        ↓
review package counts/warnings
        ↓
select exact same ZIP
        ↓
explicit confirmation
        ↓
resumable import
```

The slide workflow must not bypass or weaken the established production-import safety contract.

---

# 29. Image upload path

There is no separate manual image-upload step.

The approved learner image files are already inside:

```text
media/
```

and declared as Assets in the manifest.

The existing importer therefore handles:

```text
media image
→ private R2 object
→ Asset row
→ CaseAsset relationship
```

as part of the normal reviewed import.

---

# 30. Initial slide-ingestion scope

For v1, deliberately constrain the workflow to:

```text
one temporary holding Topic per batch

Case
├── internal title
├── optional vignette
├── zero or more ordered fixed Assets
└── one or more Case Questions
```

Do not attempt during ingestion to solve:

```text
final Topic hierarchy
Tags
Shared Questions
Additional Study Topics
alternative stimulus groups
stimulus-specific database question scopes
Image Collections
advanced reuse/deduplication
```

These can be handled during later Admin curation once the source corpus is safely represented.

---

# 31. Why this architecture is preferred

The architecture separates concerns cleanly.

### ChatGPT

Handles tasks requiring interpretation:

```text
What slides belong to one Case?
Which text is question versus answer?
Which visual is the learner stimulus?
Which answer corresponds to which question?
What image crop preserves the intended Case?
```

### Human reviewer

Handles clinical/editorial authority:

```text
Is the reconstruction correct?
Is the image appropriate?
Is anything missing?
Does the answer match the source?
Should this Case be imported?
```

### Local previewer

Handles efficient review/editing.

### Fixed finalizer

Handles deterministic integrity checking and packaging.

### Existing importer

Handles production D1/R2 mutation safely.

---

# 32. Provenance chain

The resulting content retains a clear chain:

```text
Original source slide
        ↓
source page reference
        ↓
ChatGPT reconstruction
        ↓
review-map evidence
        ↓
human-reviewed manifest + media
        ↓
validated final Import Package
        ↓
production Case / Asset / Question
```

This allows future maintainers to understand where imported teaching content originated.

---

# 33. Design principle to preserve

Do not redesign the teaching material during ingestion.

The purpose of this workflow is:

> **faithful source reconstruction into the simplest compatible Flash-Cards representation.**

Normalisation and enrichment happen after the source corpus has been safely imported.

---

# 34. Next implementation work

This design implies three next deliverables:

1. **ChatGPT slide-extraction prompt**
   - instruct ChatGPT how to reconstruct source material directly into a Reviewable Import Bundle.

2. **Reusable Local Review Previewer**
   - consumes `manifest.json`, `review-map.json`, media and source previews;
   - supports side-by-side review/editing and review-state export.

3. **Fixed Finalizer**
   - validates reviewed bundles;
   - produces the unchanged `flashcards-import-v1.zip`;
   - performs no semantic/medical transformation.

The previewer and finalizer should be built against an explicitly frozen review-bundle/review-map contract before routine ingestion begins.
