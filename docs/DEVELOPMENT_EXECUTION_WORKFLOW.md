# Development execution workflow: capability-based local, remote, and hybrid operation

> **INTERNAL OPERATIONAL DOCUMENTATION**
>
> This runbook is intended for the private Flash-Cards repository. Never commit credentials, `.dev.vars`, `.wrangler/` state, production-derived exports, or mirrored media.

_Status: current development/operator workflow._

_Last reviewed: 23 August 2026._

## Purpose

This document defines how development work should use the execution surfaces actually available to the coding workflow. Those surfaces may be directly available to the agent, or may include a user-operated local terminal/checkout that the user explicitly confirms is available. Do not infer terminal access merely from whether the user is on a laptop, phone, web client, or another device.

The goals are:

- keep the normal UX/code feedback loop fast when local execution exists;
- avoid spending GitHub Actions minutes on work that can be performed locally;
- support useful repository/PR work when only GitHub integration is available;
- combine local execution and GitHub collaboration efficiently when both are available;
- preserve CI, Preview and production safety gates;
- avoid inventing temporary workflows or unsafe deployment shortcuts merely because a capability is unavailable.

This document complements:

```text
docs/LOCAL_DEVELOPMENT_REPLICA.md
docs/PREVIEW_DEPLOYMENT.md
docs/CLOUDFLARE.md
```

Coding agents should begin with the root `AGENTS.md` safety contract and `docs/AGENT_TASK_MAP.md` before using this runbook.

### Production release authority

This document intentionally does **not** duplicate production deployment or production D1 migration commands.

`docs/CLOUDFLARE.md` is the authoritative production release runbook. It contains both:

- the normal GitHub Actions production release path; and
- the authenticated local/terminal equivalent for releasing from a command-capable environment.

Use this document to choose the execution mode, then follow `CLOUDFLARE.md` for the exact current production release procedure. If release commands, Wrangler versions, migration handling or production safety rules change, update `CLOUDFLARE.md` rather than copying the changed commands here.

## Core decision rule

**Detect available execution surfaces first. Then select the best supported workflow automatically.**

The user's device or physical location is not the execution-mode authority. A user on a phone may still be working with an agent that has shell access; a user at a laptop may still be using GitHub-only web chat. However, an explicit statement that a usable local checkout/terminal is available and the user can operate it is real capability information and should be used.

For GitHub-connected web-chat work, use **Remote GitHub mode by default** unless either:

- the agent itself has a usable local checkout and command execution; or
- the user explicitly states that a usable local checkout/terminal is available for them to operate.

The user does not need to repeatedly state that no terminal is available. When the user explicitly says terminal/local-clone access is available, use the user-assisted Hybrid path where local execution reduces Actions usage or improves the feedback loop.

Relevant capabilities include:

- usable command/shell execution directly available to the agent;
- an actual repository working tree and functional Git access;
- ability to execute repository-owned commands;
- an explicitly confirmed user-operated local checkout/terminal;
- GitHub repository/API/integration access;
- ability to inspect PRs and GitHub CI/check results.

Choose among three conceptual modes:

```text
agent has usable checkout + command execution + repository workflow
→ Local checkout mode

GitHub access without any confirmed usable local execution surface
→ Remote GitHub mode

GitHub access + either agent-operated or explicitly confirmed user-operated local execution
→ Hybrid mode
```

Execution mode and work state are separate decisions. Before creating or selecting a branch, identify whether the task explicitly targets existing work. If an existing PR or branch is targeted, inspect and continue its current head against its intended base. Only when no existing work state is targeted should the agent resolve a new intended base, normally the latest `main`, and create a feature branch from it.

All three modes keep the same minimum-context routing from `AGENT_TASK_MAP.md`; execution capability changes where work and validation happen, not which architectural/safety guidance is authoritative.

For a production release after merge, follow `docs/CLOUDFLARE.md`; do not infer production release steps from development/Preview flow.

## Do not confuse the two meanings of “Preview”

### Local production-style preview

```sh
npm run preview
```

This requires a usable local/command execution environment. It builds the application and starts the repository-pinned local Wrangler Workers runtime against local development bindings/state.

It:

- does **not** deploy a Cloudflare Worker;
- does **not** use GitHub Actions;
- does **not** consume GitHub Actions minutes;
- is useful for checking production-style Worker/runtime behavior before pushing or deploying remotely.

### Production-backed Preview deployment

