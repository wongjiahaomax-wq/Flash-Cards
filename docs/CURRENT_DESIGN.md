# Flash-Cards — Current Design Summary

_Last updated: 25 August 2026_

This is the living product/design summary for the current repository branch. For status read `CURRENT_PRODUCT_ROADMAP.md`; for implementation handover read `HANDOVER.md`; for exact schema semantics read `V1_DATA_MODEL.md`.

## 1. Product phase

Flash-Cards is a private medical learning application built around **Cases**, not permanently fixed front/back cards.

The platform baseline is established: learner Study/Review persistence, private teaching images, browser Admin content management, optional stimulus groups, Tags, tag-scoped Shared Questions, Reusable Image Questions, reviewed/resumable imports, Preview Admin, Image Management V2, contextual System/Topic/Tag navigation, and a verified first ECG corpus.

Current Case classification is deliberately simpler than the historical multi-Topic model: one canonical Primary Topic per Case plus Case Tags for cross-cutting/alternate discovery. Historical secondary Topic rows are legacy compatibility data, and older Review provenance remains historical truth; no cleanup migration is required for this behavior change.

Current engineering work is increasingly about content curation, authoring ergonomics, bounded read models, and behavior-preserving modularity rather than adding broad new architecture.

The first ECG Anki source deck is fully represented in production: **66/66 source notes**. Ongoing ECG work is enrichment and medical/content review.

## 2. Organising concepts remain distinct

### System

A **System** is a top-level learner-navigation grouping. Systems organise Topic hierarchy and may explicitly expose selected Tags as contextual learner routes.

### Topic

A **Topic** (`concepts.kind = 'topic'`) is the canonical educational home and direct reusable Topic-question scope for a Case. A current Case has exactly one Primary Topic.

### Case

A **Case** is one coherent clinical presentation/study unit. It may contain a vignette, fixed images, zero or more independent Alternative Sets, contextual questions, and zero or more Case Tags.

### Tag

A **Tag** is flat, manually curated, cross-cutting clinical metadata. Case Tags can control Shared Question eligibility through an explicit Reuse Scope Tag and can support contextual learner discovery when a System explicitly exposes the Tag.

### Asset

An **Asset** is one exact reusable teaching-media identity. V1 learner media is image-based. Asset identity is distinct from Case relationship metadata and from clinical diagnosis.

### Image Collection

A **Collection** is Admin Image Library organisation only. It has no learner-routing, Tag, Case, question, or Review semantics.

### Reusable knowledge

Two global reusable models exist:

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
Resolve eligible Case + canonical Study Topic
    ↓
Show fixed stimuli + choose active non-removed option from each active Alternative Set
    ↓
Resolve eligible questions
    ↓
Apply Case question-count / stimulus-coverage rules
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

Cross-cutting/alternate discovery belongs to Case Tags plus explicit System↔Tag exposure:

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

Historical Reviews created under the retired Additional Study Topic model may legitimately retain `primary_concept_id != study_concept_id`; those rows are historical truth and are not rewritten.

## 5. Fixed images, Alternative Sets, and option archive state

`case_assets` are fixed Case images and appear whenever the Case is reviewed.

`stimulus_groups` + `stimulus_group_options` model independent Alternative Sets. One active, non-removed option is selected per active group and frozen into Review provenance.

An option has two distinct authoring/lifecycle dimensions:

```text
is_active
→ Deactivate keeps the relationship visible to authors but excludes it from current learner selection.

removed_from_case
→ Remove from Case archives the relationship out of normal current authoring/learner use while retaining option identity, Asset relationship history, questions, and Review provenance.
```

Re-adding the same Asset to its original set may restore the archived option when current invariants allow it. Removing an option does not delete the Asset or R2 bytes.

## 6. Question placement and reusable wording

`question_prompts` stores wording only. Answers live at the context where they remain correct:

- `concept_questions` — Topic answer;
- `case_questions` — whole-Case answer;
- `stimulus_group_questions` — set-wide answer;
- `stimulus_option_questions` — Case-specific exact-image answer;
- `shared_questions` — tag-scoped reusable answer;
- `asset_questions` — exact-Asset canonical reusable answer.

