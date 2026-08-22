# Development execution workflow: laptop versus mobile

> **INTERNAL OPERATIONAL DOCUMENTATION**
>
> This runbook is intended for the private Flash-Cards repository. Never commit credentials, `.dev.vars`, `.wrangler/` state, production-derived exports, or mirrored media.

_Status: current development/operator workflow._

_Last reviewed: 22 August 2026._

## Purpose

This document defines which work should run on the developer laptop and which work should use GitHub/remote automation when the developer is working from a phone or otherwise has no terminal access.

The goals are:

- keep the normal UX/code feedback loop fast;
- avoid spending GitHub Actions minutes on work that can be performed locally;
- preserve CI, Preview and production safety gates;
- let ChatGPT continue repository/PR work when the developer is mobile;
- avoid inventing temporary workflows or unsafe deployment shortcuts merely because the laptop is unavailable.

This document complements:

```text
docs/LOCAL_DEVELOPMENT_REPLICA.md
docs/PREVIEW_DEPLOYMENT.md
docs/CLOUDFLARE.md
```

Coding agents should also begin with the root `AGENTS.md` safety contract before using this runbook.

### Production release authority

This document intentionally does **not** duplicate production deployment or production D1 migration commands.

`docs/CLOUDFLARE.md` is the authoritative production release runbook. It contains both:

- the normal GitHub Actions production release path; and
- the authenticated local/terminal equivalent for releasing from a laptop.

When choosing between laptop and mobile execution, use this document to choose the operating mode, then follow `CLOUDFLARE.md` for the exact current production release procedure. If release commands, Wrangler versions, migration handling or production safety rules change, update `CLOUDFLARE.md` rather than copying the changed commands here.

## Core decision rule

Use **local-first execution when a laptop/terminal is available**.

Use **GitHub-first execution when working from mobile or without terminal access**.

```text
Laptop available
→ local dev / local replica / local validation
→ push PR
→ normal PR CI
→ production-backed Preview only at a meaningful checkpoint

Mobile / no terminal
→ ChatGPT + GitHub connector for repository/PR work
→ GitHub CI for validation
→ permanent Preview workflow when remote Preview is actually required
```

The two modes produce the same repository/PR outcome. They differ mainly in where computation and validation happen.

For a production release after merge, follow `docs/CLOUDFLARE.md`; do not infer production release steps from the development/Preview flow above.

## Do not confuse the two meanings of “Preview”

### Local production-style preview

```sh
npm run preview
```

This runs on the laptop. It builds the application and starts the repository-pinned local Wrangler Workers runtime against local development bindings/state.

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

## Mode A — laptop available

When the developer has the laptop and terminal, prefer this path.

### 1. Sync the branch

For work already created by ChatGPT or another agent:

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

When the change looks correct under Vite and you want production-style runtime behavior locally:

```sh
npm run preview
```

This is the preferred local check for Worker/runtime behavior and does not spend GitHub Actions minutes.

When the change touches `package.json`, `package-lock.json`, `wrangler.jsonc`, Svelte/Worker runtime configuration, or the runtime-smoke tooling itself, also run the narrow binding-free compatibility check:

```sh
npm run runtime:smoke
```

The smoke starts only a temporary local Worker. It does not load production D1/R2 bindings or require production secrets.

### 5. Move normal validation work to the laptop when practical

At a meaningful checkpoint run the relevant commands locally:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

You do not need to rerun every command after every small edit. Run the focused check during iteration and the full relevant set before handing the branch back for final PR review.

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

If terminal + GitHub CLI are available, dispatch the permanent workflow as documented in `PREVIEW_DEPLOYMENT.md`.

After a PR is merged and a production release is intended, stop following this development sequence and use the exact current release procedure in `CLOUDFLARE.md`.

## Mode B — mobile / no terminal access

When the developer is working from a phone or does not have the local clone available, use the repository and GitHub automation instead of pretending a laptop-local step occurred.

