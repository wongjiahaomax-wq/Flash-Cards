# Coding-agent task map

Purpose: route a coding task to the **minimum current context** needed before editing. This file is a routing authority/lookup, not default cover-to-cover reading. `docs/DOCUMENTATION_INDEX.md` remains the documentation authority/index; historical plans and completed agent-task prompts are not default context.

Always read the root `AGENTS.md`. Then read the nearest scoped `AGENTS.md` for the implementation surface. Use the relevant row/section of this task map to identify additional authoritative documents and checks. When the task boundary is already obvious, do not load unrelated task-map sections or documentation merely for completeness.

## Progressive retrieval and escalation

Use this rule throughout implementation:

> Read the minimum evidence necessary to make the next correct decision, then broaden only when the evidence requires it.

For a bounded task in an established subsystem, prefer this retrieval ladder:

1. locate relevant symbols/files with targeted search;
2. read bounded context around those symbols;
3. inspect directly related helpers/tests only when needed to resolve an implementation question;
4. broaden to additional subsystems, architecture documents, history, or commits only while a material question remains unresolved.

Reuse sufficient information already retrieved. For bounded work, avoid:

- reading complete large files when bounded ranges answer the question;
- loading unrelated documentation “for completeness”;
- inspecting historical commits before current implementation unless history materially matters;
- repeatedly retrieving unchanged files;
- repeating PR/base/head metadata reads when no event capable of changing them occurred;
- broad repository searches after the relevant implementation surface is already established;
- repeatedly reviewing the complete PR diff during active implementation.

A task can remain constrained when it is clearly scoped to an existing subsystem and the evidence does not cross a protected boundary. Automatically elevate retrieval when evidence materially touches schema/migrations, auth/security, Production/Preview ownership, Cloudflare/deployment/runtime, Asset/R2 lifecycle, substantial architecture/refactoring, multiple interacting subsystems, or an exploratory audit where broad investigation is the work itself.

This is an escalation model rather than a permanent “small/large” label. Encountered evidence can change the required context at any time.

## Execution mode selection

Detect actual capabilities at task start. Do not infer execution mode from the user's device, physical location, or product/client name. Explicit user execution constraints override automatic selection.

Before creating/selecting a branch, identify the requested work state. If an existing PR/branch is explicitly targeted, continue its current head against its intended base. Otherwise resolve the actual intended base, normally latest `main`, before creating new work.

```text
usable checkout + command execution + repository workflow
→ Local checkout mode

GitHub repository/PR access without usable local execution
→ Remote GitHub mode

both local execution and GitHub access
→ Hybrid mode
```

`docs/HANDOVER.md` is optional unless project-wide state or recent implementation status is materially relevant. Load `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md` only for substantial structural work or when the task-map row explicitly requires it.

### Local checkout mode

Use the repository-owned iteration → checkpoint → handoff flow:

```text
npm run agent:doctor
        ↓
implement narrowly with targeted reads
        ↓
focused feedback for the current risk
        ↓
npm run agent:checks -- --compact
        ↓
checkpoint validation when useful
        ↓
final required + specialized checks
        ↓
complete final diff review
```

Presentation-only UX iteration should normally use Vite/HMR. If this checkout already has a healthy usable `npm run dev` / Vite HMR process, reuse it rather than starting another development server merely for agent iteration. Do not restart or stop a healthy local dev server after ordinary source edits; start, stop, or switch runtime processes only when the task or environment requires it. Production-style `npm run preview` remains a checkpoint tool rather than the normal edit loop. Logic changes should normally run the nearest directly related test(s) first. Do not repeatedly run broad validation after every small edit.

`agent:checks` intentionally includes tracked branch/working-tree changes and legitimate untracked files. Do not hide arbitrary untracked implementation files from it. Persistent machine/tool-only artifacts that are checkout-local belong in `.git/info/exclude`; artifacts that are universally inappropriate for the repository belong in `.gitignore`. Keep ignore patterns narrow enough that legitimate source, assets, or configuration remain visible.

### Remote GitHub mode

When GitHub access is useful but local execution is unavailable, use repository/PR state as the working surface:

