# Cloudflare setup and deployment

_Status: current production + production-backed Preview + local-replica operational runbook._

_Last updated: 19 August 2026_

The SvelteKit application deploys to Cloudflare Workers with private runtime bindings:

- `DB` — Cloudflare D1, used by the learning domain and Better Auth;
- `MEDIA` — Cloudflare R2, used for teaching images plus reviewed-import/Preview operational objects;
- `ASSETS` — generated SvelteKit static assets.

## 1. Production resources

Production resources recorded by the repository configuration include:

```text
D1 database: flash-cards-db
D1 database ID: ea6f3ec4-eb09-4fb1-8314-cd027436a2f8
R2 bucket: flash-cards-media
Worker: flash-cards
origin: https://flash-cards.mmed-fm-flashcardstest.workers.dev
```

Better Auth is live in production. Public sign-up remains disabled.

Normal production Admin authorization uses the `admin` role.

## 2. Preview Worker

Production-backed Preview Admin uses a second **Worker target only**:

```text
Worker: flash-cards-preview
origin: https://flash-cards-preview.mmed-fm-flashcardstest.workers.dev
Wrangler environment: preview
```

with:

```text
PREVIEW_MODE=true
BETTER_AUTH_URL=https://flash-cards-preview.mmed-fm-flashcardstest.workers.dev
```

The Preview Worker deliberately binds to the same existing production resources:

```text
DB    -> flash-cards-db
MEDIA -> flash-cards-media
```

No second D1 database or R2 bucket is part of the current architecture.

D1/R2 bindings and relevant vars are repeated under `env.preview` because Wrangler environment bindings/vars are non-inheritable.

This is application-level isolation, not hard resource isolation. See `PREVIEW_ADMIN_WORKSPACE.md`.

## 3. Production and Preview Better Auth secrets

Production and Preview Workers use separate `BETTER_AUTH_SECRET` values.

Configure the Preview environment secret with:

```sh
npx --yes wrangler@4.123.0 secret put BETTER_AUTH_SECRET --env preview
```

Never commit or print secret values.

The owner may use the same Better Auth identity for both environments with the combined role:

```text
admin,preview_admin
```

The separate Worker secrets keep production/Preview sessions cryptographically separate even when they read the same Better Auth identity/account rows from D1.

See `PREVIEW_ADMIN_IDENTITY.md` for bootstrap/promotion behavior.

## 4. Local development and production-like local replica

Ordinary local development uses local Wrangler D1/R2 state. The preferred workflow for realistic UI/Admin iteration refreshes production-owned teaching content and referenced media into those local bindings:

```sh
npm ci
npm run local:setup
npm run local:admin
npm run dev
```

`npm run local:setup` creates `.dev.vars` with a random local Better Auth secret if needed, applies current migrations locally, then performs a one-way production → local refresh.

The refresh safety boundary is:

```text
production D1: fixed SELECT queries only
production R2: object GET only
local D1: reset/import/mutations allowed
local R2: object PUT/mutations allowed
```

The normal local application does not use writable production bindings. Do not add remote production D1/R2 bindings to ordinary localhost runtime as a convenience shortcut.

Production rows deliberately excluded from the normal local replica include:

```text
Better Auth users/accounts/sessions/verifications
learner Reviews/question/asset snapshots and progress
Preview sessions/workspace ownership state
resumable import-job state
```

A local-only administrator is created with:

```sh
npm run local:admin
```

The local Admin account is independent from production/Preview identities. Public signup remains disabled.

Refresh current production-derived content/media later with:

```sh
npm run local:refresh
```

or separately:

```sh
npm run local:refresh:d1
npm run local:refresh:r2
```

The refresh command requires Cloudflare authorization sufficient to read the production D1 content queries and R2 objects. If authorization is missing, fix the read credential/login boundary; do not weaken the local-vs-production separation or fall back to writable remote runtime bindings.

Local D1/R2 simulations plus replica staging live beneath `.wrangler/` and are ignored by Git. `.dev.vars` is also ignored. Never commit local replica SQL, mirrored media, or secrets.

Repeatable isolated auth validation remains:

```sh
node scripts/local-auth-smoke.mjs
```

The smoke test has its own disposable local persistence and does not create the normal local administrator.

