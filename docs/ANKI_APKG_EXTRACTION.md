# Anki `.apkg` → reviewed source ZIP extraction

_Last verified: 16 August 2026_

## Purpose

This document records the mechanical extraction workflow used on:

```text
Fam Med Stuff__ECG Slides.apkg
```

The goal was **not** to convert Anki directly into production database rows. The `.apkg` was converted into a simple, inspectable interchange package containing ordinary JPEG/PNG files, note/card text, Anki tags, front-side versus answer-side image references, a media manifest, a CSV summary, and production-reconciliation metadata.

The resulting reviewed-source artifact was:

```text
ecg_anki_import_source.zip
```

For this ECG deck the verified extraction contained:

- 66 notes and 66 cards;
- 68 media files;
- 66 front-side image references and 2 answer-side image references;
- 7,195,626 bytes of media;
- 66 JPEG files and 2 PNG files;
- 0 missing media references;
- 0 unused media objects;
- matching SHA-1 and byte size for every extracted media object.

This file documents the **source-recovery layer**. See `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` for the later semantic transformation and production-import process.

## Verification against Anki's current format definitions

The method used here is consistent with Anki's upstream import/export definitions. Anki's current `PackageMetadata` describes its latest package version as using Zstandard compression and a protobuf `MediaEntries` map. `MediaEntry` includes filename, byte size and SHA-1. Anki also documents that protobuf is used internally and is not a stable public API, so a custom extractor must inspect/fail explicitly when future package formats differ rather than guessing.

Relevant upstream files:

- `ankitects/anki/proto/anki/import_export.proto`
- `ankitects/anki/docs/architecture.md`

This particular source package contained `collection.anki21b`. Older packages may use `collection.anki21` or `collection.anki2` and need a different path.

## 1. Extraction and production import are deliberately separate

The first transformation was:

```text
Anki .apkg
    ↓
mechanical source recovery
    ↓
verified source ZIP
    ↓
JSON + CSV + JPEG/PNG
```

It was deliberately separate from:

```text
verified source ZIP
    ↓
clinical/content interpretation and reconciliation
    ↓
reviewed Flash-Cards Import Package v1
    ↓
Admin preview + exact-ZIP confirmation
    ↓
resumable D1 + R2 import
```

Anki structure should not automatically dictate the Flash-Cards model. An Anki note may initially become one Case, multiple notes may later be consolidated, source tags are taxonomy evidence rather than authoritative Topics, answer-side images should not automatically become learner-visible stimuli, and identical wording can reuse one Question Prompt while the answer remains contextual.

The extraction stage therefore preserves source information rather than making irreversible application-domain decisions.

## 2. Treat the `.apkg` as an untrusted ZIP-compatible container

The first step was archive inspection:

```bash
unzip -l "Fam Med Stuff__ECG Slides.apkg"
```

This deck used a newer Anki package layout and contained entries including:

```text
collection.anki21b
media
0
1
2
3
...
```

The collection and numbered media payloads were not directly usable because this package used Zstandard compression.

A reusable extractor must treat all archive paths and sizes as untrusted, reject traversal, impose archive/decompression limits, and never execute content from the package.

## 3. Decompress `collection.anki21b`

For this deck the main Anki SQLite collection was stored as:

```text
collection.anki21b
```

It was decompressed with `zstd` into a temporary SQLite database:

```bash
zstd -d -q -c collection.anki21b > collection.sqlite
```

Equivalent Python logic:

```python
collection = subprocess.run(
    ["zstd", "-d", "-q", "-c"],
    input=zip_file.read("collection.anki21b"),
    stdout=subprocess.PIPE,
    check=True,
).stdout
```

The decompressed database was used only for source extraction. It is not a production database and must never be copied into D1.

## 4. Decompress the `media` manifest

The archive member named:

```text
media
```

was also Zstandard-compressed for this package.

Conceptually:

```bash
zstd -d -q -c media > media-manifest.bin
```

The decompressed value was not the older JSON filename map. It used Anki's protobuf-style `MediaEntries` representation.

## 5. Parse the media manifest

The extractor used a deliberately small protobuf wire parser for the wire types encountered:

