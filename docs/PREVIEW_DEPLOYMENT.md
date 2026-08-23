# Preview deployment playbook

_Status: current permanent Preview deployment workflow._

_Last updated: 23 August 2026._

This repository has a permanent GitHub Actions workflow for deploying an open same-repository pull request to the production-backed Preview Worker:

```text
.github/workflows/deploy-pr-to-preview.yml
```

Use that workflow instead of creating temporary deployment workflows, CI jobs, deployment-only source commits, or ad-hoc Wrangler commands.

For the broader capability-based execution policy, including GitHub Actions minute conservation, see:

```text
docs/DEVELOPMENT_EXECUTION_WORKFLOW.md
```

## Execution environment policy

The permanent Preview workflow is a **remote integration/deployment gate**, not the normal inner development loop.

When a usable local checkout and command-execution environment are available:

```text
local Vite iteration
→ local production-style `npm run preview`
→ local validation
→ PR / normal CI
→ Deploy PR to Preview only at a meaningful checkpoint
```

`npm run preview` is local and does not consume GitHub Actions minutes. `Deploy PR to Preview` runs on GitHub Actions and does consume remote workflow runtime.

When local execution is unavailable but useful GitHub access exists:

- use the available GitHub integration for supported repository/PR/CI inspection and mutations;
- rely on configured GitHub CI for executable validation that cannot run locally, while reporting it as CI evidence rather than local execution;
- if the active GitHub integration exposes authorized workflow dispatch, it may invoke the existing permanent Preview workflow;
- if workflow dispatch is not exposed, use the GitHub Actions web/mobile UI or another authorized terminal environment;
- never add a temporary workflow, empty deployment commit, source-code trigger, or guard bypass solely because the current integration cannot dispatch the workflow.

User device or location does not determine which of these paths is available. Follow the capability-based mode selection in `DEVELOPMENT_EXECUTION_WORKFLOW.md`; explicit user execution constraints still override automatic selection.

## 1. What Preview deployment means

Preview deployment changes **Preview Worker code**. It does not mean:

- the PR is merged;
- production Worker code changed;
- production D1 migrations were applied;
- production data was mutated;
- `main` is deployed to production.

The workflow must never run a remote D1 migration.

Because Preview binds to production-backed D1/R2, schema compatibility is a prerequisite rather than something the Preview deploy workflow is allowed to fix.

## 2. Preferred path when terminal + GitHub CLI are available

First confirm GitHub CLI authentication:

```sh
gh auth status
```

Then dispatch the permanent Preview workflow from `main`:

```sh
gh workflow run deploy-pr-to-preview.yml \
  --repo wongjiahaomax-wq/Flash-Cards \
  --ref main \
  -f pr_number=<PR_NUMBER>
```

List recent runs:

```sh
gh run list \
  --repo wongjiahaomax-wq/Flash-Cards \
  --workflow deploy-pr-to-preview.yml \
  --limit 5
```

Watch the selected run:

```sh
gh run watch <RUN_ID> \
  --repo wongjiahaomax-wq/Flash-Cards
```

If needed, inspect failed logs with normal `gh run view` commands.

## 3. What the permanent workflow guarantees

The workflow resolves and deploys the exact immutable PR head SHA. It requires:

- an open pull request;
- the PR head to come from this repository, not a fork;
- the PR base to be `main`;
- no D1 migration/schema changes in the candidate diff;
- no `wrangler.jsonc` change in the candidate diff.

It then:

- checks out the exact PR head SHA;
- installs dependencies with `npm ci`;
- runs the standard database, test, Svelte, build, auth-smoke and diff-whitespace validation;
- verifies the Preview Worker target;
- deploys with Wrangler `--env preview`;
- reports the exact deployed SHA and Preview Worker URL.

A successful run is evidence that the reported candidate SHA reached the Preview Worker. It is not evidence that production Worker code changed.

## 4. Safety rule for schema/config changes

If the workflow refuses because the PR changes D1 schema/migrations or `wrangler.jsonc`, do not bypass the guard and do not create a temporary workflow to force deployment.

Use this sequence instead:

1. stop the Preview deployment;
2. review and merge the schema foundation through the normal repository process;
3. explicitly apply the reviewed migration to the intended production D1 only when that release operation is approved;
4. verify migration application separately;
5. update/rebase the behavior PR so the already-landed migration/schema files are no longer candidate changes relative to `main`;
6. rerun `deploy-pr-to-preview.yml` against the cleaned code-only PR head.

Important:

```text
migration merged to main ≠ migration applied to production D1
```

Do not proceed to a behavior Preview that requires new schema until the shared production-backed D1 is known to have that schema.

## 5. If `gh` is unavailable

Do not modify CI or add temporary workflow files merely to manufacture a deployment trigger.

Use one of these supported paths:

1. if the active GitHub integration exposes workflow dispatch, invoke the existing permanent workflow there;
2. otherwise use the permanent workflow manually from the GitHub Actions mobile/web UI;
3. or use another terminal-enabled environment with authenticated `gh` access.

Missing workflow-dispatch capability is not a reason to create a new trigger or deployment-only commit.

## 6. Normal Preview lifecycle

```text
main on Preview
→ feature PR CI green
→ Deploy PR to Preview
→ verify exact deployed PR head SHA
→ perform manual Preview review
→ Reset Preview Workspace when appropriate
→ Restore Main to Preview
```

The reset step concerns disposable Preview-owned data. The restore step deploys current `main` code back to the Preview Worker.

Neither Reset nor Restore is a production D1 migration rollback mechanism.

## 7. Restore Main semantics

Permanent restore workflow:

```text
.github/workflows/restore-main-to-preview.yml
```

Use it after candidate inspection so Preview does not remain on arbitrary PR code.

Restoring Main means:

```text
Preview Worker code → current main
```

It does **not** mean:

```text
production D1 schema → previous schema
production data → previous data
production Worker → current main
```

If a schema foundation was already deliberately applied to production D1, restoring Preview code does not undo it.

## 8. Exact-state reporting

After a Preview operation, report at least:

```text
PR number
PR head SHA
Preview workflow result
exact SHA reported deployed
manual review result if performed
whether Preview was restored to main afterwards
```

Do not summarize this as simply `deployed` without naming the environment.

## 9. Agent instruction

When the user says **deploy Preview**, **update Preview**, **refresh Preview**, or equivalent for an open PR:

1. resolve the target PR number;
2. use `.github/workflows/deploy-pr-to-preview.yml` from `main` when the available environment exposes an authorized dispatch path;
3. watch/inspect the run to completion when the available tooling supports it;
4. report the exact Preview-deployed PR head SHA and success/failure;
5. never run D1 migrations during Preview deployment;
6. never create temporary deployment workflows or deployment-only commits when the permanent workflow can be used;
7. keep Preview deployment status separate from merge and production deployment status;
8. if the current GitHub integration cannot dispatch `workflow_dispatch`, say so explicitly and use the GitHub Actions UI/another authorized environment rather than inventing a workaround.
