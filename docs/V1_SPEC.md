# Flash-Cards — Version 1 Specification

_Last updated: 18 August 2026_

## 1. Purpose and status

This document specifies the **current V1 product behavior**, not the original implementation wish list.

V1 is a private medical-learning web application in which administrators curate structured case-based teaching content and learners complete durable, reproducible Reviews. The core platform is deployed and already contains a production-verified first ECG corpus.

For exact schema details use `V1_DATA_MODEL.md`. For current merged/deployed status use `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md`.

## 2. V1 product boundary

V1 currently proves these product capabilities:

### Learner

A learner can:

1. sign in;
2. choose a Topic;
3. receive an eligible active Case through that Study Topic;
4. see the Case vignette plus fixed and selected alternative stimuli;
5. receive a valid deduplicated set of contextual/reusable questions;
6. reveal all answers;
7. rate the whole Case **Again** or **Good**;
8. continue studying;
9. have the exact attempt recorded with content/provenance snapshots.

### Production administrator

An administrator can currently:

1. browse/create/edit Cases and their learner-facing context;
2. author one primary/default Topic plus additional Study Topics;
3. create/manage Case questions and reusable Topic questions;
4. inspect/edit reusable Question Prompt wording with usage/blast-radius protection;
5. upload/reuse/manage private R2 images;
6. author fixed images and alternative stimulus groups/options;
7. create set-wide and exact-option contextual questions;
8. configure Case question selection and stimulus-specific coverage;
9. curate flat Tags on Cases and contextual Case Questions;
10. create/manage tag-scoped Shared Questions;
11. browse/manage Images with server-backed filters/pagination, Collections, bounded selection, and bulk operations;
12. prepare/preview/start/resume strict reviewed Import Package v1 jobs.

### Not yet part of the current Admin baseline

These are the next small V1 Admin increments, not completed capabilities:

- routine learner-account administration;
- basic learner-progress administration.

Do not describe these as already shipped until implemented and verified.

## 3. Technical stack

V1 uses one full-stack SvelteKit application deployed to Cloudflare Workers.

```text
GitHub
└── SvelteKit application
    ├── Learner UI
    ├── Production Admin UI
    ├── Preview Admin UI
    ├── server-side learning/content logic
    ├── Better Auth
    ├── Drizzle ORM
    │   └── Cloudflare D1
    └── media service
        └── Cloudflare R2
```

Chosen components:

- **SvelteKit** — full-stack framework/router/UI;
- **Cloudflare Workers** — runtime/deployment;
- **Cloudflare D1** — relational data store;
- **Drizzle ORM + versioned migrations** — learning-domain schema/query layer;
- **Better Auth** — authentication and role support;
- **Cloudflare R2** — private teaching-image/object storage.

Better Auth tables and learning-domain tables share D1 but remain conceptually separate. Teaching-image bytes live in R2; D1 stores Asset metadata and relationships.

## 4. Authentication and roles

The application is private and public self-registration is disabled.

Current role boundaries include:

- `admin` — production Admin CMS;
- `user` — normal learner;
- `preview_admin` — Preview Admin only when `PREVIEW_MODE=true`.

The owner may hold `admin,preview_admin` while the production and Preview Workers use separate authentication secrets/sessions.

Authorization is enforced server-side, not by email.

Important hard boundaries include:

```text
Preview Worker /admin/**              -> forbidden
Preview Worker /study/**              -> forbidden
Preview Worker /api/auth/admin/**     -> forbidden
preview_admin on production /study/** -> forbidden by current policy
```

## 5. Core content objects

### Topic / Concept

A Topic is the product-facing name for `concepts`. It is a curated learner study route and may sit in a hierarchy.

A Case has exactly one primary/default Topic and may have additional Study Topics.

### Case

A Case is one coherent clinical presentation/study unit.

A Case contains an internal title, optional learner-facing vignette, question-selection policy, Topic relationships, and stimulus/question relationships.

Cases are not identified by Tags alone and should not be merged merely because they share a diagnosis.

### Asset

A reusable teaching stimulus. V1 learner rendering currently supports image Assets.

An Asset can be reused in multiple Cases. Production object keys are treated as immutable.

### Fixed Case Asset

A `case_assets` relationship places an Asset in a Case and gives it Case-specific order/caption. Active fixed Assets appear in every applicable Review.

