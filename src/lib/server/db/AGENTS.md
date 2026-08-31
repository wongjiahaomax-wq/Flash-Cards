# Database agent guidance

This file supplements the repository-wide `AGENTS.md` for `src/lib/server/db/`.

- Treat Production/Preview scope as a data-integrity boundary, not a cosmetic filter.
- Production content is normally `previewSessionId IS NULL`; Preview mutation must preserve ownership checks.
- Reuse `content-guards.js` and the focused Preview workspace helpers where their exact invariants apply.
- `preview-workspace.js` remains the stable Preview backend façade/coordinator while the retained legacy subsystem remains present.
- `preview-workspace/ownership.js` and `preview-workspace/session.js` own Preview ownership/security and Session lifecycle foundations.
- `preview-workspace/case.js` owns production-Case discovery for Preview, complete Case-clone orchestration (including fixed-image copying inside the clone transaction), Preview Case listing, Case metadata/vignette mutations, and current Topic compatibility behavior.
- `preview-workspace/fixed-images.js` owns fixed Case-image editor reads and ongoing fixed-image relationship mutations: single/bulk attach, Case-specific caption updates, detach, and reorder.
- Alternative Set/stimulus, question/scope/reusable-question, composed editor loading, and cleanup coordination remain in `preview-workspace.js` as an accepted legacy boundary. Further PR2D/PR2E/PR2F extraction is not planned merely to finish the former staged refactor; draft PR #91 was closed unmerged after the project moved to a local-first testing workflow.
- If Preview removal is proposed, scope a separate decommissioning assessment first. Production filtering, ownership/security guards, Asset replacement safety, auth/deployment tooling, tests, and stored Preview-owned data may depend on the subsystem.
- Before schema work, inspect `schema.js`, `migrations/`, and migration contract tests. Real schema changes require a new migration; never rewrite history.
- Current application runtime code supports the canonical schema for the current repository revision. A database running that revision is expected to have every migration required by that revision applied before the application runs.
- Tests of current application/runtime behavior should use that current supported schema, preferably through the repository-owned current-schema bootstrap or an equally current purpose-built fixture. Historical schemas are appropriate only when migration/upgrade/sequencing/preservation behavior is itself under test. Older-but-valid or unusual data states that remain representable today should be constructed as data inside the current schema. See `docs/TESTING_AND_VALIDATION_GUIDANCE.md`.
- Do not add permanent historical-column/table probing, missing-column/table fallbacks, alternate runtime Drizzle models for obsolete migration states, or tests whose sole purpose is keeping current application code working before already-required migrations. Preserve migration/upgrade tests and valid historical data states represented by the current schema.
- Keep migration-before-runtime deployment sequencing safe for future schema changes; current-schema-only runtime support does not permit deploying code that requires an unapplied migration.
- Prefer focused SQL/read models that fetch only page-required data. Avoid broad load-all-then-filter behavior.
- Keep list, detail, and dashboard read models distinct where the current code does.
- Preserve Asset identity/history and question/stimulus ownership semantics.
- Avoid speculative generic data-access abstractions.
- For Production Stimulus Family decomposition or changes that move responsibilities out of `stimulus-groups.js`, read `docs/STIMULUS_FAMILY_REFACTOR_ARCHITECTURE.md` before editing. It is the staged refactor/characterisation map; current code, migrations and executable tests remain higher authority for actual behavior.

Read for exact semantics:
- `docs/V1_DATA_MODEL.md`
- `docs/TESTING_AND_VALIDATION_GUIDANCE.md` for test fixtures/contract ownership when changing tests
- the relevant subsystem document from `docs/DOCUMENTATION_INDEX.md`
- `docs/PERFORMANCE_AND_READ_MODEL_PLAN.md` for read-path work
- `docs/PREVIEW_ADMIN_WORKSPACE.md` for retained Preview ownership/safety work
- `docs/STIMULUS_FAMILY_REFACTOR_ARCHITECTURE.md` for Production Stimulus Family decomposition/refactor work

Relevant validation commonly includes `npm run db:check`, `npm test`, `npm run check`, and `npm run build`.
