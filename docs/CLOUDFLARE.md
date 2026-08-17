# Cloudflare setup

The SvelteKit application deploys as Cloudflare Workers with private runtime bindings:

- `DB`: Cloudflare D1, used by Drizzle and Better Auth;
- `MEDIA`: Cloudflare R2, used for teaching images and reviewed import staging;
- `ASSETS`: generated SvelteKit static assets.

## Production resources

Production resources recorded in `wrangler.jsonc`:

- D1 database: `flash-cards-db`;
- D1 database ID: `ea6f3ec4-eb09-4fb1-8314-cd027436a2f8`;
- R2 bucket: `flash-cards-media`;
- Worker: `flash-cards`;
- origin: `https://flash-cards.mmed-fm-flashcardstest.workers.dev`.

Better Auth is live in production. Public sign-up remains disabled. The normal production administrator role is `admin`.

## Preview Worker

The Production-backed Preview Admin workspace adds a second **Worker target only**:

```text
flash-cards-preview
```

with origin:

```text
https://flash-cards-preview.mmed-fm-flashcardstest.workers.dev
```

The named Wrangler environment is:

```text
preview
```

and sets:

```text
PREVIEW_MODE=true
BETTER_AUTH_URL=https://flash-cards-preview.mmed-fm-flashcardstest.workers.dev
```

The Preview Worker deliberately binds to the **same existing** production resources:

```text
DB    -> flash-cards-db
MEDIA -> flash-cards-media
```

No second D1 database or R2 bucket is created. D1/R2 bindings and vars are repeated under `env.preview` because Wrangler environment bindings/vars are non-inheritable.

This is application-level isolation, not hard resource isolation. See `PREVIEW_ADMIN_WORKSPACE.md` for the ownership model and residual risk.

## Preview Better Auth secret

Production and Preview should use separate Better Auth session secrets.

Production secret name:

```text
BETTER_AUTH_SECRET
```

For the named Preview environment, set a separate value with Wrangler after the Preview infrastructure has been reviewed and released:

```sh
npx --yes wrangler@4.123.0 secret put BETTER_AUTH_SECRET --env preview
```

Do not commit the secret value. Do not configure it as part of PR review.

The separate Preview secret keeps Preview/production sessions cryptographically separate even though both Workers read the same Better Auth user/account tables from D1.

## Local development

Install dependencies, apply committed local migrations, and create local-only auth settings:

```sh
npm install
npm run db:migrate:local
cp .dev.vars.example .dev.vars
```

Replace `BETTER_AUTH_SECRET` in `.dev.vars` with a local random value of at least 32 characters. Keep `.dev.vars` out of Git.

Development modes:

```sh
npm run dev
npm run preview
```

Local D1/R2 simulations live beneath `.wrangler/` and are ignored by Git. Do not point ordinary local development at production resources.

Repeatable local authentication validation:

```sh
node scripts/local-auth-smoke.mjs
```

## Migrations

Current migrations:

```text
drizzle/0000_dashing_centennial.sql
drizzle/0001_better_auth.sql
drizzle/0002_optional_stimulus_groups.sql
drizzle/0003_multi_topic_study_routing.sql
drizzle/0004_resumable_import_jobs.sql
drizzle/0005_tag_foundation.sql
drizzle/0006_preview_admin_workspace.sql
```

`0006_preview_admin_workspace.sql` is introduced by the Preview Admin workspace PR. It adds Preview Session/ownership structures and safety triggers. It is not applied automatically by the Preview deployment workflow.

After changing the learning schema:

```sh
npm run db:generate
npm run db:check
npm run db:migrate:local
```

Review generated SQL before committing it.

Production migration application remains an explicit release step. With the currently validated release-critical Wrangler version:

```sh
npx --yes wrangler@4.123.0 d1 migrations apply DB --remote
```

Never apply an unreviewed PR migration merely to make a production-backed Preview deployment work.

## Wrangler version

`package.json` currently pins Wrangler 4.115.0, while release-critical commands in this repository have been validated with Wrangler 4.123.0. Use the explicit 4.123.0 command for release/deploy procedures until the package pin is intentionally updated.

