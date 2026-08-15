# Flash-Cards — V1 Implementation Plan

The Admin phase also includes the reviewed Flash-Cards Import Package v1 workflow at `/admin/import`. It is documented separately in `docs/CONTENT_IMPORT_PACKAGES.md`; this route is an import mechanism only, not an Anki interpreter or ECG content migration.

_Last updated: 15 August 2026_

This document tracks implementation progress against `V1_SPEC.md` and `V1_DATA_MODEL.md`.

The project now has:

- a working end-to-end V1 learner vertical slice;
- protected R2 teaching-image storage;
- durable D1-backed Reviews;
- browser content administration;
- a complete first-pass Admin CMS for Cases, Questions, Images, and Topics;
- implemented optional alternative stimulus groups;
- the merged multi-Topic learner-routing milestone from PR #18;
- Admin multi-Topic Case authoring on top of the existing `case_concepts` model.

The current implementation priority is focused validation of Admin multi-Topic authoring and the manual production taxonomy operator, followed by continued pilot content entry.

For detailed decisions, also read:

```text
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/CONTENT_MODEL_EXAMPLES.md
docs/STIMULUS_GROUPS_DESIGN.md
docs/MULTI_TOPIC_STUDY_ROUTES.md
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
- `MULTI_TOPIC_STUDY_ROUTES.md`;
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

Status: **complete for the current V1 slice; multi-Topic Review provenance is merged from PR #18**

Implemented:

- Concepts and hierarchy;
- Cases with vignette/stem and question-selection controls;
- Case/Concept links with `primary` / `secondary` roles;
- Assets and Case Assets;
- reusable Question Prompts;
- Concept Questions;
- Case Questions;
- optional stimulus groups/options and contextual questions;
- Reviews;
- Review Questions;
- Review Assets;
- D1/Drizzle helpers and migrations.

Better Auth tables remain separate from the Drizzle learning-domain schema by design.

Do not run `scripts/seed-content.mjs` blindly against production because placeholder seed Asset keys do not correspond to production R2 objects.

Migration `0002_optional_stimulus_groups.sql` is implemented. PR #18 adds the smallest additive multi-Topic provenance change, `reviews.study_concept_id`, through `0003_multi_topic_study_routing.sql`; it does not add a new Case↔Topic, Asset→Topic, or stimulus-option→Topic table.

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

Status: **complete for the current V1 vertical slice and extended for multi-Topic routing in merged PR #18**

Completed:

- D1-backed Concept/Topic selection;
- eligible Case selection;
- immediate-repeat avoidance;
- optional stimulus-group selection/freeze;
- contextual question precedence/deduplication;
- Automatic / All / Fixed question selection and per-group coverage;
- durable Review creation;
- Case/vignette/question/Asset snapshots;
- reveal timestamps;
- whole-Case `Again` / `Good` rating;
- multi-image rendering;
- internal Case title masking.

In PR #18, learner Case eligibility accepts any attached primary or secondary Topic relationship in the selected active subtree, deduplicates by Case ID, and resolves one deterministic Study Concept per Case candidate.

Current precedence is:

```text
selected stimulus option
> stimulus group
> Case
> Study Concept
> nearest inheritable ancestor of Study Concept
> more distant ancestor
```

The Case's canonical/default primary Concept is retained separately from the Study Concept that supplies reusable Topic questions for the Review.

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

Stimulus grouping and multi-Topic routing must not rename, copy, move, or otherwise alter R2 object identity.

---

## Milestone 6 — Browser content administration / Admin CMS

Status: **complete for current V1 phase; multi-Topic Case authoring is implemented in the current milestone**

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

### PR #14 — Optional alternative stimulus groups

Status: **merged**

Implemented the current alternative-stimulus authoring model, group/option contextual questions, coverage controls, and Review stimulus provenance.

### Multi-Topic Case authoring

```text
Primary/default Topic
[ Hypercalcemia ▼ ]

