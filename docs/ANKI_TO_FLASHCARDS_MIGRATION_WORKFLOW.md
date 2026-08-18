# Anki → Flash-Cards reviewed import workflow

_Last updated: 18 August 2026_

## Purpose

This document records the complete workflow used to migrate the real ECG Anki deck into Flash-Cards.

It bridges three layers that must remain separate:

```text
1. APKG source extraction
2. reviewed semantic transformation
3. deterministic production import
```

The production application does **not** parse `.apkg` files, infer diagnoses, interpret Anki tags, OCR slides, or decide how source material should map into Flash-Cards. Those decisions happen before the strict Import Package v1 reaches Admin.

For low-level APKG recovery, see `ANKI_APKG_EXTRACTION.md`.
For ECG-specific content/Asset naming rules, see `ECG_ANKI_INGESTION_RULES.md`.
For the production importer contract, see `CONTENT_IMPORT_PACKAGES.md`.

## End-to-end flow

```text
Fam Med Stuff__ECG Slides.apkg
        ↓
mechanical APKG extraction
        ↓
ecg_anki_import_source.zip
        ↓
source validation + reconciliation + semantic review
        ↓
reviewed Flash-Cards objects
        ↓
Import Package v1 ZIP
        ↓
Admin Validate and preview
        ↓
select exact same ZIP + explicit confirmation
        ↓
resumable D1/R2 import
        ↓
Admin/learner QA
        ↓
post-import Tag/shared-question curation later
```

## Phase A — convert `.apkg` into a reviewable source ZIP

The original deck was:

```text
Fam Med Stuff__ECG Slides.apkg
```

The APKG was first converted into a mechanically verified source package rather than directly into Flash-Cards rows.

The extraction recovered:

- Anki note/card identifiers;
- deck identifiers/names;
- source tags;
- front/back HTML;
- front/back plain text;
- front-side and answer-side media references separately;
- fully decompressed JPEG/PNG media;
- media size and SHA-1 metadata;
- a CSV review index;
- production reconciliation metadata.

The result was:

```text
ecg_anki_import_source.zip
```

Its intended logical layout was:

```text
ecg_anki_import_source/
├── README.md
├── notes.json
├── cards_summary.csv
├── media_manifest.json
├── production_mapping.json
└── media/
    └── original Anki JPEG/PNG files
```

The historical artifact also retained two unnecessary SQLite sidecars (`_collection.sqlite-shm` and an empty `_collection.sqlite-wal`). They were not used by downstream processing. The canonical extractor must remove such temporary files.

See `ANKI_APKG_EXTRACTION.md` for the exact ZIP/Zstandard/protobuf/SQLite workflow and its verification rules.

## Phase B — verify the normalized source package before interpreting it

Before doing any clinical/domain transformation, the normalized ZIP was inspected as source data.

For the ECG deck we verified:

```text
notes:                 66
cards:                 66
media objects:         68
front media refs:      66
answer-side media refs: 2
media bytes:           7,195,626
JPEG:                  66
PNG:                   2
missing media refs:    0
unused media:          0
SHA-1 mismatches:      0
size mismatches:       0
```

This validation establishes that later omissions or transformations are deliberate review decisions rather than extraction loss.

## Phase C — reconcile against existing production content

The source package included `production_mapping.json` because two source notes were already represented in production.

They were:

```text
Hypocalcemia
Anki note: 1746797967142
Existing Case: b11b6a14-c55e-4d70-849c-ce1c8953a38f
Action: review-and-merge-do-not-duplicate
```

and:

```text
Hypercalcemia
Anki note: 1746800349557
Existing Case: b1f4870e-52fe-4d26-bbea-851ec64357a7
Action: review-and-merge-do-not-duplicate
```

Those two notes were therefore **excluded from new Case creation**.

This reconciliation step is essential. An APKG migration is not just an append operation; source identifiers and current production content must be checked so a re-import does not create duplicate clinical Cases.

## Phase D — choose the initial semantic mapping

The agreed migration principle was to preserve the deck relatively faithfully first, then normalize/cross-link later as repeated structure becomes obvious.

### One source note initially becomes one Case

For this deck:

```text
Anki note
    ↓
Case
```

Repeated diagnoses remain separate Cases when their presentations/stems differ. They can later share Tags or reusable Questions without collapsing distinct encounters.

### Front ECG becomes the Case stimulus

For the initial ECG migration:

```text
front-side ECG image
    ↓
Case Asset
```

Answer-side images are **not** automatically flattened into the stimulus list.

### Source Q/A becomes contextual Case Questions

Question/answer material was initially attached at Case level:

```text
source ask/answer pair
    ↓
Question Prompt + Case Question answer
```

The answer remains contextual to that Case.

