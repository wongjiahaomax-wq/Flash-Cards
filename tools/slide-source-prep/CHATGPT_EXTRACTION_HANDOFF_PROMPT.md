# ChatGPT Slide Extraction Handoff Prompt — Prepared Source Bundle v1

_Status: operator copy/paste prompt for the deterministic slide-preparation workflow introduced in PR #164. This prompt is a handoff aid, not schema or implementation authority. Current repository implementation and living documentation remain authoritative._

Use this file after running `tools/slide-source-prep/prepare-slides.cmd` or `npm run slide-prep`.

Copy the prompt below into the ChatGPT agent that will perform semantic slide reconstruction, and attach the prepared source output (or its relevant aligned chunks).

---

## BEGIN PROMPT

Repository:

`wongjiahaomax-wq/Flash-Cards`

You are acting as the **semantic extraction and source-reconstruction layer** for the Flash-Cards project.

I will provide source material prepared by the repository's deterministic slide-source preparation tool. Convert that material into the existing **Reviewable Import Bundle** for human review.

You are NOT implementing application code.

You are NOT editing Production content.

You are NOT importing anything into D1 or R2.

You are NOT responsible for final Topic taxonomy.

You are NOT responsible for writing or changing the local reviewer/finalizer.

The deterministic preparation layer performs no semantic interpretation. **You remain the only semantic reconstruction step.**

### 1. Read the authoritative project contract first

Start from the latest current `main`.

Before interpreting the teaching material, read:

```text
docs/DOCUMENTATION_INDEX.md
docs/SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md
docs/CONTENT_IMPORT_PACKAGES.md
docs/V1_DATA_MODEL.md
docs/AUTHORING_MODEL.md

tools/slide-source-prep/README.md

src/lib/server/import/content-package.js
src/lib/server/storage/media.js
```

The current executable Import Package v1 validator is authoritative for manifest structure.

Do not modify that contract.

If repository documentation and implementation disagree, follow current implementation and report the discrepancy.

### 2. Architecture

Treat the workflow as:

```text
Original PPTX / PDF
        ↓
Deterministic local source preparation
        ↓
Prepared visual + textual + structural evidence
        ↓
      ChatGPT
semantic source reconstruction
        ↓
Reviewable Import Bundle
        ↓
Reusable Local Review Previewer
        ↓
Human review / editing
        ↓
Deterministic Finalizer
        ↓
flashcards-import-v1.zip
        ↓
Existing Admin Importer
```

There is only one semantic AI step:

```text
source evidence
→ proposed Flash-Cards content
```

There must be no later AI transformation required to turn approved content into the application format.

Therefore `manifest.json` must already contain the actual production-shaped content the human is being asked to approve. `review-map.json` contains review/provenance information only.

### 3. Understand the prepared evidence correctly

#### Prepared PPTX

A prepared PPTX normally contains:

```text
<name>.pptx
<name>-rendered.pdf
<name>-index.md
<name>-source-map.json
chunks/                         # only for large sources
```

Use this evidence hierarchy:

1. **`<name>-rendered.pdf` is visual authority.**
   Use it to determine what was visibly presented on each slide, including images, diagrams, layout, annotations and visual relationships.

2. **`<name>-index.md` is a retrieval aid.**
   Use its slide-numbered visible text and speaker notes to retrieve source wording efficiently. Do not treat it as a substitute for visual inspection where layout or imagery matters.

3. **`<name>-source-map.json` is deterministic structural/retrieval evidence.**
   Use stable slide IDs, text-block order, approximate geometry/basic formatting and speaker notes where useful. It contains no authoritative Flash-Cards semantics. Never assume the preparer identified a Case, question, answer, diagnosis, Topic, Tag or Case boundary.

4. **The copied original `.pptx` is provenance/source material.**
   When prepared evidence is complete, do not redundantly reconstruct the deck from raw PowerPoint unless needed to investigate a discrepancy or missing evidence.

Prepared slide numbering is deliberately aligned across the rendered PDF, Markdown and source map. Preserve original slide numbering in provenance and review records.

`Visible text` deliberately excludes:

- invisible shapes;
- descendants of invisible groups;
- wholly off-slide author material.

Partially visible shapes are preserved conservatively. Do not reintroduce excluded off-canvas material as learner-facing evidence merely because it exists in the raw PPTX.

Hidden **slides** remain represented so slide number and rendered-PDF page number stay aligned. Treat hidden slides as source evidence while respecting their hidden status and surrounding context.

Speaker notes are first-class source evidence, but they are **not automatically learner-facing content**.

#### Prepared PDF

A prepared PDF normally contains:

```text
<name>.pdf
<name>-index.md
<name>-source-map.json
chunks/                         # only for large sources
```

The PDF itself is visual authority.

The Markdown and source map contain **native/selectable PDF text only**. PR #164 performs no OCR in v1.

Therefore:

- an empty native-text entry does not prove that the page is visually empty;
- inspect the corresponding PDF page when images, diagrams, scanned text or other visual content may contain relevant evidence;
- do not manufacture missing text from the index or source map;
- do not treat absence of native text as evidence that a Case/question/answer is absent.

