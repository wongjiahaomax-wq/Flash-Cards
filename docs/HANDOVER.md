# Flash-Cards agent handover

_Refreshed: 15 August 2026_

## Current outcome

The project has moved beyond the initial scaffold. The repository contains a SvelteKit application
for Cloudflare Workers with D1, R2, Better Auth integration code, protected learner/admin routes,
and tested learning-selection logic.

Latest application-code commit before this documentation refresh:

```text
c81631f Add R2 storage cost guardrails
```

GitHub Actions passed on that commit, including the learning/storage tests, Svelte checks, and
application build.

The last verified public technical scaffold was deployed at:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

Do not assume that live deployment contains the current auth-enabled repository source until the
Better Auth database migration has been applied and a new deployment has been verified.

## Cloudflare resources

| Purpose | Binding | Production resource |
|---|---|---|
| Relational database | `DB` | D1 `flash-cards-db` (`ea6f3ec4-eb09-4fb1-8314-cd027436a2f8`) |
| Teaching images | `MEDIA` | R2 `flash-cards-media` |
| SvelteKit static files | `ASSETS` | Workers static assets |

Account-wide Workers subdomain:

```text
mmed-fm-flashcardstest.workers.dev
```

Worker name:

```text
flash-cards
```

Production configuration includes:

- `BETTER_AUTH_URL=https://flash-cards.mmed-fm-flashcardstest.workers.dev` as a non-secret Worker variable;
- `BETTER_AUTH_SECRET` in Cloudflare's encrypted Worker secret store;
- Workers observability enabled;
- `workers.dev` enabled;
- per-version public preview URLs disabled.

Never commit or print the Better Auth secret.

## Repository state

The earlier Cloudflare/D1 setup work that was described as staged/uncommitted in the original
handover has now been committed to `main`.

The repository currently includes:

- SvelteKit + Cloudflare Workers configuration;
- production D1 and R2 bindings in `wrangler.jsonc`;
- Drizzle ORM and the learning-domain schema;
- the initial Drizzle migration under `drizzle/`;
- Better Auth server/client integration;
- `/sign-in`, protected `/study`, and admin-role-protected `/admin` routes;
- Case-selection and reusable-question-resolution helpers with tests;
- R2 teaching-image guardrails and tests;
- Cloudflare type-generation normalization needed by strict `checkJs`.

There are currently no open GitHub issues. The R2 guardrail work was merged through PR #1.

## Authentication: current blocker

This remains the most important deployment caveat.

The current committed Drizzle migration contains the **learning-domain tables only**. It does not
contain Better Auth's required user/account/session/verification tables.

Current application code already calls Better Auth from the server request lifecycle. Therefore,
do **not** deploy the auth-enabled current source as the private production application before the
Better Auth D1 migration is ready. A request that calls `getSession()` against a database without
the auth tables can fail.

Required sequence:

1. Generate the Better Auth schema/migration compatible with the pinned `better-auth@1.6.25`.
2. Review the generated database changes before applying them.
3. Apply all migrations to a fresh local D1 database.
4. Test `/`, `/sign-in`, `/study`, `/admin`, and the Better Auth API routes in the local Workers runtime.
5. Apply the reviewed auth migration to production.
6. Deploy the auth-enabled source and verify redirects/session handling/role boundaries.
7. Bootstrap the first application administrator account.

The project owner intends to create the first administrator account once the schema is ready.
This means an **application user stored and managed through Better Auth**. Better Auth is being used
as an application library here; this architecture does not depend on a separate hosted Better Auth
service account.

Public user sign-up must remain disabled. Learner accounts should ultimately be created by an
administrator.

## D1 / Drizzle progress

The Version 1 learning-domain schema is implemented, including Concepts, Cases, Assets, reusable
questions, Case-specific questions, Reviews, Review Questions, and Review Assets.

The remaining Milestone 2 work is primarily:

- seed a tiny representative STEMI dataset;
- add/finish runtime ID/timestamp support needed for writes;
- add server-side queries that read the seeded Cases/questions.

The seed should exercise the educational model rather than merely populate tables. It should include
alternative Anterior STEMI Cases, inherited and Case-specific questions, different answers to a
shared `Describe this ECG` prompt, and a multi-image Case.

## Learning logic progress

The backend logic is ahead of the UI.

Implemented/tested behaviour includes:

- Case selection with immediate-repeat avoidance;
- reusable-question resolution;
- duplicate prompt precedence of Case > primary Concept > nearest inheritable ancestor > more distant ancestor;
- randomized question selection with a target of three and a maximum of four.

The `/study` page is still a scaffold. The next learner work is to connect these helpers to D1 and
build the Concept selector + seeded Case review workflow.

## R2 progress and cost guardrails

The `MEDIA` R2 binding exists and `src/lib/server/storage/media.js` is now the required teaching-image
write path.

The helper enforces:

- maximum image size: 5 MiB;
- maximum application-managed bucket storage: 5 GiB;
- Standard R2 storage class;
- immutable teaching-image object keys.

The storage guardrails have automated tests. The actual administrator upload endpoint/UI does not
exist yet.

Future upload code must call `putTeachingImage()` instead of `env.MEDIA.put()` directly.
See `docs/R2_COST_GUARDRAILS.md` for the billing/operations checklist.

## Recommended next sequence

1. Finish the Better Auth D1 migration and local authentication verification.
2. Apply the reviewed auth migration remotely and deploy the private auth-enabled build.
3. Bootstrap the first administrator account and verify admin/learner boundaries.
4. Add the tiny STEMI seed dataset and server-side read queries.
5. Connect the seeded data to `/study` for the first end-to-end learner flow.
6. Add Review/Review Question/Review Asset snapshot writes plus answer reveal and `Again`/`Good` completion.
7. Only after the learner path works, expand the admin content-management interface.
8. Add the R2 upload/serving path when Case Assets are needed by that end-to-end flow.

Do not start with the full admin dashboard or Anki importer.

## Useful commands

```sh
# Confirm Cloudflare identity and resources
npx wrangler whoami
npx wrangler d1 list
npx wrangler r2 bucket list
npx wrangler secret list

# Local verification
npm run db:migrate:local
npm run cf-typegen
npm run check
npm test
npm run preview

# Production release, only after migration review
npm run db:migrate:remote
npm run deploy:dry-run
npm run deploy
```

## Type generation detail

`npm run cf-typegen` runs Wrangler and then `scripts/normalize-cloudflare-types.js`. Once SvelteKit
has been built, Wrangler may emit a type-only `GlobalProps.mainModule` import pointing at the
generated JavaScript Worker. With this repository's `allowJs + checkJs` settings, TypeScript can
follow that import and incorrectly check the compiled Svelte bundle as source. The normalization
script removes only that generated build-artifact import; runtime and binding declarations remain
Wrangler-generated.

## Other notes

- Dependency advisories should be reviewed deliberately; do not apply breaking force-upgrades casually.
- No custom production domain is configured yet.
- Detailed Cloudflare operator instructions are in `docs/CLOUDFLARE.md`.
- Product sequencing and milestone status are in `docs/IMPLEMENTATION_PLAN.md`.