- `0` — varint;
- `1` — 64-bit;
- `2` — length-delimited;
- `5` — 32-bit.

Minimal varint decoding:

```python
def read_varint(buf, i):
    value = 0
    shift = 0

    while True:
        byte = buf[i]
        i += 1
        value |= (byte & 0x7F) << shift

        if not (byte & 0x80):
            return value, i

        shift += 7
```

For the latest `MediaEntries` shape, each logical media entry supplies:

```text
original filename
uncompressed byte size
SHA-1 digest
```

The numbered archive object used for each media item is determined by the package's ordered media-entry layout. Do **not** describe that normal archive index as a standard protobuf field. Anki defines an optional `legacy_zip_filename` field for legacy mappings, but that field is not the normal identity for newly exported media.

Conceptually:

```text
media entry position 0
    → archive member "0"
    → original filename
    → expected size
    → expected SHA-1
```

Because Anki's protobuf representation is an internal implementation detail rather than a guaranteed public API, a future extractor should fail explicitly if the observed structure no longer matches the supported format.

## 6. Decompress and verify every numbered media object

The package contained numbered members such as:

```text
0
1
2
...
```

Each was decompressed with Zstandard. For every media entry, the extractor:

1. read the matching numbered ZIP member;
2. decompressed it;
3. calculated SHA-1;
4. compared SHA-1 with the manifest;
5. compared decompressed byte length with the manifest;
6. saved the bytes under the original Anki filename.

Equivalent logic:

```python
compressed = zip_file.read(str(archive_index))

raw = subprocess.run(
    ["zstd", "-d", "-q", "-c"],
    input=compressed,
    stdout=subprocess.PIPE,
    check=True,
).stdout
```

Verification:

```python
digest = hashlib.sha1(raw).hexdigest()

if digest != expected_sha1:
    raise ValueError("SHA-1 mismatch")

if len(raw) != expected_size:
    raise ValueError("Size mismatch")
```

All 68 ECG-deck media objects passed both checks.

Recovered images were written under:

```text
media/
```

using their original Anki filenames.

## 7. Read the decompressed SQLite collection

Python's standard `sqlite3` module was used.

The extraction read the note/card/deck information needed by this deck. The core note-card query was:

```sql
SELECT
    n.id,
    n.guid,
    n.tags,
    n.flds,
    c.id,
    c.did,
    c.ord
FROM notes n
JOIN cards c
    ON c.nid = n.id
ORDER BY n.id;
```

For the collection schema encountered here, deck IDs were resolved from the deck table:

```sql
SELECT id, name
FROM decks;
```

This produced 66 joined rows: 66 unique note IDs and 66 unique card IDs.

A generic extractor must **not** assume one note equals one card. One Anki note can generate multiple cards/templates, so note count and card count should always be reported separately.

## 8. Split Anki note fields

Anki stores note fields in `notes.flds`, separated by the unit-separator character:

```text
0x1F
```

In Python:

```python
fields = flds.split("\x1f")
```

For this ECG deck, the first two useful fields were treated as:

```text
fields[0] → front
fields[1] → back
```

Both the original HTML and a simplified plain-text representation were preserved.

This front/back assumption is source-model-specific and should not be silently generalized to arbitrary Anki note types.

## 9. Detect front-side and answer-side media independently

Image references were extracted separately from front and back HTML:

```python
img_re = re.compile(
    r'<img[^>]+src=["\']([^"\']+)["\']',
    re.I,
)
```

The normalized note representation therefore retained structures such as:

```json
"front_media": ["example-ecg.jpg"],
"back_media": []
```

or:

```json
"front_media": [],
"back_media": ["annotated-answer.jpg"]
```

This distinction is important. The ECG source contained two answer-side images. They were preserved as answer-side source material and were **not** automatically promoted to learner-visible Case Assets.

## 10. Produce plain text for review without discarding source HTML

BeautifulSoup was used to make HTML fields easier for humans/agents to inspect. Image elements were replaced by explicit markers rather than silently disappearing:

```python
soup = BeautifulSoup(html, "html.parser")

for img in soup.find_all("img"):
    img.replace_with(" [IMAGE] ")

text = soup.get_text("\n", strip=True)
```