Visual inspection by ChatGPT during this semantic reconstruction step is allowed. Do not claim that visually read text came from the preparer's native-text extraction.

### 4. Large prepared sources and chunks

For large sources, matching PDF/Markdown/JSON chunks use the same original slide/page ranges.

Chunks are **mechanical retrieval units, not semantic boundaries**.

Cases may cross chunk boundaries. Inspect adjacent ranges whenever source continuity suggests that a Case, question, answer or explanation continues across a boundary.

Never renumber pages/slides locally within a chunk. Preserve original source numbering.

If both full-deck artifacts and chunks are supplied, use chunks to reduce retrieval load while retaining the full-deck numbering/continuity model.

### 5. Reconstruct the source faithfully

Guiding principle:

> **Faithfully reconstruct the source Case first. Curate and normalise it later.**

Do NOT assume one slide/page equals one Case.

A Case may span question, answer and explanation slides, or may progressively reveal answers on repeated slides.

Use all available evidence together, including:

- slide/page order;
- case/question numbers;
- repeated vignette;
- repeated images;
- repeated question text;
- headings;
- diagnosis labels;
- answer additions;
- text colour/basic formatting;
- tables;
- speaker notes;
- section transitions;
- visual continuity across adjacent pages.

Do not infer Case boundaries from a single signal such as colour alone.

If a Case boundary remains uncertain, make the best source-supported reconstruction and mark it for human review rather than silently guessing.

### 6. Source fidelity is mandatory

The supplied teaching material is authoritative for this extraction task.

Do NOT silently:

- add medical knowledge;
- complete missing answers;
- correct suspected errors;
- update guidelines;
- modernise terminology;
- infer additional investigations;
- add management steps;
- reconcile contradictions using outside knowledge.

If content appears incorrect, outdated, internally inconsistent or incomplete, preserve what the source supports and flag the issue for human review.

Do not browse the web to correct medical content unless I separately instruct you to do so.

When prepared textual/structural evidence conflicts with visual evidence:

- prefer the rendered/original PDF for what was visibly presented;
- treat speaker notes as separate source evidence;
- preserve genuine source contradictions;
- add a review warning rather than silently reconciling the conflict.

### 7. Build the existing Reviewable Import Bundle

Follow the current living reviewed-import workflow and current executable package validator exactly.

Produce one ZIP per logical source batch containing the existing reviewable structure, normally:

```text
<batch-name>-review.zip
│
├── manifest.json
├── media/
├── review-map.json
└── source-previews/
```

Do **not** generate `preview.html`.

Do not put the original PPTX/PDF inside the review ZIP unless the current living workflow explicitly requires it or I separately instruct you to do so.

Use only fields accepted by the current production validator. Do not invent manifest fields for confidence, source pages, warnings, speaker notes or source evidence; those belong in review metadata.

Use the current reviewed-import conventions for:

- one temporary holding Topic per logical batch;
- Case reconstruction;
- package-local stable IDs;
- `create` operations for normal slide-derived content;
- Case Questions and Question Prompts;
- unresolved/missing-answer handling;
- Assets and CaseAssets;
- learner-facing image extraction/cropping;
- source previews;
- review statuses, warnings and provenance;
- duplicate-looking content;
- final validation.

Do not perform production deduplication merely because source content resembles existing content.

Do not redesign the Flash-Cards authoring model during ingestion.

### 8. Images and visual evidence

Do not discard clinically meaningful images merely because their text is available elsewhere.

Where learner-facing content depends on an image, diagram, radiograph, ECG, photograph, table or other visual source, preserve the appropriate media according to the existing reviewed-import workflow.

Keep source-preview/provenance references aligned to the original slide/page numbers.

Do not treat the source map's text geometry as a replacement for the rendered slide image.

### 9. Missing or unresolved evidence

A valid production-shaped Case Question requires a valid answer.

If the source question is identifiable but its answer cannot be reliably established from supplied source evidence, do not invent an answer and do not emit an invalid production CaseQuestion merely to make the manifest complete.

Record the unresolved candidate, source Prompt, source page/slide references and blocking review warning in `review-map.json` according to the living workflow.

The human reviewer can later supply/reconcile the answer or reject the candidate.

### 10. Final checks before handoff

Before returning the bundle:

1. confirm every emitted manifest record conforms to the current executable Import Package v1 contract;
2. confirm `review-map.json` contains review/provenance metadata rather than production semantics that belong in `manifest.json`;
3. confirm all referenced media files exist and filenames/IDs are aligned;
4. confirm source-preview references preserve original slide/page numbers;
5. confirm chunk boundaries did not cause missed Case/question/answer continuity;
6. confirm source contradictions and unresolved answers are surfaced rather than silently repaired;
7. confirm no web-derived medical corrections were introduced;
8. confirm the final ZIP contains the complete Reviewable Import Bundle expected by the existing local reviewer/finalizer.

Then provide:

- the completed `<batch-name>-review.zip`;
- a concise summary of Cases/questions/assets reconstructed;
- a concise list of blocking or notable review warnings.

Do not modify the repository as part of this extraction task.

## END PROMPT
