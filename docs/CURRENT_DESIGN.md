# Flash-Cards — Current Design Summary

_Last updated: 28 August 2026_

This is the living product/design summary for the current repository. For status read `CURRENT_PRODUCT_ROADMAP.md`; for implementation handover read `HANDOVER.md`; for exact schema semantics read `V1_DATA_MODEL.md`.

## 1. Product phase

Flash-Cards is a private medical learning application built around **Cases**, not permanently fixed front/back cards.

The platform baseline is established: learner Study/Review persistence, private teaching images, browser Admin content management, optional Alternative Sets, Tags, tag-scoped Shared Questions, Reusable Image Questions, reviewed/resumable imports, Image Management V2, contextual System/Topic/Tag navigation, bounded read models, visual taxonomy/Case-classification administration, safe Case lifecycle/recovery, local-first development, and a verified first ECG corpus.

Current Case classification is deliberately simpler than the historical multi-Topic model: one canonical Primary Topic per Case plus Case Tags for cross-cutting/alternate discovery. Historical secondary Topic rows are legacy compatibility data and older Review provenance remains historical truth; no cleanup migration is required merely for this behavior change.

The first ECG Anki source deck is fully represented in production: **66/66 source notes**. Ongoing ECG work is enrichment and medical/content review.

## 2. Organising concepts remain distinct

### System

A **System** is a top-level learner-navigation grouping. Systems organise Topic hierarchy and may explicitly expose selected Tags as contextual learner routes.

### Topic

A **Topic** is the canonical educational home and direct reusable Topic-question scope for a Case. A current learner-presentable Case has exactly one behaviorally active Primary Topic.

### Case

A **Case** is one coherent clinical presentation/study unit. It may contain a vignette, fixed images, zero or more independent Alternative Sets, contextual questions, and zero or more Case Tags.

### Tag

A **Tag** is flat, manually curated, cross-cutting clinical metadata. Case Tags can control Shared Question eligibility through an explicit Reuse Scope Tag and can support contextual learner discovery when a System explicitly exposes the Tag.

### Asset

An **Asset** is one exact reusable teaching-media identity. V1 learner media is image-based. Asset identity is distinct from Case relationship metadata and from clinical diagnosis.

### Image Collection

A **Collection** is Admin Image Library organisation only. It has no learner-routing, Tag, Case, Question, or Review semantics.

### Reusable knowledge

```text
Shared Question
→ reusable Prompt + reusable answer
→ eligibility controlled by one Case Reuse Scope Tag

Reusable Image Question
→ reusable Prompt + canonical answer intrinsic to one exact Asset
→ each exact Case/stimulus usage must explicitly opt in
```

Neither model puts a universal answer on `question_prompts`.

## 3. Learner-facing Case model

```text
Choose System/Topic/Tag route where enabled
    ↓
Resolve eligible Case + canonical Primary Topic
    ↓
Show fixed stimuli + choose active non-removed option from each active Alternative Set
    ↓
Choose Original/Core or Expanded Learning source mode
    ↓
Resolve eligible Questions
    ↓
Deduplicate by Prompt precedence
    ↓
Apply Automatic / All / Fixed Case count rules
    ↓
Create immutable Review snapshots
    ↓
Reveal answers
    ↓
Again / Good
```

Diagnosis-bearing internal Case titles remain Admin-facing where exposing them would reveal the learner answer.

## 4. Canonical Topic plus contextual Tag routing

A Case is stored once with exactly one canonical Primary Topic for current authoring and learner behavior.

```text
Primary Topic
= what the Case fundamentally teaches
= direct reusable Topic-question context

Case Tag
= what else the Case demonstrates
= possible contextual learner route when exposed by a System
= possible Shared Question reuse-scope eligibility
```

A Tag route does not switch the Case to an alternate direct Topic-question bank. Current new Reviews use the canonical Primary Topic as `study_concept_id` whether reached by Topic or Tag.

Historical Reviews created under the retired Additional Study Topic model may retain `primary_concept_id != study_concept_id`; those rows are historical truth and are not rewritten.

## 5. Fixed images, Alternative Sets, and lifecycle distinctions

`case_assets` are fixed Case images and appear whenever the Case is reviewed.

`stimulus_groups` + `stimulus_group_options` model independent Alternative Sets. One active, non-removed option is selected per active group and frozen into Review provenance.

Keep lifecycle concepts separate:

```text
Option Deactivate
→ relationship remains visible to authors but is excluded from learner selection

Option Remove from Case
→ archive relationship from normal current authoring/learner use while retaining identity/history

Asset Active/Inactive
→ global Asset lifecycle state

Asset Current/Historical only/Unused
→ derived production usage classification

Same-image higher-resolution replacement
→ immutable new Asset/R2 object while preserving old historical bytes/provenance
```