This made a note reviewable as:

```text
A 50-year-old woman...
[IMAGE]
What is the ECG abnormality?
```

while `front_html` / `back_html` remained available as the source-preserving form.

## 11. Preserve source identifiers

The normalized rows retained:

```text
note_id
anki_guid
card_id
deck_id
deck_name
card_ord
```

These are provenance/reconciliation metadata, not automatic production schema requirements. They make it possible to trace a transformed Case back to the original Anki deck and to avoid accidental duplication.

## 12. Preserve Anki tags without automatically promoting them

Tags came from `notes.tags` and were normalized into arrays.

Example:

```json
"tags": ["Hypercalcemia"]
```

They were preserved as source information but were not automatically converted into production Topics. Anki tags can represent diagnoses, findings, source categories, revision labels, or administrative metadata.

Topic/Tag curation therefore happens in the semantic-review stage.

## 13. Generate `notes.json`

Each joined note/card row was written to `notes.json`.

Conceptually:

```json
{
  "note_id": 1746797967142,
  "anki_guid": "K?KVh/N;C",
  "card_id": 123456789,
  "deck_id": 123,
  "deck_name": "Fam Med Stuff::ECG Slides",
  "card_ord": 0,
  "tags": ["Hypocalcemia"],
  "front_html": "...",
  "back_html": "...",
  "front_text": "...",
  "back_text": "...",
  "front_media": ["some-ecg.jpg"],
  "back_media": []
}
```

The actual ECG package contains 66 such rows.

## 14. Generate `media_manifest.json`

A second JSON file recorded each recovered media object:

```text
archive index/position
original filename
byte size
SHA-1
note-side usages
```

Example:

```json
{
  "archive_index": 14,
  "filename": "paste-example.jpg",
  "size_bytes": 124321,
  "sha1": "0123456789abcdef...",
  "usages": [
    {
      "note_id": 1746797967142,
      "side": "front"
    }
  ]
}
```

This makes reuse and front/back placement auditable without reopening Anki.

## 15. Generate `cards_summary.csv`

A lightweight CSV index was created with review-oriented columns including:

```text
note_id
anki_guid
tags
front_media_count
back_media_count
front_text_preview
back_text_preview
```

The CSV is for quick sorting/review. `notes.json` remains the complete structured source representation.

## 16. Add production reconciliation metadata

Before the source package was handed over for semantic conversion, production content was checked for already-existing material.

Two Anki notes were already represented by production Cases:

```text
Hypocalcemia
Anki note ID: 1746797967142
Anki GUID: K?KVh/N;C
Existing production Case: b11b6a14-c55e-4d70-849c-ce1c8953a38f
```

and:

```text
Hypercalcemia
Anki note ID: 1746800349557
Anki GUID: uF~N-Xul<A
Existing production Case: b1f4870e-52fe-4d26-bbea-851ec64357a7
```

These were recorded in:

```text
production_mapping.json
```

with the action:

```text
review-and-merge-do-not-duplicate
```

This file is application/deployment-specific metadata, not part of a generic APKG parser.

## 17. Canonical normalized-source package layout

The intended reusable layout is:

```text
ecg_anki_import_source/
├── README.md
├── notes.json
├── cards_summary.csv
├── media_manifest.json
├── production_mapping.json
└── media/
    ├── paste-....jpg
    ├── ...
    └── image-....png
```

Then ZIP it normally:

```text
ecg_anki_import_source.zip
```

The historical ECG source ZIP is 7,149,508 bytes (about 6.82 MiB).

### Historical cleanup note

The actual historical `ecg_anki_import_source.zip` accidentally retained:

```text
_collection.sqlite-shm   # 32 KiB
_collection.sqlite-wal   # empty
```

The temporary main SQLite database itself was absent. These two sidecars were not referenced or used by downstream transformation, but they should not be present in the canonical interchange package.

Future extraction scripts must remove the temporary database **and** all SQLite sidecars before packaging:

```text
collection.sqlite
collection.sqlite-wal
collection.sqlite-shm
```

(or their extractor-specific temporary names).

## 18. Tools used

Standard Python modules:

