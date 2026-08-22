# Storage agent guidance

This file supplements the repository-wide `AGENTS.md` for `src/lib/server/storage/`.

- D1 Asset metadata and R2 object lifecycle must remain coordinated.
- Preserve upload/delete compensation when one side of a D1/R2 operation fails.
- Treat Asset identity, supersession lineage, and historical Review relationships as intentional immutable/history boundaries.
- Preview may read production Assets; visibility does not imply Preview ownership.
- Do not permanently delete unrelated Assets or R2 objects.
- Preserve media validation, key-generation, and serving contracts rather than creating alternate paths.

Read `docs/IMAGE_PROVENANCE.md`, `docs/ASSET_HIGHER_RESOLUTION_REPLACEMENT.md`, and the relevant import/Preview document when those boundaries are touched.

Run focused tests plus `npm run check` and `npm run build`; runtime-affecting storage/binding changes also require `npm run runtime:smoke`.
