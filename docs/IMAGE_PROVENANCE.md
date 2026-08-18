# Image provenance and attribution

_Status: current V1 contract. Image upload/edit, protected R2 serving, Asset metadata editing, and Image Collections are implemented._

_Last updated: 18 August 2026_

## Core rule

The application stores the teaching image itself in private Cloudflare R2.

An external source URL is **metadata only** and must never be used as the learner runtime image URL.

This keeps teaching content available if an external website changes, moves, or removes the source page/image.

## Current Asset metadata

Relevant Asset fields include:

- `storage_key` — immutable R2 object key;
- `original_filename` — current administrator-facing image name/display/search label;
- `alt_text` — accessibility text;
- `source_label` — optional source/attribution name;
- `source_url` — optional source webpage/reference URL;
- `licence` — optional licence/permission text;
- `image_collection_id` — optional Image Library organisational Collection;
- `is_active` — current content state.

### `original_filename` naming note

Despite the historical column name, V1 treats `assets.original_filename` as the administrator-editable human-facing image name.

The literal source upload filename does not require separate preservation in production V1 unless retained in external migration/review artifacts.

Renaming `original_filename` changes D1 metadata only. It must not rename/move/copy/replace the R2 object or alter `storage_key`.

## Provenance states

V1 does not require a separate provenance-status enum.

### Known external source

Example:

```text
source_label = DermNet
source_url   = <source page when known>
licence      = <known licence/permission when known>
```

Learner/admin presentation may expose an appropriate source label/link according to the product surface.

### Original / own teaching image

Use a meaningful source label when appropriate, such as the clinician, department, institution, or `Original teaching image`.

`source_url` and `licence` remain optional.

### Source unknown or not recoverable

```text
source_label = null
source_url   = null
licence      = null unless independently known
```

The Asset remains valid.

Do not invent attribution or guess a source merely to fill metadata.

For legacy Anki/imported media, unknown source should remain unknown until reviewed.

## Learner-information boundary

Admin image names may contain diagnoses or other internal classification because they are content-management metadata.

Do not copy diagnosis-bearing Admin names into learner-facing `alt_text` or Case captions when they would reveal the answer.

Example neutral ECG alt text:

```text
12-lead ECG tracing for this case
```

Accessibility text should be useful without defeating the learning task.

## Current Admin workflow

The production Image/Asset workflow supports:

1. upload through the protected private-R2 pipeline;
2. administrator-facing image naming/rename;
3. alt-text editing;
4. optional source label;
5. optional source URL;
6. optional licence/permission text;
7. save even when all attribution fields are blank;
8. inspect Case/stimulus usage;
9. assign one optional Image Collection or leave the Asset Unsorted.

Case-specific captions are authored separately because they belong to `case_assets` / `stimulus_group_options`, not to the global Asset.

A source URL should be validated as a web URL when present but must not be required.

## Asset versus relationship metadata

Global Asset metadata:

```text
image name
alt text
source label / URL / licence
Collection
active state
R2 storage identity
```

Case/stimulus relationship metadata:

```text
fixed/alternative membership
Case-specific caption
display order
exact-option context/questions
```

Do not move Case-specific teaching context onto the global Asset merely because the same image is involved.

## Multi-image and reused-Asset Cases

Attribution belongs to each Asset, not to the Case.

A Case with several images can therefore use different sources/licences for each Asset.

The same Asset may also be reused across several Cases without duplicating R2 bytes or provenance metadata.

Each Case can still provide its own relationship caption/context.

## Image Collections are not provenance

Image Management V2 adds zero-or-one Collection membership for library organisation.

A Collection may describe an operational grouping, but it is not a source/licence record and does not change provenance.

Deleting a Collection returns Assets to Unsorted; it does not delete media, alter source metadata, or change R2 identity.

## R2 serving and identity

Teaching-image bytes remain private.

Production learner/admin serving uses authenticated application routes and the stored R2 key; source URLs are never substituted as fallback runtime media.

Production teaching-image object keys are treated as immutable. Replacing image bytes should normally create a new Asset/object identity rather than overwrite historical media behind an existing key.

Preview uploads use the Preview workspace prefix and remain subject to Preview ownership/reset rules; they must not overwrite production objects.

## Review snapshot relationship

Reviews snapshot the Asset/storage key/caption/alt text that the learner saw according to the current Review model.

Changing later source/licence/Collection metadata does not rewrite historical Review content.

Current V1 does not snapshot source/licence/Collection metadata into Review rows.

If strict historical attribution auditing later becomes a requirement, design that as an explicit additive snapshot feature rather than inferring history from mutable current Asset metadata.

## Import/migration rule

Reviewed Import Package v1 may carry Asset provenance fields supported by the package contract, but the migration process must preserve uncertainty.

For the ECG migration:

- source hash filenames were retained in review artifacts for reconciliation;
- production `original_filename` values were normalized to human Case-aligned names;
- R2 keys remained deterministic/immutable;
- unknown external provenance remained unknown rather than fabricated.

## Governance principle

> **Store the teaching image privately and durably, preserve known provenance honestly, keep unknown provenance unknown, and never couple runtime image availability to an external source URL.**