Author-facing Case scope is intentionally simple:

```text
Applies to this whole Case
Applies to a specific image / stimulus
```

If exact-image semantics are assigned to a currently fixed image, the app may transparently convert the fixed relationship to a one-option active Stimulus Group in the same semantic mutation, preserving Asset identity and Case-specific caption.

Case-specific Image Questions are not automatically promoted to Reusable Image Questions. Reusability is an explicit editorial decision.

## 7. Reusable Image Questions

A Reusable Image Question belongs to one exact global Asset. The same Asset being reused in another Case does **not** make its reusable questions automatically eligible.

Eligibility requires an explicit `stimulus_option_asset_questions` opt-in for that exact stimulus usage. Fixed-image opt-in uses the safe one-option conversion path because reusable-image eligibility is represented on an exact Stimulus Option.

This separation supports cases where the same image has intrinsic reusable findings while still allowing Case-specific image questions whose answer depends on the surrounding vignette.

## 8. Shared Questions and Tags

A Shared Question is eligible for a selected production Case only when:

```text
Shared Question active
AND Prompt active + production-owned
AND Reuse Scope Tag active
AND selected Case explicitly has that Tag
```

Descriptive Shared Question Tags do not create eligibility. Topic ancestry does not infer Tag eligibility. V1 intentionally supports one Reuse Scope Tag rather than compound ANY/ALL expressions.

System↔Tag exposure controls learner navigation only; it does not itself create Shared Question eligibility.

## 9. Resolver precedence and selection

When the same Prompt is eligible from several sources, current precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for selected option
> stimulus group
> Case
> exact canonical Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The candidate pool is deduplicated by `question_prompt_id` after precedence.

Cases support:

- **Automatic** — normal target/cap plus stimulus-specific coverage;
- **All** — all deduplicated eligible questions;
- **Fixed** — configured count without exceeding it merely because reusable sources are eligible.

Original/Core versus Expanded Learning controls which source families enter this resolver; it is orthogonal to Case question-count mode.

## 10. Review snapshots and historical fidelity

A Review freezes what the learner actually saw. Current snapshot/provenance includes:

- Case title/vignette;
- primary and Study Topic provenance;
- effective System/Tag route plus learner-selected navigation route where applicable;
- fixed/selected media including `storage_key_snapshot`, caption, alt text, and source option/group IDs;
- Prompt/answer/order snapshots;
- contextual source IDs, including Shared Question and Asset Question identity;
- question-pool mode, reveal/completion/rating state.

For current Reviews, `study_concept_id` is the canonical Primary Topic. Historical Reviews may retain a former secondary Study Topic as historical provenance.

For reusable exact-image knowledge:

```text
source_type = asset
source_asset_question_id = <asset_questions.id>
```

For tag-shared knowledge:

```text
source_type = tag_shared
source_shared_question_id = <shared_questions.id>
```

Later edits, deactivation, option removal, taxonomy simplification, or Asset replacement never rewrite existing Review Prompt/answer/media snapshots.

## 11. Asset lifecycle, usage state, and replacement

Asset **Active/Inactive** status is distinct from derived Image Library usage state:

- **Current** — active Asset participates in an active production Case as a fixed image or active non-removed option in an active set;
- **Historical only** — no current use, but retained Case/option relationships, Review snapshots, Reusable Image Questions, or supersession lineage still require provenance;
- **Unused** — no current use and no retained historical/provenance dependency.

Preview relationships do not contribute to production lifecycle classification.

Higher-resolution replacement is deliberately narrow:

```text
same underlying image + better quality/resolution
→ create new immutable R2 object + new Asset
→ move current production relationships
→ clone Asset Questions and remap current opt-ins
→ old Asset becomes inactive and points to replacement via superseded_by_asset_id
```

The old R2 bytes remain for historical Reviews. A different image showing the same diagnosis is a separate Asset, not a replacement version.

Permanent Asset/R2 deletion remains out of scope.