```text
zipfile
sqlite3
subprocess
json
re
csv
hashlib
shutil
pathlib
```

Additional Python package:

```text
beautifulsoup4
```

External command:

```text
zstd
```

No OCR was required for the mechanical APKG extraction.

## 19. Why no Anki Python package was required

The extraction only needed:

```text
ZIP handling
Zstandard decompression
supported protobuf-wire decoding
SQLite
HTML parsing
```

This reduced dependency on a particular Anki Python library/version. The tradeoff is that the extractor must inspect and validate package variants rather than assuming every historical or future APKG uses the same internal format.

## 20. Important assumptions and limitations

### Collection format

This workflow was verified against the provided package containing `collection.anki21b`. Older/newer formats must be detected before decoding.

### Media manifest

The custom protobuf decoder was deliberately minimal. Anki's protobuf representation is not guaranteed as a public API. Unsupported structures must fail rather than be guessed.

### Notes versus cards

The ECG deck happened to have 66 notes and 66 cards. Generic code must support one note generating multiple cards.

### Front/back fields

The first two fields represented useful front/back content for this deck. Other notetypes can differ.

### Cloze / Image Occlusion

The source included multiple Anki note types. Extraction recovered source fields/media; it did not attempt to reproduce Anki scheduling or its full template-rendering engine.

### Answer-side media

Never flatten:

```text
front_media + back_media
```

into one undifferentiated stimulus list. Side is semantic evidence for later review.

## 21. Recommended reusable extraction algorithm

```text
1. Receive .apkg
2. Inspect it as an untrusted ZIP
3. Detect collection/package version
4. Decompress collection when required
5. Open temporary SQLite database
6. Decode media manifest according to the detected format
7. Decompress each media object
8. Verify SHA-1 and byte size when available
9. Extract notes/cards/decks/tags/source identifiers
10. Preserve original HTML
11. Produce plain-text convenience fields
12. Keep front-side and answer-side media separate
13. Generate notes.json
14. Generate media_manifest.json
15. Generate cards_summary.csv
16. Add production reconciliation metadata only when available
17. Delete temporary SQLite database and all sidecars
18. ZIP the normalized source directory
19. Perform semantic/clinical transformation separately
```

## 22. Safety rules

A reusable extractor should:

- never execute archive content;
- reject unsafe/path-traversal filenames;
- impose compressed/decompressed/entry-count limits;
- verify media hashes where available;
- preserve unknown provenance as unknown;
- never guess clinical meaning during extraction;
- never write directly to production D1 or R2;
- never treat Anki tags as authoritative production taxonomy;
- never expose answer-side images as learner-facing stimuli automatically;
- retain enough source identifiers to reconcile duplicates later.

## 23. Relationship to Flash-Cards Import Package v1

The normalized source ZIP is an **input to review**, not a production import package.

The later reviewed package has the stricter form:

```text
flashcards-import-v1.zip
├── manifest.json
└── media/
```

with explicit reviewed Flash-Cards objects such as:

```text
Topics
Cases
Assets
Case Assets
Question Prompts
Case Questions
Topic Questions
```

The separation is intentional:

```text
APKG extraction = mechanical and reproducible
semantic transformation = reviewed and source-aware
production import = strict, deterministic and resumable
```

See:

- `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md`
- `ECG_ANKI_INGESTION_RULES.md`
- `CONTENT_IMPORT_PACKAGES.md`

## 24. Minimum verification standard

The ECG extraction was considered mechanically valid only after confirming:

```text
all referenced media existed
all extracted media matched manifest SHA-1
all extracted media matched manifest byte size
no extracted media objects were unused
front/back media references were retained separately
note count and card count were explicitly known
```

That is the minimum standard for subsequent APKG source conversions.

## Reproducibility gap

The extraction procedure is now documented, but the exact one-off extractor program used for this first ECG conversion is **not currently committed to this repository**.

That means the algorithm is reproducible from this document, but it is not yet a one-command repository workflow. If repeated APKG migrations become routine, the next engineering step should be a repository-owned extractor with fixtures/tests for supported Anki package variants. It should remain an external/offline preparation tool rather than a production Admin endpoint.