### ChatGPT/GitHub connector responsibilities

ChatGPT may use the connected GitHub tooling to perform supported repository operations such as:

- inspect current `main`, branches, commits and PRs;
- review repository files and diffs;
- create/update a feature branch;
- edit repository files;
- commit changes through GitHub;
- open/update a draft PR;
- inspect PR metadata and available CI results/logs.

When the local machine is unavailable, GitHub CI becomes the primary executable validation environment for changes made from mobile.

Do not claim that `npm run dev`, the local D1/R2 replica, `npm run preview`, `npm run runtime:smoke`, or other laptop-only commands were executed unless they actually ran in an environment that supports them.

### Preview deployment from mobile

The permanent Preview workflow remains:

```text
.github/workflows/deploy-pr-to-preview.yml
```

If the active ChatGPT/GitHub integration exposes an authorized workflow-dispatch action, it may invoke that existing permanent workflow.

If workflow dispatch is **not** exposed by the active connector/session, use the GitHub Actions mobile/web UI to run the permanent workflow, or use another authorized terminal environment. Do not create a temporary workflow, source-code trigger, empty deployment commit, or unsafe bypass merely to compensate for missing workflow-dispatch capability.

After deployment, inspect/report the exact PR head SHA that was deployed and keep Preview deployment status separate from merge/production status.

For an actual production release from mobile/no-terminal mode, use the permanent production release path documented in `CLOUDFLARE.md`. This document does not reproduce its commands or migration options.

## GitHub Actions minute policy

GitHub-hosted CI is a shared/limited resource. Prefer spending it on checks that require the repository's remote gate or Cloudflare deployment rather than on every development iteration.

### Prefer local execution for

- repeated `npm run check` while editing;
- repeated unit-test runs;
- repeated builds;
- local Better Auth/D1 smoke tests;
- local Wrangler runtime checks;
- visual/UX iteration with real production-derived local content.

### Use GitHub Actions for

- the configured PR CI gate;
- validation when the developer is mobile/no terminal is available;
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
3. run `npm run runtime:smoke`;
4. test `npm run preview` locally when laptop access is available and the full application runtime is relevant;
5. run the relevant CI/toolchain validation;
6. do not lower a compatibility date merely to hide an outdated local runtime unless that rollback is itself an intentional reviewed change.

Release-critical procedures remain documented in `CLOUDFLARE.md`; do not duplicate them here.

## Agent instruction

When the user explicitly says they **have laptop access**:

- prefer local commands for repeated validation and UX preview;
- give exact terminal commands when a local development/validation action is required;
- do not spend extra GitHub Actions minutes merely because a remote workflow exists;
- still use normal PR CI and production-backed Preview when they are meaningful safety/integration gates;
- for production deployment or production D1 migration instructions, read and follow `CLOUDFLARE.md` rather than relying on copied commands in another document.

When the user says they are **on mobile**, **away from the laptop**, or otherwise have **no terminal access**:

- use the GitHub connector for supported repository/PR operations;
- rely on configured GitHub CI for executable validation that cannot run locally;
- use only permanent deployment workflows;
- if workflow dispatch is unavailable through the connector, state that clearly and use the GitHub Actions UI/another authorized environment rather than inventing a workaround;
- for production release details, read and follow `CLOUDFLARE.md`.

If the user's access mode is not stated and the choice affects Actions usage, ask or infer conservatively from the immediate context. Do not assume a local validation step occurred.

## Safety boundaries common to both modes

- Local replica refresh remains **read production / write local** only.
- Ordinary local app development must not use writable production bindings.
- Preview deployment must not apply D1 migrations.
- A migration merged to `main` is not proof that it is applied to production D1.
- Preview Worker deployment is not production Worker deployment.
- Production release/migration operations remain separate explicit operator actions whose exact procedure is authoritative in `CLOUDFLARE.md`.
- Never add temporary workflows or broaden credentials simply to make mobile execution resemble a laptop environment.