## Production deployment procedure

Confirm the intended `main` commit:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

Run validation:

```sh
npm ci
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

If the release includes a reviewed migration, apply it before deploying code that requires the new schema:

```sh
npx --yes wrangler@4.123.0 d1 migrations apply DB --remote
```

Then deploy production:

```sh
npx --yes wrangler@4.123.0 deploy
```

Verify live behavior after deployment rather than relying only on the Wrangler success message.

## Preview infrastructure rollout

Do not perform these steps during review of the Preview workspace PR.

After the PR is reviewed and intentionally merged/released:

1. apply reviewed migration `0006` to production D1 through the normal migration process;
2. configure the Preview environment `BETTER_AUTH_SECRET`;
3. confirm GitHub has the existing `CLOUDFLARE_ACCOUNT_ID` and a least-privilege `CLOUDFLARE_API_TOKEN` able to deploy Workers;
4. deploy the Preview Worker once with:

```sh
npx --yes wrangler@4.123.0 deploy --env preview
```

5. verify the Preview URL loads the unmistakable Preview Mode interface;
6. bootstrap the dedicated Preview Admin with:

```sh
npm run preview-admin:bootstrap
```

The Preview Admin bootstrap writes the credential into the same D1 but assigns only the `preview_admin` role. It is intentionally separate from the production `admin` bootstrap.

## Manual PR -> Preview deployment

After the Preview infrastructure is released, use GitHub Actions workflow:

```text
Deploy PR to Preview
```

Input: PR number.

The workflow requires an open same-repository PR targeting `main`, resolves and checks out the exact head SHA, blocks schema/migration-changing PRs, runs validation, and deploys only with:

```sh
npx --yes wrangler@4.123.0 deploy --env preview
```

The workflow never runs remote D1 migrations and does not use `CLOUDFLARE_D1_WRITE_TOKEN`.

Cloudflare credentials are scoped to the final deploy step only, after the PR has passed repository validation.

## Schema-changing PRs

Production-backed Preview is intentionally disabled for PRs that change the D1 schema/migrations. The workflow detects changes under `drizzle/`, `drizzle.config.js`, `src/lib/server/db/schema.js`, and related schema modules and fails closed.

Review, merge and apply the migration separately first. Do not make the Preview workflow a path for applying unmerged schema to production.

## Live authentication checks

Signed-out production checks:

```sh
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/sign-in
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/study
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/admin
curl -i https://flash-cards.mmed-fm-flashcardstest.workers.dev/api/auth/get-session
```

Expected:

- `/sign-in`: HTTP 200;
- anonymous `/study`: redirect to sign-in;
- anonymous `/admin`: redirect to sign-in;
- Better Auth session GET while signed out: HTTP 200 with `null`.

Do not use HEAD behavior on the Better Auth API route as an indicator of GET health.

## Administrator bootstraps

Production first-admin bootstrap:

```sh
npm run admin:bootstrap
```

Dedicated Preview Admin bootstrap after Preview release:

```sh
npm run preview-admin:bootstrap
```

Both commands are interactive operator actions. Never place administrator credentials in source, documentation, screenshots, logs, or chat.

## R2 teaching images

The `MEDIA` bucket remains private. Normal teaching-image and Preview image uploads both use `putTeachingImage()` in `src/lib/server/storage/media.js`.

Current guardrails include:

- JPEG/PNG only;
- 5 MiB maximum per image;
- 5 GiB application-managed stored-byte ceiling;
- Standard storage class;
- immutable object keys.

Normal teaching images use production teaching-image keys. Preview uploads use:

```text
preview/<preview-session-id>/...
```

Preview cleanup only deletes verified Preview-owned keys. It must never delete a normal teaching-image key.

See `R2_COST_GUARDRAILS.md` for the full storage checklist.

## Routine validation

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

Keep migrations, production deployment, Preview initial deployment, Cloudflare secret creation, and both administrator bootstraps as deliberate operator actions.
