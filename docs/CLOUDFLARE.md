# Cloudflare setup and deployment

_Status: current repository operational runbook through PR #59. Production migration, Worker deployment, and live verification state must be established separately._

_Last updated: 22 August 2026._

The SvelteKit application deploys to Cloudflare Workers with private runtime bindings:

- `DB` — Cloudflare D1, used by the learning domain and Better Auth;
- `MEDIA` — Cloudflare R2, used for teaching images plus reviewed-import/Preview operational objects;
- `ASSETS` — generated SvelteKit static assets.

## 1. Release-state vocabulary

Do not use **merged**, **migrated**, and **deployed** as synonyms.

The project has three independent release facts:

```text
Merged to main
= the repository default branch contains the change

Production D1 migration applied
= the reviewed remote D1 migration command completed for the intended database

Production Worker deployed
= the intended repository commit/SHA was deployed to the production Worker
```

A fourth fact should be recorded separately:

```text
Production behavior verified
= the intended live route/data behavior was checked after release
```

Therefore:

- merging a PR does not apply D1 migrations;
- merging a PR does not deploy the Worker;
- a committed migration file does not prove production D1 has applied it;
- a deployment-trigger commit does not by itself prove the corresponding Actions run succeeded;
- a successful Worker deploy does not prove a migration was applied unless that migration step was also explicitly run and succeeded;
- a successful migration does not deploy application code.

When documenting current production state, record these facts separately and cite the relevant workflow/run/log or post-release verification where available.

## 2. Production and Preview resources

Production uses one Worker with private D1/R2 bindings. Better Auth is live and public sign-up remains disabled. Normal production Admin authorization uses the `admin` role.

Production-backed Preview uses a second Worker target with the `preview` Wrangler environment and `PREVIEW_MODE=true`.

Preview deliberately binds to the same existing production D1 and R2 resources. There is no second synchronized D1 database or R2 bucket in the current architecture.

This is application-level isolation, not hard resource isolation. See `PREVIEW_ADMIN_WORKSPACE.md`.

Production and Preview Workers use separate `BETTER_AUTH_SECRET` values. Never commit or print secret values.

The owner may use the same Better Auth identity for both environments with the combined role:

```text
admin,preview_admin
```

The separate Worker secrets keep production/Preview sessions cryptographically separate even when both environments read the same Better Auth identity/account rows.

See `PREVIEW_ADMIN_IDENTITY.md` for bootstrap/promotion behavior.

## 3. Local development and production-like local replica

Ordinary local development uses local Wrangler D1/R2 state. The preferred workflow for realistic UI/Admin iteration refreshes allowlisted production-owned teaching content and referenced media into those local bindings:

```sh
npm ci
npm run local:setup
npm run local:admin
npm run dev
```

The refresh safety boundary is:

```text
production D1: fixed SELECT queries only
production R2: object GET only
local D1: reset/import/mutations allowed
local R2: object PUT/mutations allowed
```

The normal local application does not use writable production bindings. Do not add writable remote production D1/R2 bindings to ordinary localhost runtime as a convenience shortcut.

Production auth identities/sessions, learner Reviews/progress, Preview workspace state and resumable import-job state are deliberately excluded from the normal replica.

Refresh current production-derived content/media with:

```sh
npm run local:refresh
```

or separately:

```sh
npm run local:refresh:d1
npm run local:refresh:r2
```

Local D1/R2 simulations plus replica staging live beneath `.wrangler/`; `.dev.vars` is also local-only. Never commit mirrored production content/media, local credentials or secrets.

Repeatable isolated auth validation remains:

```sh
node scripts/local-auth-smoke.mjs
```

See `LOCAL_DEVELOPMENT_REPLICA.md` for the complete internal runbook.

## 4. Current migration ledger

