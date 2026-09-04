# Development execution workflow

_Status: current development/operator workflow._

_Last reconciled: 4 September 2026._

The GitHub repository is public. The application, Production credentials, auth/user/learner data, and private teaching media remain private operational concerns. Never commit credentials, `.dev.vars`, `.wrangler/` state, Production exports, learner data, or mirrored private media.

## Purpose

Choose the development workflow from the execution capabilities actually available, not from the user's device/client name.

The three supported modes are:

```text
usable checkout + command execution
→ Local checkout mode

GitHub repository/PR access without usable local execution
→ Remote GitHub mode

both local execution and GitHub access
→ Hybrid mode
```

Before creating/selecting a branch, first determine whether the task targets an existing PR/branch. If not, resolve the actual intended base, normally latest `main`, then create the feature branch from that exact base.

Root `AGENTS.md` and `docs/AGENT_TASK_MAP.md` own coding-agent routing/safety. This runbook owns execution-mode mechanics.

## Production release boundary

This file does **not** authorize or duplicate Production deployment/migration commands. `docs/CLOUDFLFLARE.md` is the Production release authority.

Development/validation state is separate from:

```text
Production migration
Production Worker deployment
Production data mutation
feature enablement
live verification
```

## Local checkout mode

### Sync / dependency preparation

For existing remote work:

```sh
git fetch origin
git switch <branch>
git pull --ff-only origin <branch>
npm run deps:ensure
```

For a new local branch, start from the resolved current intended base.

`npm run deps:ensure` is the normal dependency-preparation command. It reuses `node_modules` only when the `package.json`/`package-lock.json`/Node ABI/platform/architecture fingerprint still matches; otherwise it performs the repository clean install and records the fingerprint.

Use:

```sh
npm run deps:ensure -- --force
```

only for known dependency damage/drift or when the environment tooling indicates a forced clean refresh is required.

Do not use `npm install` as an implicit lockfile repair step. The committed lockfile is authoritative.

On Windows, use `npm run local:stop` before a required clean dependency refresh when this checkout's Vite/Wrangler process may hold native modules open. Do not kill all machine-wide Node processes.

### Local content replica

Use the production-like local content replica only when realistic content is useful:

```sh
npm run local:setup
npm run local:admin
```

Refresh deliberately when production content needs updating:

```sh
npm run local:refresh
```

Do not refresh D1/R2 before every code/CSS edit.

### Fast development loop

```sh
npm run dev
```

Use Vite/HMR for normal UX iteration against local bindings/state. Reuse a healthy existing dev server rather than restarting after each edit.

### Production-style local runtime checkpoint

```sh
npm run local:stop
npm run preview
```

`npm run preview` builds and runs the checked-out Worker locally against local D1/R2/auth state. It does not deploy anything.

Use `npm run local:stop` when switching back to Vite or when local runtime file locks need clearing.

### Validation

Run `npm run agent:doctor` when environment/Git conclusions are not already trustworthy for the current local session.

After a coherent change:

```sh
npm run agent:checks -- --compact
```

Then run the focused/checkpoint/final commands it requires. Common ordinary contracts are:

```sh
npm run validate:fast -- --compact
npm run validate:full -- --compact
```

Specialized checks reported by `agent:checks` remain additional requirements. Compact mode changes presentation only, not check selection.

Do not claim a command passed unless it actually ran.

## Remote GitHub mode

Use when GitHub access exists but no usable local execution surface exists.

Normal flow:

```text
resolve existing work or exact latest base
→ read root AGENTS.md
→ route through AGENT_TASK_MAP.md
→ retrieve minimum sufficient current context
→ form coherent change
→ self-review intended changes
→ update branch coherently
→ inspect complete base→head diff at final checkpoint
→ inspect GitHub CI/check evidence
→ leave Draft PR as durable handoff unless user requests Ready
```

### Retrieval discipline

Prefer the smallest sufficient GitHub surface:

- metadata for PR/base/head/state;
- targeted search for discovery;
- exact file/bounded context once the path is known;
- individual patches during active work;
- complete intended-base → head diff at final review/handoff.

Reuse information already retrieved. Do not repeatedly load unchanged large files/diffs merely for completeness.

### Remote GitHub write discipline

Separate planning from branch mutation. For a coherent Remote GitHub implementation, prefer this sequence:

```text
inspect enough context
→ form the coherent implementation
→ self-review the intended changes
→ mutate the branch coherently
→ inspect the resulting complete diff
→ inspect CI
```