See `LOCAL_DEVELOPMENT_REPLICA.md` for the complete internal runbook.

## 5. Current migrations and production state

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
```

Current production state recorded in `HANDOVER.md` / `IMPLEMENTATION_PLAN.md`:

- `0006_preview_admin_workspace.sql` — applied to production D1;
- `0007_image_collections.sql` — landed/applied as the Image Management V2 schema foundation;
- `0008_tag_shared_questions.sql` — applied to production D1 before PR #43 behavior rollout;
- PR #43 behavior/Admin code — merged and deployed without another migration.

Do not create/apply a new migration merely to reproduce the PR #43 rollout sequence.

After changing learning schema locally:

```sh
npm run db:generate
npm run db:check
npm run db:migrate:local
```

Always review generated SQL before committing it.

Production migration application remains an explicit release operation.

## 6. Wrangler versions

`package.json` currently pins:

```text
wrangler 4.115.0
```

Release-critical repository procedures have been validated with explicit:

```text
wrangler 4.123.0
```

Use the repository's deliberately selected release command/version for production migration/deploy procedures until the pin/release process is intentionally updated.

Do not assume `npx wrangler` resolving a newer external version is harmless for a release-critical action.

## 7. Production deployment procedure

Confirm intended `main`:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

Install/validate:

```sh
npm ci
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

If the release includes a reviewed migration, apply it **before** deploying code that requires it:

```sh
npx --yes wrangler@4.123.0 d1 migrations apply DB --remote
```

Then deploy production:

```sh
npx --yes wrangler@4.123.0 deploy
```

Verify live behavior after deployment. A successful Wrangler command is not by itself proof that all intended runtime behavior/data migrations were verified.

Migration state and Worker deployment state are separate facts.

### 7.1 One-click production deployment from GitHub

For a repeatable deployment without local Wrangler authentication, use the manual **Deploy production** workflow:

```text
GitHub → Actions → Deploy production → Run workflow
```

The workflow runs the repository checks, build, and local auth smoke test before deploying the Worker. Leave **Apply pending production D1 migrations** disabled for code-only releases. Enable it only when the reviewed release includes a migration that has been intentionally approved for production.

The workflow requires the repository secret `CLOUDFLARE_API_TOKEN`. It requires `CLOUDFLARE_D1_WRITE_TOKEN` only when migrations are selected. Both tokens must be scoped to the Cloudflare account that owns `flash-cards-db`; never commit either value to the repository.

## 8. Preview infrastructure is already released

The initial Preview infrastructure rollout is complete. The current baseline includes:

- Preview Worker;
- migration `0006` ownership/session structures;
- separate Preview Better Auth secret/session boundary;
- Preview Admin identity support;
- manual Deploy PR to Preview workflow;
- Reset Preview Workspace;
- Restore Main to Preview workflow;
- production/Preview route/data isolation tests.

Do not rerun initial infrastructure-bootstrap instructions as though Preview were not yet deployed.

Use the current operator workflows/runbooks for normal ongoing Preview operation.

## 9. Preview Admin bootstrap / identity promotion

Current command:

```sh
npm run preview-admin:bootstrap
```

For an existing valid production Admin identity, the bootstrap can promote/reuse that identity by adding the `preview_admin` role rather than creating a duplicate account.

The intended owner role is:

```text
admin,preview_admin
```

The bootstrap preserves production Admin authorization while independently enabling Preview access.

Follow `PREVIEW_ADMIN_IDENTITY.md`; never copy credentials into repository source, documentation, screenshots, Actions logs, or chat.

## 10. Manual PR → Preview deployment

Permanent workflow:

```text
.github/workflows/deploy-pr-to-preview.yml
```

Use this workflow instead of temporary deployment workflows or deployment-only source commits.

It requires an open same-repository PR targeting `main`, resolves the exact head SHA, runs repository validation, and deploys only with:

```sh
npx --yes wrangler@4.123.0 deploy --env preview
```

It never applies remote D1 migrations and does not use the D1 write token.

See `PREVIEW_DEPLOYMENT.md` for the exact dispatch/operator procedure.

## 11. Schema-changing PRs and Preview

Production-backed Preview deliberately fails closed for candidate changes that alter the D1 schema/migrations or critical Wrangler binding configuration.

Do not weaken that guard to make a schema-changing PR previewable against production D1.

