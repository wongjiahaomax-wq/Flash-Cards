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

`validate:fast` is checkpoint validation: whitespace validation, Node tests, and Svelte checks. Use it after a coherent batch of edits or when a broader checkpoint is useful; do not treat it as an every-edit loop.

`validate:full` is the ordinary local pre-handoff contract: whitespace validation, migration/schema checks, Node tests, Svelte checks, build, and the existing local Better Auth/D1 smoke test. Run it after implementation is complete, not repeatedly during normal iteration. It does not install dependencies or run production operations.

During active editing, prefer the cheapest feedback that meaningfully tests the current risk. Presentation-only UX changes such as copy, spacing, classes, and layout should normally be batched under Vite/HMR. Run focused tests earlier when logic changes warrant them. Do not rerun a previously passing command unless subsequent changes could invalidate what it checked.

Runtime-affecting changes still require the separate existing `npm run runtime:smoke` contract at an appropriate checkpoint before handoff. This v1 deliberately does not implement changed-file validation intelligence.

| Task | Scoped guidance | Minimum authoritative context | Common checks |
| --- | --- | --- | --- |
| Admin UX / Case editor | `src/routes/admin/AGENTS.md` | `AUTHORING_MODEL.md`; relevant current Admin/image design | Vite/HMR for presentation-only iteration; focused tests for logic; `validate:fast` at checkpoint; `validate:full` before handoff |
| Database / read models | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; `PERFORMANCE_AND_READ_MODEL_PLAN.md` | `npm run db:check`; focused tests; normal validation at checkpoint/handoff |
| Schema / migrations | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; current schema + migrations | `npm run db:check`; focused tests; full validation before handoff |
| Asset / R2 lifecycle | DB + storage guidance | `IMAGE_PROVENANCE.md`; `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` | focused tests; check/build at checkpoint; runtime smoke if bindings/runtime change |
| Cloudflare / Wrangler runtime | `scripts/AGENTS.md`; `.github/AGENTS.md` | `CLOUDFLARE.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | focused tests; `npm run runtime:smoke`; full validation before handoff |
| Preview | Admin/DB/GitHub guidance as applicable | `PREVIEW_ADMIN_WORKSPACE.md`; `PREVIEW_DEPLOYMENT.md` | focused tests + relevant runtime checks at checkpoint/handoff |
| Local development replica | `scripts/AGENTS.md` | `LOCAL_DEVELOPMENT_REPLICA.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | focused script tests; runtime smoke when applicable |
| Imports / reviewed imports | DB/storage guidance | `CONTENT_IMPORT_PACKAGES.md`; `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` | import tests; normal validation at checkpoint/handoff |
| Slide-review tooling | `tools/slide-import-review/AGENTS.md` | `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md`; `CONTENT_IMPORT_PACKAGES.md` | `npm run slide-review:test`; `npm run slide-review:build` at meaningful checkpoints |
| Tags / Shared Questions | Admin + DB guidance | `TAGGING_MODEL_DECISIONS.md`; `TAGGING_STAGE_B_BEHAVIOR.md` | focused tests for logic; Vite/HMR for presentation-only edits; normal validation at checkpoint/handoff |
| Stimulus / reusable-image behavior | Admin + DB guidance | `STIMULUS_GROUPS_DESIGN.md`; `REUSABLE_IMAGE_QUESTIONS.md`; `AUTHORING_MODEL.md` | focused tests for logic; Vite/HMR for presentation-only edits; normal validation at checkpoint/handoff |

If a task affects more than one row above, read the authorities for each affected boundary. Do not read the entire documentation corpus by default.