Do not use sequential repository writes as a substitute for thinking through the complete change. Do not use GitHub Actions as an iterative debugger for intermediate partially implemented branch states when those states can reasonably be avoided.

Keep simple writes simple. A single-file change may use the integration's ordinary file-update capability, and a trivial metadata-only PR change does not need low-level Git-data construction. Use the multi-file path only when it materially reduces sequential repository mutations or avoidable intermediate branch states.

When one logical implementation spans multiple files and the active integration exposes the required Git-data capabilities, prefer one coherent Git commit constructed from the exact current feature-branch head:

```text
establish the exact feature-branch head
→ create changed-file blobs
→ create one tree based on that exact head's tree
→ create one commit using that exact head as the intended parent
→ move the feature branch once with a normal fast-forward update
```

The objective is one coherent implementation batch → one branch update → one normal PR synchronize/CI cycle, rather than one branch update and CI event per changed file. This is a write-efficiency preference, not a rule that every task must have exactly one commit. Multiple commits remain appropriate when they represent genuinely separate logical changes that improve reviewability.

Exact-head safety is mandatory. Establish the feature-branch head immediately before constructing the commit, use that exact head as the intended parent/base, and move the branch only with a normal fast-forward update. Never force-update the feature branch merely to make a batched write succeed. If the branch moved concurrently, stop using the stale parent, inspect the new state, and reconcile normally before constructing another commit. When the task explicitly targets an existing PR or branch, preserve that existing work state and its intended base instead of rebuilding the work from `main`.

After the branch update, inspect the current PR/head state, inspect the complete intended base → current head change, verify that every intended file landed correctly, and apply the existing final-review and validation requirements normally. An atomic write is not evidence that the implementation is correct, and it does not replace GitHub CI/check inspection.

This runbook owns the detailed Remote GitHub write procedure. Keep root agent guidance and task-routing documentation at the concise policy/routing level rather than duplicating these Git-data steps into another competing execution workflow.

GitHub API/integration access has a higher round-trip cost than a local filesystem. Inspect sufficient context before editing, avoid repeatedly fetching the same files unnecessarily, form the implementation before speculative writes, batch related changes where practical, and use logical commits rather than one commit per file. Multiple logical commits are appropriate when they genuinely improve reviewability.

Before the principal implementation handoff/push, inspect the complete proposed change against:

- task goal;
- behavioral invariants;
- acceptance criteria;
- accidental scope expansion;
- unrelated cleanup;
- stale references/imports;
- missing tests;
- inappropriate tests;
- unintended behavioral changes;
- documentation made inaccurate by the implementation.

For refactor-only work, explicitly confirm that behavior was preserved.

Do not use GitHub Actions as the first debugger for a stream of small speculative changes. Prefer:

```text
inspect
→ reason
→ coherent implementation
→ self-review
→ push
→ inspect CI
```

If CI reveals a genuine issue, diagnose and fix it normally.

### Validation evidence in remote mode

Never claim that a command ran when it did not. Keep executed validation, inspection, and GitHub CI/check evidence distinct.

When local commands cannot run, report the GitHub checks actually observed and explicitly state any required validation that could not be verified. A successful GitHub check is CI evidence; it is not evidence that the agent personally ran the corresponding local command.

### Draft PR as durable handoff

For remote work, the Draft PR is the durable handoff artifact. It should preserve enough branch/diff/CI context for a later session without requiring the original chat.

## Hybrid mode

Use local execution for targeted exploration, implementation, focused tests, and repository validation; use GitHub for branch/PR state, collaboration, review, and CI.

Avoid expensive duplicate reads/validation across both surfaces when one already establishes the fact.

## Draft / Ready CI lifecycle

Ordinary PR validation remains:

```text
Draft PR            → fast ordinary CI
Ready-for-Review PR → full ordinary CI
Draft → Ready       → full validation on current head
same-PR newer run   → supersedes/cancels older same-PR work where configured
different PRs       → independent
```

The repository's validation scripts/workflows own exact check composition. Do not copy a hard-coded test list into task prompts when `agent:checks` can derive it.

## Remote Preview

The production-backed Preview Worker remains an optional/safety-sensitive capability, not the normal development path.

Use local `npm run dev` / `npm run preview` first when local execution exists. Use remote Preview only when explicitly requested or when it adds concrete value beyond local validation/ordinary PR CI.

Remote Preview does not authorize Production D1 migration.

## Production release

After merge, if a Production release is intended, stop following the development sequence and follow the exact current `docs/CLOUDFLARE.md` runbook.

Never infer Production release steps from an old PR body, historical plan, or this development guide.
