# Flash-Cards agent handover

_Refreshed: 15 August 2026_

## Current outcome

The project is past the infrastructure/authentication blocker and now also has an approved learner-facing study prototype merged into `main`.

The repository contains a SvelteKit application for Cloudflare Workers with D1, R2, Better Auth, protected learner/admin routes, tested learning-selection logic, R2 storage guardrails, and a learner study UI prototype covering single-image and multi-image Cases.

Latest learner-product merge:

```text
PR #6 — Add Anki-derived learner study demo
Merge commit: 077b0364aba3557f706907a86059fcd59714b390
```

PR #6 CI passed after route/type fixes. The successful workflow covered dependency installation, database migration checks, all 18 tests, Svelte checks, production build, and the local D1 + Better Auth smoke test.

The production Worker remains live at:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

The learner prototype merged in PR #6 has not yet been deliberately deployed to production as part of this handover update.

## Learner UI baseline now approved

The merged `/study` prototype establishes the intended V1 learner interaction pattern:

1. learner chooses study content;
2. one Case is shown;
3. all Case images are displayed together;
4. all selected question parts remain visible together;
5. learner reveals all answers;
6. learner rates the whole Case `Again` or `Good`;
7. learner moves to the next Case.

The current demo includes reconstructed examples from the earlier Anki design review:

- three alternative Anterior STEMI ECG Cases;
- Pityriasis rosea as a multi-image Case;
- Lichen planus as a multi-site/multi-image Case.

The current learner demo still uses temporary in-code demo data and image placeholders. It does not yet read Cases/questions from D1, persist Reviews, or display R2-backed teaching images.

## Image provenance decision

`docs/IMAGE_PROVENANCE.md` now records the agreed V1 image-source behaviour:

- the learner-visible image is stored in R2;
- external source URLs are attribution/reference metadata only and must not be used as the runtime image source;
- attribution is optional;
- source information belongs to each Asset, not to the whole Case;
- different images in one multi-image Case may have different sources;
- an unknown original source is valid and must not require invented attribution;
- own/original teaching images may be labelled explicitly;
- unknown-source internal provenance notes should not be shown to learners by default.

The existing `assets` schema already contains `source_label`, `source_url`, and `licence`, so no new migration is required merely to support optional learner-facing attribution.

## Production verification completed

The following live checks have passed:

- `/sign-in` returns HTTP 200;
- an anonymous request to `/study` returns HTTP 303 to `/sign-in?redirect=%2Fstudy`;
- an anonymous request to `/admin` returns HTTP 303 to `/sign-in?redirect=%2Fadmin`;
- a normal `GET /api/auth/get-session` returns HTTP 200 with JSON `null` while signed out;
- `BETTER_AUTH_SECRET` is present in Cloudflare's encrypted Worker secret store;
- the first production administrator account has been bootstrapped with `npm run admin:bootstrap`.

Important test detail: `curl -I` sends a HEAD request. Better Auth's `get-session` route returned 404 under that HEAD check even though a normal GET was healthy. Use `curl -i`, not `curl -I`, when checking Better Auth GET API routes.

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
- approved learner study UI prototype merged from PR #6;
- temporary learner demo content in code for UI evaluation;
- local D1 + Better Auth end-to-end smoke test in `scripts/local-auth-smoke.mjs`;
- secure first-admin bootstrap utility in `scripts/bootstrap-admin.mjs`;
- Case-selection and reusable-question-resolution helpers with tests;
- R2 teaching-image guardrails and tests;
- image-provenance rules in `docs/IMAGE_PROVENANCE.md`;
- Cloudflare type-generation normalization needed by strict `checkJs`.

Merged PRs of note:

- PR #1 — R2 storage cost guardrails;
- PR #2 — Better Auth D1 schema;
- PR #3 — local D1 + Better Auth smoke validation;
- PR #4 — production administrator bootstrap command;
- PR #6 — approved learner study prototype and image-provenance documentation.

## Authentication status

The previous authentication database blocker is resolved.

Better Auth 1.6.25 is configured with direct Cloudflare D1 persistence and the Admin plugin. Public user sign-up remains disabled; learner accounts should be created by an administrator.

Remaining auth/product verification is to confirm the production administrator browser login and implement the smallest learner-account creation flow needed for role-boundary testing.

## D1 / Drizzle progress

The Version 1 learning-domain schema is implemented, including Concepts, Cases, Assets, reusable questions, Case-specific questions, Reviews, Review Questions, and Review Assets.

