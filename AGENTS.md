# Flash-Cards Agent Safety Contract

This is the short universal machine-facing entry point for coding agents working in this repository. It defines repository-wide safety, routing, retrieval, and handoff invariants; it is not a substitute for scoped guidance or authoritative subsystem documentation.

## Start here

Always read this file before changing the repository.

Then load only the context needed for the task:

1. read the nearest scoped `AGENTS.md` for the files/subsystem being changed;
2. use `docs/AGENT_TASK_MAP.md` as the routing authority/lookup for additional task-specific documents and checks;
3. read directly related implementation and tests;
4. use `docs/DOCUMENTATION_INDEX.md` when the relevant authority is unclear or the task map directs you there;
5. read `docs/HANDOVER.md` only when project-wide status or recent implementation state is materially relevant.

The governing retrieval principle is:

> Read the minimum evidence necessary to make the next correct decision, then broaden only when the evidence requires it.

For a clearly bounded task in an existing subsystem, normally:

1. locate the relevant symbol/file with targeted search;
2. read bounded context around the relevant implementation;
3. inspect directly related helpers/tests when needed to answer an implementation question;
4. broaden to additional subsystems, architecture documents, history, or commits only while a material question remains unresolved.

Reuse sufficient information already retrieved. Do not load unrelated documentation “for completeness”, read complete large files when bounded ranges are sufficient, inspect history before current implementation without a material reason, repeatedly retrieve unchanged files/metadata, keep searching broadly after the implementation surface is established, or repeatedly inspect the complete PR diff during active implementation.

### Retrieval escalation

Constrained retrieval is appropriate when the work is clearly scoped to an existing subsystem and current evidence is sufficient. Automatically broaden context when evidence shows that the task materially touches any protected or cross-cutting boundary, including:

- schema or migrations;
- authentication or security;
- Production/Preview ownership or mutation boundaries;
- Cloudflare, deployment, Wrangler, or runtime behavior;
- Asset/R2 lifecycle or other persistent-storage ownership;
- substantial architecture/refactoring;
- multiple materially interacting subsystems;
- exploratory audits where broad investigation is itself the task.

This is an escalation model, not a rigid task-size classification. A bounded task may become elevated as soon as the evidence reveals a protected boundary.

When documentation conflicts with current executable implementation or an enforced contract, follow the current implementation and report the discrepancy. Do not silently rewrite working behavior to match stale prose.

## Execution capabilities and work state

Detect the capabilities actually available to the agent and choose Local checkout, Remote GitHub, or Hybrid operation from those capabilities rather than product/client names or the user's device. `docs/DEVELOPMENT_EXECUTION_WORKFLOW.md` is the detailed authority for those modes and Remote GitHub write mechanics.

Before creating or selecting a branch, identify the requested work state:

- if the task explicitly targets an existing PR/branch, continue its current head against its intended base;
- otherwise resolve the intended base, normally the actual latest `main`, and create the feature branch from that resolved base.

For an existing PR, normally establish the PR number, exact head SHA, intended base, and Draft/Ready state once at task start. Retrieve those facts again only after something capable of changing them, such as a push, rebase/update from `main`, external branch movement, or final handoff verification.

A successful `npm run agent:doctor` establishes that the local-execution side is available. If GitHub access is also available, use Hybrid strengths rather than falling back to product-name heuristics.

## Universal change discipline

- Preserve product behavior in refactor-only work.
- Keep the change focused; do not broaden a task into unrelated cleanup, formatting, schema, UX, or architecture work.
- Prefer existing helpers/patterns and directly related tests before adding a new abstraction.
- For capable coding agents, task prompts should normally state the goal, important behavioral/safety invariants, scope constraints, acceptance criteria, and any explicit existing-PR/branch requirement. Do not force broad hard-coded file, documentation, test, or exploration lists when current repository routing can discover the needed context; exact artifacts remain appropriate when they are genuinely part of the task contract, and prompt instructions must not force unrelated context to be loaded “for completeness”.
- Treat Production/Preview scope and ownership checks as data-integrity boundaries, not incidental filters.
- Never mutate production D1/R2 merely to test, debug, seed, or preview a change.
- Never invent temporary deployment/mutation workflows, one-off production bypasses, or broader credentials to compensate for a missing capability.
- Never commit credentials, API tokens, private keys, `.dev.vars`, `.wrangler/`, production-derived exports/snapshots/media, or deliberately excluded local replica state.
- For SvelteKit actions, remember that `redirect()` throws; do not let a broad catch convert a successful redirect into an error response.
- If you notice an unrelated issue, change it only when required for safe completion; otherwise keep it out of the focused PR and record a useful follow-up when appropriate.

## Protected-boundary routing

Load the scoped guidance and authorities before editing a protected area. Do not duplicate their detailed rules here.

