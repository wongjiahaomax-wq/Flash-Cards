# Flash-Cards — V1 Implementation Plan

_Last updated: 15 August 2026_

This is the execution order for `V1_SPEC.md` and `V1_DATA_MODEL.md`.

The principle is to get one thin end-to-end learner path working early, then add administration around it.

## Milestone 0 — Freeze the V1 contract

Status: **complete**

Deliverables:

- `CURRENT_DESIGN.md` — broader design rationale and open future questions;
- `V1_SPEC.md` — frozen V1 behaviour/scope;
- `V1_DATA_MODEL.md` — V1 relational model and selection rules;
- this implementation plan.

Do not add deferred features unless they are required to make the V1 acceptance test work.

---

## Milestone 1 — Scaffold the application

Status: **complete**

Goal: a SvelteKit app runs locally and is deployable to Cloudflare Workers.

Completed:

- SvelteKit application scaffold;
- Cloudflare adapter/runtime;
- Wrangler configuration;
- environment-variable handling;
- public landing and sign-in routes;
- placeholder `/study` and `/admin` routes;
- automated test/check/build scripts;
- working Cloudflare Workers deployment scaffold.

Definition of done:

- repository contains runnable application code;
- local development starts without production infrastructure credentials;
- production build passes.

---

## Milestone 2 — D1 + Drizzle schema

Status: **partially complete**

Goal: the learning-domain model exists as executable migrations and representative seed data.

Completed:

- Drizzle ORM and Drizzle Kit added;
- Version 1 learning-domain schema implemented;
- D1 configured locally and in production;
- learning-domain migration generated and committed;
- Better Auth D1 migration committed separately;
- database access helper added;
- core Case/question selection helpers implemented and tested.

Remaining:

- add ID/timestamp helpers where needed by runtime writes;
- add a seed script with a tiny STEMI dataset;
- add server-side read queries that exercise the seeded data.

Seed content should include:

- `STEMI` parent Concept;
- `Anterior STEMI` child Concept;
- two alternative Anterior STEMI Cases;
- at least one multi-image Case somewhere in the seed data;
- one inherited STEMI question;
- one Anterior-STEMI-specific question;
- `Describe this ECG` attached to both Cases with different answers;
- one Case-only question.

Definition of done:

- migrations apply cleanly to a fresh local D1 database;
- seed script produces a valid V1 dataset;
- simple server-side queries can read the seeded Cases/questions.

---

## Milestone 3 — Authentication and permissions

Status: **substantially complete — production auth live; learner-management verification remains**

Goal: private learner/admin access works.

Completed:

- Better Auth 1.6.25 added and pinned;
- D1 persistence configured in the auth factory;
- Better Auth user/account/session/verification migration committed as `drizzle/0001_better_auth.sql`;
- email/password authentication enabled;
- Better Auth Admin plugin added;
- public sign-up disabled;
- `/study` protected for authenticated users;
- `/admin` protected by admin role;
- sign-in/sign-out UI added;
- local D1 + Better Auth smoke test implemented and passing;
- local smoke test covers disabled sign-up, real credential sign-in, session cookie creation, session lookup, and admin access;
- reviewed auth migration applied to production D1;
- auth-enabled Worker deployed to production;
- production `/sign-in`, anonymous `/study`, anonymous `/admin`, and `GET /api/auth/get-session` verified;
- secure `npm run admin:bootstrap` command added and tested;
- first production administrator account bootstrapped.

Remaining:

- verify the bootstrapped administrator signs in through the browser and reaches `/admin`;
- implement or expose an administrator flow for creating learner accounts;
- create a test learner account;
- verify learner can access `/study` but is redirected away from `/admin`.

Definition of done:

- unauthenticated users cannot access `/study` or `/admin`;
- learner can access `/study` but not `/admin`;
- admin can access both;
- admin can create a learner account.

Public user sign-up must remain disabled. Better Auth is an embedded application library; no separate
hosted Better Auth account is required.

---

## Milestone 4 — Core learner study flow

Status: **partially implemented at the logic layer — next primary product milestone**

Goal: prove the educational model before building a large admin interface.

Already implemented/tested:

- Case-selection helper with immediate-repeat avoidance;
- reusable-question resolution;
- Case > primary Concept > nearest ancestor precedence/deduplication;
- randomized review-question selection, capped at four.

Remaining:

- Concept/topic selection page;
- descendant Concept database lookup;
- connect selection helpers to D1 queries;
- Review + Review Question snapshot creation;
- Review Asset snapshot creation;
- Case study page;
- answer reveal;
- `Again`/`Good` completion;
- next-Case action.

Definition of done:

A learner can repeatedly study seeded content and the system correctly varies compatible questions while keeping Case-specific answers attached to the correct Case.

This is the most important remaining V1 product milestone.

---

## Milestone 5 — R2 image storage

Status: **partially complete — infrastructure/guardrails ready**