```text
.github/workflows/deploy-pr-to-preview.yml
```

This is a GitHub Actions workflow that deploys the exact open PR head SHA to the `flash-cards-preview` Cloudflare Worker.

It:

- runs remotely on GitHub Actions;
- consumes GitHub Actions runtime;
- uses the production-backed Preview environment;
- is a later integration checkpoint, not the normal inner UX loop;
- never applies remote D1 migrations.

## Mode A — local checkout

Use this mode when the agent itself genuinely has a usable repository checkout, command execution, and the ability to execute the repository workflow.

### 1. Sync the branch

For work already created remotely or by another agent:

```sh
git fetch origin
git switch <branch>
git pull --ff-only origin <branch>
```

Run `npm ci` after dependency/lockfile changes or when the local install is not known to match the branch. The committed lockfile is authoritative; do not use `npm install` in CI as an implicit lockfile repair step.

### 2. Use the local replica only when realistic production-derived content is useful

First setup:

```sh
npm run local:setup
npm run local:admin
```

Refresh only when the production content copy actually needs updating:

```sh
npm run local:refresh
```

Do **not** refresh D1/R2 before every CSS, Svelte or UX edit. The existing local replica can be reused across ordinary iterations.

### 3. Use Vite for the normal fast UX loop

```sh
npm run dev
```

Use this for repeated component, layout, CSS, routing and authoring UX changes because it provides the fastest hot-reload loop.

### 4. Use local Wrangler preview at a checkpoint

When the change looks correct under Vite and production-style runtime behavior is relevant:

```sh
npm run preview
```

This is the preferred local check for Worker/runtime behavior and does not spend GitHub Actions minutes.

When the change touches `package.json`, `package-lock.json`, `wrangler.jsonc`, Svelte/Worker runtime configuration, or the runtime-smoke tooling itself, also run the narrow binding-free compatibility check:

```sh
npm run runtime:smoke
```

The smoke starts only a temporary local Worker. It does not load production D1/R2 bindings or require production secrets.

### 5. Let the repository-owned validation policy choose the checks

After syncing a checkout, or whenever the local environment may have drifted, run:

```sh
npm run agent:doctor
```

Before a meaningful handoff or PR review checkpoint, ask the repository which validation applies to the current feature change:

```sh
npm run agent:checks
```

`agent:checks` is read-only and advisory. It classifies the current branch diff plus working-tree changes and reports:

- affected repository areas;
- required automated checks;
- recommended manual or credential-dependent follow-up;
- specialized checks that are not required for the current change.

It prefers the locally available `origin/main` remote-tracking ref as the normal branch base, with local `main` as fallback. It does not fetch, mutate refs, switch branches or otherwise modify Git state.

Use the repository-owned validation runners instead of maintaining another manual command list in this runbook:

```sh
npm run validate:fast
npm run validate:full
```

Use `validate:fast` for an ordinary iteration checkpoint when the focused contract is sufficient. Use `validate:full` before handoff when `agent:checks` calls for the ordinary full contract, and run any additional specialized commands that `agent:checks` reports, such as runtime or slide-review validation.

Local `validate:*` resolves the same feature-branch base used by `agent:checks`. Its whitespace check compares that merge-base with the current tracked working tree, so committed feature changes, staged changes and unstaged tracked changes are all included. CI consumes the same ordinary full validation check IDs but keeps PR-checkout-specific diff semantics and GitHub annotations explicit.

You do not need to rerun every command after every small edit. Run focused checks during iteration and the repository-selected full/specialized set before handing the branch back for final PR review.

Opening/updating a PR may still trigger repository CI automatically. The local-first policy reduces avoidable extra remote runs; it does not weaken configured PR gates.

### 6. Deploy to the production-backed Preview only when it adds value

For ordinary UX work, do not deploy every small iteration to Preview.

A good sequence is:

```text
Vite local UX loop
→ local production-style preview
→ local validation
→ PR / CI
→ production-backed Preview once the candidate is worth manual integration review
```

If an authorized workflow-dispatch surface is available, dispatch the permanent workflow as documented in `PREVIEW_DEPLOYMENT.md`.

After a PR is merged and a production release is intended, stop following this development sequence and use the exact current release procedure in `CLOUDFLARE.md`.

## Mode B — remote GitHub

Use this mode when the agent has useful GitHub repository/API/integration access but no usable local execution surface is available to the agent and the user has not explicitly confirmed a user-operated local checkout/terminal.