```text
identify requested work state
        ↓
establish exact PR/branch head + intended base
        ↓
read root AGENTS.md
        ↓
read nearest scoped AGENTS.md
        ↓
use the relevant task-map routing only as needed
        ↓
targeted implementation/test retrieval
        ↓
coherent implementation + self-review
        ↓
coherent GitHub branch update
        ↓
complete intended-base → current-head review at final checkpoint
        ↓
GitHub CI/check evidence
        ↓
Draft PR durable handoff
```

For an existing PR, normally establish the PR number, exact head SHA, intended base, and Draft/Ready state once at the start. Re-read those facts only after a push, rebase/update from `main`, external branch movement, or final handoff verification.

During active implementation, prefer targeted retrieval, bounded file reads, implicated patches, directly related tests, and focused correction deltas. Do not repeatedly fetch the complete PR diff. At final review/handoff, inspect the complete intended base → current head change; a correction delta is not a substitute for final completeness.

For detailed Remote GitHub retrieval discipline and coherent multi-file write mechanics, follow `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`. That runbook owns the retrieval and multi-file write procedure; this task map owns routing and escalation only.

Distinguish inspection from execution. Do not report local commands as passed unless they actually ran. Report GitHub CI/check evidence separately and list required validation that could not be executed or verified.

### Hybrid mode

Use each capability where it is strongest:

```text
local checkout
→ targeted repository exploration
→ implementation
→ focused testing
→ repository validation

GitHub
→ branch / PR collaboration
→ reviews and CI/check state
→ durable handoff
```

Do not perform expensive remote reads for information already available in the local checkout, and do not ignore current PR/check state merely because local validation exists.

## Local agent commands

Use these from the repository root when command execution is available:

```sh
npm run agent:doctor
npm run agent:checks -- --compact
npm run validate:fast -- --compact
npm run validate:full -- --compact
npm run local:stop
```

`agent:doctor` is the read-only environment check. Run it normally once per local coding session, not after every edit or every small task. Rerun it when its conclusions may no longer be trustworthy—for example after switching to a different checkout/environment, dependency installation or `npm ci`, Node/Wrangler/toolchain changes, unexpected local tooling failures, or other evidence of environment drift. Application source changes alone are not a reason to rerun it. A successful run establishes the local-execution side; it does not determine whether GitHub access also exists.

`agent:checks` is the read-only changed-file validation advisor. Its compact form uses the same classification/report as verbose mode and changes presentation only. It includes committed feature-branch changes, tracked working-tree changes, and untracked files. Its final required/specialized checks remain authoritative for handoff regardless of how narrow iteration feedback was.

`validate:fast` is checkpoint validation after a coherent batch, not an every-edit loop. `validate:full` is the ordinary local pre-handoff contract when required. Compact variants preserve the same check selection/ordering and reduce presentation volume only. Run specialized checks surfaced by `agent:checks` in addition to the ordinary contract.

`local:stop` is the repository-scoped cleanup command for this checkout's Vite/Wrangler development processes. Reuse a healthy existing local development process when possible; do not call `local:stop` merely because an application source edit completed. Detailed command/runtime semantics live in `scripts/AGENTS.md` and `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`.

For tasks that change maintained tests, test selection, validation composition, changed-path rules, specialized-check ownership, or CI diagnostics, read `docs/TESTING_AND_VALIDATION_GUIDANCE.md`; add `docs/CI_AGENT_DIAGNOSTICS.md` when CI presentation/retrieval itself changes. Low-level validation/reporter ownership lives in the scoped `scripts/` and `.github/` guidance rather than here.

## Task routing lookup

