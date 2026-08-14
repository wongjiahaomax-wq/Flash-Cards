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

Goal: the domain model exists as executable migrations.

Completed:

- Drizzle ORM and Drizzle Kit added;
- Version 1 learning-domain schema implemented;
- D1 configured locally and in production;
- initial learning-domain migration generated and committed;
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

Status: **in progress — current blocker**

Goal: private learner/admin access works.

Completed in application code:

- Better Auth added and pinned;
- D1 persistence configured in the auth factory;
- email/password authentication enabled;
- Better Auth Admin plugin added;
- public sign-up disabled;
- `/study` protected for authenticated users;
- `/admin` protected by admin role;
- sign-in/sign-out UI added.

Remaining:

- generate and review Better Auth's D1 tables/migration;
- apply the auth migration to a fresh local D1 database;
- test the complete auth flow in the local Workers runtime;
- apply the reviewed migration to production;
- deploy the auth-enabled source;
- bootstrap the first application administrator account;
- verify learner/admin role boundaries end-to-end;
- verify an admin can create learner accounts.

The first administrator account will be created by the project owner after the Better Auth schema is
ready. This is an application user managed by Better Auth; no separate hosted Better Auth service
account is required for this architecture.

Definition of done:

- unauthenticated users cannot access `/study` or `/admin`;
- learner can access `/study` but not `/admin`;
- admin can access both;
- admin can create a learner account.

---

## Milestone 4 — Core learner study flow

Status: **partially implemented at the logic layer**

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

This is the most important V1 product milestone.

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

Status: **infrastructure partially complete; private V1 deployment not complete**

Goal: a usable private demo is live.

Already completed:

- production D1 database created and bound;
- production R2 bucket created and bound;
- Worker bindings/secrets configured;
- public technical scaffold deployed;
- R2 cost guardrails added.

Remaining:

- apply Better Auth migration to production;
- deploy and verify private auth-enabled application;
- bootstrap production admin;
- create test learner accounts;
- enter/seed acceptance content;
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

The next implementation action is to **finish Milestone 3's database integration before deploying the auth-enabled source**:

1. generate and review the Better Auth D1 schema/migration for the pinned Better Auth version;
2. apply all migrations to a fresh local D1 database;
3. test `/`, `/sign-in`, `/study`, `/admin`, and Better Auth API routes locally;
4. apply the reviewed auth migration to production and deploy;
5. bootstrap the first administrator account;
6. resume Milestone 2 with the tiny STEMI seed dataset;
7. connect that dataset to the Milestone 4 learner study flow.

Do not start with the full admin dashboard or Anki importer. The first product objective remains a thin, working learner path using representative seeded content.