Permanent Asset/R2 deletion remains a separate future workflow.

## 6. Question placement and reusable wording

`question_prompts` stores wording only. Answers live at the context where they remain correct:

- Topic Question;
- whole-Case Question;
- set-wide Stimulus Group Question;
- Case-specific exact Stimulus Option Question;
- tag-scoped Shared Question;
- exact-Asset Reusable Image Question.

Author-facing Case scope remains:

```text
Applies to this whole Case
Applies to a specific image / stimulus
```

If exact-image semantics are assigned to a fixed image, the app may transparently convert it to a one-option active Stimulus Group while preserving Asset identity and Case caption.

Case-specific Image Questions are not automatically promoted to Reusable Image Questions. Reusability is an explicit editorial decision.

## 7. Reusable Question eligibility and precedence

A Shared Question is eligible only when its active Reuse Scope Tag is explicitly attached to the selected Case. Topic ancestry and System↔Tag exposure do not infer that membership.

A Reusable Image Question belongs to one exact Asset and is eligible only when the exact selected stimulus usage explicitly opts in.

When the same Prompt is eligible from several sources, current precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for selected option
> stimulus group
> Case
> exact canonical Primary Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The candidate pool is deduplicated by `question_prompt_id` after precedence.

Original/Core versus Expanded Learning determines which source families enter this resolver. It is separate from the Case's Automatic/All/Fixed question-count mode.

## 8. Review snapshots and historical fidelity

A Review freezes what the learner actually saw, including:

- Case title/vignette;
- canonical primary/Study Topic provenance;
- effective System/Tag route plus learner-selected navigation route where applicable;
- fixed/selected media including storage-key/caption/alt-text snapshots and source option/group IDs;
- Prompt/answer/order snapshots;
- contextual source IDs including Shared Question and Asset Question identity;
- question-pool mode, reveal/completion/rating state.

Later edits, deactivation, option removal, taxonomy simplification, or Asset replacement never rewrite existing Review Prompt/answer/media snapshots.

## 9. Current Production Admin workflow

Production navigation includes:

```text
Dashboard
Cases
Questions
Shared Questions
Images
Systems & Topics
Tags
Import package
```

Routine Case authoring remains:

```text
Primary Topic + Case Tags
→ Case details
→ Images / Alternative Sets
→ contextual Questions
→ Preview
```

The Case editor supports browser-local Classic/Compact preference and is decomposed into focused components under `src/lib/components/case-editor/`. Preview Admin reuses this shared editor surface while respecting Preview ownership restrictions.

## 10. Systems & Topics workspace

`/admin/topics` is now a visual tree + inspector workspace rather than the previous duplicated taxonomy list and separate hierarchy manager.

Current design boundaries:

- Systems are top-level roots;
- Topics may nest beneath Systems or other Topics;
- Cases attach to Topics, never Systems;
- direct Cases are revealed by canonical Primary Topic and display their human-readable Case title;
- Topic hierarchy moves are staged before apply;
- Case Primary Topic changes are staged before apply;
- Case Tag additions/removals are staged before apply;
- only one mutation domain may have a pending staging batch at a time;
- expected-state preflight catches stale loaded state before canonical mutation functions;
- the implementation does not claim serializable concurrency or one cross-domain atomic transaction;
- System↔Tag exposure remains a separate System-level workflow.

The full Case editor remains responsible for vignette/images/questions; the workspace is classification/taxonomy administration, not a replacement Case authoring surface.

## 11. Case lifecycle and Case Library curation

Production Case lifecycle is:

```text
Active
→ Deactivate
→ Inactive but fully preserved
→ validated Restore
→ Active
```

Deactivation changes only `cases.is_active`; it does not delete Questions, Assets, Tags, Primary Topic, R2 media, or historical Reviews.

Restore validates Production ownership and one active canonical Primary Topic classified as a Topic before reactivation.

The Case Library provides:

- Active / Inactive views;
- bounded server-side filtering/sorting/pagination;
- explicit Search/Enter for Case/Topic/System text filters rather than navigation while typing;
- lifecycle-correct Tag filtering;
- bulk Primary Topic assignment;
- single/bulk deactivate and restore;
- inline Case Tag add/remove/create-and-attach;
- bulk Case Tag All/Some/None curation with add/remove/create-and-add.

PR #102's read-path optimization reuses the compatible taxonomy result instead of performing the former duplicate active taxonomy supporting read.

## 12. Image Library and replacement

Asset **Active/Inactive** status is distinct from derived Image Library usage state:

