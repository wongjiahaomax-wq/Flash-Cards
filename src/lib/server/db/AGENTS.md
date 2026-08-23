# Database agent guidance

This file supplements the repository-wide `AGENTS.md` for `src/lib/server/db/`.

- Treat Production/Preview scope as a data-integrity boundary, not a cosmetic filter.
- Production content is normally `previewSessionId IS NULL`; Preview mutation must preserve ownership checks.
- Reuse `content-guards.js` and the focused Preview workspace helpers where their exact invariants apply.
- `preview-workspace.js` remains the stable Preview backend façade/coordinator during the staged refactor.
- `preview-workspace/ownership.js` and `preview-workspace/session.js` own Preview ownership/security and Session lifecycle foundations.
- `preview-workspace/case.js` owns production-Case discovery for Preview, complete Case-clone orchestration (including fixed-image copying inside the clone transaction), Preview Case listing, Case metadata/vignette mutations, and Case Topic-role mutations.
- `preview-workspace/fixed-images.js` owns fixed Case-image editor reads and ongoing fixed-image relationship mutations: single/bulk attach, Case-specific caption updates, detach, and reorder.
- Alternative Set/stimulus and question/scope/reusable-question mutation APIs remain in `preview-workspace.js` until their later focused extraction PRs.
- Before schema work, inspect `schema.js`, `migrations/`, and migration contract tests. Real schema changes require a new migration; never rewrite history.
- Prefer focused SQL/read models that fetch only page-required data. Avoid broad load-all-then-filter behavior.
- Keep list, detail, and dashboard read models distinct where the current code does.
- Preserve Asset identity/history and question/stimulus ownership semantics.
- Avoid speculative generic data-access abstractions.

Read for exact semantics:
- `docs/V1_DATA_MODEL.md`
- the relevant subsystem document from `docs/DOCUMENTATION_INDEX.md`
- `docs/PERFORMANCE_AND_READ_MODEL_PLAN.md` for read-path work
- `docs/PREVIEW_ADMIN_WORKSPACE.md` for Preview ownership work

Relevant validation commonly includes `npm run db:check`, `npm test`, `npm run check`, and `npm run build`.