For GitHub-connected web chat, this is the default mode unless local terminal/clone access is explicitly available. The absence of local execution changes where validation can happen; it does not change the repository's architecture, safety rules, minimum-context routing, or the current work state the user asked the agent to continue.

### Current web-chat GitHub capability baseline

As of this document's review date, the GitHub integration used from web chat can support substantial remote repository work without a local checkout. Depending on repository permissions and the exact actions exposed in the active session, it can:

- inspect repository files, branches and commits;
- inspect PRs, issues, diffs, reviews, inline review threads and comments;
- create or update feature branches and repository files/commits;
- open and update draft PRs and PR metadata;
- inspect PR CI/workflow runs, jobs, steps, logs and artifacts;
- rerun failed workflow jobs/runs when the connected GitHub permission allows it.

Treat this as a capability baseline, not a permanent exhaustive API contract. Check the active integration before relying on a specific mutation. In particular, generic `workflow_dispatch` is **not guaranteed to be exposed** by the web-chat GitHub integration; if it is unavailable, use another authorized GitHub/terminal surface rather than inventing a repository workaround.

The GitHub integration does not by itself make local repository commands such as `npm run validate:full`, Vite, local Wrangler Preview, or the local D1/R2 replica available. Those require a real execution surface. If the user explicitly confirms that they have the local clone/terminal available and can run commands, switch to the user-assisted Hybrid path for suitable local work.

### Remote GitHub flow

A normal high-level flow is:

```text
identify requested work state
→ existing PR/branch explicitly targeted?
   ├─ yes → inspect/use that PR head and intended base
   └─ no  → resolve current intended base, normally latest main,
            then create feature branch
→ read root AGENTS.md
→ consult AGENT_TASK_MAP.md
→ read nearest scoped AGENTS.md
→ load only relevant authoritative context
→ inspect directly related implementation/tests
→ form a coherent implementation
→ make coherent GitHub changes
→ review complete branch/PR diff
→ commit/push
→ inspect GitHub CI and specialized checks
→ make coherent follow-up fixes if required
→ leave draft PR as durable handover state
```

This is guidance rather than a rigid algorithm.

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

Never claim that a command ran when it did not. In particular, do not say `npm run validate:full passed` merely because GitHub CI passed.

Keep three kinds of evidence distinct:

- **executed validation:** commands actually run in an execution environment controlled by the agent or explicitly run by the user at the agent's request;
- **inspection:** conclusions based on reviewing files/diffs without executing the command;
- **GitHub CI/check evidence:** validation executed by configured GitHub workflows/check providers.

When local commands cannot run, say so and report the GitHub CI/check evidence actually available. If the affected subsystem requires specialized validation such as `npm run runtime:smoke`, `npm run slide-review:test`, or `npm run slide-review:build`, inspect the equivalent configured GitHub check/workflow evidence where it exists and explicitly report anything that could not be verified. Do not make specialized checks universal CI merely to support remote agents.

### Draft PR as durable handoff

For remote work, the current draft PR is an important persistent handover artifact. A later coding-agent session should normally be able to reconstruct current work from:

- PR title/body;
- current branch diff;
- commits;
- PR conversation;
- inline review threads;
- CI/check state;
- repository agent guidance.

The original chat should not be required. Keep the PR body concise and useful. Sections such as Goal, Behavioral invariants / constraints, Implementation, Validation, Remaining review points, and Explicitly out of scope are useful when the task is non-trivial; do not require a verbose template for trivial changes.

### Preview deployment from remote GitHub mode

The permanent Preview workflow remains:

```text
.github/workflows/deploy-pr-to-preview.yml
```

If the active GitHub integration exposes an authorized workflow-dispatch action, it may invoke that existing permanent workflow.

If workflow dispatch is **not** exposed by the active integration/session, use another authorized GitHub/terminal surface. Do not create a temporary workflow, source-code trigger, empty deployment commit, or unsafe bypass merely to compensate for missing workflow-dispatch capability.

After deployment, inspect/report the exact PR head SHA that was deployed and keep Preview deployment status separate from merge/production status.

For an actual production release, use the permanent production release path documented in `CLOUDFLARE.md`. This document does not reproduce its commands or migration options.

## Mode C — hybrid

Use this mode when GitHub access is available together with a usable local execution surface. That local surface may be either:

- directly available to the agent; or
- explicitly confirmed by the user as a local checkout/terminal they can operate on the agent's instructions.

