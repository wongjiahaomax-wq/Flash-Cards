# Flash-Cards agent handover

_Refreshed: 15 August 2026_

## Current outcome

The project now has a working end-to-end V1 vertical slice rather than only infrastructure and prototypes.

Merged implementation milestones of note:

```text
PR #7 — D1-backed learner Reviews
PR #8 — protected R2 teaching-image pipeline
PR #9 — browser-based admin Case/Asset/question management
```

PR #9 merged into `main` at:

```text
f48f1a5fe7dee3be2230343befb4a484c98d7a32
```

Post-merge CI run #67 completed successfully on that merge commit.

The production Worker remains:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

The PR #9 branch head was deployed for browser testing before merge. The merged commit contains the same application code. A deliberate post-merge redeploy can still be done later if release provenance needs to point specifically at `main`.

## Product state now working

The administrator can perform the following in the browser without direct SQL for routine content entry:

1. sign in as an administrator;
2. create a topic/Concept;
3. create a Case with an internal title and optional Case stem/vignette;
4. edit the Case vignette;
5. upload a JPEG/PNG teaching image to private R2;
6. paste, drag/drop, or choose an image in the upload control;
7. attach an existing Asset to a Case without re-uploading it;
8. order multiple Case Assets and add Case-specific captions;
9. add/edit/remove/reorder Case questions;
10. optionally save a question as reusable for the Case's primary Concept;
11. preview the resulting Case through the learner Study flow.

A real production Case with an ECG, clinical stem, and questions was entered through this workflow and previewed successfully in Study.

## Learner flow

`/study` is now D1-backed rather than temporary in-code demo data.

Current learner behaviour:

- learner selects a study Concept/topic;
- an eligible active Case is selected;
- immediate-repeat avoidance uses persisted Review history where possible;
- Case vignette is snapshotted into the Review;
- ordered Case Assets are snapshotted;
- compatible questions are resolved with precedence:
  `Case-specific > primary Concept > nearest inheritable ancestor > more distant ancestor`;
- a randomized target set is selected, currently targeting three and capping at four;
- all selected questions remain visible together;
- learner reveals all answers;
- learner rates the whole Case `Again` or `Good`;
- completion/reveal timestamps and Review snapshots persist in D1.

Internal diagnosis-bearing Case titles are masked from the learner UI.

## Educational/content model decisions

The main learner-facing unit is a **Case**, not a fixed flashcard front/back.

Important modelling rules:

- **Case stem/vignette is Case-level context.** It is separate from image Assets and separate from question prompts.
- **Assets are reusable stimuli.** One uploaded ECG/image should be stored once in R2 and may be attached to multiple Cases.
- **Multiple Assets that must be interpreted together belong to one Case.**
- **Alternative examples of the same condition remain separate Cases.**
- **Case-specific questions/answers override reusable Concept questions for the same prompt.**
- **Reusable Question Prompts are separate from their answers/context.**
- Later question parts may give clues to earlier questions; no pre/post-diagnosis gating is required for the target exam.

Concrete precedent: an ECG showing prolonged QTc may be reused in both a neutral ECG-recognition Case and a post-operative hypocalcaemia Case. The ECG Asset is stored once; the two Cases have different stems/question sets and may be associated with different Concepts.

See `docs/CONTENT_MODEL_EXAMPLES.md`.

## Authentication status

Better Auth 1.6.25 is configured with direct Cloudflare D1 persistence and the Admin plugin.

Completed:

- public sign-up disabled;
- `/study` requires authentication;
- `/admin` requires administrator role;
- local auth smoke test exists in `scripts/local-auth-smoke.mjs`;
- production auth schema deployed;
- first production administrator bootstrapped;
- administrator browser sign-in verified;
- authenticated `/admin` access verified.

Remaining auth/product work:

- add the smallest administrator learner-account creation/management workflow;
- create a test learner;
- verify learner access to `/study` and denial from `/admin`.

Do not store administrator credentials in the repository or documentation.

## D1 / Drizzle state

The V1 learning-domain schema is implemented and actively used.

Core objects include:

- Concepts and Concept hierarchy;
- Cases with `vignette_md`;
- Case/Concept links;
- Assets and Case Assets;
- reusable Question Prompts;
- Concept Questions;
- Case Questions;
- Reviews;
- Review Questions;
- Review Assets.

Review creation snapshots the Case title/vignette, selected questions, and ordered Assets so the review remains tied to what the learner actually saw.