### Stimulus Group and Option

A `stimulus_group` represents one independent alternative set inside a Case. V1 selects one active `stimulus_group_option` per active group when the Review starts and freezes the choice.

A Case may have multiple groups, such as one ECG group and one X-ray group.

### Question Prompt

Reusable learner-facing wording only. It does not own a universal clinical answer or clinical Tags.

### Contextual Question relationships

Answers live where they remain correct:

- Topic/Concept Question;
- Case Question;
- stimulus-group Question;
- exact stimulus-option Question.

### Tag

Flat, manually curated cross-cutting clinical metadata.

Case Tags describe concepts covered by a Case. Contextual Case Question Tags describe knowledge tested by that Question. Case Tags do not automatically propagate to Questions.

### Shared Question

A global production-curated reusable knowledge object containing:

- one reusable Question Prompt;
- a reusable medical/teaching answer;
- exactly one Reuse Scope Tag;
- active/archive state;
- zero or more independent descriptive Tags.

The Reuse Scope Tag controls Case eligibility. Descriptive Tags do not.

### Image Collection

Admin-only Image Library organisation. An Asset belongs to zero or one Collection; null is **Unsorted**.

Collections never change learner routing/stimulus semantics.

## 6. Multi-Topic Case routing

When a learner chooses a Topic, the system may select a Case attached to that Topic as either its primary/default route or an additional Study Topic.

The chosen route is preserved as `reviews.study_concept_id`. The Case's canonical primary/default Topic is separately preserved as `reviews.primary_concept_id`.

The Study Topic supplies direct reusable Topic questions for that Review. All attached Topics are not mixed into one question pool.

An attached Topic is valid only if every valid random configuration of the Case remains a legitimate example of that Topic.

## 7. Shared Question eligibility

For a selected production Case, a Shared Question is eligible exactly when:

```text
shared_questions.is_active = true
AND question_prompts.is_active = true
AND question_prompts.preview_session_id IS NULL
AND the Reuse Scope Tag is active
AND case_tags contains (selected Case, Reuse Scope Tag)
```

No descriptive Shared Question Tag creates eligibility. Topic ancestry does not infer Tag eligibility. V1 has one Reuse Scope Tag per Shared Question; compound Boolean scopes are deferred.

## 8. Question precedence and deduplication

When the same `question_prompt_id` is available from several sources, the most contextual source wins:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate set is deduplicated by `question_prompt_id`.

This prevents a broad reusable answer from overriding an exact Case/image answer while still enabling progressive reuse.

## 9. Question selection modes

Each Case supports:

### Automatic

Uses the existing normal target/cap behavior and configured stimulus-specific coverage rules.

### All

Includes all deduplicated eligible questions.

### Fixed

Selects the configured count from the deduplicated pool. Additional Shared/Topic questions do not cause the Review to exceed the configured count.

All selected question parts remain visible together. There is no diagnosis-first gating.

## 10. Review creation and historical fidelity

Review creation resolves the selected Case, Study Topic, stimuli, questions, answers, order, and provenance before learner interaction.

The Review persists snapshots so later content editing does not rewrite historical meaning.

Relevant provenance includes:

- canonical primary Topic;
- Study Topic;
- selected stimulus group/option identities;
- contextual Question source type;
- Shared Question identity where `source_type = 'tag_shared'`.

For Shared Questions, Tag IDs are not snapshotted; the Prompt wording, answer, and Shared Question source identity are.

Alternative stimuli do not rerandomize when an existing Review is refreshed.

## 11. Learner workflow

```text
/sign-in
   ↓
/study
   ↓
Choose Topic
   ↓
resolve Case + Study Topic
   ↓
select fixed + alternative stimuli
   ↓
resolve/dedupe/select questions
   ↓
/study/[review-id]
   ├── vignette
   ├── selected images
   ├── selected questions
   └── Reveal answers
          ↓
       Again / Good
          ↓
       Next Case
```

The target examination permits movement between question parts, so later prompts may give clues to earlier ones. This is intentional exam fidelity.

## 12. Production Admin workflow

Current primary routes include:

```text
/admin
/admin/cases
/admin/questions
/admin/shared-questions
/admin/images
/admin/topics
/admin/tags
/admin/import
```

