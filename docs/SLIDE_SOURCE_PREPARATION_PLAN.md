# Slide Source Preparation Plan

_Status: Draft implementation plan for the current PR. This PR is the implementation vehicle; continue coding in this PR rather than creating a follow-up PR. Do not treat this plan as living implementation authority after the PR is complete._

## Objective

Add a deliberately small local/offline preparation step before ChatGPT slide extraction so PPTX/PDF teaching decks are easier and more reliable for ChatGPT to reconstruct without introducing another semantic transformation.

The highest-yield outputs are:

1. a deterministic visual rendering of PPTX sources as PDF;
2. a slide/page-numbered Markdown text index containing visible source text and PowerPoint speaker notes where available;
3. automatic bounded chunking for large rendered decks/indexes;
4. preservation of the original source.

The user workflow must stay simple enough for routine use: choose or drag a `.pptx`/`.pdf`, run one launcher, then upload the prepared outputs to ChatGPT.

## Architectural boundary

Current reviewed slide ingestion remains:

```text
source PPTX / PDF
        ↓
ChatGPT semantic reconstruction
        ↓
Reviewable Import Bundle
        ↓
local human reviewer
        ↓
deterministic finalizer
        ↓
existing production importer
```

This PR adds only a deterministic preparation layer before ChatGPT:

```text
source PPTX / PDF
        ↓
local deterministic preparation
├── preserve original
├── render PPTX visually to PDF
├── extract retrieval-friendly source text/notes
└── split large rendered material into bounded ranges
        ↓
ChatGPT semantic reconstruction
```

The preparation layer must not infer Cases, questions, answers, diagnoses, topics, learner Assets, or other Flash-Cards semantics. ChatGPT remains the only semantic source-reconstruction step.

It must remain local/offline and must not contact Production, D1, R2, Cloudflare, GitHub, external AI, or web services.

## V1 scope

### Supported inputs

V1 supports exactly:

```text
.pptx
.pdf
```

Legacy `.ppt`, Keynote, Word, image folders, and other formats are out of scope.

### Windows-first execution

V1 may be explicitly Windows-first because the primary workflow runs on Windows and high-fidelity PPTX rendering should use installed desktop PowerPoint rather than attempting to recreate PowerPoint layout in application code.

For PPTX input, desktop Microsoft PowerPoint is an acceptable explicit prerequisite.

Do not add a server, browser upload application, hosted conversion service, or Cloudflare path merely to make source preparation cross-platform.

### Simple invocation

Provide two equivalent entry points:

```text
1. Human-friendly Windows launcher:
   drag/drop a PPTX or PDF onto the launcher, or run it and choose/provide a file.

2. Repository/developer CLI:
   npm run slide-prep -- "<source-path>"
```

The normal user must not need to type multiple conversion/extraction commands or manually assemble the output files.

If a lightweight `.cmd`/PowerShell wrapper is the simplest Windows launcher, prefer that over building a GUI.

## Output contract

Preparation writes to a sibling/generated directory without changing the source file.

For a normal PPTX source:

```text
<name>-prepared/
├── <name>.pptx
├── <name>-rendered.pdf
└── <name>-index.md
```

For a normal PDF source:

```text
<name>-prepared/
├── <name>.pdf
└── <name>-index.md
```

The copied original should remain byte-for-byte unchanged where practical. Never save back into or mutate the user's original input file.

For large sources, retain the full prepared files and add matching bounded upload chunks:

```text
<name>-prepared/
├── <original source>
├── <name>-rendered.pdf                 # PPTX only
├── <name>-index.md
└── chunks/
    ├── <name>-001-040.pdf
    ├── <name>-001-040.md
    ├── <name>-041-080.pdf
    ├── <name>-041-080.md
    └── ...
```

For PDF input, the chunk PDFs are split from the original PDF. For PPTX input, they are split from the PowerPoint-rendered PDF.

The chunk Markdown files must cover exactly the same original slide/page range as their paired PDF.

Do not renumber source identity inside the index. Original slide/page 41 remains slide/page 41 even when it appears in the `041-080` chunk.

## PPTX preparation

### Preserve the original

Copy the original `.pptx` into the prepared output so ChatGPT can still access structural evidence that may not survive PDF rendering.

Do not rewrite, normalize, resave, or strip the copied presentation merely to prepare it.

### Render visual truth through PowerPoint

Use installed desktop PowerPoint's own PDF export/rendering path for PPTX input.

The rendered PDF exists to freeze the visual appearance ChatGPT should inspect:

- slide layout;
- text positioning/formatting;
- images;
- tables;
- shapes;
- annotations;
- answer additions/overlays;
- other visually meaningful composition.