For the user-assisted Hybrid path, the agent may continue repository/PR work through GitHub while giving the user exact local commands for validation, Vite/Preview, local replica work, or other tasks that are cheaper or only possible locally. Do not claim a user-run command passed until the user supplies its result.

Prefer each capability for what it does best:

```text
local execution surface
→ repository exploration when available there
→ implementation when appropriate
→ focused testing
→ repository validation

GitHub
→ branch collaboration
→ PR
→ review discussion
→ GitHub CI/check state
→ handover
```

Do not force expensive remote repository reads when the same information is already available cheaply in a directly accessible local checkout. Likewise, do not ignore GitHub PR/check state merely because local validation exists.

The local validation contract remains authoritative for work that can actually be executed locally. GitHub CI remains an independent remote gate/evidence source; report user-run or agent-run local command results and CI results separately rather than conflating them.

## GitHub Actions minute policy

GitHub-hosted CI is a shared/limited resource. Prefer spending it on checks that require the repository's remote gate or Cloudflare deployment rather than on every development iteration.

### Prefer local execution when available for

- repeated `npm run check` while editing;
- repeated unit-test runs;
- repeated builds;
- local Better Auth/D1 smoke tests;
- local Wrangler runtime checks;
- visual/UX iteration with real production-derived local content.

### Use GitHub Actions for

- the configured PR CI gate;
- executable validation when no usable local execution environment is available;
- the permanent production-backed Preview deployment;
- repository workflows that require GitHub secrets or an explicitly remote environment.

Avoid rerunning already-successful jobs unless the candidate changed or the run was genuinely transient/flaky.

The dedicated Wrangler runtime smoke workflow is intentionally path-filtered to runtime/toolchain files instead of charging every unrelated UX/content PR. If its scope changes later, preserve that principle unless a broader gate is required for reliability.

## Wrangler / compatibility-date maintenance

Wrangler/workerd and `wrangler.jsonc` compatibility dates are one runtime contract.

The exact `wrangler` devDependency recorded by `package.json` and `package-lock.json` is the repository authority. Normal package scripts and deployment workflows use that installed copy; do not add an alternate `npx wrangler@...` version for one command or environment.

When changing `compatibility_date` or Wrangler-related tooling:

1. update the exact repository pin and lockfile together when the runtime version changes;
2. ensure the selected Wrangler/workerd runtime supports the requested date;
3. run `npm run runtime:smoke` when command execution is available;
4. test `npm run preview` locally when a usable local execution environment is available and the full application runtime is relevant;
5. inspect/run the relevant CI/toolchain validation according to the selected execution mode;
6. do not lower a compatibility date merely to hide an outdated local runtime unless that rollback is itself an intentional reviewed change.

Release-critical procedures remain documented in `CLOUDFLARE.md`; do not duplicate them here.

## Agent instruction

At task start, determine whether the agent itself has:

- usable shell/command execution;
- a usable repository checkout and Git working tree;
- ability to run repository-owned commands;
- GitHub repository/PR/check access.

For GitHub-connected web chat, default to Remote GitHub mode when no local execution surface is directly available. Do not ask the user to reconfirm that they lack terminal access on each task. If the user explicitly states that a usable local checkout/terminal is available for them to operate, treat that as an available user-operated execution surface and use Hybrid mode where appropriate. Merely saying that they are on a laptop or phone does not establish terminal availability.

Also identify the requested work state before selecting or creating a branch. Continue an explicitly targeted existing PR/branch at its current head and intended base; otherwise resolve a new intended base, normally the latest `main`.

In every mode:

- use the minimum-context routing in root `AGENTS.md` and `AGENT_TASK_MAP.md`;
- preserve subsystem-specific validation requirements;
- distinguish agent-run commands, user-run commands, inspection, and GitHub CI evidence;
- review the complete diff before principal handoff;
- preserve focused PR scope and leave unrelated cleanup out unless required for safe completion.

## Safety boundaries common to all modes

- Local replica refresh remains **read production / write local** only.
- Ordinary local app development must not use writable production bindings.
- Preview deployment must not apply D1 migrations.
- A migration merged to `main` is not proof that it is applied to production D1.
- Preview Worker deployment is not production Worker deployment.
- Production release/migration operations remain separate explicit operator actions whose exact procedure is authoritative in `CLOUDFLARE.md`.
- Never add temporary workflows or broaden credentials simply to compensate for a missing execution capability.