- **Current** — active Asset participates in active Production Case content;
- **Historical only** — no current use, but retained relationships/Reviews/Reusable Image Questions/supersession lineage require provenance;
- **Unused** — no current use and no retained historical/provenance dependency.

Higher-resolution replacement is deliberately narrow:

```text
same underlying image + better quality/resolution
→ create new immutable R2 object + new Asset
→ move current Production relationships
→ clone Asset Questions and remap current opt-ins
→ old Asset becomes inactive with supersession lineage
```

A different image showing the same diagnosis is a separate Asset, not a replacement version.

## 13. Bounded read-model direction

Admin reads are deliberately page-specific:

```text
Dashboard → small aggregates + bounded work queue
Case detail → exact active Production Case by ID
Case/Question libraries → SQL-filtered 60-row pages + visible-ID enrichment
Taxonomy workspace → Primary-Topic-only current coverage/detail reads
```

Measurement/instrumentation uses `Server-Timing` and small read timings. Caching/index changes remain evidence-driven rather than default architecture.

## 14. Reviewed imports and progressive enrichment

Production accepts strict Flash-Cards Import Package v1, not arbitrary APKG/PPTX/PDF input.

Anki and slide sources are reconstructed outside the Production importer. The local slide-review tool edits the production-shaped manifest and deterministically finalizes approved review bundles into strict production packages.

For current Case classification, Import Package v1 may carry `secondaryTopicIds` only as an empty compatibility array. Non-empty arrays are rejected by reviewed import and resumable staging/plan boundaries.

The machine-consumed slide review-map shape is owned by:

```text
tools/slide-import-review/schemas/review-map-v1.schema.json
```

It is strict and rejects unknown fields. Prose extraction examples must not override this executable schema.

## 15. Preview Admin model

Preview uses a separate Worker but the same D1/R2 resources. Safety is **clone then mutate Preview-owned content**, not mutate Production then roll back.

`src/lib/server/db/preview-workspace.js` remains the stable public façade. Focused internal ownership through Session/ownership, Case lifecycle/cloning, and fixed-image operations is already extracted.

The Case clone copies the canonical Primary Topic and Case Tags but deliberately does not recreate legacy secondary Topic rows. Preview does not gain global Tag/System authoring.

Global Shared Questions, Reusable Image Questions, and higher-resolution Asset replacement remain Production-only mutation domains.

Further Preview backend decomposition is **paused** after the local-first workflow decision in PR #92. The remaining Alternative Set/question/cleanup façade responsibilities are accepted legacy ownership for now, not a required staged queue.

## 16. Developer execution and CI model

Repository work uses capability-based execution:

```text
usable checkout + commands → Local checkout mode
GitHub-only repository access → Remote GitHub mode
both → Hybrid mode
```

Repository validation authority is exposed through `agent:doctor`, `agent:checks`, `validate:fast`, and `validate:full`; specialized runtime/slide-review checks are selected by changed subsystem.

Normal application development is local-first with the production-like local D1/R2 replica. Remote Preview deployment is optional/legacy rather than a required integration gate.

PR CI is state-aware:

```text
Draft PR            → fast ordinary validation
Ready-for-Review PR → full ordinary validation
Draft → Ready       → full validation on the same head
same-PR newer run   → cancel superseded run
different PRs       → independent
```

Do not duplicate a static test list into every coding prompt; repository validation definitions are the authority.

## 17. Current priorities

1. curate the real ECG/content corpus;
2. curate canonical Primary Topics, Case Tags, and System↔Tag exposure;
3. promote genuinely reusable Shared/Image Questions only where scope is proven;
4. add useful stimulus variants;
5. user-test merged taxonomy/lifecycle/Case Library workflows;
6. finish Account Management v1 implementation;
7. implement basic learner-progress administration;
8. continue focused modularity/performance work where it reduces measured or reasoning cost.

## 18. Deliberately deferred

Keep deferred until real evidence justifies them:

- Additional Study Topic revival;
- compound/multiple Shared Question reuse scopes;
- Tag hierarchy/aliases and unscoped global Study-by-Tag;
- AI/automatic clinical classification without reviewed workflow;
- Asset Tags;
- permanent Asset/R2 deletion;
- generic Asset-family/version-history architecture;
- automatic visual same-image detection;
- FSRS/sophisticated scheduling;
- advanced analytics;
- WYSIWYG authoring;
- broad non-image stimuli/uploads;
- institutional multi-tenancy, payments, gamification, leaderboards, native apps, offline mode.

The design principle remains: **extend the model because real content, learner behavior, maintainability evidence, or measured performance requires it—not because theoretical completeness is possible.**
