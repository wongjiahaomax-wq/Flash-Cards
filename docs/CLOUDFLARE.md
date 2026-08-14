# Cloudflare setup

The SvelteKit application deploys as a Cloudflare Worker with static assets and two
private runtime bindings:

- `DB`: Cloudflare D1, used by Drizzle and Better Auth;
- `MEDIA`: Cloudflare R2, used for immutable teaching images.

The bindings intentionally omit account-specific resource IDs. Wrangler 4
automatically creates persistent local simulations during development and provisions
the production D1 database and R2 bucket on the first authenticated deployment. It
then writes the provisioned names and IDs back to `wrangler.jsonc`; commit that update
so later deployments keep using the same resources.

## Local development

Install dependencies, create the local database schema, and create local-only auth
settings:

```sh
npm install
npm run db:migrate:local
cp .dev.vars.example .dev.vars
```

Replace `BETTER_AUTH_SECRET` in `.dev.vars` with a random value of at least 32
characters. Then use either development mode:

```sh
npm run dev      # Vite/SvelteKit development server
npm run preview  # production build in the local Workers runtime
```

Local D1 and R2 data is stored beneath `.wrangler/` and is ignored by Git. Neither
command connects to production resources unless a binding is explicitly configured
with `"remote": true`.

## Migrations

Generate a migration after changing `src/lib/server/db/schema.js`, then validate and
apply it locally:

```sh
npm run db:generate
npm run db:check
npm run db:migrate:local
```

Review and commit generated SQL in `drizzle/`. Applying a migration to production is
an explicit step:

```sh
npm run db:migrate:remote
```

## First deployment

Authenticate Wrangler and verify the build without changing Cloudflare resources:

```sh
npx wrangler login
npx wrangler whoami
npm run deploy:dry-run
```

Deploy the Worker:

```sh
npm run deploy
```

On the first deployment, Wrangler provisions D1 and R2 and updates `wrangler.jsonc`.
Apply committed migrations after provisioning:

```sh
npm run db:migrate:remote
```

Set production secrets interactively; secret values must not be added to
`wrangler.jsonc`:

```sh
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
```

`BETTER_AUTH_URL` should be the deployed HTTPS origin (for example, the Worker custom
domain) with no path component. Redeploy after changing secrets when needed.

## Routine checks

```sh
npm run cf-typegen
npm run check
npm test
npm run deploy:dry-run
```

Cloudflare dashboard builds can use `npm run deploy` as the deploy command. Keep
production migration application as a deliberate release step so schema changes are
reviewed before they affect persistent data.
