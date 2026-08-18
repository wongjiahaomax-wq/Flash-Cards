# ECG Anki ingestion rules

_Status: adopted and production-validated. The initial ECG source migration is complete; these rules remain the reviewed-package preparation convention for future ECG material._

_Last updated: 18 August 2026_

## Purpose

These rules govern the **external reviewed-package preparation step** for ECG Anki/source material.

The production application continues to import only reviewed Flash-Cards Import Package v1 ZIPs. It does not infer diagnoses, rename Assets, interpret arbitrary APKG content, or promote raw Anki Tags into the application model automatically.

For the complete chain see:

- `ANKI_APKG_EXTRACTION.md` — mechanical `.apkg` recovery/normalization;
- `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` — real ECG source → reviewed objects → Import Package v1 → production record;
- `CONTENT_IMPORT_PACKAGES.md` — strict/resumable production importer contract.

## 1. Initial content mapping

The adopted baseline mapping is:

```text
Anki deck/topic
    ↓ curated Study Topic route
Anki note
    ↓
Case
    ├── front-side ECG image(s) → Case Asset(s)
    └── source Q/A pairs → contextual Case Questions
```

Initial import should preserve source questions conservatively as Case Questions unless reuse has already been explicitly reviewed.

Reusable Topic questions, Shared Questions, Additional Study Topics, alternative stimulus groups, and Tags are progressive enrichment.

Raw Anki Tags are evidence for later curation; they are not automatically promoted into Topics or canonical application Tags.

## 2. Required Asset display-name convention

Every imported ECG teaching image should receive a human-readable `assets.original_filename` that starts with the Case title and identifies modality plus sequence number.

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

Use two-digit numbering beginning at `01` within each Case/modality, even when only one image currently exists. This preserves stable human sorting if alternatives are added later.

For other modalities use the same pattern with an appropriate label:

```text
<Case title> — X-ray 01.jpg
<Case title> — CT 01.png
<Case title> — Clinical photo 01.jpg
```

## 3. Why `original_filename` is the display field

The Admin Image Library displays/searches/sorts `assets.original_filename`.

Therefore the human-readable Case-aligned label belongs in that field.

The R2 `storage_key` is a separate immutable internal identity and must **not** be renamed merely to improve Admin display/sorting.

Source media filenames/hashes may remain in review artifacts for reconciliation, but values such as:

```text
paste-<hash>.jpg
```

are not acceptable human-facing names for newly prepared ECG packages.

## 4. Learner-information boundary

Case-aligned Admin filenames may contain the diagnosis. Learner-facing alt text/captions must not copy diagnosis-bearing Admin metadata when it would reveal the answer.

Prefer neutral alt text such as:

```text
12-lead ECG tracing for this case
```

or an equivalent accessibility description that does not disclose the diagnosis unnecessarily.

## 5. Provenance is independent of display naming

Where known, preserve image provenance using the existing fields:

```text
source_label
source_url
licence
```

Unknown provenance remains unknown until reviewed; never fabricate attribution.

Changing `original_filename` does not change provenance and does not change R2 identity.

## 6. Reviewed-package approval rule

Before approving an ECG Import Package v1:

1. every create-Asset maps to a reviewed Case;
2. every ECG `originalFilename` follows `<Case title> — ECG NN.<ext>`;
3. numbering is unique/sequential within the Case/modality;
4. `altText` remains learner-safe;
5. deterministic package-local IDs/storage behavior remain unchanged by display renaming;
6. provenance is retained independently where available;
7. source questions are mapped conservatively enough to preserve meaning for later curation.

This naming rule is an ECG preparation convention, not a generic Import Package v1 schema restriction. The importer remains modality-agnostic.

## 7. Batch 01 retrospective rename — completed audit record

Package:

```text
packageId: ecg-anki-batch-01-20260816
```

was imported before the Case-aligned naming rule was adopted. Its 13 teaching Assets initially retained source-style `paste-<hash>.jpg` names.

A fixed-purpose operator was added:

```text
scripts/rename-ecg-batch-01-assets.mjs
.github/workflows/rename-ecg-batch-01-assets.yml
```

Safety contract:

- target exactly the 13 deterministic Batch 01 Asset IDs;
- verify each immutable R2 `storage_key`;
- accept only the recorded old source filename or intended target filename;
- mutate only `assets.original_filename`;
- use 13 small individually guarded updates rather than a large free-form mutation;
- post-flight verify all target names/storage keys;
- never mutate R2 bytes/keys, Cases, Questions, Topics, Tags, Reviews, users, or learner progress.

### Historical failed first query shape

The first production apply attempt used one large guarded `CASE` UPDATE. Pre-flight matched all 13 Assets, but Cloudflare D1 returned internal error 7500 for that query shape. No rename was verified from that attempt.

The operator was simplified to 13 fixed guarded UPDATE statements.

### Final outcome

The rerun succeeded and post-flight verification confirmed all 13 Batch 01 `original_filename` values were corrected while immutable storage keys remained unchanged.

The current production migration record independently confirms that Batch 01 and Batch 02 ECG Assets use the adopted Case-aligned naming convention.

Therefore **do not treat the Batch 01 rename as pending work**. Keep the operator/runbook only as a fixed-purpose audit/recovery record.

## 8. Initial ECG migration outcome

Production verification on 18 August 2026 closed the initial source migration:

```text
Batch 01 imported Cases/ECGs:      13
Batch 02 imported Cases/ECGs:      51
Pre-existing mapped calcium Cases:  2
                         ----
Source notes represented:          66 / 66
```

Future work on this corpus is curation/enrichment: Tags, Shared Questions, Additional Study Topics, alternative stimuli, and medical content review where useful.

## 9. Future ECG ingestion principle

For future source batches:

```text
preserve source meaning first
→ use Case-aligned human media names
→ keep learner-facing metadata neutral
→ import through reviewed Package v1
→ enrich progressively after ingestion
```

Do not require a complete taxonomy/Tag/reuse model before reviewed ECG content can enter the application.
