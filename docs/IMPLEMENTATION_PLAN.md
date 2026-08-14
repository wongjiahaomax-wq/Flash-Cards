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
- `IMAGE_PROVENANCE.md` — V1 image storage/attribution rules;
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
- protected `/study` and `/admin` routes;
- automated test/check/build scripts;
- working Cloudflare Workers deployment scaffold.

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
- add a representative seed dataset;
- add server-side read/write queries that exercise the seeded data.

The seed should include:

- `STEMI` parent Concept;
- `Anterior STEMI` child Concept;
- multiple alternative Anterior STEMI Cases;
- at least one multi-image Dermatology Case;
- one inherited STEMI question;
- one Anterior-STEMI-specific question;
- `Describe this ECG` attached to more than one Case with different answers;
- one Case-only question.

---

## Milestone 3 — Authentication and permissions

Status: **substantially complete — production auth live; learner-management verification remains**

Completed:

- Better Auth 1.6.25 added and pinned;
- D1 persistence configured;
- Better Auth Admin plugin added;
- public sign-up disabled;
- `/study` protected for authenticated users;
- `/admin` protected by admin role;
- sign-in/sign-out UI added;
- local auth smoke test implemented and passing;
- auth-enabled Worker deployed to production;
- first production administrator account bootstrapped.

Remaining:

- verify administrator browser sign-in and `/admin` access;
- implement the smallest administrator learner-account creation flow;
- create a test learner account;
- verify learner can access `/study` but not `/admin`.

---

## Milestone 4 — Core learner study flow

Status: **learner UI prototype complete; D1 persistence/integration next**

Goal: prove the educational model with a real D1-backed learner workflow.

Completed:

- Case-selection helper with immediate-repeat avoidance;
- reusable-question resolution;
- Case > primary Concept > nearest ancestor precedence/deduplication;
- randomized review-question selection, capped at four;
- learner study selector prototype;
- single-image and multi-image Case presentation;
- all questions visible together;
- reveal-all answers interaction;
- whole-Case `Again`/`Good` interaction;
- next-Case navigation;
- PR #6 merged after full CI validation.

Remaining:

- Concept/topic selection backed by D1;
- descendant Concept database lookup;
- replace temporary demo Cases/questions with D1 queries;
- Review + Review Question snapshot creation;
- Review Asset snapshot creation;
- persist reveal timestamp/status;
- persist `Again`/`Good` completion;
- use persisted history for immediate-repeat avoidance;
- preserve the approved learner UI while replacing its data source.

Definition of done:

A learner can repeatedly study seeded D1 content, receive valid randomized compatible questions, reveal answers, rate the whole Case, and produce durable Review history.

---

## Milestone 5 — R2 image storage

Status: **infrastructure/guardrails complete; product integration next**

Goal: Cases display real uploaded teaching images with optional source attribution.

Completed:

- production R2 `MEDIA` binding;
- server-side R2 storage helper;
- 5 MiB per-image application limit;
- 5 GiB managed-storage ceiling;
- Standard storage-class enforcement;
- immutable object-key enforcement;
- automated tests for storage guardrails;
- image provenance policy documented;
- Asset schema already includes `source_label`, `source_url`, and `licence`.

Remaining:

- minimal admin upload endpoint/UI;
- MIME validation at route boundary;
- immutable object-key generation;
- Asset record creation/editing;
- optional source label/URL/licence entry;
- unknown-source support without invented attribution;
- secure R2 image-serving path;
- multiple ordered Case Assets;
- learner display of optional attribution per image;
- Review Asset snapshots retaining the exact object key shown.

All teaching-image writes must go through `putTeachingImage()` rather than calling `MEDIA.put()` directly.

---

## Milestone 6 — Minimal content administration

Status: **not started beyond protected admin scaffold**

Goal: the administrator no longer needs seed scripts for routine content entry.

Implement in this order after the learner vertical slice is functioning:

1. Concepts
2. Question Prompts + Concept Questions
3. Cases + Concept links
4. Case Questions
5. Case Assets/order

Do not expand into a large dashboard before the learner flow and image pipeline are proven.

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

---

## Milestone 8 — Deployment and acceptance test

Status: **private auth deployment complete; learner V1 acceptance demo incomplete**

Remaining:

- verify authenticated administrator browser access;
- create and verify a test learner account;
- seed representative acceptance content;
- deploy the D1-backed learner flow;
- verify R2 image persistence/serving;
- execute the V1 acceptance test from `V1_SPEC.md`;
- record bugs as GitHub issues.

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

Only after this milestone should we revisit FSRS/scheduling, bulk Anki import, richer analytics, structured marking points, question weighting, or broader stimulus types.

---

## Immediate next phase — two-agent parallel implementation

The approved learner UI is now merged. The next phase should run two agents in parallel from the same current `main`, with separate branches and PRs.

### Track A — D1 learner/review vertical slice

Primary goal: replace temporary demo data underneath the approved learner UI with real D1 data and durable Review records.

Scope:

1. representative seed data;
2. server-side D1 queries for Concept/Case/question/Asset metadata reads;
3. create Review/Review Question/Review Asset snapshots;
4. adapt `/study` to real D1-backed selection while preserving the approved UI;
5. persist reveal and `Again`/`Good` completion;
6. tests for the end-to-end learning-domain behaviour.

### Track B — R2 Asset/admin vertical slice

Primary goal: establish the real teaching-image pipeline independently of Review persistence.

Scope:

1. minimal protected admin Asset upload page/endpoint;
2. MIME/size validation;
3. R2 upload through `putTeachingImage()` only;
4. Asset metadata persistence including optional source attribution;
5. secure image-serving path;
6. tests for upload/metadata/serving behaviour.

Detailed branch and ownership rules are in `docs/PARALLEL_WORK_PLAN.md`.

### Integration order

- both branches start from the same `main` commit;
- each opens its own draft PR;
- neither agent merges its own PR;
- when both are green, merge the lower-conflict PR first;
- update/rebase the second PR on the new `main` and resolve only integration conflicts;
- finish any thin glue required for learner pages to render the new R2 Asset-serving URL.

---

## Known technical debt

`package.json` still pins Wrangler 4.115.0, while the project uses compatibility date `2026-08-14`. Local auth smoke tests and production release were validated with Wrangler 4.123.0. Update the dependency/lockfile deliberately before relying on release scripts that use the pinned binary.

Do not apply `npm audit fix --force` casually.
