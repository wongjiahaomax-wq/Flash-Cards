# ECG Anki ingestion rules

_Last updated: 16 August 2026_

## Status

This is the adopted conversion rule for migrating the ECG Anki source material into Flash-Cards.

It governs the **external reviewed-package preparation step**. The production application continues to import only reviewed Flash-Cards Import Package v1 ZIPs and does not infer diagnoses, rename Assets, or interpret arbitrary Anki/APKG content.

For the complete migration chain, see:

- `ANKI_APKG_EXTRACTION.md` — mechanical `.apkg` → normalized reviewed-source ZIP recovery;
- `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` — the real ECG source ZIP → reviewed Cases/Questions/Assets → Import Package v1 → production workflow;
- `CONTENT_IMPORT_PACKAGES.md` — the strict production Import Package v1 and resumable-import contract.

## Initial content mapping

For the initial ECG migration:

```text
Anki deck/topic
    ↓ curated Study Topic route
Anki note
    ↓
Case
    ├── front-side ECG image(s) → Case Asset(s)
    └── source Q/A pairs → Case Questions
```

The initial import should preserve source questions as contextual Case Questions. Reusable/shared questions and additional Tags are curated later when repetition across imported material is visible.

Raw Anki tags are evidence for later Case/Question Tag curation; they are not automatically promoted into Topics.

## Required Asset display-name convention

Every imported teaching image must receive a human-readable `assets.original_filename` that starts with the Case title and identifies the modality and sequence number.

For ECGs:

```text
<Case title> — ECG 01.<ext>
<Case title> — ECG 02.<ext>
<Case title> — ECG 03.<ext>
```

Examples:

```text
Wolff-Parkinson-White syndrome — ECG 01.jpg
Posterior MI — chest pain — ECG 01.jpg
Posterior MI — chest pain — ECG 02.jpg
```

Use two-digit numbering beginning at `01` within each Case/modality, even when there is currently only one image. This keeps alphabetical sorting stable when alternatives are added later.

For other modalities, use the same pattern with the modality label, for example:

```text
<Case title> — X-ray 01.jpg
<Case title> — CT 01.png
<Case title> — Clinical photo 01.jpg
```

### Why this field is used

The Admin Image Library displays `assets.original_filename`, searches it, and uses it for Name A–Z / Z–A sorting. Therefore the human-readable Case-aligned label belongs in `original_filename`.

The R2 `storage_key` is a separate internal immutable identity and must **not** be renamed merely to improve administrator sorting.

## Learner-information boundary

Case-aligned filenames may contain the diagnosis because they are administrator metadata. Do not copy a diagnosis-bearing Case title into learner-facing alt text or captions when doing so would reveal the answer.

Use neutral alt text appropriate to the stimulus, for example:

```text
12-lead ECG tracing for this case
```

Image provenance remains separate from the display name. Where known, use the existing `source_label`, `source_url`, and `licence` metadata. The source Anki media filename/hash may remain in migration review artifacts, but a value such as `paste-<hash>.jpg` is not an acceptable Admin Image Library display name for newly prepared ECG packages.

## Package-preparation review rule

Before a reviewed ECG Import Package v1 is approved:

1. every create-Asset must map to a known Case;
2. `originalFilename` must follow `<Case title> — ECG NN.<ext>` for ECG stimuli;
3. numbering must be unique and sequential within the Case;
4. `altText` must remain learner-safe and must not accidentally reveal the diagnosis;
5. the package must retain deterministic package-local IDs/storage behaviour; renaming `originalFilename` must never be implemented by changing the deterministic R2 key;
6. source provenance should be retained independently where available.

This is an ingestion/review rule rather than a generic Import Package v1 schema restriction. The importer remains modality-agnostic and supports non-ECG packages.

## Batch 01 retrospective cleanup

Package `ecg-anki-batch-01-20260816` was imported before this naming rule was adopted. Its 13 teaching Assets retained source-style `paste-<hash>.jpg` names.

The repository contains a fixed-purpose operator:

```text
scripts/rename-ecg-batch-01-assets.mjs
.github/workflows/rename-ecg-batch-01-assets.yml
```

The operator:

- targets exactly the 13 deterministic Asset IDs from Batch 01;
- verifies each immutable R2 `storage_key` before mutation;
- accepts only the recorded old source filename or the intended new Case-aligned filename, making safe reruns idempotent;
- changes only `assets.original_filename`;
- sends 13 small, individually guarded UPDATE statements as one fixed Wrangler/D1 multi-statement batch rather than using a large CASE/subquery UPDATE;
- guards every statement by exact Asset ID, image type, immutable storage key, and known old-or-target filename;
- performs post-flight verification of all 13 names and storage keys;
- never touches R2 objects, image bytes, Cases, Questions, Topics, Tags, Reviews, users, or learner progress.

The first production apply attempt used one large guarded CASE UPDATE. Its pre-flight passed for all 13 Assets, but Cloudflare D1 returned internal error code 7500 when executing that query shape. No rename was verified. The operator was therefore simplified to the fixed 13-statement batch above.

Run the workflow first with `apply = false`. Review the pre-flight output, then run it again with `apply = true`.