The next D1 work is now directly tied to replacing the temporary learner demo data:

- seed a tiny representative dataset matching the approved UI examples;
- add/finish runtime ID/timestamp support needed for writes;
- add server-side queries for Concept selection, Case selection, question resolution, and Case Assets;
- create Review/Review Question/Review Asset snapshots;
- persist reveal/completion state and `Again`/`Good` ratings.

The seed should exercise the educational model rather than merely populate tables. It should include alternative Anterior STEMI Cases, inherited and Case-specific questions, different answers to a shared `Describe this ECG` prompt, and at least one multi-image Case.

## Learning logic and UI progress

Implemented/tested backend behaviour includes:

- Case selection with immediate-repeat avoidance;
- reusable-question resolution;
- duplicate prompt precedence of Case > primary Concept > nearest inheritable ancestor > more distant ancestor;
- randomized question selection with a target of three and a maximum of four.

Implemented learner UI baseline includes:

- single-image and multi-image Case layouts;
- all questions visible together;
- reveal-all answers;
- whole-Case `Again` / `Good` controls;
- next-Case navigation;
- responsive presentation suitable for phone-based review.

The next learner milestone is not a redesign. It is to replace the temporary demo data underneath this approved interface with real D1-backed Review data.

## R2 progress and cost guardrails

The `MEDIA` R2 binding exists and `src/lib/server/storage/media.js` is the required teaching-image write path.

The helper enforces:

- maximum image size: 5 MiB;
- maximum application-managed bucket storage: 5 GiB;
- Standard R2 storage class;
- immutable teaching-image object keys.

Future upload code must call `putTeachingImage()` instead of `env.MEDIA.put()` directly.

The next R2 slice should add a minimal admin Asset workflow: upload an image to R2, create/update Asset metadata, optionally record source attribution, and securely serve the stored image to the learner UI.

## Parallel implementation plan

The next implementation phase is deliberately split between two parallel agents. See `docs/PARALLEL_WORK_PLAN.md` for exact branch/file ownership and integration rules.

High-level split:

### Agent A — D1 learner/review vertical slice

Owns:

- representative seed data;
- server-side D1 read/write queries;
- Review snapshot creation;
- persisted reveal and `Again`/`Good` completion;
- adapting the approved learner UI to real D1 data.

Should avoid R2 upload/admin Asset implementation except for consuming a stable Asset-read interface if available.

### Agent B — R2 Asset/admin vertical slice

Owns:

- minimal admin Asset upload/edit UI;
- R2 write via `putTeachingImage()`;
- Asset metadata including optional source attribution;
- secure image-serving route/helper;
- tests for upload validation and attribution behaviour.

Should avoid changing the learner review-selection algorithm or Review persistence.

Both agents must branch from current `main`, use separate branches/PRs, and avoid editing the same files unless explicitly coordinated.

## Recommended next sequence

1. Run Agent A and Agent B in parallel according to `docs/PARALLEL_WORK_PLAN.md`.
2. Merge the lower-conflict PR first if both are green; rebase/update the second PR against the new `main`.
3. Integrate R2-backed Asset rendering into the D1 learner flow if that is not already achieved by the two PRs through stable interfaces.
4. Verify production administrator browser login and add the minimum learner-account creation workflow.
5. Deploy the integrated learner vertical slice deliberately to production.
6. Run the V1 acceptance test with representative ECG + Dermatology content.
7. Only then expand the broader admin content-management interface or attempt bulk Anki import.

Do not start with FSRS, full analytics, a full admin dashboard, or a bulk Anki importer.

## Useful commands

```sh
# Confirm repo state before new branch work
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD

# Local verification
npm run db:migrate:local
npm run check
npm test
npm run build
node scripts/local-auth-smoke.mjs

# Cloudflare identity/resources
npx --yes wrangler@4.123.0 whoami
npx --yes wrangler@4.123.0 d1 list
npx --yes wrangler@4.123.0 r2 bucket list
npx --yes wrangler@4.123.0 secret list
```

## Known technical debt

`package.json` still pins Wrangler 4.115.0, while the project uses compatibility date `2026-08-14`. The local auth smoke test and production release were validated with Wrangler 4.123.0 because the older bundled runtime did not support that compatibility date. Update the Wrangler dependency/lockfile before relying on release scripts that use the pinned binary.

Dependency advisories should be reviewed deliberately; do not apply `npm audit fix --force` casually.
