# Slide Source Preparation

Small local/offline preparation layer for PPTX/PDF teaching material before ChatGPT semantic extraction.

It does **not** identify Cases, questions, answers, diagnoses, Topics, Tags, learner Assets, or other Flash-Cards semantics. It preserves and exposes source evidence so ChatGPT can perform the one semantic reconstruction step more efficiently.

## Normal use

From the repository root:

```bash
npm run slide-prep -- "C:\path\to\Teaching Deck.pptx"
```

or on Windows drag a `.pptx`/`.pdf` onto:

```text
tools\slide-source-prep\prepare-slides.cmd
```

The tool refuses to mix a new run with an existing prepared directory. To intentionally replace the prior output:

```bash
npm run slide-prep -- "C:\path\to\Teaching Deck.pptx" --force
```

## Prerequisites

### PPTX

V1 is Windows-first for PowerPoint sources and requires installed desktop Microsoft PowerPoint. PowerPoint itself performs the PDF export so the visual rendering comes from the application's native renderer.

### PDF

Native/selectable PDF text extraction uses Poppler's `pdftotext` command. Ensure `pdftotext` is on `PATH`.

Large sources over 50 pages/slides are mechanically split into upload chunks. PDF chunking uses Poppler's `pdfseparate` and `pdfunite`; ensure both are on `PATH` when chunking is needed. A large PPTX also needs these commands because its chunks are split from the PowerPoint-rendered PDF.

No OCR, network service, Cloudflare resource, production database, or AI API is used.

## Output

PPTX:

```text
Teaching Deck-prepared/
├── Teaching Deck.pptx
├── Teaching Deck-rendered.pdf
├── Teaching Deck-index.md
├── Teaching Deck-source-map.json
└── chunks/                         # only for >50 slides
```

PDF:

```text
Teaching Deck-prepared/
├── Teaching Deck.pdf
├── Teaching Deck-index.md
├── Teaching Deck-source-map.json
└── chunks/                         # only for >50 pages
```

The original file is copied byte-for-byte into the prepared directory. The input file itself is never saved back to or rewritten.

For a large source, each chunk range contains three aligned files:

```text
Teaching Deck-0001-0040.pdf
Teaching Deck-0001-0040.md
Teaching Deck-0001-0040.json
```

The numbers remain the **original** slide/page numbers. Chunking is mechanical; it does not try to infer Case boundaries.

## `source-map.json`

The source map is a versioned deterministic sidecar intended to help ChatGPT retrieve source structure without repeatedly reverse-engineering the presentation.

For PPTX it captures, where PowerPoint exposes the information safely:

- stable slide identity;
- visible text/table blocks;
- approximate normalized geometry;
- font size, font colour, bold and italic state;
- speaker notes;
- slide dimensions.

For PDF it captures native text lines and Poppler bounding boxes. PDF style is left `null` rather than guessed.

Blocks are ordered approximately top-to-bottom, then left-to-right, with extraction order as the stable tie-breaker. The Markdown index is generated from the same normalized representation, so the JSON and Markdown identities stay aligned.

The source map intentionally contains no semantic labels such as `question`, `answer`, `caseId`, `diagnosis`, or `answerSlideFor`.

## Markdown index

Each slide/page gets one stable section such as:

```markdown
## Slide 0042

Visual page: 42
Source-map id: slide-0042

### Visible text
...

### Speaker notes
...
```

Slides/pages with no extractable text remain represented explicitly. PowerPoint slides with no notes also receive an explicit marker rather than disappearing from the index.

## Large-source defaults

- 50 pages/slides or fewer: no chunks.
- More than 50: 40-page/slide chunks.
- Optional override:

```bash
npm run slide-prep -- "C:\path\to\Teaching Deck.pdf" --chunk-size 25
```

The full original/full rendered PDF/full index/full source map are retained alongside chunks.

## Failure behavior

Preparation fails rather than producing misleading partial output when a required global operation fails, including:

- unsupported source extension;
- unreadable source;
- missing PowerPoint for PPTX;
- PowerPoint PDF export failure;
- missing `pdftotext` for PDF extraction;
- missing Poppler split tools when large-deck chunking is required;
- malformed/unparseable native PDF bbox output.

A single slide/page with no extractable text is **not** a failure.

On a failed run, the new prepared output directory is removed so stale/partial files are not mistaken for a successful preparation.

## Tests

Pure deterministic logic is covered without requiring PowerPoint or Poppler:

```bash
npm run slide-prep:test
```

A manual Windows smoke should additionally cover:

1. a PPTX with ordinary text, a table, coloured/bold text, and speaker notes;
2. a PDF with at least one native-text page and one page with no native text;
3. a source over 50 pages/slides when Poppler split tools are installed;
4. rerunning against an existing output directory with and without `--force`.