Current committed learning-domain migrations are:

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
0004_resumable_import_jobs.sql
0005_tag_foundation.sql
0006_preview_admin_workspace.sql
0007_image_collections.sql
0008_tag_shared_questions.sql
0009_reusable_image_questions.sql
0010_reusable_image_reactivation_guard.sql
0011_asset_supersession.sql
```

Previously verified production records establish that `0006`, `0007` and `0008` were applied as part of their corresponding released features.

`0009`, `0010` and `0011` are present on current `main`. **Repository presence is not production-application evidence.** Do not label these migrations production-applied unless the remote migration state or a successful release run has been explicitly checked.

After changing learning schema locally:

```sh
npm run db:generate
npm run db:check
npm run db:migrate:local
```

Always review generated SQL before committing it.

Production migration application is an explicit release operation.

## 5. Wrangler/runtime contract

`package.json` and `package-lock.json` pin one exact repository-local Wrangler version. That installed package is the Wrangler authority for local Preview, D1 commands, Preview deployment and production deployment.

Normal repository scripts/workflows must use the installed Wrangler (`wrangler ...` or `./node_modules/.bin/wrangler ...`). Do not silently download another release-critical Wrangler version with `npx wrangler@...`; doing so can make local, CI and deployment workerd runtimes disagree.

`wrangler.jsonc` `compatibility_date` is part of the same contract. Do not lower it merely to accommodate an outdated local runtime. When Wrangler or the compatibility date changes, run:

```sh
npm ci
npm run runtime:smoke
```

`runtime:smoke` starts a temporary binding-free local Worker under the repository-pinned Wrangler/workerd runtime and verifies readiness. It intentionally does not load the repository D1/R2 bindings or production credentials.

A path-filtered PR workflow also runs this smoke test when runtime/toolchain files change, avoiding the cost on unrelated UX/content PRs.

## 6. Normal production release path

The durable GitHub Actions release workflow is:

```text
.github/workflows/deploy-production.yml
```

It is manually dispatched and has an explicit boolean input:

```text
apply_migrations = false | true
```

This is the preferred production release path when GitHub Actions is available.

**Dispatch this workflow from `main`.** The workflow now fails closed unless `GITHUB_REF` is exactly `refs/heads/main`, so selecting another branch/ref is not a supported production release path.

Before dispatch, identify the intended current `main` SHA and decide whether the release is:

```text
code only
or
code + reviewed D1 migration(s)
```

With an authenticated GitHub CLI, the code-only form is:

```sh
gh workflow run deploy-production.yml \
  --repo wongjiahaomax-wq/Flash-Cards \
  --ref main \
  -f apply_migrations=false
