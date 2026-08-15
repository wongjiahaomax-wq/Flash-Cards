# Flash-Cards — V1 Implementation Plan

_Last updated: 15 August 2026_

This document tracks implementation progress against `V1_SPEC.md` and `V1_DATA_MODEL.md`.

The project has now crossed the first major threshold: a real administrator can create content in the browser, store images in private R2, attach those Assets to Cases, add questions, and preview the resulting Case through the D1-backed learner Study flow.

---

## Milestone 0 — Freeze the V1 contract

Status: **complete**

Completed:

- `CURRENT_DESIGN.md`;
- `V1_SPEC.md`;
- `V1_DATA_MODEL.md`;
- `IMAGE_PROVENANCE.md`;
- this implementation plan.

The V1 educational model remains Case-based rather than fixed front/back flashcards.

---

## Milestone 1 — Scaffold the application

Status: **complete**

Completed:

- SvelteKit application scaffold;
- Cloudflare adapter/runtime;
- Wrangler configuration;
- public landing/sign-in routes;
- protected `/study` and `/admin` routes;
- CI covering database checks, tests, Svelte checks, build, and local auth smoke validation;
- production Worker deployment scaffold.

---

## Milestone 2 — D1 + Drizzle learning-domain model

Status: **complete for the current V1 slice**

Completed:

- Drizzle ORM and Drizzle Kit;
- Version 1 learning-domain schema;
- D1 learning migration;
- Better Auth D1 migration kept separate from Drizzle learning schema;
- database access helpers;
- Concepts and hierarchy;
- Cases with `vignette_md`;
- Case/Concept links;
- Assets and Case Assets;
- reusable Question Prompts;
- Concept Questions;
- Case Questions;
- Reviews, Review Questions, and Review Assets;
- representative seed tooling for local/tests;
- runtime IDs/timestamps for current writes;
- server-side read/write logic used by learner/admin flows.

Important operational note: `scripts/seed-content.mjs` is useful for local/tests but should not be run blindly against production because its placeholder Asset keys do not correspond to real R2 bytes.

---

## Milestone 3 — Authentication and permissions

Status: **substantially complete**

Completed:

- Better Auth 1.6.25;
- direct D1 persistence;
- Better Auth Admin plugin;
- public sign-up disabled;
- `/study` authentication;
- `/admin` administrator authorization;
- sign-in/sign-out UI;
- local auth smoke test;
- production auth schema and secret configuration;
- first production administrator bootstrap;
- administrator browser sign-in verified;
- administrator access to `/admin` verified.

Remaining:

- smallest administrator learner-account creation/management flow;
- create a test learner;
- verify normal learner access to `/study` and denial from `/admin`.

---

## Milestone 4 — Core learner study flow

Status: **complete for V1 vertical slice**

Completed:

- D1-backed topic/Concept selection;
- eligible descendant-primary Case loading;
- Case selection with immediate-repeat avoidance;
- reusable-question resolution;
- precedence/deduplication:
  `Case > primary Concept > nearest inheritable ancestor > more distant ancestor`;
- randomized question selection with target three / maximum four;
- durable Review creation;
- Case title/vignette snapshots;
- ordered Review Question snapshots;
- ordered Review Asset snapshots;
- reveal persistence;
- whole-Case `Again` / `Good` completion;
- next-Case navigation using persisted history;
- single-image and multi-image learner presentation;
- internal Case titles hidden/masked from learners.

Definition of done achieved: a learner can study D1-backed content, reveal answers, rate the whole Case, and leave durable Review history.

---

## Milestone 5 — R2 teaching-image pipeline

Status: **complete for V1 vertical slice**

Completed:

- production `MEDIA` R2 binding;
- 5 MiB per-image limit;
- 5 GiB application-managed storage ceiling;
- Standard storage class;
- immutable storage keys;
- JPEG/PNG validation;
- upload through `putTeachingImage()`;
- D1 Asset metadata creation;
- optional source label/source URL/licence;
- unknown-source support without invented attribution;
- cleanup attempt when Asset metadata creation fails after upload;
- authenticated image-serving route;
- MIME, ETag, and private immutable cache handling;
- stable `getTeachingImageUrl(assetId)` helper;
- learner rendering through private R2-backed delivery;
- ordered multiple Case Assets;
- clipboard paste, drag/drop, and normal file-picker upload UI.

External URLs remain attribution metadata only; they are never the learner image source.

---

## Milestone 6 — Minimal browser content administration

Status: **substantially complete for routine V1 content entry**

Completed in PR #9:

