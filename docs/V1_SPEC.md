# Flash-Cards — Version 1 Specification

_Last updated: 24 August 2026_

## 1. Purpose and status

This document specifies the **current V1 product behavior on repository `main`**, not the original implementation wish list. Deployment/application state remains separately verified; use `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` for that boundary.

V1 is a private medical-learning web application in which administrators curate structured case-based teaching content and learners complete durable, reproducible Reviews.

## 2. Current V1 product boundary

### Learner

A learner can:

1. sign in;
2. choose a Topic;
3. receive an eligible active production Case through that Study Topic;
4. see the Case vignette plus fixed images and selected active, non-removed alternative stimuli;
5. receive a valid deduplicated set of Case, Topic, stimulus, Shared, and explicitly opted-in Reusable Image Questions;
6. reveal all answers;
7. rate the whole Case **Again** or **Good**;
8. continue studying;
9. have the exact attempt recorded with immutable content/provenance/media snapshots.

### Production administrator

An administrator can currently:

1. browse/create/edit Cases and learner-facing context;
2. manage one primary/default Topic plus Additional Study Topics, including inline Topic creation from the Case editor;
3. create/manage whole-Case questions and reusable Topic questions;
4. inspect/edit reusable Question Prompt wording with usage/blast-radius protection;
5. upload/reuse/manage private R2 image Assets;
6. author fixed images and Alternative Sets/options;
7. create set-wide and Case-specific exact-image questions;
8. create canonical Reusable Image Questions and explicitly opt exact Case/stimulus usages in or out;
9. change a whole-Case question to an exact image/stimulus scope where valid;
10. configure Case question selection and stimulus-specific coverage;
11. curate flat Tags on Cases and contextual Case Questions;
12. create/manage tag-scoped Shared Questions;
13. browse/manage Images with server-backed lifecycle/status/source/Topic/Collection filters, pagination, bounded selection, and bulk operations;
14. move alternative options between sets in the same Case while preserving option identity;
15. deactivate an option or distinctly **Remove from Case** while retaining historical relationships/provenance;
16. replace an Asset with a higher-resolution copy of the **same underlying image** through the narrow immutable supersession workflow;
17. prepare/preview/start/resume strict reviewed Import Package v1 jobs.

The Case editor also provides browser-local Classic/Compact layout preference. Compact mode includes fast-review surfaces and a final **All questions in this Case** audit without changing learner semantics.

### Not yet part of the current Admin baseline

These remain next small V1 Admin capabilities rather than completed product features:

- routine learner-account administration;
- basic learner-progress administration.

Permanent Asset/R2 deletion is also intentionally not implemented merely because lifecycle filters can identify unused-looking content.

## 3. Technical stack

V1 uses one full-stack SvelteKit application deployed to Cloudflare Workers:

```text
GitHub
└── SvelteKit application
    ├── Learner UI
    ├── Production Admin UI
    ├── Preview Admin UI
    ├── server-side learning/content logic
    ├── Better Auth
    ├── Drizzle ORM → Cloudflare D1
    └── private media service → Cloudflare R2
```

Current repository migrations extend through `0013_review_assets_asset_lookup.sql`. Repository presence is not proof of production migration application.

## 4. Authentication and roles

Public self-registration is disabled. Current role concepts include:

- `admin` — production Admin CMS;
- `user` — normal learner;
- `preview_admin` — Preview Admin when `PREVIEW_MODE=true`.

The owner may hold `admin,preview_admin`. Production and Preview Workers use separate Better Auth secrets/sessions even when the underlying identity is shared.

Hard boundaries include:

```text
Preview Worker /admin/**          -> forbidden
Preview Worker /study/**          -> forbidden
Preview Worker /api/auth/admin/** -> forbidden

preview-only preview_admin on production /study/** -> forbidden
combined admin,preview_admin on production /study/** -> allowed
```

Authorization is server-side; UI hiding is not the security boundary.

## 5. Core content objects

### Topic / Concept

A Topic is a curated learner study route/hierarchy. A Case has exactly one primary/default Topic and may have Additional Study Topics.

### Case

A Case is one coherent clinical presentation/study unit containing internal title, optional learner vignette, question-selection policy, Topic relationships, and stimulus/question relationships.

### Asset

One exact reusable teaching-media identity. V1 learner media is image-based. Production R2 object keys are immutable.

### Fixed Case Asset

`case_assets` places an Asset in a Case with Case-specific display order/caption. Active fixed Assets appear in every applicable Review.

### Stimulus Group / Alternative Set

A `stimulus_group` represents one independent Alternative Set in a Case. One active, non-removed `stimulus_group_option` is selected per active group when a Review begins and is then frozen.

Option state distinguishes:

```text
Deactivate
→ relationship remains in normal authoring, excluded from learner selection.

Remove from Case
→ relationship becomes archived from current authoring/selection via removed_from_case,
  while option identity, Asset linkage, questions, and historical provenance remain.
```

### Question Prompt

Reusable wording only; no universal answer lives on `question_prompts`.

### Contextual Question relationships

Answers live where they remain correct:

- Topic Question;
- whole-Case Question;
- set-wide Stimulus Group Question;
- Case-specific exact Stimulus Option Question.

### Shared Question

Global reusable medical/teaching knowledge containing Prompt, answer, exactly one Reuse Scope Tag, active/archive state, and zero or more independent descriptive Tags.

### Reusable Image Question

Global canonical question/answer intrinsic to one exact Asset. Eligibility in a Case requires explicit opt-in for the exact stimulus usage. Reusing the Asset elsewhere does not silently reuse its questions.

### Tag

Flat manually curated cross-cutting clinical metadata. Case Tags can control Shared Question eligibility; descriptive Shared Question Tags do not.

### Image Collection

Admin-only Image Library organisation. Collections never change learner routing/stimulus semantics.

## 6. Multi-Topic Case routing

When a learner chooses a Topic, an attached Case may be selected through either its primary/default or an Additional Study Topic.

The chosen route is persisted as `reviews.study_concept_id`; the canonical primary Topic is separately persisted as `reviews.primary_concept_id`.

The actual Study Topic supplies direct Topic Questions. The system does not mix every attached Topic bank into the same Review.

## 7. Author-facing question scope

The ordinary Case-editor choice is:

```text
Applies to this whole Case
Applies to a specific image / stimulus
```

Exact-image assignment to a currently fixed image may transparently create a one-option active Stimulus Group in the same semantic mutation, preserving Asset identity, caption, and effective learner visibility.

Case-specific exact-image knowledge remains separate from Reusable Image Questions. Promotion/reuse is never inferred merely because Prompt wording or Asset identity matches.

## 8. Shared Question eligibility

For a selected production Case, a Shared Question is eligible exactly when:

```text
shared_questions.is_active = true
AND question_prompts.is_active = true
AND question_prompts.preview_session_id IS NULL
AND Reuse Scope Tag is active
AND case_tags contains (selected Case, Reuse Scope Tag)
```

Descriptive Tags never create eligibility. Topic ancestry does not infer a Tag match. V1 has one Reuse Scope Tag per Shared Question.

## 9. Reusable Image Question eligibility

A canonical `asset_questions` row is not sufficient by itself. For a selected stimulus option, the active Asset Question must be explicitly linked to that exact option through `stimulus_option_asset_questions`, and the option/Asset identities must agree.

Removing one opt-in affects only that exact stimulus usage. It does not archive the canonical Asset Question or another Case's opt-in.

## 10. Question precedence and deduplication

When the same Prompt ID is available from several sources, current-main precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for selected option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate set is deduplicated by `question_prompt_id`.

A cross-Stimulus-Group invariant prevents the same Prompt becoming independently stimulus-specific in multiple active groups that may both be selected in one Review.

## 11. Question selection modes

Each Case supports:

### Automatic

Uses the normal target/cap behavior plus configured stimulus-specific coverage rules.

### All

Includes all deduplicated eligible questions.

### Fixed

Selects the configured count from the deduplicated pool. Reusable sources do not cause the Review to exceed the configured count.

All selected question parts remain visible together; there is no diagnosis-first gating.

## 12. Review creation and historical fidelity

Review creation resolves Case, Study Topic, stimuli, questions, answers, order, and provenance before learner interaction.

Review data freezes:

- Case title/vignette;
- primary and Study Topic;
- selected fixed/alternative media with storage-key/caption/alt-text snapshots;
- selected Prompt/answer/order snapshots;
- contextual source IDs, including Shared Question and Asset Question provenance.

For reusable image knowledge:

```text
source_type = asset
source_asset_question_id = <asset_questions.id>
```

For Shared Questions:

```text
source_type = tag_shared
source_shared_question_id = <shared_questions.id>
```

Later authoring changes do not rewrite an existing Review.

## 13. Media lifecycle and higher-resolution replacement

Asset status and usage state are separate:

```text
Status: Active / Inactive
Usage:  Current / Historical only / Unused
```

**Current** means active participation in an active production Case. **Historical only** means no current use but retained relationships/Reviews/Reusable Image Questions/supersession lineage still require provenance. **Unused** means neither current nor retained historical/provenance dependency exists. Preview relationships are excluded from production classification.

