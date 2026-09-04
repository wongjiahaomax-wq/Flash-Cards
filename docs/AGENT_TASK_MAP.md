# Coding-agent task map

Purpose: route a coding task to the **minimum current context** needed before editing. This file is a routing authority/lookup, not default cover-to-cover reading. `docs/DOCUMENTATION_INDEX.md` remains the documentation authority/index; historical plans and completed agent-task prompts are not default context.

Always read root `AGENTS.md`, then the nearest scoped `AGENTS.md` for the implementation surface. Root `AGENTS.md` owns universal retrieval, escalation, work-state, validation, and final-review discipline. Use only the relevant row below to identify additional subsystem authorities. Do not load unrelated rows or documentation merely for completeness.

## Execution-mode routing

Execution mode is determined from actual capabilities as described in root `AGENTS.md`; detailed mechanics live in `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`.

### Local checkout mode

Use the repository-owned iteration → checkpoint → handoff flow from root `AGENTS.md`. Low-level command/runtime semantics live in `scripts/AGENTS.md` and `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`.

### Remote GitHub mode

Use `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md` as the detailed authority for Remote GitHub retrieval and multi-file write mechanics. This task map routes task-specific context only.

### Hybrid mode

Use local execution for repository exploration, implementation, and validation; use GitHub for current branch/PR collaboration, reviews, CI/check state, and durable handoff. Detailed mechanics live in `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`.

For changes to maintained tests, validation composition, changed-path rules, specialized-check ownership, or CI diagnostics, route to `docs/TESTING_AND_VALIDATION_GUIDANCE.md`; add `docs/CI_AGENT_DIAGNOSTICS.md` when CI presentation/retrieval itself changes.

## Task routing lookup

| Task | Scoped guidance | Minimum authoritative context |
| --- | --- | --- |
| Tests / validation architecture / fixtures | `scripts/AGENTS.md`; `.github/AGENTS.md` as applicable | `TESTING_AND_VALIDATION_GUIDANCE.md`; `CI_AGENT_DIAGNOSTICS.md` when CI presentation/retrieval changes |
| Substantial refactor / new module boundary / hotspot decomposition / meaningful JS→TS extraction | nearest affected scoped guidance | `ENGINEERING_ARCHITECTURE_GUIDELINES.md` plus the affected subsystem authority |
| Admin presentation / interaction | `src/routes/admin/AGENTS.md` | directly affected implementation/tests; relevant current Admin design only when needed |
| Case editor authoring / classification / question / image semantics | `src/routes/admin/AGENTS.md`; DB/storage guidance when ownership or lifecycle is involved | `AUTHORING_MODEL.md`; relevant Topic/Tag/question/image authority for the changed semantics |
| Authentication / Account Management | relevant Admin/server guidance; inspect current auth routes/modules | `ACCOUNT_MANAGEMENT_PLAN.md` only where still future-intent authority; current auth implementation/tests |
| Database / read models | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; `PERFORMANCE_AND_READ_MODEL_PLAN.md` |
| Schema / migrations | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; current schema + migrations |
| Asset / R2 lifecycle | `src/lib/server/storage/AGENTS.md`; DB guidance when relationships change | `IMAGE_PROVENANCE.md`; `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` |
| Cloudflare / Wrangler runtime | `scripts/AGENTS.md`; `.github/AGENTS.md` | `CLOUDFLARE.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` |
| Preview retained subsystem | Admin/DB/GitHub guidance as applicable | `PREVIEW_ADMIN_WORKSPACE.md`; `PREVIEW_DEPLOYMENT.md` only for remote Preview deployment |
| Local development replica | `scripts/AGENTS.md` | `LOCAL_DEVELOPMENT_REPLICA.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` |
| Imports / reviewed imports | DB/storage guidance | `CONTENT_IMPORT_PACKAGES.md`; `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` |
| Slide-review tooling | `tools/slide-import-review/AGENTS.md` | `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md`; `CONTENT_IMPORT_PACKAGES.md` |
| Tags / Shared Questions | Admin + DB guidance | `TAGGING_MODEL_DECISIONS.md`; `TAGGING_STAGE_B_BEHAVIOR.md` |
| Stimulus / reusable-image behavior | Admin + DB + storage guidance as applicable | `STIMULUS_GROUPS_DESIGN.md`; `REUSABLE_IMAGE_QUESTIONS.md`; `AUTHORING_MODEL.md` |

If a task affects more than one row, load the authorities for each material boundary.

For Preview backend implementation details, use `src/lib/server/db/AGENTS.md` and `docs/PREVIEW_ADMIN_WORKSPACE.md`. If Preview removal is proposed, treat it as a separate decommissioning assessment because production filtering, ownership/security, Asset safety, auth/deployment tooling, tests, and stored Preview-owned data may depend on it.

For account/auth work, current implementation and current subsystem guidance take precedence over completed historical prompts. If an existing implementation PR is explicitly targeted, follow root `AGENTS.md` work-state rules rather than restarting from `main`.