Do not attempt to reproduce PowerPoint rendering with a custom HTML/canvas renderer in v1.

The export must preserve one source slide per PDF page and preserve source order.

### Extract a retrieval-friendly slide index

Generate `<name>-index.md` with one stable section per original slide.

Minimum shape:

```markdown
# Source: Example.pptx

Slides: 80

## Slide 0001

### Visible text
...

### Speaker notes
...

## Slide 0002

### Visible text
...

### Speaker notes
...
```

The index is source evidence, not interpreted content.

For ordinary PowerPoint content, extract the text that is straightforwardly available from slide shapes/placeholders/tables and speaker notes. Preserve source wording. Do not rewrite, summarize, spell-correct, classify, or medically interpret it.

Approximate deterministic visual/shape order is sufficient; v1 does not need perfect reading-order reconstruction for every SmartArt/chart/group edge case because the rendered PDF remains the visual authority.

If a slide has no straightforward extractable visible text, emit an explicit empty marker rather than silently dropping the slide.

If speaker notes are empty, emit an explicit empty marker.

Speaker notes are valuable source evidence even when they contain answers; do not sanitize them. Answer-leakage decisions remain ChatGPT/reviewer responsibilities later in the workflow.

## PDF preparation

### Preserve the original

Copy the original PDF into the prepared output unchanged.

Do not re-render or rasterize an ordinary PDF just to prepare it.

### Extract native page text only

Generate `<name>-index.md` with one section per original PDF page:

```markdown
# Source: Example.pdf

Pages: 80

## Page 0001

### Visible text
...
```

Prefer native/selectable PDF text. Preserve wording and page boundaries.

V1 must not OCR every page. If a page has no extractable native text, write an explicit marker such as:

```text
[No extractable native text]
```

and continue. ChatGPT can still inspect the source PDF visually.

A small maintained local dependency for native PDF text extraction and/or deterministic PDF splitting is acceptable if the repository has no existing suitable primitive. Do not add a dependency merely for convenience when the platform/repository already provides the needed deterministic operation.

## Large-deck chunking

Chunking is a context-management convenience, not a semantic split.

Default policy:

- no chunks for sources of 50 pages/slides or fewer;
- when the source exceeds 50 pages/slides, create chunks of 40 original pages/slides;
- preserve source order and original numbering;
- always keep the full original/full rendered PDF/full index alongside the chunks;
- do not attempt to detect Case boundaries or move chunk boundaries around semantic content.

A simple optional CLI override such as `--chunk-size <n>` is acceptable, but the default workflow must require no configuration.

Chunk boundaries are intentionally mechanical. ChatGPT remains responsible for recognizing a Case that crosses a chunk boundary; the full original and full index remain available as fallback evidence.

## Failure behavior

Fail clearly rather than silently producing misleading prepared material.

Required examples:

- PPTX input without usable desktop PowerPoint: report the missing prerequisite and do not pretend a rendered PDF was produced;
- PowerPoint PDF export failure: stop the PPTX preparation as failed;
- source cannot be opened/read: report the source path and failure;
- PDF native text extraction fails globally: report failure rather than emitting a deceptively complete index;
- one PDF page or PowerPoint slide has no extractable text: this is not a global failure; emit the explicit empty marker and continue;
- output directory collision: use a deterministic safe overwrite/replace policy or require explicit opt-in; never merge stale output from an older preparation run into the new result silently;
- temporary PowerPoint/COM processes/resources must be cleaned up on both success and failure as far as safely possible.

The terminal/launcher summary should report at minimum:

```text
Source:
Type:
Slides/pages:
Rendered PDF: yes/no/not applicable
Index: path
Chunks: count
Warnings: count
Output directory:
```

## Deliberate non-goals

Do not add these to v1:

```text
OCR orchestration
AI/LLM calls
Case detection
question/answer detection
answer matching
diagnosis detection
Topic/Tag inference
medical correction or summarization
image extraction/cropping
learner Asset selection
duplicate-slide detection
near-identical Q/A slide pairing
semantic chunk boundaries
PowerPoint-to-HTML recreation
a full desktop GUI
cloud conversion/upload
production import/review behavior changes
```

Do not expand scope merely because some of these could improve extraction further. The purpose of this PR is to test whether deterministic rendering + retrieval-friendly indexing provides most of the gain cheaply.

## Proposed implementation surface

Prefer a small separate local tool, for example:

```text
tools/slide-source-prep/
├── README.md
├── ...implementation...
└── tests/
```

and a repository script:

```text
npm run slide-prep -- "<source-path>"
```

Add only the minimum Windows launcher/wrapper needed for the one-step human workflow.