Additional Study Topics
[ Short QTc ]  [Make primary] [Remove]
[ Add Topic ]
```

The Case editor now provides separate Primary/default Topic and Additional Study Topics sections. It supports active secondary add/remove, secondary promotion, primary change with old-primary preservation, inactive relationship display, duplicate prevention, and exactly-one-primary validation. The learner route/provenance contract remains unchanged: the selected attached Topic is the Study Concept, while the canonical primary remains Review primary provenance.

Topic hierarchy editing remains deliberately deferred.

---

## Milestone 7 — Pilot content/model validation

Status: **in progress**

Pilot content should span:

- ECG/Cardiology;
- ENT;
- Eye;
- Dermatology;
- additional useful mixed-modality clinical examples where they expose model requirements.

Pilot modelling has demonstrated two important extensions:

1. a Case may remain clinically identical while one or more example stimuli vary between attempts, with exact selected stimuli needing more specific questions/answers;
2. a single Case may legitimately be studied through multiple educational Topics without duplicating the Case, stem, Assets, or questions.

Concrete examples include:

- Hypercalcaemia with several interchangeable shortened-QTc ECGs, some with additional findings such as Osborn waves;
- Multiple myeloma with hypercalcaemia where one Review may select one ECG plus one X-ray from independent alternative groups;
- Hypocalcaemia Cases that are also valid `Prolonged QTc` study routes when every allowed stimulus configuration supports that route.

These requirements are documented in `STIMULUS_GROUPS_DESIGN.md` and `MULTI_TOPIC_STUDY_ROUTES.md`.

Continue to exercise:

- stem + image + multiple questions;
- image-only recognition;
- fixed multi-image Cases;
- same Asset reused across Cases;
- same prompt with different contextual answers;
- Concept-level reusable questions;
- inherited questions;
- multi-Topic Case routes;
- imported Anki material that initially remains ordinary Case/Asset/question content.

---

## Milestone 7A — Optional alternative stimulus groups

Status: **implemented**

Goal: allow richer Case variation without forcing existing or imported content into a complex structure.

Implemented design principles:

- stimulus grouping is optional and emergent;
- ordinary ungrouped Case Assets remain fixed and behave exactly as before;
- a Case may have zero or more independent stimulus groups;
- V1 chooses exactly one option from each active group;
- selected options are frozen into the Review at creation time;
- an Asset remains global reusable media and does not own questions;
- group-level and option-specific prompt/answer contexts extend the existing Question Prompt model;
- more-specific context overrides less-specific context for the same prompt;
- Case question count supports Automatic / all eligible / Choose N;
- stimulus-specific question coverage is configurable;
- imported Anki content does not require stimulus classification before it is usable;
- the migration is additive/backward-compatible;
- R2 storage identity and provenance contracts remain unchanged.

Current question precedence, with PR #18 Study-Concept terminology, is:

```text
selected stimulus option
  > stimulus group
  > Case
  > Study Concept
  > nearest inheritable ancestor
  > more distant ancestor
```

Review creation selects stimuli before resolving the final question set.

See `docs/STIMULUS_GROUPS_DESIGN.md` for detailed product and schema direction.

Implemented in migration `0002_optional_stimulus_groups.sql` and the existing Case editor. Ordinary Cases remain unchanged; enriched Cases support fixed stimuli plus one selected option per active group, contextual group/option questions, configurable Automatic/All/Fixed question selection, per-group coverage, and Review provenance snapshots.

---

## Milestone 7B — Multi-Topic learner Case routes

Status: **implemented and merged in PR #18**

Implemented scope:

- any attached active Case Topic can make the Case learner-eligible;
- selected Topic + active descendants retain existing subtree semantics;
- Case candidates are deduplicated by ID before random selection;
- one Study Concept is selected deterministically per candidate using exact route, primary-in-subtree, deepest secondary, then stable tie-break precedence;
- reusable Topic questions come from the Study Concept and its inheritable ancestors only;
- the canonical/default Topic does not leak reusable questions into another Study route;
- Reviews store both canonical `primary_concept_id` and route-specific `study_concept_id`;
- historical Reviews backfill `study_concept_id = primary_concept_id`;
- existing single-Topic and stimulus behavior remains regression-covered.

Explicitly not implemented in the current V1 model:

- production taxonomy mutation during deployment;
- Topic chips/default selector;
- `asset_concepts` or `stimulus_option_concepts`;
- Asset-owned questions;
- finding ontology;
- Deck / Collection;
- AI classification / Anki auto-tagging;
- FSRS or new progress dashboards.

---

## Milestone 8 — Learner accounts and role-boundary acceptance

Status: **planned after current content-model/Admin multi-Topic work**

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

Do not pull these into the focused multi-Topic implementation unless real use proves they are required:

- `asset_concepts`;
- `stimulus_option_concepts`;
- Asset-owned questions;
- finding ontology;
- Deck / Collection;
- FSRS or scheduling controls;
- bulk Anki import automation / auto-tagging;
- selecting more than one option from a single stimulus group;
- broad non-image upload types;
- rich WYSIWYG editing;
- complex tagging;
- bulk permanent deletion;
- AI content generation/classification;
- complex organisations/roles;
- advanced analytics/new progress dashboards;
- structured marking points/marks;
- sophisticated Concept hierarchy editor.

---

## Current recommended sequence

1. **Review and merge the Admin multi-Topic Case authoring and operator milestone.**
2. Apply the agreed production taxonomy manually after merge using the dedicated operator workflow.
3. Continue representative pilot content entry, including ECG and mixed-modality examples.
4. Fix concrete Admin/content-model friction discovered during entry.
5. Implement learner-account administration + role-boundary acceptance.
6. Implement basic learner-progress administration.
7. Reassess Asset/Stimulus→Topic, FSRS/import/analytics/structured marks/hierarchy tooling only if real content requires them.

---

## Technical debt / operational cautions

- `package.json` pins Wrangler 4.115.0 while compatibility/release work has used 4.123.0; update deliberately in a focused change.
- do not use `npm audit fix --force` casually.
- Review Asset historical serving currently resolves live Asset state; deactivation semantics may need later work.
- attribution metadata is not currently snapshotted into Reviews.
- if structured marks are later introduced, store them structurally rather than parsing `(2)`/`(4)` from strings.
- do not modify production D1 directly from PR #18.

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
