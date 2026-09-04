# Database agent guidance

This file supplements the repository-wide `AGENTS.md` for `src/lib/server/db/`.

- Treat Production/Preview scope as a data-integrity boundary, not a cosmetic filter.
- Production content is normally `previewSessionId IS NULL`; Preview mutation must preserve ownership checks.
- Reuse `content-guards.js` and the focused Preview workspace helpers where their exact invariants apply.
- For active production-only mutation paths, use the explicit semantic guards where their invariant matches: `requireProductionCase(...)` for Production Cases and `requireProductionImageAsset(...)` for Production image Assets.
- Preview Case ownership has one authority: `requireOwnedPreviewCase(...)`, exported through `preview-workspace.js` from `preview-workspace/ownership.js`. Preserve its full Case return value and `PreviewWorkspaceError` behavior; do not add a second independent implementation in `content-guards.js` or rewrite Preview mutation call sites merely to share a generic abstraction.
- Preview Asset eligibility is intentionally different from Production-only Asset ownership: `requirePreviewUsableAsset(...)` accepts active Production Assets as well as Assets owned by the current Preview Session. Do not substitute `requireProductionImageAsset(...)` on Preview paths that intentionally allow Production Asset reuse.
- Do not replace these semantic ownership guards with vague generic “scoped entity” helpers that weaken or obscure their distinct invariants.
- If Preview removal is proposed, scope a separate decommissioning assessment first. Production filtering, ownership/security guards, Asset replacement safety, auth/deployment tooling, tests, and stored Preview-owned data may depend on the subsystem.
- Before schema work, inspect `schema.js`, `migrations/`, and migration contract tests. Real schema changes require a new migration; never rewrite history.
- Current runtime assumes every migration required by the repository revision is applied before the application runs. Ordinary runtime-behavior tests use the current supported schema; historical schemas are reserved for genuine migration/upgrade/sequencing/preservation behavior. Do not add runtime fallbacks or alternate models solely to support obsolete migration states. See `docs/TESTING_AND_VALIDATION_GUIDANCE.md`.
- Keep migration-before-runtime deployment sequencing safe for future schema changes.
- Prefer focused SQL/read models that fetch only page-required data. Avoid broad load-all-then-filter behavior.
- Keep list, detail, and dashboard read models distinct where the current code does.
- Preserve Asset identity/history and question/stimulus ownership semantics.
- Avoid speculative generic data-access abstractions.
- For Production Stimulus Family decomposition or changes that move responsibilities out of `stimulus-groups.js`, read `docs/STIMULUS_FAMILY_REFACTOR_ARCHITECTURE.md` before editing. It is the staged refactor/characterisation map; current code, migrations and executable tests remain higher authority for actual behavior.

Use `docs/AGENT_TASK_MAP.md` for the relevant subsystem authority. `docs/PREVIEW_ADMIN_WORKSPACE.md` owns Preview module responsibilities; `docs/PERFORMANCE_AND_READ_MODEL_PLAN.md` owns read-path guidance.
