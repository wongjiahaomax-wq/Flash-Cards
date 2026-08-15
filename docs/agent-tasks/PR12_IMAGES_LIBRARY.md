# PR #12 Agent Brief — Image Library

You are implementing **PR #12 — Image Library + rename/edit metadata** for `wongjiahaomax-wq/Flash-Cards`.

## Start here

Read these files before changing code:

```text
docs/HANDOVER.md
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/PARALLEL_WORK_PLAN.md
docs/V1_DATA_MODEL.md
docs/IMAGE_PROVENANCE.md
docs/R2_COST_GUARDRAILS.md
```

Work only on branch:

```text
agent/admin-images-library
```

Push all progress to the existing draft PR for this branch. Do not open a second PR and do not merge your own PR.

## Goal

Build a visual Image/Asset Library so an administrator can find uploaded images, rename them, edit Asset-level metadata, see where each image is used, and reuse the existing protected R2 upload pipeline.

Create:

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

## Required functionality

### `/admin/images`

Implement a visual thumbnail grid.

Each Asset should show at minimum:

- thumbnail;
- current image name;
- usage count;
- active/inactive state if surfaced.

Search at minimum:

- `assets.original_filename`;
- `assets.alt_text`;
- `assets.source_label`.

Useful V1 filters:

- all / used / unused;
- active / inactive;
- source known / source unknown.

### `/admin/images/new`

Reuse the existing protected teaching-image upload pipeline. Preserve JPEG/PNG validation, 5 MiB per-image limit, 5 GiB app-managed ceiling, immutable R2 keys, D1 Asset metadata, and existing paste/drag-drop/file-picker behaviour where practical.

Do not create a second R2 upload mechanism.

### `/admin/images/[assetId]`

Show:

- large protected image preview;
- editable image name;
- editable alt text;
- editable source label;
- editable source URL;
- editable licence/permission;
- usage count;
- Cases using the Asset;
- direct links to `/admin/cases/[caseId]`.

### Image-renaming contract

Use the existing field:

```text
assets.original_filename
```

as the administrator-editable image name.

The actual original upload filename does not need separate preservation.

Renaming must update D1 metadata only. It must **never** rename, move, copy, replace, or delete the R2 object/key.

These must remain stable:

```text
assets.id
assets.storage_key
R2 object/key
Case Asset relationships
Review relationships/snapshots
```

No schema migration is expected for image renaming.

### Asset metadata vs Case caption

Global Asset detail may edit only Asset-level metadata such as name, alt text, source label/URL, and licence.

Do not move Case-specific caption editing into the Asset page. Captions belong to `case_assets` and remain editable in the Case editor because the same Asset may have different captions in different Cases.

### Provenance

Unknown source is valid. Do not fabricate attribution.

`source_url` is attribution/reference metadata only and must never become the runtime image source.

## Ownership / boundaries

Own primarily:

```text
src/routes/admin/images/**
Asset-library query/helper modules
Asset metadata update logic
focused Image Library tests
```

You may make a minimal change to `src/routes/admin/+layout.svelte` to activate the Images navigation link.

Avoid broad edits to:

```text
src/routes/admin/+layout.svelte
src/routes/admin/+page.svelte
src/routes/admin/+page.server.js
src/routes/admin/questions/**
package.json
package-lock.json
wrangler.jsonc
src/app.css
docs/HANDOVER.md
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/PARALLEL_WORK_PLAN.md
```

Do not redesign learner Study behaviour, authentication, Review semantics, or R2 key strategy.

No schema migration is expected. If you believe one is unavoidable, explain the concrete blocker in the draft PR before adding it.

## Tests and validation

Add focused tests for image rename, metadata updates, search/filtering, and usage aggregation.

Before reporting completion run:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

If the sandbox cannot download Wrangler for the local auth smoke script, state that clearly; GitHub CI must still pass before merge.

## Completion report

Update the existing draft PR description with:

- routes implemented;
- search/filter behaviour;
- rename/metadata behaviour;
- upload reuse behaviour;
- helper/query modules added;
- tests added;
- migrations (expected none);
- shared files touched;
- validation results;
- any residual limitations.

Do not expand scope into Questions, Topics, learner accounts, progress analytics, FSRS, or Anki import.