- create active Concept/topic with generated unique slug;
- create active Case with primary Concept;
- internal Case title;
- optional editable Case stem/vignette;
- upload teaching image;
- select existing uploaded Assets;
- attach/detach Asset from Case;
- attach the same Asset to different Cases without re-uploading;
- order multiple Case Assets;
- Case-specific captions;
- add/edit/remove/reorder Case questions;
- exact Question Prompt reuse where practical;
- optionally save a question as reusable for the Case's primary Concept;
- Study preview link.

No schema migration was required for this slice.

Still intentionally deferred:

- full Concept hierarchy editor;
- full Case edit/archive/delete workflow;
- secondary Concept-link editor;
- rich Asset metadata editor after upload;
- search/filtering for large content libraries;
- bulk content operations/import.

The current admin interface is sufficient to build real Cases without routine SQL.

---

## Milestone 7 — Users and basic progress

Status: **next major implementation milestone**

Goal: administrators can create learners and see whether learners are using the system and where they struggle.

Recommended order:

1. learner-account creation/management;
2. learner list;
3. recent Review list;
4. filter by learner;
5. filter by Concept;
6. counts of `Again` and `Good`;
7. flag repeated `Again` ratings for a Case.

Keep this observational and simple before adding scheduling complexity.

---

## Milestone 8 — Deployment and acceptance testing

Status: **major vertical-slice acceptance achieved; role-boundary acceptance incomplete**

Completed:

- production auth deployment;
- administrator browser login;
- private R2 upload from `/admin`;
- production D1 content creation through `/admin`;
- real Case stem entry;
- real Asset attachment;
- real Case question entry;
- learner Study preview of the resulting Case;
- PR #9 merged to `main`;
- post-merge CI run #67 passed on merge commit `f48f1a5fe7dee3be2230343befb4a484c98d7a32`.

Remaining:

- create/verify normal learner account;
- verify learner cannot access `/admin`;
- deliberately redeploy from current `main` if release provenance needs to match the merge commit rather than the previously deployed PR head;
- run a small multi-topic acceptance set including multi-image and reused-Asset Cases;
- record product bugs/friction as issues.

---

## Milestone 9 — Pilot content and model validation

Status: **ready to begin**

Goal: use real teaching material to discover whether the current model is sufficient before adding scheduling/import complexity.

Enter a small representative set from:

- ECG/Cardiology;
- ENT;
- Eye;
- Dermatology.

Deliberately exercise:

- Case stem + image + multiple questions;
- image-only/neutral recognition Case;
- multi-image Case;
- alternative Cases for the same Concept;
- the same Asset reused across multiple Cases;
- the same Question Prompt with different Case-specific answers;
- Concept-level reusable questions;
- inherited broader questions;
- Cases that may need a secondary Concept.

Concrete model test:

- store a prolonged-QTc ECG once as an Asset;
- attach it to a neutral ECG-recognition Case;
- attach the same Asset to a post-operative hypocalcaemia Case;
- give the Cases different stems and question sets;
- evaluate whether primary/secondary Concept links are sufficient for future retrieval and analytics.

See `CONTENT_MODEL_EXAMPLES.md`.

Only after this pilot should the project revisit:

- FSRS/scheduling;
- bulk Anki import;
- structured marks/marking points;
- richer analytics;
- question weighting;
- broader non-image stimulus types.

---

## Immediate next phase

The previous two-agent D1/R2 implementation phase is complete. PRs #7, #8, and #9 are merged.

The next phase should focus on **users, progress, and real pilot content**, not more infrastructure.

Recommended sequence:

1. implement learner-account administration;
2. verify role boundaries with a real learner;
3. add a minimal progress view;
4. enter a representative pilot content set through `/admin`;
5. document any model mismatch found during real content entry;
6. only then decide whether secondary Concepts, structured marks, search/filtering, or importer work should move forward.

---

## Known technical debt

### Wrangler version

`package.json` still pins Wrangler 4.115.0 while the project compatibility date and release path have been validated with Wrangler 4.123.0.

Update the dependency and lockfile deliberately before relying on the pinned `npm run deploy` path for future releases.

### Review Asset serving semantics

Review Assets snapshot the exact storage key shown, but the authenticated image endpoint currently resolves the live active Asset by `assetId`. Deactivating an Asset therefore makes it unavailable to historical Reviews. This is acceptable for current V1 but should be revisited if historical audit fidelity becomes important.

### Attribution snapshots

Asset source metadata is currently live metadata rather than part of the Review snapshot. Revisit only if historical attribution fidelity becomes a requirement.

### Question marks

Do not encode exam marks such as `(2)` or `(4)` into question text if structured marking becomes important. Add explicit metadata later rather than parsing prompt strings.

Do not apply `npm audit fix --force` casually.
