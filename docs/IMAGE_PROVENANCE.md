# Image provenance and attribution

_Last updated: 15 August 2026_

This document records the V1 rules for image storage, source attribution, and learner-facing display.

## Core rule

The application must store the teaching image itself in Cloudflare R2. An external source URL is metadata only and must not be used as the learner-facing image URL.

This prevents teaching material from breaking when an external website changes, moves, or removes an image.

## Existing Asset fields

The current V1 Asset model already supports:

- `storage_key` — the immutable R2 object key;
- `original_filename` — optional original upload filename;
- `alt_text` — accessibility text;
- `source_label` — optional source or attribution name;
- `source_url` — optional source webpage/reference URL;
- `licence` — optional licence or permission text.

Attribution is optional. An administrator must be able to save an Asset even when its original source cannot be identified.

## Provenance states in V1

V1 does not require a separate database enum for provenance status. The following conventions are sufficient initially:

### Known external source

- `source_label`: populated, for example `DermNet`;
- `source_url`: populated when a useful source page is known;
- `licence`: populated when known.

Learner display:

- with URL: `Source: DermNet ↗` as a link;
- without URL: `Source: DermNet` as plain text.

### Original / own teaching image

- `source_label`: a meaningful attribution such as `Original teaching image`, the clinician/department name, or the institution;
- `source_url`: optional;
- `licence`: optional.

Learner display uses the source label as plain text unless a URL is present.

### Source unknown or not recoverable

- `source_label`: null;
- `source_url`: null;
- `licence`: null unless permission information is independently known.

The Asset remains valid and can still be used in a Case.

Learner display: show no source line by default. Do not display `Source unknown` to the learner unless there is a later educational or governance reason to do so.

For legacy Anki imports, an unknown source must not be replaced with a guessed or fabricated citation.

## Admin workflow

The future image upload/edit interface should allow:

1. upload the image to R2;
2. enter alt text;
3. enter a Case-specific caption separately from the Asset metadata;
4. optionally enter source name;
5. optionally enter source URL;
6. optionally enter licence/permission information;
7. save the Asset even if all attribution fields are blank.

A source URL should be validated as a web URL when present, but it must never be required.

## Multi-image Cases

Attribution belongs to each Asset, not to the Case. This allows a Case containing several images to use different sources for each image.

Example:

- Image 1 — source A;
- Image 2 — source B;
- Image 3 — source unknown.

Each image should render its own attribution independently.

## Learner UI

Attribution should be visually secondary to the clinical stimulus and questions.

Recommended presentation under an image:

```text
Herald patch
Source: DermNet ↗
```

If no source is recorded:

```text
Herald patch
```

The source link should open the source page separately from the study flow so the learner does not lose the current review.

## Historical reviews

The image bytes are protected historically by the immutable R2 object-key rule. When review snapshots are expanded in a later migration, source/citation metadata may also be snapshotted if preserving the exact attribution shown at review time becomes important.

This is not required to validate the current learner UI prototype.

## Implementation sequence

1. Keep PR #6 focused on learner review layout and interaction.
2. Use these provenance rules when implementing the R2-backed Asset admin workflow.
3. Add any additional provenance/admin-only fields only when the upload workflow demonstrates a concrete need for them.
4. Do not require attribution for importing or using an image.
