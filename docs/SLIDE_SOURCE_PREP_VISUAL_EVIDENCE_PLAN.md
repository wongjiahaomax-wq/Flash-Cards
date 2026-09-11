# Slide Source Prep — Rendered Page Images and Contact Sheets Plan

## Status

Planning only. Do not implement in this commit.

## Goal

Reduce extraction-AI navigation and visual bookkeeping by adding deterministic visual evidence to Slide Source Prep:

```text
prepared source
├── existing source/rendered PDF
├── existing index.md
├── existing source-map.json
├── source-pages/
│   ├── page-0001.jpg
│   ├── page-0002.jpg
│   └── ...
└── overview/
    ├── pages-0001-0016.jpg
    ├── pages-0017-0032.jpg
    └── ...
```

The new outputs are retrieval/review aids only. They must not introduce semantic interpretation.

## Product intent

The extraction AI currently receives aligned visual, textual, and structural evidence, but visual inspection still requires navigating the source/rendered PDF page by page. Pre-rendering each page and providing numbered contact sheets should make it cheaper to:

- scan the deck structure;
- identify likely multi-page Case groups for later semantic inspection;
- compare visually similar question/answer-continuation slides;
- distinguish obvious title/reference/summary pages from Case material;
- inspect a specific source page without re-rendering the PDF;
- reuse deterministic page renders as source-preview material when assembling the Reviewable Import Bundle.

This should help PPTX, native PDF, scanned/image-heavy PDF, and screenshot-heavy material equally at the visual-evidence layer.

## Preserve

Slide Prep remains a deterministic, pre-semantic evidence-preparation tool.

Preserve all current invariants:

- no Case/question/answer/diagnosis/Topic/Tag inference;
- no OCR in this change;
- no LLM/API/cloud dependency;
- the rendered PDF remains visual authority for PPTX;
- the supplied PDF remains visual authority for PDF;
- original slide/page numbering remains aligned across all artifacts;
- hidden PPTX slides remain represented exactly as current behavior requires;
- existing native-text/source-map/speaker-note semantics remain unchanged;
- existing chunking, `--force`, launcher, failure cleanup, and portable extraction handoff remain intact;
- no reviewer/finalizer/importer behavior change unless a minimal compatibility adjustment is required to consume already-prepared previews.

## Scope

### 1. Per-page rendered images

For every source slide/page, generate one deterministic visual render from the same authoritative PDF used by the existing pipeline.

Recommended prepared-root shape:

```text
source-pages/
├── page-0001.jpg
├── page-0002.jpg
└── ...
```

Requirements:

- exactly one image for every original source page/slide;
- contiguous original numbering, zero-padded to four digits;
- JPEG output unless current repository constraints provide a stronger reason to use PNG;
- sufficient resolution for detailed visual inspection of teaching slides, including ordinary tables and screenshots;
- deterministic orientation and dimensions derived from the rendered/source PDF page;
- no crop, enhancement, annotation, OCR, or semantic alteration;
- generation failure must fail the preparation run rather than leave an apparently complete prepared directory.

The implementation should choose a bounded render resolution/quality after inspecting current tooling and package-size implications. Do not silently degrade source readability solely to minimise prepared-folder size.

### 2. Numbered contact sheets

Compose the per-page images into deterministic overview sheets, initially targeting 16 source pages per sheet in a 4 × 4 grid unless implementation evidence shows a materially better bounded default.

Recommended shape:

```text
overview/
├── pages-0001-0016.jpg
├── pages-0017-0032.jpg
└── ...
```

Requirements:

- preserve source order left-to-right, top-to-bottom;
- every thumbnail must have a clearly visible source page/slide number outside the source image so numbering cannot be mistaken for slide content;
- do not overlay labels onto the source thumbnail itself;
- maintain source aspect ratio; use padding rather than destructive stretching/cropping;
- contact sheets are for deck-level navigation and structural orientation, not authoritative small-text reading;
- final partial sheets must represent only the remaining source pages and use the exact covered range in the filename;
- every source page must appear exactly once across the contact-sheet set.

### 3. Portable extraction contract/handoff

Update the repository-independent prepared-source contract so an extraction AI understands the new evidence hierarchy:

- source/rendered PDF remains visual authority;
- `source-pages/` are deterministic full-page visual retrieval aids aligned 1:1 with source numbering;
- `overview/` contact sheets are navigation aids only and must not be treated as stronger evidence than full-page renders/PDF;
- use the full-resolution page/PDF when detailed text, image annotations, answer leakage, or ambiguous visual evidence matters;
- the complete prepared source remains required for a final review ZIP.

Keep `AI_EXTRACTION_HANDOFF_PROMPT.md` short. Detailed semantics belong in `AI_EXTRACTION_CONTRACT.md`.

### 4. Review-bundle source-preview reuse

Investigate the smallest compatible way for the extraction AI to reuse prepared per-page renders as `source-previews/` in the Reviewable Import Bundle instead of regenerating equivalent page images.

Preferred outcome:

