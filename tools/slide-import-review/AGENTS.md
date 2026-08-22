# Slide review tool agent guidance

This file supplements the repository-wide `AGENTS.md` for `tools/slide-import-review/`.

- This tool is local/offline review and deterministic finalization; it is not the production importer and must not contact production.
- `manifest.json` is production-shaped content authority during review; `review-map.json` is provenance/review metadata.
- Finalization must be deterministic and remove review-only files from the production Import Package.
- Preserve source reconstruction/review boundaries: do not add a second semantic AI transformation step.
- Keep unresolved-question and learner-media safety rules explicit; do not invent answers or allow answer leakage.
- Reuse the existing Import Package v1 validator/constraints rather than creating a competing package format.

Read `docs/SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md` and `docs/CONTENT_IMPORT_PACKAGES.md`.
Run `npm run slide-review:test` and `npm run slide-review:build` for changes in this tool.
