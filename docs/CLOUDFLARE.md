# Cloudflare setup

The SvelteKit application deploys as a Cloudflare Worker with static assets and two private runtime bindings:

- `DB`: Cloudflare D1, used by Drizzle and Better Auth;
- `MEDIA`: Cloudflare R2, used for teaching images;
- `ASSETS`: generated SvelteKit static assets.

Production resources are already provisioned and recorded in `wrangler.jsonc`:

- D1 database: `flash-cards-db`;
- R2 bucket: `flash-cards-media`;
- Worker: `flash-cards`.

The current Worker origin is:

```text
https://flash-cards.mmed-fm-flashcardstest.workers.dev
```

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

## Current authentication migration caveat

The application contains Better Auth integration code, but the currently committed Drizzle migration
contains the learning-domain tables only. Better Auth's user/account/session/verification tables must
be generated, reviewed, and applied before the current auth-enabled source is treated as production-ready.

Required release order:

1. generate/review the Better Auth D1 migration for the pinned Better Auth version;
2. apply all migrations to a fresh local D1 database;
3. test sign-in, session handling, `/study`, and `/admin` in the local Workers runtime;
4. apply the reviewed migration to production;
5. deploy the auth-enabled build;
6. bootstrap the first application administrator account;
7. verify learner/admin role boundaries.

Public sign-up is intentionally disabled.

Better Auth is used as an application library in this project. The administrator account is an
application user stored through Better Auth; there is no separate hosted Better Auth service account
required by this architecture.

## Migrations

After changing `src/lib/server/db/schema.js`, generate and validate a learning-domain migration:

```sh
npm run db:generate
npm run db:check
npm run db:migrate:local
```

Review and commit generated SQL in `drizzle/`.

Production migration application is always an explicit release step:

```sh
npm run db:migrate:remote
```

Do not apply a newly generated production migration without reviewing its SQL and testing it locally first.

## Production variables and secrets

`wrangler.jsonc` contains the non-secret production origin variable:

```text
BETTER_AUTH_URL=https://flash-cards.mmed-fm-flashcardstest.workers.dev
```

`BETTER_AUTH_SECRET` must remain an encrypted Cloudflare Worker secret. Verify its presence with:

```sh
npx wrangler secret list
```

If it needs to be replaced, set it interactively:

```sh
npx wrangler secret put BETTER_AUTH_SECRET
```

Never place the secret value in source, `wrangler.jsonc`, documentation, screenshots, or logs.

## Deployment

Confirm Cloudflare identity and run local validation first:

```sh
npx wrangler whoami
npm run cf-typegen
npm run check
npm test
npm run deploy:dry-run
```

For an auth-enabled release, apply the reviewed database migration before deploying code that expects
those tables:

```sh
npm run db:migrate:remote
npm run deploy
```

After deployment, verify the live behaviour rather than assuming a successful build means the auth
flow is correct.

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
npm run cf-typegen
npm run check
npm test
npm run build
npm run deploy:dry-run
```

Keep production migration application and production deployment as deliberate, reviewable release steps.