### Reuse prompt wording only when genuinely identical

`question_prompts` represent reusable wording, not clinical ownership.

When wording was exactly reused across Cases, one Question Prompt could be reused while each Case retained its own answer relationship.

We did **not** aggressively generalize similar-but-not-identical questions into shared knowledge during migration.

### Topic routing stayed deliberately conservative

New ECG Cases were routed under the existing production Topic:

```text
ECG Findings
```

Raw Anki tags were **not** exploded into dozens of Topics.

This was deliberate because source tags mixed diagnoses, findings and other labels. Stage A Tags can be curated after content is safely imported.

### Question selection preserved the original encounter

Imported Cases used:

```text
questionSelectionMode = all
```

so the learner sees the source Case's full sequence rather than prematurely randomizing a subset.

### Provenance was not guessed

If an image's source/licence was unknown, the importer left:

```text
sourceLabel = null
sourceUrl = null
licence = null
```

Unknown provenance must remain unknown until reviewed.

## Phase E — normalize human-facing Case and Asset metadata

Anki media names were source hashes such as:

```text
paste-c1bb25c15c3b0c56a7e686cdbe6586670527fb49.jpg
```

Those filenames are useful as source provenance but poor for the Admin Image Library.

The adopted ingestion convention is:

```text
<Case title> — ECG 01.<ext>
<Case title> — ECG 02.<ext>
```

For example:

```text
Posterior MI — chest pain — ECG 01.jpg
Wolff-Parkinson-White syndrome — ECG 01.jpg
```

This value goes into `assets.original_filename` because that is the human-facing Image Library name/search/sort field.

The R2 `storage_key` remains the deterministic internal key and is not renamed for display convenience.

Learner-facing `altText` remains neutral, for example:

```text
12-lead ECG tracing for this case.
```

A diagnosis-bearing Admin filename must not accidentally become a learner clue.

See `ECG_ANKI_INGESTION_RULES.md`.

## Phase F — build a reviewed Flash-Cards Import Package v1

The production importer accepts only:

```text
<package>.zip
├── manifest.json
└── media/
    └── declared JPEG/PNG files
```

The manifest explicitly declares reviewed domain objects:

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

Every object uses an explicit operation:

```text
create
use
skip
```

For this migration:

- the existing `ECG Findings` Topic was `use`;
- new Cases/Assets/relationships were `create`;
- pre-existing calcium source notes were not recreated;
- Tags were not placed in Import Package v1 because tagging remains a later curation stage.

The importer derives deterministic application IDs/storage keys server-side. The package does not provide SQL/table names or arbitrary production identifiers for create operations.

## Phase G — Batch 01 pilot

Rather than committing the whole deck before validating the mapping in the real application, the first package was a representative pilot.

Package:

```text
ecg_anki_batch_01_import_v1.zip
packageId: ecg-anki-batch-01-20260816
SHA-256: 9021997d31e547bdfa1a6f152fbe27143f85714b464c5f999f15a3e236f4c7e9
```

Contents:

```text
Topics:             1 use
Cases:              13 create
Assets:             13 create
Case Assets:        13 create
Question Prompts:   37 create
Case Questions:     42 create
Topic Questions:    0
Primary Topic links: 13
Secondary links:     0
```

The 13 pilot notes covered a range of source shapes: Cases with/without vignettes, short and longer question sequences, and different ECG diagnoses/presentations.

The Admin static preview passed, the resumable job completed, and the Cases were written to production.

## Phase H — learn from Batch 01 and correct the Asset naming rule

The pilot exposed one workflow problem: the imported Image Library names retained source-style `paste-<hash>.jpg` filenames.

That made sorting/searching difficult.

The permanent rule was therefore added:

```text
<Case title> — ECG NN.<ext>
```

The 13 already-imported Batch 01 `assets.original_filename` values were retroactively corrected with a narrowly scoped production operator.

The operator:

- targeted exactly the 13 deterministic Batch 01 Asset IDs;
- verified each immutable R2 storage key;
- changed only `assets.original_filename`;
- left R2 bytes/storage keys untouched;
- verified all 13 names after mutation.

The first implementation used one large guarded SQL UPDATE and Cloudflare D1 returned internal error 7500. It was replaced with 13 small guarded UPDATE statements; the rerun succeeded and post-flight verified all 13 records.

This is documented in `ECG_ANKI_INGESTION_RULES.md`.

## Phase I — prepare and import the remaining 51 notes as reviewed Batch 02

After the pilot was accepted, the accounting was:

```text
66 source notes
- 13 imported in Batch 01
- 2 pre-existing production-mapped calcium notes
= 51 remaining notes
```

The remainder fit comfortably within Import Package v1 size/entry limits, so it was prepared as one package while still relying on the resumable importer for bounded execution.

