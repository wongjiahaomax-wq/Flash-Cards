# Preview deployment playbook

This repository has a permanent GitHub Actions workflow for deploying an open same-repository pull request to the production-backed Preview Worker:

```text
.github/workflows/deploy-pr-to-preview.yml
```

Use that workflow instead of creating temporary deployment workflows, CI jobs, or deployment-only source commits.

## Preferred path when terminal + GitHub CLI are available

This is the default for Codex in a VS Code GitHub cloud workspace, Codespaces-like environments, or any agent session with terminal access and an authenticated `gh` CLI.

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

List the newest runs:

```sh
gh run list \
  --repo wongjiahaomax-wq/Flash-Cards \
  --workflow deploy-pr-to-preview.yml \
  --limit 5
```

Watch the selected run to completion:

```sh
gh run watch <RUN_ID> \
  --repo wongjiahaomax-wq/Flash-Cards
```

If needed, inspect logs for a failed run with the normal `gh run view` / `gh run view --log-failed` workflow.

## What the permanent workflow guarantees

The workflow resolves and deploys the exact immutable PR head SHA. It requires:

- an open pull request;
- the PR head to come from this repository, not a fork;
- the PR base to be `main`;
- no D1 migration/schema changes in the PR diff;
- no `wrangler.jsonc` change in the PR diff.

It then:

- checks out the exact PR head SHA;
- installs dependencies with `npm ci`;
- runs the standard database, test, Svelte, build, auth-smoke and diff-whitespace validation;
- verifies the Preview Worker target;
- deploys with Wrangler `--env preview`;
- reports the exact deployed SHA and Preview Worker URL.

It must never run a remote D1 migration as part of Preview deployment.

## Safety rule for schema/config changes

If the workflow refuses because the PR changes D1 schema/migrations or `wrangler.jsonc`, do not bypass the guard and do not create a temporary workflow to force the deployment.

Instead:

1. stop the Preview deployment;
2. review/land/apply the schema or Worker configuration separately using the appropriate production change process;
3. update/rebase the feature PR so the already-landed schema/config files are no longer in its diff;
4. rerun `deploy-pr-to-preview.yml` against the cleaned PR head.

## If `gh` is unavailable

Do not modify CI or add temporary workflow files merely to manufacture a deployment trigger.

Report that the current environment cannot dispatch the existing `workflow_dispatch` action and ask the operator to either:

- run the permanent workflow manually from GitHub Actions; or
- use a terminal-enabled environment with authenticated `gh` access.

Once `gh` is available, use the preferred path above.

## Normal Preview lifecycle

```text
main on Preview
→ get feature PR CI green
→ Deploy PR to Preview
→ verify exact deployed PR head
→ perform manual Preview review
→ Reset Preview Workspace when appropriate
→ Restore Main to Preview
→ continue/merge only after review
```

## Agent instruction

When the user says **deploy Preview**, **update Preview**, **refresh Preview**, or equivalent for an open PR:

1. resolve the target PR number;
2. if terminal + authenticated `gh` are available, dispatch `.github/workflows/deploy-pr-to-preview.yml` from `main` with that PR number;
3. watch the run to completion;
4. report the exact deployed PR head SHA and whether validation/deployment succeeded;
5. never run D1 migrations during Preview deployment;
6. never create temporary deployment workflows or deployment-only commits when the permanent workflow can be dispatched directly.
