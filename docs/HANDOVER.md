# Flash-Cards agent handover

_Refreshed: 15 August 2026_

## Current outcome

The project is past the infrastructure/authentication blocker. The repository contains a SvelteKit
application for Cloudflare Workers with D1, R2, Better Auth, protected learner/admin routes, tested
learning-selection logic, and a secure one-time production administrator bootstrap command.

Latest `main` commit before this documentation refresh:

```text
3a8836c Merge PR #4: Add production admin bootstrap command
```

PR #4 CI passed after a type-check fix. The successful workflow covered database migration checks,
all unit tests, Svelte checks, a production build, and the local D1 + Better Auth smoke test.

The production Worker is live at:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

The auth-enabled application was deployed successfully on 15 August 2026. The release that was
verified from the operator terminal reported Cloudflare Worker version:

```text
22c2e687-b1de-4d6d-833c-1057202bce7e
```

PR #4 only added the local bootstrap utility/tests/package command, so that repository merge did not
require another Worker deployment before the administrator bootstrap was run.

## Production verification completed

The following live checks have passed:

- `/sign-in` returns HTTP 200;
- an anonymous request to `/study` returns HTTP 303 to `/sign-in?redirect=%2Fstudy`;
- an anonymous request to `/admin` returns HTTP 303 to `/sign-in?redirect=%2Fadmin`;
- a normal `GET /api/auth/get-session` returns HTTP 200 with JSON `null` while signed out;
- `BETTER_AUTH_SECRET` is present in Cloudflare's encrypted Worker secret store;
- the first production administrator account has been bootstrapped with `npm run admin:bootstrap`.

Important test detail: `curl -I` sends a HEAD request. Better Auth's `get-session` route returned 404
under that HEAD check even though a normal GET was healthy. Use `curl -i`, not `curl -I`, when checking
Better Auth GET API routes.

Still to verify at the product level:

- sign in through the browser with the bootstrapped administrator account;
- confirm that authenticated administrator reaches `/admin`;
- create a learner account through an administrator workflow;
- verify learner access to `/study` and denial/redirect from `/admin`.

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

The repository currently includes:

- SvelteKit + Cloudflare Workers configuration;
- production D1 and R2 bindings in `wrangler.jsonc`;
- Drizzle ORM and the learning-domain schema;
- learning-domain migration `drizzle/0000_dashing_centennial.sql`;
- Better Auth migration `drizzle/0001_better_auth.sql`;
- Better Auth server/client integration;
- `/sign-in`, protected `/study`, and admin-role-protected `/admin` routes;
- local D1 + Better Auth end-to-end smoke test in `scripts/local-auth-smoke.mjs`;
- secure first-admin bootstrap utility in `scripts/bootstrap-admin.mjs`;
- Case-selection and reusable-question-resolution helpers with tests;
- R2 teaching-image guardrails and tests;
- Cloudflare type-generation normalization needed by strict `checkJs`.

Merged infrastructure/auth PRs:

- PR #1 — R2 storage cost guardrails;
- PR #2 — Better Auth D1 schema;
- PR #3 — local D1 + Better Auth smoke validation;
- PR #4 — production administrator bootstrap command.

## Authentication status

The previous authentication database blocker is resolved.

Better Auth 1.6.25 is configured with direct Cloudflare D1 persistence and the Admin plugin. The
committed auth migration creates the `user`, `session`, `account`, and `verification` tables plus the
Admin plugin fields/indexes expected by the pinned version.

The local smoke test performs a full disposable auth exercise:

1. applies migrations to local D1;
2. seeds a synthetic admin credential with Better Auth's password hashing;
3. starts the local built Worker;
4. verifies sign-in page and anonymous route protection;
5. confirms public sign-up is disabled;
6. signs in through the real Better Auth API;
7. verifies the session cookie/session endpoint;
8. verifies authenticated access to `/study` and `/admin`.