Package:

```text
ecg_anki_batch_02_import_v1.zip
packageId: ecg-anki-batch-02-20260816
SHA-256: 926248292b002cbd33d40ad588eac9a6c0ec2833cbfe4290fe4b7bd0fdd72262
```

Package size/structure:

```text
compressed bytes:   5,802,245
ZIP entries:        52
uncompressed bytes: 5,955,298
```

Contents:

```text
Topics:             1 use
Cases:              51 create
Assets:             51 create
Case Assets:        51 create
Question Prompts:   66 total
  - 63 create
  - 3 use/reused
Case Questions:     153 create
Topic Questions:    0
Primary Topic links: 51
Secondary links:     0
```

The 3 reused Question Prompts were exact wording matches already created in Batch 01.

## Production completion verification — 18 August 2026

The original migration documentation recorded Batch 02 as prepared but did not yet record its production completion. A later read-only D1 audit closed that gap.

The exact reviewed import-job rows are:

```text
Batch 01
packageId: ecg-anki-batch-01-20260816
SHA-256:   9021997d31e547bdfa1a6f152fbe27143f85714b464c5f999f15a3e236f4c7e9
status:    complete
phase:     finalize
progress:  264 / 264
lastError: null

Batch 02
packageId: ecg-anki-batch-02-20260816
SHA-256:   926248292b002cbd33d40ad588eac9a6c0ec2833cbfe4290fe4b7bd0fdd72262
status:    complete
phase:     finalize
progress:  848 / 848
lastError: null
```

The same production verification confirmed the current deterministic content state:

```text
Batch 01: 13 active production Cases
13 active ECG Assets
13 Case↔ECG links

Batch 02: 51 active production Cases
51 active ECG Assets
51 Case↔ECG links
```

All 64 imported ECG Assets use the adopted Case-aligned ECG filename convention. The two pre-existing mapped calcium Cases are also active production Cases with at least one active production image each.

Therefore the complete source accounting is:

```text
13 Batch 01 imported notes
+ 51 Batch 02 imported notes
+ 2 pre-existing mapped calcium notes
= 66 / 66 source notes represented in production
```

An initial audit query using a long `LIKE` pattern triggered Cloudflare D1 internal error 7500 (`LIKE or GLOB pattern too complex`). The import-job rows themselves already showed both jobs complete; the final count verification replaced the problematic query shape with simple deterministic-prefix comparisons and passed. The red first audit was therefore an audit-query failure, not evidence of missing imported content.

Initial ECG source ingestion is now complete. Subsequent work should treat the corpus as content to curate/enrich rather than a pending migration: add clinically useful Tags, promote genuinely reusable knowledge into Shared Questions, add additional Study Topic routes/stimulus variants where justified, and perform medical correction/review separately from migration accounting.

## Source-specific review decisions in Batch 02

The transformation remained source-derived rather than silently medical-editing the deck, but a few notes required explicit handling.

### Answer-side image containing AF cause lists

Source note:

```text
1725543447705
```

The cardiac/non-cardiac causes were stored in an answer-side image. The visible source lists were transcribed into the relevant Case Question answers rather than publishing that answer image as a learner stimulus.

This is a **semantic transformation from visible source material**, not OCR performed by the production importer.

### Diagnosis omitted from answer text but present in source tag

Source note:

```text
1725542476483
```

The answer text omitted the diagnosis, while the Anki source tag explicitly identified first-degree heart block. The transformation used that source tag as the support for the diagnosis answer and recorded the exception in the review artifact.

### Incomplete answer labels

Source note:

```text
1725539570495
```

Its answer labels were incomplete. The first two asks were combined into one Case Question so the available source answer was not split speculatively.

These exceptions illustrate the key rule: preserve and transform what the source actually supports; do not invent missing clinical content merely to make the structure look uniform.

## Phase J — package-level verification before handing the ZIP to Admin

Each reviewed Import Package was checked outside production before upload.

Checks included:

- package ID/version present;
- only `manifest.json` and declared `media/` entries;
- no ZIP data descriptors;
- size/entry-count within importer limits;
- every create-Asset media path exists;
- no undeclared media;
- declared MIME type matches image magic bytes;
- local IDs globally unique;
- references resolve to declared package objects;
- no duplicate Case/Asset relationships;
- no duplicate display order within a Case;
- prompt reuse uses explicit `use` when appropriate;
- Case titles and `originalFilename` follow reviewed naming rules;
- alt text remains learner-safe;
- production-mapped source notes are not duplicated.

The generated review Markdown is retained outside the production package so an administrator/agent can inspect the transformation before import.

## Phase K — Admin validation and exact-ZIP confirmation

The administrator flow is:

