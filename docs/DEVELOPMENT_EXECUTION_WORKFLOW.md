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

This file does **not** authorize or duplicate Production deployment/migration commands. `docs/CLOUDFLARE.md` is the Production release authority.

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

### Write discipline

Think through a coherent multi-file change before mutation. Prefer one coherent commit/tree update where supported rather than a sequence of partially valid intermediate states.

After writing, review the resulting complete diff and CI. A correction delta does not substitute for final full-diff review.

GitHub CI evidence is not the same as local command evidence. Report the distinction.

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
