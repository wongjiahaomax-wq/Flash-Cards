# Slide Source Preparation

Living executable authority for the optional deterministic preparation step before slide reconstruction by an extraction AI.

This tool prepares `.pptx` and `.pdf` teaching material so an extraction AI receives aligned visual, textual, and structural source evidence. It performs **no semantic interpretation**: no Case/question/answer/diagnosis/Topic/Tag inference, no medical correction, no AI calls, and no OCR in v1.

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
├── AI_EXTRACTION_HANDOFF_PROMPT.md
├── AI_EXTRACTION_CONTRACT.md
├── manifest-slide-profile-v1.schema.json
├── review-map-v1.schema.json
└── chunks/                         # only for >50 slides
```

PDF:

```text
Teaching Deck-prepared/
├── Teaching Deck.pdf
├── Teaching Deck-index.md
├── Teaching Deck-source-map.json
├── AI_EXTRACTION_HANDOFF_PROMPT.md
├── AI_EXTRACTION_CONTRACT.md
├── manifest-slide-profile-v1.schema.json
├── review-map-v1.schema.json
└── chunks/                         # only for >50 pages
```

The source is copied byte-for-byte; the input itself is never saved back to. On failed preparation the newly created output directory is removed so a partial run cannot masquerade as a successful one.

The four portable extraction files are copied unchanged into the prepared root. They are the complete provider-neutral handoff, narrow slide manifest profile, and canonical review-map schema needed by an extraction AI that has no access to this project or external services. They are not duplicated into mechanical chunks. A final review ZIP requires the complete prepared source batch; chunks are retrieval aids only and cannot independently satisfy the reviewer's complete source-coverage contract.

For large sources each range contains aligned files:

```text
Teaching Deck-0001-0040.pdf
Teaching Deck-0001-0040.md
Teaching Deck-0001-0040.json
```

Original numbering is preserved. Chunking is mechanical, not semantic, and a chunk must not be renumbered or treated as an independently finalizable source.

## PPTX evidence semantics

The rendered PDF is visual authority. Source-map/Markdown `Visible text` is deliberately narrower than "all text stored in the PPTX":

- invisible shapes are excluded;
- an invisible group excludes its descendants;
- shapes wholly outside the rendered slide viewport are excluded;
- partially visible shapes are preserved and their source-map geometry is clipped to the on-slide intersection;
- hidden **slides** remain represented and are included in the rendered PDF so slide N remains PDF page N.

This prevents off-canvas author material from being presented as visible learner-facing evidence while preserving slide identity.

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

Windows launcher smoke evidence (2026-09-08):

- Poppler 25.07.0 was available through the WinGet installation.
- A real PDF with a spaced Windows path completed through `prepare-slides.cmd` with exit code 0.
- The exact `Smoke Deck-prepared` directory, index, and source map were created, and the launcher completed its Explorer-opening step.
- A real Windows double-click/file-association launch opened the native picker; clicking `Cancel` completed with final launcher exit code 0 without running preparation, showing failure, or requiring another keypress.
- Controlled CLI failure and existing-output protection both remained visible and fail-closed; the existing output sentinel was preserved.
- On exact PR #168 head `2feb0147644cc79055928f0f3d5b1a847e8a5b6a`, a copied real `WKD 26.pptx` with a spaced Windows path completed through `prepare-slides.cmd` with exit code 0, 13 slides, zero warnings, and no chunks. PowerPoint COM identified hidden slide 8; the rendered PDF had 13 pages, and the source map retained ordered pages 1–13 including page 8.
- That real PPTX smoke preserved native text and speaker notes (source-map text pages 1–7 and 9–13; notes pages 4, 6, 7, 9, and 13). The prepared root contained the source PPTX, rendered PDF, index, source map, and all four portable extraction artifacts (8/8).

PowerPoint COM itself is not CI-tested. The exact-head real PPTX success smoke above is complete. The broader manual checklist still covers:

1. PPTX ordinary text, table, colour/bold/italic, speaker notes;
2. invisible text shape;
3. invisible group containing a text child;
4. wholly off-slide text and partially visible text;
5. a hidden slide, verifying slide number = rendered PDF page number;
6. PDF with at least one native-text page and one no-text/image-only page;
7. a source over 50 pages/slides, verifying aligned PDF/Markdown/JSON chunks;
8. existing output without `--force` and intentional replacement with `--force`.

After focused tests, follow repository-owned `agent:checks` and required final validation.
