# Flash-Cards — V1 Implementation Plan

_Last updated: 15 August 2026_

This document tracks implementation progress against `V1_SPEC.md` and `V1_DATA_MODEL.md`.

The project now has a real end-to-end V1 vertical slice and a substantially improved Admin Case workflow. The current implementation priority is the Admin content-library phase.

For detailed Admin CMS scope, also read:

```text
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/PARALLEL_WORK_PLAN.md
```

---

## Milestone 0 — Freeze the V1 contract

Status: **complete**

The V1 educational model remains Case-based rather than fixed front/back cards.

Core reference docs:

- `CURRENT_DESIGN.md`;
- `V1_SPEC.md`;
- `V1_DATA_MODEL.md`;
- `CONTENT_MODEL_EXAMPLES.md`;
- `IMAGE_PROVENANCE.md`.

---

## Milestone 1 — Application scaffold

Status: **complete**

Completed:

- SvelteKit;
- Cloudflare Workers adapter/runtime;
- Wrangler configuration;
- public landing/sign-in routes;
- protected `/study` and `/admin`;
- CI covering database checks, tests, Svelte checks, build, and auth smoke validation.

---

## Milestone 2 — D1 + Drizzle learning-domain model

Status: **complete for V1 slice**

Implemented:

- Concepts and hierarchy;
- Cases with vignette/stem;
- Case/Concept links;
- Assets and Case Assets;
- reusable Question Prompts;
- Concept Questions;
- Case Questions;
- Reviews;
- Review Questions;
- Review Assets;
- D1/Drizzle helpers and migrations.

Better Auth tables remain separate from the Drizzle learning-domain schema by design.

Do not run `scripts/seed-content.mjs` blindly against production because placeholder seed Asset keys do not correspond to production R2 objects.

---

## Milestone 3 — Authentication and permissions

Status: **substantially complete**

Completed:

- Better Auth 1.6.25;
- direct D1 persistence;
- Admin plugin;
- public sign-up disabled;
- `/study` authentication;
- `/admin` administrator authorization;
- sign-in/sign-out;
- local auth smoke test;
- production auth schema/secrets;
- first administrator bootstrapped and verified.

Remaining, but intentionally deferred until after Admin CMS + pilot content:

- browser learner-account creation/management;
- test learner creation;
- learner `/study` access and `/admin` denial acceptance test.

---

## Milestone 4 — Core learner Study flow

Status: **complete for V1 vertical slice**

Completed:

- D1-backed Concept selection;
- eligible Case selection;
- immediate-repeat avoidance;
- question precedence/deduplication:
  `Case > primary Concept > nearest inheritable ancestor > more distant ancestor`;
- randomized target three / maximum four questions;
- durable Review creation;
- Case/vignette/question/Asset snapshots;
- reveal timestamps;
- whole-Case `Again` / `Good` rating;
- multi-image rendering;
- internal Case title masking.

Do not redesign the learner flow as part of the current Admin phase.

---

## Milestone 5 — Protected R2 teaching-image pipeline

Status: **complete for V1 vertical slice**

Completed:

- private `MEDIA` R2 binding;
- JPEG/PNG upload;
- 5 MiB image limit;
- 5 GiB app-managed ceiling;
- immutable storage keys;
- writes through `putTeachingImage()`;
- D1 Asset metadata;
- optional source label/URL/licence;
- unknown source supported;
- protected authenticated image serving;
- clipboard, drag/drop, and picker upload.

External `source_url` is attribution only, never runtime image storage.

---

## Milestone 6 — Browser content administration

Status: **substantially complete and being expanded into content libraries**

### PR #9 — first browser content vertical slice

Status: **merged**

Implemented Topic/Case creation, vignette editing, questions, image upload/attachment/captions/order, and learner preview.

### PR #10 — Admin shell + Case management redesign

Status: **merged**

Merge commit:

```text
21f349b4869f59a8bccbf440437ce67088776b58
```

Implemented:

- persistent Admin shell;
- `/admin` dashboard;
- `/admin/cases` searchable Case library;
- `/admin/cases/new`;
- `/admin/cases/[caseId]`;
- focused Case metadata editing while preserving PR #9 Case question/Asset functionality.

### PR #11 — Questions Library

Status: **next, parallel**

Build:

```text
/admin/questions
/admin/questions/[promptId]
```

Required outcomes:

- global prompt/answer search;
- Topic/scope filtering;
- usage counts;
- Case and Concept usage inspection;
- context-specific answers;
- shared-prompt blast-radius warning before global prompt edits;
- Case links.

### PR #12 — Image Library + rename/edit metadata

Status: **next, parallel**

Build:

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

Required outcomes:

- thumbnail library;
- image search/filtering;
- usage counts and Case links;
- Asset metadata editing;
- image rename using existing `assets.original_filename`;
- rename changes D1 metadata only and never changes immutable R2 key/object;
- reuse existing upload pipeline.

No schema migration is expected.

### PR #13 — Topics dashboard

Status: **defer until PR #11 and #12 merge**

Build simple Topic list/detail/search, counts, and reusable-question inspection. Do not build a sophisticated hierarchy editor yet.

---

## Milestone 7 — Pilot content/model validation

Status: **ready after PR #11/#12/#13 admin ergonomics**

Enter representative content from:

- ECG/Cardiology;
- ENT;
- Eye;
- Dermatology.

Deliberately exercise:

- stem + image + multiple questions;
- image-only recognition;
- multi-image Case;
- alternative Cases for the same Concept;
- same Asset reused across Cases;
- same prompt with different Case-specific answers;
- Concept-level reusable questions;
- inherited questions;
- possible need for secondary Concepts.

Use real content entry to discover model/admin blind spots before adding larger infrastructure.

---

## Milestone 8 — Learner accounts and role-boundary acceptance

Status: **planned after pilot-content/Admin CMS phase**

Implement the smallest administrator learner-account workflow, then verify:

- learner can sign in and study;
- learner cannot access `/admin`.

---

## Milestone 9 — Basic learner progress administration

Status: **planned**

Initial scope:

- learner list;
- recent Reviews;
- learner filter;
- Concept filter;
- Again/Good summaries;
- repeated Again flags.

Avoid sophisticated analytics initially.

---

## Later/deferred work

Do not pull these into PR #11/#12:

- FSRS or scheduling controls;
- bulk Anki import;
- rich WYSIWYG editing;
- complex tagging;
- bulk permanent deletion;
- AI content generation;
- complex organisations/roles;
- advanced analytics;
- structured marking points/marks;
- broad stimulus types;
- sophisticated Concept hierarchy editor.

---

## Current recommended sequence

1. **PR #11 Questions Library** — parallel now.
2. **PR #12 Image Library** — parallel now.
3. Merge both with green CI, rebasing the second if needed.
4. **PR #13 Topics dashboard**.
5. Pilot real content and fix friction/model issues.
6. Learner account administration + role acceptance.
7. Basic progress administration.
8. Reassess FSRS/import/analytics/structured marks later.

---

## Technical debt / operational cautions

- `package.json` pins Wrangler 4.115.0 while compatibility work has used 4.123.0; update deliberately in a focused change, not incidentally inside PR #11/#12.
- do not use `npm audit fix --force` casually.
- Review Asset historical serving currently resolves live Asset state; deactivation semantics may need later work.
- attribution metadata is not currently snapshotted into Reviews.
- if structured marks are later introduced, store them structurally rather than parsing `(2)`/`(4)` from strings.

---

## Validation required for every implementation PR

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

GitHub CI must be green before merge.