Routine Case authoring follows:

```text
Topics → Case → Images → Case questions → Preview
```

Advanced controls remain available for alternative sets, group/exact-option questions, coverage, activation/order, Tags, and reuse without making them mandatory for simple content entry.

Global Question Prompt wording edits must account for all active usages, including Shared Question usages.

## 13. Image Library V1/V2 behavior

The current Image Library supports:

- server-backed pages of 60 Assets;
- exact matching counts;
- deterministic filters/sorts;
- cross-page explicit selection inside one canonical query context;
- exact Select All when the matching set is `<=300`;
- refusal rather than silent truncation above 300;
- server mutation bound of `<=30` unique Assets per request;
- sequential client orchestration for larger explicit selections;
- Image Collection create/rename/delete/assignment in production Admin;
- explicit Unsorted state;
- same-Case option Move while preserving option identity and exact-option teaching data.

Image-management operations do not change learner stimulus or Review semantics.

## 14. Media storage and provenance

Teaching images are stored in private R2 and served through authenticated application routes.

Current guardrails include:

- JPEG/PNG teaching uploads;
- maximum 5 MiB per image;
- managed 5 GiB application storage ceiling;
- immutable production object keys;
- optional source label, source URL, and licence;
- unknown provenance is valid and must not be invented.

External image URLs are reference/attribution metadata only.

## 15. Reviewed Import Package v1

The production app accepts a strict reviewed Flash-Cards package, not arbitrary APKG/Anki input.

The external migration process is responsible for extraction, source interpretation, clinical review, taxonomy choices, and package construction.

The Admin importer then provides:

- hardened ZIP/manifest validation;
- exact reviewed-ZIP confirmation;
- deterministic create/use/skip semantics;
- dependency/conflict checks;
- resumable browser-orchestrated bounded requests;
- D1 checkpoints/lease fencing;
- private R2 staging;
- safe retry behavior.

Import Package v1 deliberately has no Tag fields. Tags and Shared Questions are progressive post-import curation.

## 16. Preview Admin

Preview uses a separate Worker with the same D1/R2 bindings as production.

Safety relies on explicit Preview ownership and hard request/data boundaries. Preview follows clone-then-mutate and never treats production mutation plus rollback as a normal workflow.

Preview-owned rows use `preview_session_id`; Preview uploads live under `preview/<preview-session-id>/...` and Reset removes only Preview-owned workspace data.

Global Shared Questions are production-curated and have no Preview mutation authority.

## 17. Current production content validation

The first real ECG source deck has been migrated and independently verified in production:

```text
13 Batch 01 imports
+ 51 Batch 02 imports
+ 2 pre-existing mapped calcium Cases
= 66 / 66 source notes represented
```

The reviewed Batch 01 and Batch 02 import jobs completed with their recorded package hashes and no import errors. Initial ECG ingestion is therefore complete; subsequent work is curation/enrichment.

## 18. Current V1 acceptance standard

A current V1 regression/acceptance exercise should include:

- primary and additional Study Topics;
- fixed and alternative stimuli;
- exact-option and set-wide questions;
- Case and Topic questions using overlapping Prompts to verify precedence;
- a matching Case Tag and eligible Shared Question;
- Automatic, All, and Fixed Case modes;
- Review snapshot/provenance persistence;
- production Admin versus normal learner authorization;
- Preview isolation for any Preview-tested Admin workflow.

Repository implementation PRs must keep the standard validation set green:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

## 19. Next V1 increments

Current next product work is intentionally narrow:

1. curate the imported ECG corpus using Tags/Shared Questions and observed needs;
2. implement the smallest administrator learner-account workflow;
3. implement basic learner-progress Admin: learner list, recent Reviews, filters, Again/Good summaries, and repeated-Again signals.

## 20. Deferred beyond the current V1 baseline

Unless real evidence creates a concrete requirement, defer:

- compound/multiple Shared Question reuse scopes;
- Tag hierarchy and aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- FSRS/sophisticated scheduling;
- advanced cohort analytics;
- automated free-text marking;
- per-question learner rating;
- branching/gated question flows;
- WYSIWYG authoring;
- broad non-image upload types;
- gamification, leaderboards, payments, native apps, offline mode, and institutional multi-tenancy.