| Boundary | Required routing trigger |
| --- | --- |
| Database, schema, migrations, Preview DB ownership | `src/lib/server/db/AGENTS.md` plus the relevant `AGENT_TASK_MAP.md` row/document |
| Admin authoring / Preview Admin / Svelte actions | `src/routes/admin/AGENTS.md` plus the relevant authoring/Preview authority |
| Asset/media/R2 lifecycle | `src/lib/server/storage/AGENTS.md` plus the relevant image/storage authority |
| Scripts, local replica, Wrangler/runtime tooling | `scripts/AGENTS.md` plus the relevant runbook |
| GitHub Actions / CI / deployment workflows | `.github/AGENTS.md` plus the relevant CI/Cloudflare runbook |
| Tests, validation selection, CI diagnostics | `docs/TESTING_AND_VALIDATION_GUIDANCE.md`; add `docs/CI_AGENT_DIAGNOSTICS.md` when CI presentation/retrieval changes |
| Substantial structural work | `docs/ENGINEERING_ARCHITECTURE_GUIDELINES.md` plus the affected subsystem authority |

Use `docs/AGENT_TASK_MAP.md` for the exact current routing for auth, imports, tags, stimulus behavior, slide-review tooling, and other task-specific areas.

## Validation and reporting

Preserve the repository's iteration → checkpoint → handoff validation architecture. Constrained retrieval never means reduced validation.

- Do not claim a command, test, build, deployment, migration, or smoke check ran unless it actually ran.
- When local execution is available, use `npm run agent:doctor` as the read-only environment check normally once per local coding session; rerun it when environment/toolchain/Git-worktree assumptions may have become stale, not merely because ordinary application source changed.
- During active implementation, use the cheapest feedback that meaningfully tests the current risk: Vite/HMR for presentation-only iteration and the nearest directly related test(s) for logic changes.
- After a coherent change, run `npm run agent:checks` (prefer `npm run agent:checks -- --compact` when output enters model context) to obtain current iteration/checkpoint guidance, final required checks, and specialized requirements.
- `agent:checks` intentionally includes legitimate untracked files. Do not change it or local practice to ignore arbitrary untracked implementation files. Persistent checkout-local machine/tool artifacts belong in `.git/info/exclude`; universally inappropriate repository artifacts belong in `.gitignore`. Never add broad ignore patterns that could hide legitimate source, assets, or configuration.
- Use `npm run validate:fast -- --compact` at a coherent checkpoint when the repository guidance calls for it; focused iteration success is not handoff completion.
- Before final handoff/review, execute every final required check reported by `agent:checks` plus required specialized checks. `npm run validate:full -- --compact` remains the ordinary local pre-handoff contract when applicable; compact mode changes presentation only, never check selection or semantics.
- Do not rerun an unchanged validation command unless later changes could invalidate what it checked.
- When command execution is unavailable, inspect equivalent GitHub CI/check evidence where it exists and report separately what could not be executed. “GitHub CI passed” is not the same claim as “the local command passed”.
- Low-level validation selection, reporter, specialized-check, and CI ownership rules live in `scripts/AGENTS.md`, `.github/AGENTS.md`, `docs/TESTING_AND_VALIDATION_GUIDANCE.md`, and `docs/CI_AGENT_DIAGNOSTICS.md`; load them only when that machinery is being changed.

Do not introduce arbitrary command-count limits, token budgets, context counters, caches, retrieval wrappers, or a second validation/retrieval DSL as substitutes for judgment and repository-owned contracts.

## Implementation versus final review

During active implementation, prefer targeted implementation reads, changed-file/scoped diff inspection, directly relevant tests, and focused correction deltas. Do not repeatedly retrieve the complete PR diff after each small edit.

At a deliberate final review/handoff checkpoint, inspect the complete intended-base → current-head branch/PR diff. Check task fit, behavioral and safety invariants, accidental scope expansion, unrelated changes, stale references/imports, missing or inappropriate tests, and documentation accuracy. A correction-only delta review never substitutes for this complete final review.

A Draft PR is a durable handoff artifact for remote work. Keep its title/body, current diff, commits, review discussion, and CI/check state sufficient for a later agent to reconstruct the work without the original chat. Do not mark a Draft Ready for Review unless the task explicitly calls for it.

## Before committing / handing off

Confirm that the complete change:

- satisfies the requested goal and acceptance criteria without unrelated cleanup;
- preserves behavior where behavior change is out of scope;
- does not weaken Production/Preview, auth/security, schema/migration, storage, runtime, deployment, or validation safeguards;
- contains no secrets, generated local state, production-derived content, or broad ignore rules that could conceal legitimate repository files;
- follows the routed scoped authorities for every protected boundary it touches;
- has no stale references/imports or documentation made inaccurate by the implementation;
- has received the repository-required final validation and complete intended-base → current-head review.
