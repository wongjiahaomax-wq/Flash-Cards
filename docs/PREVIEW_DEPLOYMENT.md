# Preview deployment playbook

_Status: current permanent Preview deployment workflow._

_Last updated: 20 August 2026._

This repository has a permanent GitHub Actions workflow for deploying an open same-repository pull request to the production-backed Preview Worker:

```text
.github/workflows/deploy-pr-to-preview.yml
```

Use that workflow instead of creating temporary deployment workflows, CI jobs, deployment-only source commits, or ad-hoc Wrangler commands.

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

Use the permanent workflow manually from GitHub Actions, or use a terminal-enabled environment with authenticated `gh` access.

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
2. dispatch `.github/workflows/deploy-pr-to-preview.yml` from `main` when the available environment supports it;
3. watch/inspect the run to completion;
4. report the exact Preview-deployed PR head SHA and success/failure;
5. never run D1 migrations during Preview deployment;
6. never create temporary deployment workflows or deployment-only commits when the permanent workflow can be used;
7. keep Preview deployment status separate from merge and production deployment status.