## 12. Current Admin workflow

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
→ Images
→ Case questions
→ Preview
```

The Case editor supports browser-local Classic/Compact preference. Compact mode adds a structural completeness summary, responsive image strips, persistent Prompt/Answer review surfaces for current image-linked/set-wide questions, source previews, and a final **All questions in this Case** audit.

The route-level editor is decomposed into focused components under `src/lib/components/case-editor/`. Preview Admin continues to reuse this shared production editor surface while respecting Preview ownership restrictions.

## 13. Bounded read-model direction

Admin list/detail/dashboard reads are intentionally distinct:

```text
Dashboard → small aggregates + bounded work queue
Case detail → exact active production Case by ID
Case/Question libraries → SQL-filtered 60-row pages + visible-ID enrichment
```

The Questions search path preserves the previous Unicode-aware JavaScript matching semantics by verifying bounded SQL-prefiltered candidate batches rather than materialising the complete relationship graph.

Measurement/instrumentation exists through `Server-Timing` and small server-read timing records. Caching/index changes remain evidence-driven.

## 14. Reviewed imports and progressive enrichment

Production accepts strict Flash-Cards Import Package v1, not arbitrary APKG/PPTX/PDF input.

Anki and slide sources are reconstructed outside the production importer. The local slide-review tool edits the production-shaped manifest and deterministically finalizes an approved review bundle into the strict production package. Semantic PPTX/PDF reconstruction remains a separate upstream step.

For current Case classification, Import Package v1 may carry the legacy `secondaryTopicIds` field only as an empty compatibility array. Non-empty arrays are rejected by reviewed import and resumable staging/plan boundaries.

Content may begin as Topic/Case/fixed Assets/Case Questions and later gain Case Tags, Alternative Sets, Shared Questions, Reusable Image Questions, and image lifecycle refinements.

## 15. Preview Admin model and backend ownership

Preview uses a separate Worker but the same D1/R2 resources. Safety is **clone then mutate Preview-owned content**, not mutate production then roll back.

`src/lib/server/db/preview-workspace.js` remains the stable public façade. Current internal ownership includes:

```text
session.js      → Preview Session lookup/create/TTL
ownership.js    → ownership/security guards
errors.js       → PreviewWorkspaceError
input.js        → shared normalization
case.js         → production Case discovery, complete Case clone transaction, Preview Case lifecycle/Primary Topic
fixed-images.js → ongoing fixed-image reads, attach/bulk attach, caption, detach/normalize, reorder
```

The Case clone copies the canonical Primary Topic and Case Tags but deliberately does not recreate legacy secondary Topic rows. Preview does not gain global Tag/System authoring.

Alternative Set conversion/orchestration, question-domain operations, `ensurePreviewWorkspace()`, and workspace-wide cleanup remain in the façade pending later focused extraction.

Global Shared Questions, Reusable Image Questions, and higher-resolution Asset replacement remain production-only mutation domains.

## 16. Developer execution model

Repository work uses capability-based execution:

```text
usable checkout + commands → Local checkout mode
GitHub-only repository access → Remote GitHub mode
both → Hybrid mode
```

Local validation authority is exposed through `agent:doctor`, `agent:checks`, `validate:fast`, and `validate:full`; specialized runtime/slide-review checks are selected based on changed subsystems.

`npm run dev` and `npm run preview` use deterministic repository-owned launchers and repository-local Wrangler/XDG state. Local `npm run preview` is not Preview Worker deployment.

## 17. Current priorities

1. curate the real ECG/content corpus;
2. curate canonical Primary Topics, Case Tags, and System↔Tag exposure;
3. promote genuinely reusable Shared/Image Questions only where scope is proven;
4. add useful stimulus variants;
5. observe Admin/learner friction;
6. continue focused modularity/performance work where it reduces measured or reasoning cost;
7. implement learner-account administration;
8. implement basic learner-progress administration.

## 18. Deliberately deferred

Keep deferred until real evidence justifies them:

- compound/multiple Shared Question reuse scopes;
- Tag hierarchy/aliases and global Study-by-Tag outside contextual System navigation;
- Review Tag snapshots beyond current route/shared-question provenance and AI Tag inference;
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