| Task | Scoped guidance | Minimum authoritative context | Common checks |
| --- | --- | --- | --- |
| Tests / validation architecture / fixtures | `scripts/AGENTS.md`; `.github/AGENTS.md` as applicable | `TESTING_AND_VALIDATION_GUIDANCE.md`; `CI_AGENT_DIAGNOSTICS.md` when CI presentation/retrieval changes | `agent:checks`; focused validation-contract/selection tests; repository-selected handoff checks |
| Substantial refactor / new module boundary / hotspot decomposition / meaningful JS→TS extraction | nearest affected scoped guidance | `ENGINEERING_ARCHITECTURE_GUIDELINES.md` plus the affected subsystem authority | `agent:checks`; focused characterization tests; repository-selected handoff checks |
| Admin presentation / interaction | `src/routes/admin/AGENTS.md` | directly affected implementation/tests; relevant current Admin design only when needed | Vite/HMR for presentation-only iteration; focused tests for interaction logic; `agent:checks`; final required checks |
| Case editor authoring / classification / question / image semantics | `src/routes/admin/AGENTS.md`; DB/storage guidance when ownership or lifecycle is involved | `AUTHORING_MODEL.md`; relevant Topic/Tag/question/image authority for the changed semantics | `agent:checks`; focused tests; Vite/HMR for presentation changes; final required checks |
| Authentication / Account Management | relevant Admin/server guidance; inspect current auth routes/modules | `ACCOUNT_MANAGEMENT_PLAN.md` only where still future-intent authority; current auth implementation/tests | `agent:checks`; focused auth/security tests; final required checks; runtime smoke when runtime/binding-sensitive |
| Database / read models | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; `PERFORMANCE_AND_READ_MODEL_PLAN.md` | `agent:checks`; `npm run db:check`; focused tests; final required checks |
| Schema / migrations | `src/lib/server/db/AGENTS.md` | `V1_DATA_MODEL.md`; current schema + migrations | `agent:checks`; `npm run db:check`; focused migration/schema tests; full handoff validation |
| Asset / R2 lifecycle | `src/lib/server/storage/AGENTS.md`; DB guidance when relationships change | `IMAGE_PROVENANCE.md`; `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` | `agent:checks`; focused tests; final required checks; runtime smoke if bindings/runtime change |
| Cloudflare / Wrangler runtime | `scripts/AGENTS.md`; `.github/AGENTS.md` | `CLOUDFLARE.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | `agent:checks`; focused tests; `npm run runtime:smoke`; final required checks |
| Preview retained subsystem | Admin/DB/GitHub guidance as applicable | `PREVIEW_ADMIN_WORKSPACE.md`; `PREVIEW_DEPLOYMENT.md` only for remote Preview deployment | `agent:checks`; focused ownership/runtime tests; final required checks |
| Local development replica | `scripts/AGENTS.md` | `LOCAL_DEVELOPMENT_REPLICA.md`; `DEVELOPMENT_EXECUTION_WORKFLOW.md` | `agent:checks`; focused script tests; credential-dependent verification only when appropriate |
| Imports / reviewed imports | DB/storage guidance | `CONTENT_IMPORT_PACKAGES.md`; `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` | `agent:checks`; import tests; final required checks |
| Slide-review tooling | `tools/slide-import-review/AGENTS.md` | `SLIDE_TO_FLASHCARDS_REVIEWED_IMPORT_WORKFLOW.md`; `CONTENT_IMPORT_PACKAGES.md` | `agent:checks`; `npm run slide-review:test`; `npm run slide-review:build` |
| Tags / Shared Questions | Admin + DB guidance | `TAGGING_MODEL_DECISIONS.md`; `TAGGING_STAGE_B_BEHAVIOR.md` | `agent:checks`; focused tests; Vite/HMR for presentation-only edits; final required checks |
| Stimulus / reusable-image behavior | Admin + DB + storage guidance as applicable | `STIMULUS_GROUPS_DESIGN.md`; `REUSABLE_IMAGE_QUESTIONS.md`; `AUTHORING_MODEL.md` | `agent:checks`; focused tests; Vite/HMR for presentation-only edits; final required checks |

If a task affects more than one row, load the authorities for each material boundary. Do not read the entire documentation corpus by default.

For Preview backend implementation details, use `src/lib/server/db/AGENTS.md` and `docs/PREVIEW_ADMIN_WORKSPACE.md`; do not duplicate the current helper/module ownership map here. If Preview removal is proposed, treat it as a separate decommissioning assessment because production filtering, ownership/security, Asset safety, auth/deployment tooling, tests, and stored Preview-owned data may depend on it.

For account/auth work, current implementation and current subsystem guidance take precedence over completed historical prompts. If an existing implementation PR is explicitly targeted, continue that PR head against its intended base rather than restarting from `main`.
