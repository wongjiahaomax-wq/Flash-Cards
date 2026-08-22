# Coding-agent task map

Purpose: route a coding task to the **minimum current context** needed before editing. `docs/DOCUMENTATION_INDEX.md` remains the documentation authority/index. Historical plans and completed agent-task prompts are not default reading.

Always read the root `AGENTS.md`, the nearest scoped `AGENTS.md`, and the directly related implementation/tests. Load more context only when the task crosses subsystem boundaries.

## Local agent commands

Use these from the repository root:

```sh
npm run agent:doctor
npm run validate:fast
npm run validate:full
```

`agent:doctor` is a read-only pre-edit environment check. It reports Git state, the Node 22 contract, repository-installed Wrangler consistency, and the presence of local developer state without reading secrets or modifying D1/R2.

`validate:fast` is the normal iteration loop: whitespace validation, Node tests, and Svelte checks.

`validate:full` is the ordinary local pre-handoff contract: whitespace validation, migration/schema checks, Node tests, Svelte checks, build, and the existing local Better Auth/D1 smoke test. It does not install dependencies or run production operations.

Runtime-affecting changes still require the separate existing `npm run runtime:smoke` contract. This v1 deliberately does not implement changed-file validation intelligence.

| Task | Scoped guidance | Minimum authoritative context | Common checks |
| --- | --- | --- | --- |
| Admin UX / Case editor | `src/routes/admin/AGENTS.md` | `AUTHORING_MODEL.md`; relevant current Admin/image design | `npm test`; `npm run check`; `npm run build` |
| Database / read models | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; `PERFORMANCE_AND_READ_MODEL_PLAN.md` | `npm run db:check`; `npm test` |
| Schema / migrations | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; current schema + migrations | `npm run db:check`; `npm test` |
| Asset / R2 lifecycle | DB + storage guidance | `IMAGE_PROVENANCE.md`; `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` | focused tests; check; build |
| Cloudflare / Wrangler runtime | `scripts/AGENTS.md`; `.github/AGENTS.md` | `CLOUDFLARE.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | `npm run runtime:smoke` |
| Preview | Admin/DB/GitHub guidance as applicable | `PREVIEW_ADMIN_WORKSPACE.md`; `PREVIEW_DEPLOYMENT.md` | focused tests + relevant runtime checks |
| Local development replica | `scripts/AGENTS.md` | `LOCAL_DEVELOPMENT_REPLICA.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | focused script tests; runtime smoke when applicable |
| Imports / reviewed imports | DB/storage guidance | `CONTENT_IMPORT_PACKAGES.md`; `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` | import tests + normal validation |
| Slide-review tooling | `tools/slide-import-review/AGENTS.md` | `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md`; `CONTENT_IMPORT_PACKAGES.md` | `npm run slide-review:test`; `npm run slide-review:build` |
| Tags / Shared Questions | Admin + DB guidance | `TAGGING_MODEL_DECISIONS.md`; `TAGGING_STAGE_B_BEHAVIOR.md` | focused tests; check; build |
| Stimulus / reusable-image behavior | Admin + DB guidance | `STIMULUS_GROUPS_DESIGN.md`; `REUSABLE_IMAGE_QUESTIONS.md`; `AUTHORING_MODEL.md` | focused tests; check; build |

If a task affects more than one row above, read the authorities for each affected boundary. Do not read the entire documentation corpus by default.
