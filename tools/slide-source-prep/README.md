# Slide Source Preparation

Living executable authority for the optional deterministic preparation step before ChatGPT slide reconstruction.

This tool prepares `.pptx` and `.pdf` teaching material so ChatGPT receives aligned visual, textual, and structural source evidence. It performs **no semantic interpretation**: no Case/question/answer/diagnosis/Topic/Tag inference, no medical correction, no AI calls, and no OCR in v1.

## Normal use

From the repository root:

```bash
npm run slide-prep -- "C:\path\to\Teaching Deck.pptx"
```

On Windows, double-click the launcher to open a native file picker, then choose one `.pptx` or `.pdf`:

```text
tools\slide-source-prep\prepare-slides.cmd
```

The prepared output folder opens automatically after a successful run. The launcher pauses after success/failure so the human-readable summary remains visible; cancelling the picker exits without running preparation. For the fast path, drag one `.pptx`/`.pdf` onto the same launcher. The CLI is the non-interactive path.

The tool refuses to mix a new run with an existing prepared directory. Replace intentionally with:

```bash
npm run slide-prep -- "C:\path\to\Teaching Deck.pptx" --force
```

The Windows launcher never adds `--force` and never deletes an existing prepared directory.

## Prerequisites

### PPTX

V1 is Windows-first and requires installed desktop Microsoft PowerPoint. PowerPoint itself renders the PDF.

### PDF / chunking

Native PDF text uses Poppler `pdftotext`. Mechanical PDF chunking uses `pdfseparate` and `pdfunite`. These commands must be on `PATH` when the corresponding operation is needed.

No network service, Cloudflare resource, production database, or external AI is used.

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

The source is copied byte-for-byte; the input itself is never saved back to. On failed preparation the newly created output directory is removed so a partial run cannot masquerade as a successful one.

For large sources each range contains aligned files:

```text
Teaching Deck-0001-0040.pdf
Teaching Deck-0001-0040.md
Teaching Deck-0001-0040.json
```

Original numbering is preserved. Chunking is mechanical, not semantic.

## PPTX evidence semantics

The rendered PDF is visual authority. Source-map/Markdown `Visible text` is deliberately narrower than "all text stored in the PPTX":

- invisible shapes are excluded;
- an invisible group excludes its descendants;
- shapes wholly outside the rendered slide viewport are excluded;
- partially visible shapes are preserved and their source-map geometry is clipped to the on-slide intersection;
- hidden **slides** remain represented and are included in the rendered PDF so slide N remains PDF page N.

This prevents off-canvas author material from being presented to ChatGPT as visible learner-facing evidence while preserving slide identity.

## `source-map.json`

The source map is a versioned deterministic retrieval sidecar. It records, where safely available:

- stable slide/page identity;
- visible text/table blocks;
- approximate normalized on-page geometry;
- font size/colour/bold/italic for straightforward PowerPoint text;
- PowerPoint speaker notes;
- slide/page dimensions.

PDF style remains `null` rather than guessed. Blocks are ordered approximately top-to-bottom then left-to-right, with extraction order as tie-breaker. Markdown is generated from the same normalized representation.

The source map intentionally contains no semantic fields such as `question`, `answer`, `caseId`, `diagnosis`, or `answerSlideFor`.

## Empty pages/slides

Every original slide/page remains represented. A page with no native PDF text or a slide with no straightforward visible text gets an explicit empty marker. PowerPoint slides with no speaker notes also get an explicit notes marker.

## Large-source defaults

- `<= 50` pages/slides: no chunks.
- `> 50`: 40-page/slide chunks.
- Override with `--chunk-size N`.
- Full original/full rendered PDF/full index/full source map remain alongside chunks.

## Failure behavior

Preparation fails clearly for unsupported/unreadable input, missing PowerPoint, failed PowerPoint export, missing required Poppler commands, malformed PDF bbox output, or chunking errors. Existing output requires `--force`; a failed run cleans up its partial output.

## Validation

Focused deterministic suite:

```bash
npm run slide-prep:test
```

PowerPoint COM itself is not CI-tested. Before final handoff on Windows, manually smoke a real PPTX and PDF covering:

1. PPTX ordinary text, table, colour/bold/italic, speaker notes;
2. invisible text shape;
3. invisible group containing a text child;
4. wholly off-slide text and partially visible text;
5. a hidden slide, verifying slide number = rendered PDF page number;
6. PDF with at least one native-text page and one no-text/image-only page;
7. a source over 50 pages/slides, verifying aligned PDF/Markdown/JSON chunks;
8. existing output without `--force` and intentional replacement with `--force`.

After focused tests, follow repository-owned `agent:checks` and required final validation.