Production then followed the reviewed release order: remote migration first, current Worker build
second, live route verification third, administrator bootstrap fourth.

Public user sign-up must remain disabled. Learner accounts should be created by an administrator.

The first-admin command intentionally:

- refuses to run if an administrator already exists;
- prompts locally for name/email and requires the exact confirmation word `CREATE`;
- hides the password during entry;
- hashes the password locally with Better Auth;
- writes only the resulting credential hash to D1;
- stores temporary SQL only under ignored `.wrangler/` and deletes it afterward;
- verifies the created credential/admin role after the write.

## Deployment lesson from the auth rollout

An earlier production check still showed the old public scaffold even after a deploy command. The
cause was resolved by explicitly confirming the local checkout was current before rebuilding/deploying.
For future releases, verify the commit before a production deployment:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

Then build and deploy from that confirmed checkout. Do not assume a successful Wrangler command means
the intended Git commit was published; verify the live routes afterward.

## Wrangler version caveat

`package.json` still pins Wrangler 4.115.0. The project compatibility date is `2026-08-14`, but the
local workerd bundled with Wrangler 4.115.0 only supported compatibility dates through `2026-07-29`
during validation. The smoke test and successful production deployment used Wrangler 4.123.0.

Until the package dependency and lockfile are deliberately updated, use explicit Wrangler 4.123.0
for release-critical commands rather than relying on the pinned `wrangler` executable.

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

The `MEDIA` R2 binding exists and `src/lib/server/storage/media.js` is the required teaching-image
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

1. Verify the production administrator can sign in through the browser and access `/admin`.
2. Add the tiny representative STEMI seed dataset and server-side read queries.
3. Connect seeded data to `/study` for the first end-to-end learner flow.
4. Add Review/Review Question/Review Asset snapshot writes plus answer reveal and `Again`/`Good` completion.
5. Add the minimum administrator learner-account creation flow and verify learner/admin boundaries.
6. Add the R2 upload/serving path when Case Assets are needed by that end-to-end flow.
7. Only after the learner path works, expand the admin content-management interface.

Do not start with the full admin dashboard or Anki importer.

## Useful commands

```sh
# Confirm repo state before production work
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD

# Confirm Cloudflare identity/resources
npx --yes wrangler@4.123.0 whoami
npx --yes wrangler@4.123.0 d1 list
npx --yes wrangler@4.123.0 r2 bucket list
npx --yes wrangler@4.123.0 secret list

# Local verification
npm run db:migrate:local
npm run check
npm test
npm run build
node scripts/local-auth-smoke.mjs

# Production migration/release while Wrangler remains pinned to 4.115.0
npx --yes wrangler@4.123.0 d1 migrations apply DB --remote
npm run build
npx --yes wrangler@4.123.0 deploy

# First admin bootstrap (normally only once)
npm run admin:bootstrap

# Live auth checks
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/sign-in
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/study
curl -I https://flash-cards.mmed-fm-flashcardstest.workers.dev/admin
curl -i https://flash-cards.mmed-fm-flashcardstest.workers.dev/api/auth/get-session
```

## Type generation detail

`npm run cf-typegen` runs Wrangler and then `scripts/normalize-cloudflare-types.js`. Once SvelteKit
has been built, Wrangler may emit a type-only `GlobalProps.mainModule` import pointing at the
generated JavaScript Worker. With this repository's `allowJs + checkJs` settings, TypeScript can
follow that import and incorrectly check the compiled Svelte bundle as source. The normalization
script removes only that generated build-artifact import; runtime and binding declarations remain
Wrangler-generated.

## Other notes

- Dependency advisories should be reviewed deliberately; do not apply `npm audit fix --force` casually.
- No custom production domain is configured yet.
- Detailed Cloudflare operator instructions are in `docs/CLOUDFLARE.md`.
- Product sequencing and milestone status are in `docs/IMPLEMENTATION_PLAN.md`.