Preferred sequence when a feature needs schema then code UI inspection:

1. review/land the schema foundation through the protected process;
2. apply the reviewed migration to the intended D1 environment explicitly;
3. update/rebase the behavior PR so migration/schema files are no longer candidate changes relative to `main`;
4. deploy the resulting code-only head to Preview;
5. inspect/reset/restore as normal.

Image Management V2 used this safety pattern around `0007_image_collections.sql`.

## 12. Restore Main to Preview

After reviewing a candidate PR, use the permanent Restore Main workflow so the Preview Worker returns to current `main`.

Normal lifecycle:

```text
main on Preview
→ Deploy PR to Preview
→ inspect candidate
→ Reset Preview Workspace
→ Restore Main to Preview
→ next candidate
```

Do not leave arbitrary candidate code deployed indefinitely.

## 13. Live authentication checks

Useful signed-out production checks:

```sh
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/sign-in
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/study
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/admin
curl -i https://flash-cards.mmed-fm-flashcardstest.workers.dev/api/auth/get-session
```

Expected shape:

- `/sign-in` loads;
- anonymous `/study` redirects to sign-in;
- anonymous `/admin` redirects to sign-in;
- signed-out Better Auth session GET returns no active session.

Do not use unsupported/irrelevant HTTP method behavior on the Better Auth API route as the sole health indicator.

## 14. Administrator bootstraps are explicit operator actions

Local development administrator:

```sh
npm run local:admin
```

This writes only to local D1 and is safe to use with the production-like local replica.

Production first-admin bootstrap:

```sh
npm run admin:bootstrap
```

Preview role/identity bootstrap:

```sh
npm run preview-admin:bootstrap
```

Never place administrator credentials or secrets in source, docs, screenshots, logs, or chat. Never substitute a production/Preview bootstrap for `local:admin` merely to make localhost authentication work.

## 15. R2 teaching images, local replica and staging

`MEDIA` remains private.

Normal teaching-image and Preview image uploads use the central media helper (`putTeachingImage()`), not arbitrary route-level direct writes.

Current application guardrails include:

- JPEG/PNG teaching uploads;
- 5 MiB per-image limit;
- 5 GiB application-managed R2 ceiling;
- Standard storage;
- immutable production object keys.

Preview uploads use:

```text
preview/<preview-session-id>/...
```

Reviewed import staging uses:

```text
imports/staging/...
```

The local production-like replica selects production R2 objects from mirrored `assets.storage_key` rows, retrieves those objects from production with read-only GET operations, and puts the same bytes/keys into local Wrangler R2. It does not clone unrelated Preview/import staging objects merely because they exist in the bucket.

Preview cleanup may delete only verified Preview-owned media. Import staging cleanup follows the import-job contract. Neither path may delete normal production teaching objects ambiguously.

See `R2_COST_GUARDRAILS.md`, `CONTENT_IMPORT_PACKAGES.md`, and `LOCAL_DEVELOPMENT_REPLICA.md`.

## 16. Production D1 snapshot/operator and local-replica credentials

Read-only production content inspection prefers repository secret:

```text
CLOUDFLARE_D1_READ_TOKEN
```

The fixed-purpose agreed-taxonomy operator uses separate least-privilege write credential:

```text
CLOUDFLARE_D1_WRITE_TOKEN
```

Do not grant write access to the read token or turn the read-only snapshot workflow into free-form SQL.

The local replica refresh likewise needs production **read** authorization for its fixed D1 SELECT queries and R2 object GETs. This may come from a suitably authorized local Wrangler login/session or another explicitly configured local read credential. Keep refresh/operator credentials out of source control, and do not place them in `.dev.vars` unless they are actual Worker runtime variables (the normal replica does not require that).

Never make a missing local read credential a reason to expose production write bindings to localhost.

See `PRODUCTION_CONTENT_SNAPSHOT.md`, `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md`, and `LOCAL_DEVELOPMENT_REPLICA.md`.

## 17. Routine validation

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

Keep local-replica refresh, migrations, production deploys, Preview candidate deploy/restore, Cloudflare secret creation, content operators, and administrator bootstrap/promotion as explicit operations with independently verified outcomes. The local-replica command is read-production/write-local only; production mutation remains outside that developer workflow.