The repository still contains `scripts/seed-content.mjs` for representative local/testing content. Do **not** run the current seed blindly against production: it includes placeholder Asset metadata with seed R2 keys whose image bytes do not exist in production. Routine production content should now be entered through `/admin`.

## R2 state and provenance

Private R2 is the canonical teaching-image store.

Implemented:

- `MEDIA` R2 binding;
- maximum image size 5 MiB;
- 5 GiB application-managed storage ceiling;
- Standard storage class;
- immutable object keys;
- upload through `putTeachingImage()`;
- orphan cleanup attempt if D1 Asset metadata creation fails;
- authenticated `/api/assets/{assetId}/image` serving;
- MIME/ETag/private-cache handling;
- optional `source_label`, `source_url`, and `licence` metadata;
- clipboard paste, drag/drop, and normal file-picker upload UI.

External source URLs are attribution/reference metadata only and are never the runtime image source.

An Asset may be attached to more than one Case without copying or re-uploading the R2 object.

## Cloudflare resources

| Purpose | Binding | Production resource |
|---|---|---|
| Relational database | `DB` | D1 `flash-cards-db` (`ea6f3ec4-eb09-4fb1-8314-cd027436a2f8`) |
| Teaching images | `MEDIA` | R2 `flash-cards-media` |
| Static files | `ASSETS` | Workers static assets |

Worker name:

```text
flash-cards
```

Workers subdomain:

```text
mmed-fm-flashcardstest.workers.dev
```

Production configuration includes `BETTER_AUTH_URL`, an encrypted `BETTER_AUTH_SECRET`, D1/R2 bindings, Workers observability, and `workers.dev` routing.

Never print or commit `BETTER_AUTH_SECRET`.

## Repository state

Current repository features include:

- SvelteKit + Cloudflare Workers;
- Drizzle ORM for the learning-domain schema;
- direct D1 Better Auth tables/migrations;
- protected sign-in/study/admin routes;
- D1-backed learner Review flow;
- private R2 image upload and serving;
- browser content administration for topics, Cases, stems, Assets, captions, and questions;
- reusable Concept questions plus Case-specific questions;
- whole-Case `Again`/`Good` ratings;
- local auth smoke tests and focused learning/storage/admin tests;
- R2 cost guardrails and image-provenance documentation.

Merged PRs of note:

- PR #1 — R2 storage cost guardrails;
- PR #2 — Better Auth D1 schema;
- PR #3 — local D1 + Better Auth validation;
- PR #4 — production admin bootstrap;
- PR #5 — production auth documentation refresh;
- PR #6 — approved learner study UI prototype;
- PR #7 — D1-backed learner Reviews;
- PR #8 — protected R2 teaching-image pipeline;
- PR #9 — browser-based admin Case/Asset/question management.

## Recommended next sequence

1. **Learner account administration** — create/manage learner accounts without operator scripts.
2. **Role-boundary acceptance test** — verify a normal learner can study but cannot administer content.
3. **Basic progress administration** — learner list, recent Reviews, Concept filters, Again/Good summaries.
4. **Pilot content entry** — enter a representative set from ECG, ENT, Eye, and Dermatology through the real admin UI.
5. **Stress-test modelling** — explicitly test reused Assets across multiple Cases, multi-image Cases, reused prompts with different Case answers, and Cases that may need secondary Concepts.
6. Improve admin ergonomics based on actual content-entry friction.
7. Only after that revisit FSRS/scheduling, bulk Anki import, richer analytics, structured marks/marking points, or broader stimulus types.

## Known technical debt

`package.json` still pins Wrangler 4.115.0, while the project compatibility date has been validated with Wrangler 4.123.0. Update the Wrangler dependency/lockfile deliberately before relying on the pinned release scripts.

Dependency advisories should be reviewed deliberately; do not run `npm audit fix --force` casually.

Potential product/data refinements to evaluate with pilot content:

- explicit admin support for secondary Concept links;
- whether question marks/weighting should become structured metadata rather than text such as `(2)` or `(4)` in prompts;
- whether historical Reviews should continue serving an Asset after that live Asset is deactivated;
- whether attribution metadata should be snapshotted into Reviews;
- better Case/question search and filtering as the library grows.

## Useful commands

```sh
# Validation
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs

# Cloudflare
npx --yes wrangler@4.123.0 whoami
npx --yes wrangler@4.123.0 d1 list
npx --yes wrangler@4.123.0 r2 bucket list
npx --yes wrangler@4.123.0 secret list
```
