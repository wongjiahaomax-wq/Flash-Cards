# Flash-Cards — V1 Implementation Plan

_Last updated: 15 August 2026_

This document tracks implementation progress against `V1_SPEC.md` and `V1_DATA_MODEL.md`.

The project now has:

- a working end-to-end V1 learner vertical slice;
- protected R2 teaching-image storage;
- durable D1-backed Reviews;
- browser content administration;
- a complete first-pass Admin CMS for Cases, Questions, Images, and Topics;
- pilot-content modelling that has identified a concrete need for optional alternative stimulus groups.

The current implementation priority is now **the smallest backward-compatible stimulus-group extension required by real pilot content**, followed by continued pilot entry.

For detailed decisions, also read:

```text
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/CONTENT_MODEL_EXAMPLES.md
docs/STIMULUS_GROUPS_DESIGN.md
docs/HANDOVER.md
```

---

## Milestone 0 — Freeze the V1 contract

Status: **complete for baseline; additive extensions must remain backward-compatible**

The educational model remains Case-based rather than fixed front/back cards.

Core reference docs:

- `CURRENT_DESIGN.md`;
- `V1_SPEC.md`;
- `V1_DATA_MODEL.md`;
- `CONTENT_MODEL_EXAMPLES.md`;
- `STIMULUS_GROUPS_DESIGN.md`;
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

Status: **complete for current V1 slice; stimulus extension planned**

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

The planned stimulus-group milestone requires an additive reviewed D1 migration. Existing Cases without stimulus groups must continue to work unchanged.

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

Remaining, intentionally after the current content-model milestone:

- browser learner-account creation/management;
- test learner creation;
- learner `/study` access and `/admin` denial acceptance test.

---

## Milestone 4 — Core learner Study flow

Status: **complete for current V1 vertical slice**

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

The stimulus-group milestone will extend, not replace, this flow. It will select/freeze stimulus alternatives before final question resolution and will make question-count behaviour configurable rather than permanently fixed at 3–4.

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

Stimulus grouping must not rename, copy, move, or otherwise alter R2 object identity.

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

Implemented persistent Admin shell, dashboard, searchable Cases, dedicated creation/editing routes, and focused Case metadata management.

### PR #11 — Questions Library

Status: **merged**

Merge commit:

```text
b78e7c9c0af4b4024adb3e5d373aef8631482914
```

Implemented global prompt/answer search, Topic/scope filtering, usage inspection, context-specific answers, blast-radius warnings, and stale-usage protection.

### PR #12 — Image / Asset Library

Status: **merged**

Merge commit:

```text
e1af88633f67b9a4bca1778684664b863fe62adb
```

Implemented thumbnail browsing, search/filtering, usage inspection, Asset metadata editing, dedicated protected upload, and D1-only image renaming.

A later focused refinement on `main` also added Topic filtering, deterministic sorting, added-date display, and compact Topic context to the Image Library.

### PR #13 — Topics dashboard

Status: **merged**

Merge commit:

```text
02853083518d0228e8aaffa9c7566822e6c8d7c5
```

Implemented Topic search, active primary-Case counts, active reusable-question counts, Case/question inspection, inheritance visibility, and parent/direct-child navigation.

Topic editing and sophisticated hierarchy management remain deliberately deferred.

---

## Milestone 7 — Pilot content/model validation

Status: **in progress**

Pilot content should span:

- ECG/Cardiology;
- ENT;
- Eye;
- Dermatology;
- additional useful mixed-modality clinical examples where they expose model requirements.

Pilot modelling has already demonstrated one important blind spot:

> A Case may remain clinically identical while one or more example stimuli vary between attempts, and exact selected stimuli may require more specific questions/answers.

Concrete examples include:

- Hypercalcaemia with several interchangeable shortened-QTc ECGs, some with additional findings such as Osborn waves;
- Multiple myeloma with hypercalcaemia where one Review may select one ECG plus one X-ray from independent alternative groups.

This requirement is documented in `STIMULUS_GROUPS_DESIGN.md`.

Continue to exercise:

- stem + image + multiple questions;
- image-only recognition;
- fixed multi-image Cases;
- same Asset reused across Cases;
- same prompt with different contextual answers;
- Concept-level reusable questions;
- inherited questions;
- possible need for secondary Concepts;
- imported Anki material that initially remains ordinary Case/Asset/question content.

---

## Milestone 7A — Optional alternative stimulus groups

Status: **next focused implementation milestone**

Goal: allow richer Case variation without forcing existing or imported content into a complex structure.

Required design principles:

- stimulus grouping is optional and emergent;
- ordinary ungrouped Case Assets remain fixed and behave exactly as today;
- a Case may have zero or more independent stimulus groups;
- first implementation chooses exactly one option from each group;
- selected options are frozen into the Review at creation time;
- an Asset remains global reusable media and does not own questions;
- group-level and option-specific prompt/answer contexts extend the existing Question Prompt model;
- more-specific context overrides less-specific context for the same prompt;
- Case question count becomes configurable, with a path for Automatic / all eligible / Choose N;
- stimulus-specific question coverage is configurable rather than permanently hard-coded;
- imported Anki content must not require stimulus classification before it is usable;
- the migration must be additive/backward-compatible;
- R2 storage identity and provenance contracts remain unchanged.

Planned question precedence:

```text
selected stimulus option
  > stimulus group
  > Case
  > primary Concept
  > nearest inheritable ancestor
  > more distant ancestor
```

Review creation should select stimuli before resolving the final question set.

See `docs/STIMULUS_GROUPS_DESIGN.md` for detailed product and schema direction.

---

## Milestone 8 — Learner accounts and role-boundary acceptance

Status: **planned after stimulus-group/pilot-content friction work**

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

Do not pull these into the focused stimulus-group implementation unless real use proves they are required:

- FSRS or scheduling controls;
- bulk Anki import automation;
- selecting more than one option from a single stimulus group;
- broad non-image upload types;
- rich WYSIWYG editing;
- complex tagging;
- bulk permanent deletion;
- AI content generation/classification;
- complex organisations/roles;
- advanced analytics;
- structured marking points/marks;
- sophisticated Concept hierarchy editor;
- broad secondary-Concept management.

---

## Current recommended sequence

1. **Implement the focused optional stimulus-group extension** from `STIMULUS_GROUPS_DESIGN.md`.
2. Continue representative pilot content entry, including hypercalcaemia/multiple-myeloma ECG + X-ray examples.
3. Fix concrete Admin/content-model friction discovered during entry.
4. Implement learner-account administration + role-boundary acceptance.
5. Implement basic learner-progress administration.
6. Reassess FSRS/import/analytics/structured marks/hierarchy tooling later.

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
