# Cloudflare setup

The SvelteKit application deploys as a Cloudflare Worker with static assets and private runtime bindings:

- `DB`: Cloudflare D1, used by Drizzle and Better Auth;
- `MEDIA`: Cloudflare R2, used for teaching images;
- `ASSETS`: generated SvelteKit static assets.

Production resources are provisioned and recorded in `wrangler.jsonc`:

- D1 database: `flash-cards-db`;
- D1 database ID: `ea6f3ec4-eb09-4fb1-8314-cd027436a2f8`;
- R2 bucket: `flash-cards-media`;
- Worker: `flash-cards`.

The current Worker origin is:

```text
https://flash-cards.mmed-fm-flashcardstest.workers.dev
```

## Production authentication status

Better Auth is live in production. The reviewed Better Auth migration has been applied to production
D1, the auth-enabled Worker has been deployed, and the first production administrator has been
bootstrapped.

Verified live behaviour on 15 August 2026:

- `/sign-in` -> HTTP 200;
- anonymous `/study` -> HTTP 303 redirect to `/sign-in?redirect=%2Fstudy`;
- anonymous `/admin` -> HTTP 303 redirect to `/sign-in?redirect=%2Fadmin`;
- normal `GET /api/auth/get-session` -> HTTP 200 with JSON `null` while signed out.

The successful auth-enabled deployment reported Worker version:

```text
22c2e687-b1de-4d6d-833c-1057202bce7e
```

Public sign-up remains intentionally disabled. Better Auth is used as an application library; there
is no separate hosted Better Auth service account in this architecture.

## Local development

Install dependencies, apply the committed local migrations, and create local-only auth settings:

```sh
npm install
npm run db:migrate:local
cp .dev.vars.example .dev.vars
```

Replace `BETTER_AUTH_SECRET` in `.dev.vars` with a random value of at least 32 characters.
Keep local secrets in `.dev.vars`; the file is ignored by Git.

Then use either development mode:

```sh
npm run dev      # Vite/SvelteKit development server
npm run preview  # production build in the local Workers runtime
```

Local D1 and R2 simulations are stored beneath `.wrangler/` and are ignored by Git.
Do not intentionally point local development at production resources unless that behaviour has
been reviewed.

For the repeatable local authentication validation used by CI:

```sh
node scripts/local-auth-smoke.mjs
```

The smoke test uses disposable local D1 state, seeds a synthetic admin credential, verifies disabled
public sign-up, performs a real Better Auth sign-in, verifies the session, and checks authenticated
`/study` + `/admin` access.

## Migrations

Learning-domain migration:

```text
drizzle/0000_dashing_centennial.sql
```

Better Auth migration for the pinned Better Auth 1.6.25 schema:

```text
drizzle/0001_better_auth.sql
```

After changing `src/lib/server/db/schema.js`, generate and validate a learning-domain migration:

```sh
npm run db:generate
npm run db:check
npm run db:migrate:local
```

Review and commit generated SQL in `drizzle/`.

Production migration application is always an explicit release step. While the repository is still
pinned to Wrangler 4.115.0, prefer the validated Wrangler 4.123.0 command:

```sh
npx --yes wrangler@4.123.0 d1 migrations apply DB --remote
```

Do not apply a newly generated production migration without reviewing its SQL and testing it locally first.

## Production variables and secrets

`wrangler.jsonc` contains the non-secret production origin variable:

```text
BETTER_AUTH_URL=https://flash-cards.mmed-fm-flashcardstest.workers.dev
```

`BETTER_AUTH_SECRET` is stored as an encrypted Cloudflare Worker secret. Verify only its presence/name:

```sh
npx --yes wrangler@4.123.0 secret list
```

Expected secret name:

```text
BETTER_AUTH_SECRET
```

If it needs to be replaced, set it interactively:

```sh
npx --yes wrangler@4.123.0 secret put BETTER_AUTH_SECRET
```

Never place the secret value in source, `wrangler.jsonc`, documentation, screenshots, or logs.

## Wrangler version caveat

The project compatibility date is `2026-08-14`. `package.json` still pins Wrangler 4.115.0, whose
bundled local runtime only supported compatibility dates through `2026-07-29` during validation.
Wrangler 4.123.0 successfully ran the local auth smoke test and the production deployment.

Until the package dependency/lockfile is updated, use explicit Wrangler 4.123.0 for release-critical
operations. Do not assume `npm run deploy` is using the validated version.

## Production deployment procedure

First confirm that the local checkout is actually the intended `main` commit:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

This check matters. During the auth rollout an earlier deploy served the old public scaffold because
the intended current build had not reached production. The corrected release explicitly confirmed
the Git commit, rebuilt, and then deployed.

Run validation:

```sh
npm ci
npm run check
npm test
npm run build
```

If the release includes a reviewed migration, apply it **before** deploying code that requires the new schema:

```sh
npx --yes wrangler@4.123.0 d1 migrations apply DB --remote
```

Deploy the freshly built Worker:

```sh
npx --yes wrangler@4.123.0 deploy
```

Do not rely only on Wrangler's success message. Verify live behaviour after every production release.

## Live authentication checks

Use HEAD for SvelteKit page/redirect checks:

```sh
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/sign-in
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/study
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/admin
```

Expected while signed out:

- `/sign-in`: 200;
- `/study`: 303 to `/sign-in?redirect=%2Fstudy`;
- `/admin`: 303 to `/sign-in?redirect=%2Fadmin`.

For Better Auth GET API routes, use a normal GET rather than `curl -I`:

```sh
curl -i https://flash-cards.mmed-fm-flashcardstest.workers.dev/api/auth/get-session
```

Expected while signed out: HTTP 200 and body `null`.

`curl -I` sends HEAD, and the Better Auth route returned 404 under that HEAD request during rollout;
that did not indicate a broken GET endpoint.

## First administrator bootstrap

The repository includes a secure operator command:

```sh
npm run admin:bootstrap
```

It is intended for the first production administrator and normally should only succeed once. It:

- queries production D1 and refuses to continue if an admin already exists;
- prompts for administrator name/email;
- requires the exact confirmation word `CREATE`;
- reads the password without echoing it;
- hashes the password locally with Better Auth;
- writes the Better Auth `user` + credential `account` records to remote D1;
- removes its temporary SQL file after execution;
- verifies the resulting admin credential row.

Never paste the administrator password into chat, GitHub, source files, or shell commands.

## R2 teaching images

The production teaching-image bucket is bound as `MEDIA` and should remain private.
All future teaching-image writes must go through `putTeachingImage()` in
`src/lib/server/storage/media.js`.

Current application guardrails include:

- 5 MiB maximum per teaching image;
- 5 GiB maximum application-managed stored bytes;
- Standard R2 storage class only;
- immutable object keys.

There is not yet an administrator upload route. When it is added, do not call `env.MEDIA.put()`
directly. See `R2_COST_GUARDRAILS.md` for the full checklist and billing-warning guidance.

## Routine checks

```sh
npm run db:check
npm run check
npm test
npm run build
node scripts/local-auth-smoke.mjs
```

Keep production migration application, administrator bootstrap, and production deployment as deliberate,
reviewable operator actions.