```text
Admin → Import package
        ↓
select reviewed ZIP
        ↓
Validate and preview
        ↓
check package counts/warnings
        ↓
select the exact same ZIP again
        ↓
explicit confirmation
        ↓
Start resumable import
```

The static preview validates the hardened package structure and reports counts.

Database conflict validation deliberately occurs later in the durable job, because a large package should not run the entire D1 dry-run in the preview request.

**All database validation phases still complete before the first domain write.**

## Phase L — resumable bounded production execution

The importer stores job state in D1 and stages the exact confirmed package privately in R2.

The browser repeatedly asks for one bounded next step.

Current execution uses:

```text
IMPORT_ITEMS_PER_REQUEST = 7
IMPORT_D1_OPERATION_BUDGET = 40
```

Validation phases run before domain-write phases. The browser can pause/close/sleep without losing completed checkpoints.

The package is not whole-package transactional once write phases begin, so safety instead relies on:

- pre-write database validation;
- deterministic IDs/keys;
- idempotent matching retries;
- fail-closed conflicts;
- persisted phase/cursor;
- bounded requests;
- exact-R2 object identity;
- post-error resume from the durable checkpoint.

See `CONTENT_IMPORT_PACKAGES.md` and `RESUMABLE_IMPORT_RUNTIME_SAFETY.md`.

## Phase M — post-import QA before further normalization

After a package completes, the imported material should be checked in both Admin and learner views before doing large-scale content normalization.

Recommended checks:

```text
Case appears under the intended Topic
ECG image renders
vignette is in the expected place
all Case Questions appear
question order makes sense
answers render/read correctly
Admin image filename is sortable/searchable
answer-side source media was not accidentally exposed
no duplicate pre-existing Cases were created
```

Only after ingestion is stable should later work promote repeated concepts into shared Questions, add cross-cutting Tags, or introduce more sophisticated Topic routing.

## What was intentionally deferred

The ECG migration deliberately did **not** try to solve all future content architecture at import time.

Deferred work includes:

- broad medical fact-checking/correction of source content;
- automatic Anki tag → Topic conversion;
- automatic Case Tag → Question Tag inheritance;
- shared/tag-scoped Question normalization beyond exact prompt reuse;
- Study-by-Tag;
- AI taxonomy assignment inside production;
- automatic answer-image stimulus exposure;
- generic APKG parsing inside the Worker/Admin app.

This keeps initial ingestion reversible and reviewable.

## Generic reusable recipe for future Anki decks

### Stage 1 — mechanical extraction

```text
1. Inspect APKG format
2. Recover collection database
3. recover/decompress media
4. verify hashes/sizes
5. extract notes/cards/tags/source IDs
6. preserve HTML + plain text
7. separate front/back media
8. package normalized source ZIP
```

### Stage 2 — semantic review

```text
1. inspect source corpus
2. inspect existing production content
3. identify duplicates/reconciliation targets
4. choose Topic routing
5. choose Case boundaries
6. identify stimuli
7. split source Q/A into contextual Questions
8. reuse only genuinely shared Prompt wording
9. preserve unknown provenance
10. document any source-specific exception
```

### Stage 3 — reviewed Import Package v1

```text
1. build explicit manifest
2. include only learner-needed media
3. apply human-readable Asset names
4. use explicit create/use/skip
5. verify references/MIME/ZIP limits
6. calculate/store package SHA-256 for review
7. produce separate human review artifact
```

### Stage 4 — production

```text
1. Admin preview
2. verify counts
3. reselect exact same ZIP
4. explicit confirmation
5. resumable import
6. inspect completion/error
7. learner/Admin QA
```

### Stage 5 — later curation

```text
Tags
shared Questions
additional Topic routes
stimulus alternatives/groups
clinical updates/corrections
```

## Invariants to preserve

Throughout the workflow:

```text
source extraction must be mechanical
semantic review must be traceable to source
production import must be deterministic
```

And specifically:

- never infer production taxonomy from raw Anki tags without review;
- never automatically expose answer-side images;
- never guess source/licence metadata;
- never duplicate known production Cases;
- never use diagnosis-bearing Admin filenames as learner-facing alt text;
- never treat the normalized source ZIP as a production database dump;
- never bypass Admin preview/exact-ZIP confirmation for reviewed package imports.

## Reproducibility status

The production importer and its safety checks are repository-owned and tested.

The APKG extraction algorithm is now documented in `ANKI_APKG_EXTRACTION.md`, but the exact one-off extractor program used for the first ECG deck is not yet committed. If future migrations become frequent, that should become a tested offline utility with explicit support for known Anki package variants.

The semantic transformation remains intentionally review-driven. Automating repetitive formatting is reasonable; silently automating clinical interpretation or taxonomy decisions is not.