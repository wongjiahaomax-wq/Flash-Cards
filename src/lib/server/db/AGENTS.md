# Database agent guidance

This file supplements the repository-wide `AGENTS.md` for `src/lib/server/db/`.

- Treat Production/Preview scope as a data-integrity boundary, not a cosmetic filter.
- Production content is normally `previewSessionId IS NULL`; Preview mutation must preserve ownership checks.
- Reuse `content-guards.js` and `preview-workspace.js` semantic guards where their exact invariants apply.
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