Goal: Cases display real uploaded teaching images.

Completed:

- production R2 `MEDIA` binding;
- server-side R2 storage helper;
- 5 MiB per-image application limit;
- 5 GiB managed-storage ceiling;
- Standard storage-class enforcement;
- immutable object-key enforcement;
- automated tests for storage guardrails;
- R2 cost/operations guidance in `R2_COST_GUARDRAILS.md`.

Remaining:

- implement admin upload endpoint;
- validate permitted image MIME types at the route boundary;
- generate immutable object keys;
- create Asset records;
- render images securely in learner/admin UI;
- support multiple ordered Case Assets;
- add caching/serving behaviour appropriate for private learner access.

All teaching-image writes must go through `putTeachingImage()` rather than calling `MEDIA.put()` directly.

Definition of done:

- admin can upload at least JPEG/PNG images;
- multi-image Case displays assets together in configured order;
- review snapshots retain the exact object keys shown.

---

## Milestone 6 — Minimal content administration

Status: **not started beyond protected admin scaffold**

Goal: the administrator no longer needs seed scripts for routine content entry.

Implement in this order:

1. Concepts
2. Question Prompts + Concept Questions
3. Cases + Concept links
4. Case Questions
5. Case Assets/order

Tasks:

- list/create/edit/deactivate forms;
- validation for required relationships;
- Concept parent cycle prevention;
- exactly-one-primary-Concept enforcement for learner-ready Cases;
- duplicate-link prevention;
- simple search/filtering where lists become cumbersome.

Definition of done:

An admin can recreate the acceptance-test content from the web interface without editing database rows manually.

---

## Milestone 7 — Users and basic progress

Status: **not started**

Goal: administrators can see whether learners are using the system and where they struggle.

Tasks:

- learner list;
- recent-review list;
- filter by learner;
- filter by Concept;
- counts of `Again` and `Good`;
- highlight repeated `Again` ratings for a Case.

Definition of done:

Admin can inspect the V1 review data requested in the product goal without a separate analytics platform.

---

## Milestone 8 — Deployment and acceptance test

Status: **private authentication deployment complete; V1 acceptance demo incomplete**

Goal: a usable private demo is live.

Completed:

- production D1 database created and bound;
- production R2 bucket created and bound;
- Worker bindings/secrets configured;
- Better Auth migration applied to production D1;
- auth-enabled Worker deployed over HTTPS;
- `/sign-in` verified live;
- anonymous `/study` and `/admin` verified to redirect to sign-in;
- Better Auth session endpoint verified with a normal GET;
- first production administrator account bootstrapped;
- R2 cost guardrails added.

Remaining:

- verify authenticated administrator access in-browser;
- create and verify a test learner account;
- enter/seed acceptance content;
- connect learner study flow to production data;
- verify image persistence/serving when R2 upload is added;
- execute V1 acceptance test from `V1_SPEC.md`;
- record bugs as GitHub issues.

Definition of done:

- application is accessible over HTTPS;
- admin and learner role boundaries work;
- content and images persist;
- repeated study attempts produce valid combinations and review records;
- acceptance-test defects are either fixed or explicitly documented.

---

## Milestone 9 — Pilot content and feedback

Status: **not started**

Goal: validate the model with real teaching material before adding scheduling complexity.

Tasks:

- enter a small representative sample from ECG, ENT, Eye, and Dermatology;
- deliberately include alternative examples and multi-image Cases;
- test reused prompts with Case-specific answers;
- collect learner/admin friction points;
- identify any real content pattern the V1 data model cannot represent cleanly.

Only after this milestone should we revisit:

- FSRS/scheduling;
- Anki importer;
- richer analytics;
- structured answers/marking points;
- question difficulty/weighting;
- broader non-image stimulus types.

---

## Immediate next task

The infrastructure blocker is resolved. The next implementation action is to build the **tiny STEMI
vertical slice**:

1. verify the bootstrapped production administrator can sign in and reach `/admin`;
2. add the representative STEMI seed dataset described in Milestone 2;
3. add server-side D1 queries for Concepts, Cases, assets, and resolved compatible questions;
4. connect those queries to `/study` using the existing selection engine;
5. snapshot Review, Review Question, and Review Asset records;
6. implement reveal + `Again`/`Good` + next Case;
7. add the smallest administrator learner-account creation flow needed to test role boundaries;
8. add the minimum R2 upload/serving path once the seeded learner flow needs real images.

Do not start with the full admin dashboard or Anki importer. The first product objective remains a thin,
working learner path using representative seeded content.

## Known technical debt

`package.json` still pins Wrangler 4.115.0, while the project uses compatibility date `2026-08-14`.
The local auth smoke test and production release were validated with Wrangler 4.123.0 because the older
bundled runtime did not support that compatibility date. Update the Wrangler dependency/lockfile before
relying on `npm run deploy` or other scripts that use the pinned binary.
