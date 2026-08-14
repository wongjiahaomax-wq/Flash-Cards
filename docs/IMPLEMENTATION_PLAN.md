# Flash-Cards — V1 Implementation Plan

_Last updated: 14 August 2026_

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

Goal: a SvelteKit app runs locally and is deployable to Cloudflare Workers.

Tasks:

- initialise SvelteKit in the repository;
- configure the Cloudflare adapter/runtime;
- configure Wrangler;
- add base environment-variable handling;
- add a simple public landing/sign-in route;
- add placeholder `/study` and `/admin` routes;
- add formatting/linting/test scripts;
- confirm `npm run dev` and production build succeed.

Definition of done:

- repository contains runnable application code;
- local development starts without infrastructure credentials for basic pages;
- production build passes.

---

## Milestone 2 — D1 + Drizzle schema

Goal: the domain model exists as executable migrations.

Tasks:

- add Drizzle and Drizzle Kit;
- define domain schema from `V1_DATA_MODEL.md`;
- configure a local D1 database;
- generate and commit migrations;
- add database access helper;
- add ID/timestamp helpers;
- add a seed script with a tiny STEMI dataset.

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

Goal: private learner/admin access works.

Tasks:

- add Better Auth;
- configure D1 persistence;
- enable email/password authentication;
- add Better Auth Admin plugin;
- disable public sign-up;
- bootstrap first admin account;
- protect learner routes;
- protect admin routes by role;
- add sign-in/sign-out UI.

Definition of done:

- unauthenticated users cannot access `/study` or `/admin`;
- learner can access `/study` but not `/admin`;
- admin can access both;
- admin can create a learner account.

---

## Milestone 4 — Core learner study flow

Goal: prove the educational model before building a large admin interface.

Tasks:

- Concept/topic selection page;
- descendant Concept lookup;
- Case selection with immediate-repeat avoidance;
- reusable-question resolution;
- precedence/deduplication rules;
- random 2–4-question selection (target 3);
- Review + Review Question snapshot creation;
- Review Asset snapshot creation;
- Case study page;
- answer reveal;
- `Again`/`Good` completion;
- next-Case action.

Definition of done:

A learner can repeatedly study seeded content and the system correctly varies compatible questions while keeping Case-specific answers attached to the correct Case.

This is the most important V1 milestone.

---

## Milestone 5 — R2 image storage

Goal: Cases display real uploaded teaching images.

Tasks:

- create R2 binding/service wrapper;
- implement admin upload endpoint;
- validate permitted image MIME types and reasonable file size;
- generate immutable object keys;
- create Asset records;
- render images securely in learner/admin UI;
- support multiple ordered Case Assets.

Definition of done:

- admin can upload at least JPEG/PNG images;
- multi-image Case displays assets together in configured order;
- review snapshots retain the exact object keys shown.

---

## Milestone 6 — Minimal content administration

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

Goal: a usable private demo is live.

Tasks:

- create production D1 database;
- create production R2 bucket;
- configure Worker bindings/secrets;
- apply production migrations;
- bootstrap production admin;
- deploy application;
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

The next implementation action is **Milestone 1: scaffold the SvelteKit/Cloudflare Workers application in this repository**.

Do not start with the admin dashboard or importer. The first engineering objective is a runnable skeleton, followed immediately by the D1 schema and a seeded learner study flow.
