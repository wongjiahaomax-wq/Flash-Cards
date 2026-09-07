# Slide Source Preparation — Source Map Amendment

_Status: additive implementation contract for Draft PR #164. This amendment extends `SLIDE_SOURCE_PREPARATION_PLAN.md`; where this amendment is more specific about prepared-output structure, follow this amendment for PR #164._

## Purpose

Add one retrieval-oriented machine-readable sidecar to the prepared source without introducing semantic preprocessing:

```text
<name>-source-map.json
```

The source map exposes source structure that is useful to ChatGPT but expensive or lossy to reconstruct repeatedly from a PPTX/PDF: stable slide/page identity, text blocks, approximate geometry, simple formatting, object type, and PowerPoint speaker notes where available.

It must remain deterministic source evidence. It must never infer Flash-Cards semantics.

## Non-semantic boundary

The source map may describe facts such as:

```text
slide 18
text block at x/y
font size 24
font colour #FF0000
bold = true
object type = text
speaker notes = ...
```

It must not emit fields or labels such as:

```text
question
answer
caseId
diagnosis
answerSlideFor
likelyDuplicateOf
learnerAsset
suggestedTopic
```

ChatGPT remains responsible for deciding what source evidence means.

## Revised prepared output

PPTX:

```text
<name>-prepared/
├── <name>.pptx
├── <name>-rendered.pdf
├── <name>-index.md
└── <name>-source-map.json
```

PDF:

```text
<name>-prepared/
├── <name>.pdf
├── <name>-index.md
└── <name>-source-map.json
```

For large-deck upload chunks, the Markdown and JSON should cover the same original slide/page range as the paired PDF when chunk PDFs are produced:

```text
chunks/
├── <name>-001-040.pdf
├── <name>-001-040.md
├── <name>-001-040.json
└── ...
```

Original numbering must remain authoritative inside every representation. Slide/page 41 is always 41 even inside a `041-080` chunk.

## V1 source-map shape

Use a small versioned JSON shape. Example:

```json
{
  "version": 1,
  "source": {
    "filename": "Example.pptx",
    "type": "pptx"
  },
  "pageCount": 2,
  "pages": [
    {
      "id": "slide-0001",
      "page": 1,
      "label": "Slide 0001",
      "width": 960,
      "height": 540,
      "blocks": [
        {
          "order": 1,
          "type": "text",
          "text": "What is the diagnosis?",
          "geometry": {
            "x": 0.12,
            "y": 0.18,
            "width": 0.5,
            "height": 0.08
          },
          "style": {
            "fontSize": 24,
            "color": "#000000",
            "bold": false,
            "italic": false
          }
        }
      ],
      "speakerNotes": "Discuss the answer after learners respond."
    }
  ]
}
```

For PDF pages, geometry/style may be `null` when the deterministic native-text adapter cannot establish them safely. Do not invent coordinates or formatting.

## Stable ordering

Within each page/slide, sort blocks deterministically by approximate visual reading order:

```text
top → bottom
then left → right
then original extraction order as tie-breaker
```

Assign `order` after sorting.

The Markdown index should be generated from the same normalized page/block representation rather than from a separate interpretation path. This keeps Markdown and JSON aligned.

## Cross-file identity

Use the same zero-padded label everywhere:

```text
Slide 0042
Page 0042
```

The Markdown index should make the cross-file relationship explicit, for example:

```text
## Slide 0042

Visual page: 42
Source-map id: slide-0042
```

Do not rely on fragile display-only renumbering in chunks.

## PPTX extraction

Where PowerPoint COM exposes the information straightforwardly, capture:

- text content;
- shape/table text type;
- approximate left/top/width/height;
- font size;
- font colour;
- bold/italic;
- speaker notes;
- original slide dimensions.

V1 does not need perfect run-level typography, SmartArt reconstruction, chart-data extraction, or nested-layout fidelity. Prefer a conservative `null` field to fabricated precision.

## PDF extraction

Use native/selectable text only in v1. If the chosen deterministic local PDF text tool exposes bounding boxes, preserve them; otherwise use `geometry: null` and `style: null`.

No OCR is added by this amendment.

## Acceptance additions

PR #164 implementation should additionally prove that:

1. every prepared slide/page has exactly one stable source-map page record;
2. every page/slide identifier matches the Markdown index identifier;
3. source-map block ordering is deterministic;
4. geometry is normalized consistently when available;
5. missing geometry/style is represented as `null`, not guessed;
6. PowerPoint speaker notes appear in both the source map and Markdown index without semantic rewriting;
7. chunk Markdown/JSON ranges remain aligned when chunking is implemented;
8. no semantic labels are introduced into the source map.