Higher-resolution replacement is allowed only for a better-quality copy of the same underlying image. It creates a new immutable R2 object and new Asset, transfers current production relationships, preserves Stimulus Option IDs, clones Asset Questions/remaps current opt-ins, leaves the old Asset/R2 bytes for historical provenance, and records `superseded_by_asset_id`.

A different ECG/X-ray/photograph/diagram remains a separate Asset even when it depicts the same diagnosis.

Historical Study image delivery uses `review_assets.storage_key_snapshot` through an authenticated Review-owned route, so old Reviews remain valid after replacement/deactivation.

## 14. Production Admin workflow

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

The shared Case editor is now componentized under `src/lib/components/case-editor/`, while the route remains the cross-section/server-data coordinator. Preview Admin continues to reuse the production editor implementation rather than maintaining a second copy.

Compact mode is a review-oriented presentation of the same underlying authoring semantics; Classic remains available.

## 15. Image Library behavior

The current Image Library supports:

- 60-item server-backed pages;
- exact matching totals;
- deterministic search/filter/sort;
- Active/Inactive status filtering plus Current/Historical only/Unused usage filtering;
- source/Topic/Collection context;
- cross-page explicit selection within one canonical query context;
- exact Select All when the matching set is `<=300`;
- refusal rather than silent truncation above 300;
- server mutation bound of `<=30` unique Assets per request;
- sequential client orchestration for larger explicit selections;
- Image Collection management;
- same-Case option Move;
- lifecycle-oriented oldest-first cleanup views.

These features do not physically delete Assets/R2 objects.

## 16. Bounded Admin read models

Current `main` uses page-specific read models:

- `/admin` → aggregate counts + bounded Case work queue;
- Case detail → exact active production Case by ID;
- `/admin/cases` → 60-row SQL-filtered/count page + page-only relationship enrichment;
- `/admin/questions` → 60-row bounded Prompt page with SQL filters and bounded Unicode-aware search verification.

Timing instrumentation uses `Server-Timing` and small structured read timings without logging sensitive content.

## 17. Reviewed Import Package v1

Production accepts a strict reviewed Flash-Cards package, not arbitrary Anki/PPTX/PDF input.

The external process is responsible for source extraction/semantic reconstruction, clinical review, taxonomy choices, and package construction. The local slide-review/finalizer edits the real production-shaped manifest and deterministically emits the strict production package after human review.

Import Package v1 deliberately stays conservative; Tags, Additional Study Topics, Alternative Sets, Shared Questions, and Reusable Image Questions can be added progressively after ingestion.

## 18. Preview Admin

Preview uses a separate Worker with the same D1/R2 resources as production. Safety relies on explicit ownership and hard request/data boundaries.

Preview follows clone-then-mutate. Global Shared Questions and Reusable Image Questions remain production-curated. Production Asset replacement remains production-only and refuses to deactivate a source Asset referenced by a live Preview workspace.

The public Preview DB API remains `src/lib/server/db/preview-workspace.js`. Internal focused owners currently cover Session lifecycle, ownership/security, Case lifecycle/cloning, and fixed-image operations; Alternative Set/question/cleanup extraction is still staged follow-up work.

## 19. Current V1 acceptance standard

A current regression/acceptance exercise should include:

- primary and Additional Study Topics;
- fixed and alternative stimuli;
- active, inactive, and removed option behavior;
- exact-option, reusable exact-Asset, set-wide, Case, Topic, and tag-shared questions using overlapping Prompts to verify precedence;
- Automatic, All, and Fixed Case modes;
- Review Prompt/answer/media snapshot persistence;
- production Admin vs learner vs Preview authorization;
- Preview isolation for any Preview-tested workflow;
- same-image replacement historical fidelity where that subsystem changes.

Repository implementation work should use the repository-owned validation workflow described in `AGENT_TASK_MAP.md` rather than copying an independent command list here.

## 20. Next V1 increments

1. curate the imported ECG/content corpus using current Tags/reuse/image semantics;
2. continue focused maintainability/performance work when evidence justifies it;
3. implement the smallest administrator learner-account workflow;
4. implement basic learner-progress Admin.

## 21. Deferred beyond the current V1 baseline

Unless real evidence creates a concrete requirement, defer:

- compound/multiple Shared Question reuse scopes;
- Tag hierarchy/aliases and Study-by-Tag;
- Review Tag snapshots and automatic/AI Tag inference;
- Asset Tags;
- permanent destructive media deletion;
- generic Asset-family/version-history architecture;
- FSRS/sophisticated scheduling;
- advanced cohort analytics;
- automated free-text marking/per-question rating;
- branching/gated question flows;
- WYSIWYG authoring;
- broad non-image upload types;
- gamification, leaderboards, payments, native apps, offline mode, institutional multi-tenancy.
