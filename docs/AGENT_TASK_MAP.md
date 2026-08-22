# Coding-agent task map

Purpose: route a coding task to the **minimum current context** needed before editing. `docs/DOCUMENTATION_INDEX.md` remains the documentation authority/index. Historical plans and completed agent-task prompts are not default reading.

Always read the root `AGENTS.md`, the nearest scoped `AGENTS.md`, and the directly related implementation/tests. Load more context only when the task crosses subsystem boundaries.

## Local agent commands

Use these from the repository root:

```sh
npm run agent:doctor
npm run agent:checks
npm run validate:fast
npm run validate:full
```

`agent:doctor` is a read-only pre-edit environment check. It reports Git state, the Node 22 contract, repository-installed Wrangler consistency, and the presence of local developer state without reading secrets or modifying D1/R2.

`agent:checks` is the read-only changed-file validation advisor. By default it compares the current branch from the merge-base with locally available `origin/main` (falling back to local `main`) through `HEAD`, then includes tracked working-tree changes and untracked files. It classifies repository-specific subsystems and prints required automated checks separately from recommended follow-up. It never contacts GitHub, mutates Git state, accesses production, or automatically runs the recommended suites. Use `node scripts/agent-checks.mjs --base <ref>` only when the intended base is not the normal `main` branch. `--files <comma-separated-paths>` is available for deterministic classifier verification without altering real files.

`validate:fast` is checkpoint validation: feature-diff whitespace validation, Node tests, and Svelte checks. Use it after a coherent batch of edits or when a broader checkpoint is useful; do not treat it as an every-edit loop.

`validate:full` is the ordinary local pre-handoff contract: feature-diff whitespace validation, migration/schema checks, Node tests, Svelte checks, build, and the existing local Better Auth/D1 smoke test. Run it after implementation is complete, not repeatedly during normal iteration. It does not install dependencies or run production operations.

Local `validate:*` uses the same preferred feature-branch base resolution as `agent:checks`; its diff check compares the merge-base with the current tracked working tree, so committed branch changes plus staged and unstaged tracked changes are covered. The ordinary `validate:full` sequence and PR CI consume the same repository-owned validation definitions. CI still installs dependencies separately and keeps its PR-specific diff semantics and GitHub failure annotations explicit.

During active editing, prefer the cheapest feedback that meaningfully tests the current risk. Presentation-only UX changes such as copy, spacing, classes, and layout should normally be batched under Vite/HMR. Run focused tests earlier when logic changes warrant them. Do not rerun a previously passing command unless subsequent changes could invalidate what it checked.

Recommended coding-agent flow:

```text
npm run agent:doctor
        ↓
implement narrowly
        ↓
npm run agent:checks
        ↓
run the relevant focused checks
        ↓
npm run validate:full before handoff when applicable
        ↓
run specialized checks identified by agent:checks
```

Runtime and slide-review suites remain specialized rather than universal gates. `agent:checks` surfaces `npm run runtime:smoke` when runtime-sensitive paths change, and requires both `npm run slide-review:test` and `npm run slide-review:build` for `tools/slide-import-review/**` changes.

| Task | Scoped guidance | Minimum authoritative context | Common checks |
| --- | --- | --- | --- |
| Admin UX / Case editor | `src/routes/admin/AGENTS.md` | `AUTHORING_MODEL.md`; relevant current Admin/image design | Vite/HMR for presentation-only iteration; focused tests for logic; `agent:checks`; `validate:full` before handoff when applicable |
| Database / read models | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; `PERFORMANCE_AND_READ_MODEL_PLAN.md` | `agent:checks`; `npm run db:check`; focused tests; normal validation at checkpoint/handoff |
| Schema / migrations | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; current schema + migrations | `agent:checks`; `npm run db:check`; focused tests; full validation before handoff |
| Asset / R2 lifecycle | DB + storage guidance | `IMAGE_PROVENANCE.md`; `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` | `agent:checks`; focused tests; check/build at checkpoint; runtime smoke if bindings/runtime change |
| Cloudflare / Wrangler runtime | `scripts/AGENTS.md`; `.github/AGENTS.md` | `CLOUDFLARE.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | `agent:checks`; focused tests; `npm run runtime:smoke`; full validation before handoff |
| Preview | Admin/DB/GitHub guidance as applicable | `PREVIEW_ADMIN_WORKSPACE.md`; `PREVIEW_DEPLOYMENT.md` | `agent:checks`; focused tests + relevant runtime checks at checkpoint/handoff |
| Local development replica | `scripts/AGENTS.md` | `LOCAL_DEVELOPMENT_REPLICA.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | `agent:checks`; focused script tests; credential-dependent local verification when appropriate |
| Imports / reviewed imports | DB/storage guidance | `CONTENT_IMPORT_PACKAGES.md`; `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` | `agent:checks`; import tests; normal validation at checkpoint/handoff |
| Slide-review tooling | `tools/slide-import-review/AGENTS.md` | `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md`; `CONTENT_IMPORT_PACKAGES.md` | `agent:checks`; `npm run slide-review:test`; `npm run slide-review:build` |
| Tags / Shared Questions | Admin + DB guidance | `TAGGING_MODEL_DECISIONS.md`; `TAGGING_STAGE_B_BEHAVIOR.md` | `agent:checks`; focused tests for logic; Vite/HMR for presentation-only edits; normal validation at checkpoint/handoff |
| Stimulus / reusable-image behavior | Admin + DB guidance | `STIMULUS_GROUPS_DESIGN.md`; `REUSABLE_IMAGE_QUESTIONS.md`; `AUTHORING_MODEL.md` | `agent:checks`; focused tests for logic; Vite/HMR for presentation-only edits; normal validation at checkpoint/handoff |

If a task affects more than one row above, read the authorities for each affected boundary. Do not read the entire documentation corpus by default.