```

Use `-f apply_migrations=true` only when the reviewed release deliberately includes pending production D1 migration application.

For a code-only release, leave migration application disabled.

For a release whose code requires reviewed pending migrations, enable migration application deliberately. The workflow then performs validation, applies remote migrations first, and deploys the Worker only after the migration step succeeds.

The workflow requires the deployment credential for Worker deploys and a separate D1 write credential only when migration application is enabled. Keep credentials least-privilege and never commit or print their values.

After the run, verify the workflow summary reports:

```text
Ref: refs/heads/main
Commit: <GITHUB_SHA>
```

and confirm that the reported commit exactly matches the `main` SHA intended for release. A green run against an unexpected SHA is not acceptable production-release evidence.

A successful run summary is evidence for the exact commit deployed and whether that run attempted migrations. Where migration state is operationally important, verify the remote migration result rather than relying only on prose in a PR or commit message.

### Local/terminal equivalent

When deliberately releasing from an authenticated terminal, first confirm the intended `main` SHA and run the standard validation:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD
npm ci
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

If the release includes reviewed pending migrations:

```sh
npm run db:migrate:remote
```

Then deploy:

```sh
npm run deploy
```

Both commands resolve to the repository-pinned Wrangler. Verify live behavior afterwards.

## 7. Legacy/exceptional one-shot production workflow

The repository also contains:

```text
.github/workflows/deploy-main-once.yml
```

This is **not triggered by an ordinary merge to `main`**. Its `push` trigger is path-filtered to the workflow file itself, so it runs only when that file changes on `main`.

Its current behavior is also materially different from the durable manual release workflow: when triggered, it applies production D1 migrations and then deploys the Worker without a separate `apply_migrations` choice.

Treat this as a historical/exceptional one-shot mechanism, not the normal release path.

Do not edit its trigger comment merely to deploy routine code when the permanent manual `Deploy production` workflow is available. Do not infer that later merged PRs were deployed merely because this file exists or because an older trigger commit exists.

If this workflow is ever intentionally used again, record the exact run result and treat migration/deployment/post-flight as separate verified facts.

## 8. Preview infrastructure and normal lifecycle

The Preview infrastructure baseline is already released. Normal ongoing Preview operation uses:

```text
.github/workflows/deploy-pr-to-preview.yml
.github/workflows/restore-main-to-preview.yml
```

The candidate deployment workflow:

- requires an open same-repository PR targeting `main`;
- resolves and deploys the exact PR head SHA;
- runs repository validation;
- deploys only to the Preview Worker;
- never applies remote D1 migrations;
- rejects candidate migration/schema changes and critical Wrangler binding changes.

Normal lifecycle:

```text
main on Preview
→ feature PR CI green
→ Deploy PR to Preview
→ inspect exact candidate SHA
→ Reset Preview Workspace when appropriate
→ Restore Main to Preview
```

Restoring Main changes Preview Worker code only. It does not roll back D1 schema or production data.

See `PREVIEW_DEPLOYMENT.md` for the exact operator playbook.

## 9. Schema-changing features and Preview

Production-backed Preview must fail closed when the candidate diff changes D1 schema/migrations or critical Wrangler binding configuration.

Do not weaken that guard merely to make a feature previewable.

Preferred sequence:

1. review and merge the schema foundation;
2. explicitly apply the reviewed migration to the intended production D1 when that release step is approved;
3. verify migration application;
4. update/rebase the behavior PR so migration/schema files are no longer candidate changes relative to `main`;
5. deploy the resulting code-only PR head to Preview;
6. inspect/reset/restore as normal;
7. later deploy production code through the normal production release path.

Step 1 and step 2 are separate. A merged migration file is not automatically applied.

## 10. Administrator bootstraps are explicit operator actions

Local administrator:

```sh
npm run local:admin
```

Production first-admin bootstrap:

```sh
npm run admin:bootstrap
```

Preview role/identity bootstrap:

```sh
npm run preview-admin:bootstrap
```

Never place administrator credentials or secrets in source, docs, screenshots, logs, or chat. Never substitute a production/Preview bootstrap for `local:admin` merely to make localhost authentication work.

## 11. R2 teaching images, Preview and staging

`MEDIA` remains private.

Normal teaching-image and Preview image uploads use the central media helper rather than arbitrary route-level writes.

Current application guardrails include:

- JPEG/PNG teaching uploads;
- 5 MiB per-image limit;
- 5 GiB application-managed R2 ceiling;
- Standard storage;
- immutable production object keys.

Preview uploads use the Preview-owned prefix. Reviewed import staging uses the separate `imports/staging/...` namespace.

Higher-resolution replacement creates a new immutable production object rather than overwriting the old object. On success, the old object is retained for historical Review snapshots; on D1 failure, only the newly uploaded replacement object is eligible for cleanup. Do not add blanket garbage collection that deletes superseded historical objects.

Preview cleanup may delete only verified Preview-owned media. Import staging cleanup follows the import-job contract. Neither path may delete normal production teaching objects ambiguously.

See `R2_COST_GUARDRAILS.md`, `CONTENT_IMPORT_PACKAGES.md`, `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md`, and `LOCAL_DEVELOPMENT_REPLICA.md`.

## 12. Production content inspection and fixed-purpose operators

Read-only production content inspection uses the repository's fixed `Production content snapshot` workflow and should prefer the dedicated D1-read credential.

The snapshot is evidence about the queried production **data**, not about which Worker commit is deployed and not about migration application beyond what those queried tables can directly demonstrate. Current Case-route output explicitly excludes Preview-owned Cases (`preview_session_id IS NULL`).

Production write operators such as the agreed-taxonomy workflow are fixed-purpose, reviewed operations. They are not generic SQL consoles and must not be generalized into free-form mutation paths. Their machine checks cover defined invariants; human inspection remains required where the operator deliberately preserves unrelated relationships.

Keep read and write credentials separate. Do not grant write access to the read token.

See `PRODUCTION_CONTENT_SNAPSHOT.md` and `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md`.

## 13. Release verification checklist

For every production release, record the applicable facts independently:

```text
[ ] intended main SHA identified
[ ] production workflow dispatched from main / ref guard passed
[ ] CI/release validation passed
[ ] required D1 migration(s) explicitly applied and verified, or confirmed not required
[ ] reported workflow GITHUB_SHA matches intended main SHA
[ ] intended Worker SHA deployed
[ ] live behavior/post-flight checked
[ ] any fixed-purpose data operator run separately verified
```

For documentation, prefer wording such as:

```text
merged on main
migration present on main
migration verified applied to production D1
Worker SHA verified deployed
live behavior verified
```

rather than the ambiguous single word `deployed` when several facts are involved.

## 14. Routine validation

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

When Wrangler/runtime-affecting files change, also run:

```sh
npm run runtime:smoke
```

Keep local-replica refresh, migrations, production deploys, Preview candidate deploy/restore, Cloudflare secret creation, content operators and administrator bootstrap/promotion as explicit operations with independently verified outcomes.