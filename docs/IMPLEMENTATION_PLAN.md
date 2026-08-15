# Flash-Cards — V1 Implementation Plan

_Last updated: 15 August 2026_

This document tracks implementation progress against `V1_SPEC.md` and `V1_DATA_MODEL.md`.

The project now has:

- a working end-to-end V1 learner vertical slice;
- protected R2 teaching-image storage;
- durable D1-backed Reviews;
- browser content administration;
- a complete first-pass Admin CMS for Cases, Questions, Images, and Topics.

The current implementation priority is now **pilot content/model validation**.

For detailed Admin CMS decisions, also read:

```text
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/HANDOVER.md
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

Remaining, intentionally after pilot content:

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

## Milestone 6 — Browser content administration / Admin CMS

Status: **complete for current V1 phase**

### PR #9 — first browser content vertical slice

Status: **merged**

Established Topic/Case creation, vignette editing, questions, image upload/attachment/captions/order, and learner preview.

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
- focused Case metadata editing while preserving Case question/Asset functionality.

### PR #11 — Questions Library

Status: **merged**

Merge commit:

```text
b78e7c9c0af4b4024adb3e5d373aef8631482914
```

Implemented:

```text
/admin/questions
/admin/questions/[promptId]
```

Capabilities include global prompt/answer search, Topic/scope filtering, current active usage counts, Case/Concept usage inspection, context-specific answers, shared-prompt blast-radius warnings, and stale-usage protection.

### PR #12 — Image / Asset Library

Status: **merged**

Merge commit:

```text
e1af88633f67b9a4bca1778684664b863fe62adb
```

Implemented:

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

Capabilities include thumbnail browsing, search/filtering, usage inspection, Asset metadata editing, dedicated protected upload, and image renaming via existing `assets.original_filename` without changing immutable R2 identity.

### PR #13 — Topics dashboard

Status: **merged**

Merge commit:

```text
02853083518d0228e8aaffa9c7566822e6c8d7c5
```

Implemented:

```text
/admin/topics
/admin/topics/[conceptId]
```

Capabilities include Topic search, active primary-Case counts, active reusable-question counts, primary Case inspection, Topic-specific reusable answers, inheritance visibility, and parent/direct-child navigation.

Topic editing and sophisticated hierarchy management remain deliberately deferred.

PRs #10–#13 required no schema migration.

---

## Milestone 7 — Pilot content/model validation

Status: **current priority / ready now**

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

The purpose is not merely to populate the database. Use real content entry to identify:

- content-model blind spots;
- awkward reuse semantics;
- missing Admin affordances;
- unnecessary clicks;
- confusing terminology;
- search/filter gaps.

Fix demonstrated friction before adding larger infrastructure.

---

## Milestone 8 — Learner accounts and role-boundary acceptance

Status: **planned after pilot-content/Admin friction fixes**

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

Do not pull these into pilot-content fixes unless real use proves they are required:

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
- sophisticated Concept hierarchy editor;
- broad secondary-Concept management.

---

## Current recommended sequence

1. **Enter representative pilot content** across ECG/Cardiology, ENT, Eye, and Dermatology.
2. Fix concrete Admin/content-model friction discovered during entry.
3. Implement learner-account administration + role-boundary acceptance.
4. Implement basic learner-progress administration.
5. Reassess FSRS/import/analytics/structured marks/hierarchy tooling later.

---

## Technical debt / operational cautions

- `package.json` pins Wrangler 4.115.0 while compatibility/release work has used 4.123.0; update deliberately in a focused change.
- do not use `npm audit fix --force` casually.
- Review Asset historical serving currently resolves live Asset state; deactivation semantics may need later work.
- attribution metadata is not currently snapshotted into Reviews.
- if structured marks are later introduced, store them structurally rather than parsing `(2)`/`(4)` from strings.

---

## Validation required for implementation PRs

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

GitHub CI must be green before merge.