Keep this preparer separate from `tools/slide-import-review/` unless implementation evidence shows a shared deterministic helper genuinely belongs elsewhere. The reviewer consumes ChatGPT's Reviewable Import Bundle; the preparer operates on raw PPTX/PDF source before ChatGPT. They are adjacent but distinct lifecycle stages.

The coding agent should inspect the current repository and choose the smallest maintainable implementation that satisfies the behavior above. Do not treat speculative implementation details in this plan as stronger authority than current executable repository contracts.

## Implementation tranches

### Tranche 1 — Tool skeleton + one-step invocation

Implement the bounded local tool surface and output-directory lifecycle.

Acceptance:

- one PPTX/PDF path is accepted;
- unsupported extensions fail clearly;
- output is written outside the source without mutating it;
- human-friendly Windows launcher and `npm run slide-prep -- ...` both reach the same core behavior;
- stale prior output cannot be silently mixed with a new run.

### Tranche 2 — PPTX rendering + structural index

Implement the PowerPoint path.

Acceptance:

- original PPTX is preserved;
- installed PowerPoint exports one-slide-per-page PDF in source order;
- index contains every slide number exactly once;
- ordinary visible text and speaker notes are captured without semantic rewriting;
- empty text/notes remain explicitly represented;
- PowerPoint application/presentation resources are closed safely after the run.

### Tranche 3 — PDF native-text index

Implement the PDF path.

Acceptance:

- original PDF is preserved unchanged;
- index contains every source page number exactly once;
- native/selectable text remains page-scoped;
- image-only/no-text pages remain explicitly represented without OCR;
- extraction errors are distinguished from legitimately empty pages.

### Tranche 4 — Mechanical large-deck chunking

Implement deterministic range chunks.

Acceptance:

- sources `<= 50` pages/slides create no chunks by default;
- sources `> 50` create 40-page/slide chunks by default;
- chunk PDF and Markdown range pairs match exactly;
- names use zero-padded original ranges;
- no source page/slide is lost, duplicated, reordered, or semantically reassigned;
- full source/full index remain available.

### Tranche 5 — Focused tests, docs, and workflow reconciliation

Add focused deterministic regression coverage around the pure/testable parts of the tool, including:

- input validation;
- naming/output planning;
- slide/page index formatting;
- empty-text markers;
- range/chunk calculations;
- chunk/index correspondence;
- stale-output handling;
- failure reporting.

Where PowerPoint COM/export itself cannot be made reliable in CI, keep COM/platform calls behind a narrow adapter and test the deterministic logic independently. Add a local/manual smoke procedure for a real PPTX with speaker notes and a real PDF with at least one native-text page and one no-text page.

Update the reviewed-slide workflow documentation only as needed to show this preparer as an optional deterministic upstream aid; do not rewrite the semantic reconstruction or reviewer/finalizer contracts.

Follow the repository-owned focused/checkpoint/handoff validation guidance and report what actually ran.

## Acceptance scenario

A user should be able to take a teaching deck and do approximately:

```text
Drag Example.pptx onto Prepare Slides.cmd
```

and receive:

```text
Example-prepared/
├── Example.pptx
├── Example-rendered.pdf
├── Example-index.md
└── chunks/              # only when large
```

Then the ChatGPT upload decision is simple:

### Normal PPTX

Upload:

```text
Example.pptx
Example-rendered.pdf
Example-index.md
```

### Normal PDF

Upload:

```text
Example.pdf
Example-index.md
```

### Large source

Upload the matching PDF/index chunk(s) needed for the extraction batch, retaining the full original/full index for cross-boundary/source verification when necessary.

## Success criteria

This PR is successful when:

1. routine preparation is one-step for the user;
2. PPTX visual fidelity is delegated to PowerPoint's own renderer;
3. original PPTX/PDF source remains available and unchanged;
4. ChatGPT receives a numbered retrieval-friendly text representation aligned to the visual source;
5. PowerPoint speaker notes are surfaced in the index;
6. PDF pages without native text are preserved without mandatory OCR;
7. large decks gain simple deterministic bounded chunks;
8. no semantic interpretation is introduced before ChatGPT;
9. no production/reviewer/import behavior is coupled to the preparer;
10. implementation remains small enough that additional preprocessing features can be evaluated later rather than designed upfront.

## Work state / PR lifecycle

This plan is committed first so implementation can proceed against an explicit durable contract.

Continue implementation in this same PR and branch.

Do not:

- create a separate implementation PR;
- merge while the PR contains only the plan;
- mark Ready for Review merely because the plan is complete.

Keep the PR Draft until implementation, validation, documentation reconciliation, and final whole-PR review are complete.