```text
prepared source-pages/page-0007.jpg
→ copied unchanged as
review ZIP source-previews/source-001-page-0007.jpg
```

This must remain an extraction/bundle-assembly convenience, not a production-importer change. If current contracts already permit this without code changes, document the intended reuse rather than adding unnecessary implementation.

## Explicit non-goals

Do not add in this PR:

- DOCX support;
- direct PNG/JPG source-set ingestion;
- OCR;
- image-to-text extraction;
- adjacent-page similarity scoring;
- visual diff generation;
- automatic question/answer pairing;
- Case-boundary detection;
- learner-Asset selection;
- embedded-media extraction;
- semantic metadata in `source-map.json`;
- changes to final Topic taxonomy or content-model semantics.

Those may be evaluated separately after measuring whether rendered pages/contact sheets materially reduce extraction burden.

## Implementation shape

Prefer one shared PDF-rendering path so PPTX and PDF sources converge after current source preparation:

```text
PPTX
  → existing PowerPoint render → aligned PDF
                              \
                               → page renderer → source-pages/ → contact-sheet composer
                              /
PDF ─────────────────────────
```

Do not build separate PPTX and PDF thumbnail engines unless required by a concrete platform limitation.

Use current repository-owned dependencies/tooling where suitable. Avoid introducing a heavy new runtime or image-processing dependency when existing Poppler/ImageMagick-equivalent capabilities already available to the tool can satisfy the contract reliably. If a new dependency is necessary, keep it local to the preparation tool and justify it in the PR.

## Failure and lifecycle behavior

The prepared folder represents a coherent successful run. Therefore:

- missing/failed page renders are fatal;
- malformed or incomplete contact-sheet generation is fatal;
- existing partial-output cleanup semantics remain intact;
- an existing prepared directory remains protected by current `--force` behavior;
- the Windows launcher continues to use the same CLI preparation path and automatically receives the new outputs.

## Executable acceptance contract

The implementation must provide focused executable proof at the actual preparation layer, not source-regex inspection alone.

| Invariant | Required behavior | Required executable proof |
| --- | --- | --- |
| Exact page coverage | N-page input produces exactly N ordered page renders | Prepare a deterministic fixture PDF and assert filenames/count plus page dimensions/readability sanity |
| PPTX/PDF alignment | PPTX page renders come from the same aligned rendered PDF and preserve hidden-slide numbering | Existing/manual real-PPTX smoke plus focused deterministic logic coverage where PowerPoint COM cannot run in CI |
| Contact-sheet coverage | Each source page appears once, in source order, with correct range filenames | Execute contact-sheet generation for full and partial groups and inspect/assert composition metadata or pixels |
| Number labels | Contact-sheet labels are outside thumbnails and correspond to source page numbers | Executable image-level assertion or deterministic composition primitive test |
| No destructive geometry | Thumbnails preserve page aspect ratio without crop/stretch | Executable dimension/layout assertions |
| Fail-closed preparation | Render/contact-sheet failure removes the newly created prepared output | Invoke preparation with controlled renderer/composer failure and assert cleanup |
| Portable contract | Extraction contract accurately describes page renders/contact sheets and preserves PDF authority | Focused contract test against prepared portable artifacts |
| Existing behavior | PPTX/PDF index/source-map/chunking/launcher behavior remains intact | Current focused Slide Prep suite plus repository-required final validation |

Static source inspection may supplement these tests but must not substitute for executable coverage where the invariant concerns actual generated images or preparation lifecycle.

## Measurement / follow-up

This feature is intended to reduce AI burden rather than add artifacts for their own sake. After implementation, run at least one representative extraction comparison and record qualitative/quantitative evidence where practical:

- number of PDF page-render/navigation operations required by the AI;
- whether contact sheets allow Case-group identification before detailed inspection;
- whether prepared page renders can be reused directly as review `source-previews/`;
- prepared-folder size impact;
- any model/provider limitation caused by many image files.

Do not make similarity/diff/OCR work part of this PR unless measurement demonstrates that page renders/contact sheets alone are insufficient and the scope is explicitly amended first.

## Luna / Codex implementation handoff

Implement this plan later with GPT-5.6 Luna in Codex using a usable local checkout and shell.

When implementation starts:

- continue this existing Draft PR; do not create another PR or restart from `main`;
- inspect the actual current PR head and current repository guidance before editing;
- use progressive retrieval, starting from the Slide Source Prep implementation/tests and broadening only when evidence requires it;
- preserve the deterministic/non-semantic boundary and all explicit non-goals above;
- use focused executable tests during iteration, then current repository-owned final validation;
- keep the PR Draft and do not merge or mark Ready for Review until implementation has been independently reviewed.

## Implementation-ready checkpoint

Before coding, review this plan once for literal executability: a capable agent should not be able to satisfy the wording while omitting exact page coverage, correct contact-sheet numbering/order, fail-closed cleanup, or the visual-authority hierarchy. Amend only genuine gaps found by that review; do not reopen unrelated Slide Prep architecture.
