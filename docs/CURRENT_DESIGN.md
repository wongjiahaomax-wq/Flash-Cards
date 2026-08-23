# Flash-Cards — Current Design Summary

_Last updated: 24 August 2026_

This is the living product/design summary for current `main`. For status read `CURRENT_PRODUCT_ROADMAP.md`; for implementation handover read `HANDOVER.md`; for exact schema semantics read `V1_DATA_MODEL.md`.

## 1. Product phase

Flash-Cards is a private medical learning application built around **Cases**, not permanently fixed front/back cards.

The platform baseline is established: learner Study/Review persistence, private teaching images, browser Admin content management, multi-Topic routing, optional stimulus groups, Tags, tag-scoped Shared Questions, Reusable Image Questions, reviewed/resumable imports, Preview Admin, Image Management V2, and a verified first ECG corpus.

Current engineering work is increasingly about content curation, authoring ergonomics, bounded read models, and behavior-preserving modularity rather than adding broad new architecture.

The first ECG Anki source deck is fully represented in production: **66/66 source notes**. Ongoing ECG work is enrichment and medical/content review.

## 2. Organising concepts remain distinct

### Topic

A **Topic** (`concepts`) is a curated learner study route/hierarchy. A Case has exactly one primary/default Topic and may have Additional Study Topics through `case_concepts`.

### Case

A **Case** is one coherent clinical presentation/study unit. It may contain a vignette, fixed images, zero or more independent Alternative Sets, and contextual questions.

### Tag

A **Tag** is flat, manually curated, cross-cutting clinical metadata. Case Tags can also control Shared Question eligibility through an explicit Reuse Scope Tag.

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
Choose Topic
    ↓
Resolve eligible Case + Study Topic
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

## 4. Multi-Topic routing

A Case is stored once even when it is a legitimate example of several Study Topics. The actual Topic route used for the Review becomes `reviews.study_concept_id`; the canonical primary Topic is separately snapshotted as `primary_concept_id`.

Attach an Additional Study Topic only when every valid random configuration of the Case remains a legitimate example of that Topic. A finding specific to one alternative image usually belongs to exact-image teaching rather than Case-level routing.

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

## 9. Resolver precedence and selection

When the same Prompt is eligible from several sources, current-main precedence is:

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

The candidate pool is deduplicated by `question_prompt_id` after precedence.

Cases support:

- **Automatic** — normal target/cap plus stimulus-specific coverage;
- **All** — all deduplicated eligible questions;
- **Fixed** — configured count without exceeding it merely because reusable sources are eligible.

## 10. Review snapshots and historical fidelity

A Review freezes what the learner actually saw. Current snapshot/provenance includes:

- Case title/vignette;
- primary and actual Study Topic;
- fixed/selected media including `storage_key_snapshot`, caption, alt text, and source option/group IDs;
- Prompt/answer/order snapshots;
- contextual source IDs, including Shared Question and Asset Question identity;
- reveal/completion/rating state.

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

Later edits, deactivation, option removal, or Asset replacement never rewrite existing Review Prompt/answer/media snapshots.

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

Production navigation remains:

```text
Dashboard
Cases
Questions
Shared Questions
Images
Topics
Tags
Import package
```

Routine Case authoring remains:

```text
Topics → Case → Images → Case questions → Preview
```

The Case editor supports browser-local Classic/Compact preference. Compact mode adds a structural completeness summary, responsive image strips, persistent Prompt/Answer review surfaces for current image-linked/set-wide questions, source previews, and a final **All questions in this Case** audit.

The large route has been decomposed without changing behavior. `src/routes/admin/cases/[caseId]/+page.svelte` remains the route-level coordinator while focused components under `src/lib/components/case-editor/` own header/navigation, Topics, Case details, Images, Case Questions, image picker, and Preview sections. Preview Admin continues to reuse this shared production editor surface.

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

Anki and slide sources are reconstructed outside the production importer. The local slide-review tool edits the real production-shaped manifest and deterministically finalizes an approved review bundle into the strict production package. Semantic PPTX/PDF reconstruction is still a separate upstream step.

Import Package v1 stays conservative: content may begin as Topic/Case/fixed Assets/Case Questions and later gain Study Topics, Alternative Sets, Tags, Shared Questions, Reusable Image Questions, and image lifecycle refinements.

## 15. Preview Admin model and backend ownership

Preview uses a separate Worker but the same D1/R2 resources. Safety is **clone then mutate Preview-owned content**, not mutate production then roll back.

`src/lib/server/db/preview-workspace.js` remains the stable public façade. Current internal ownership is:

```text
session.js      → Preview Session lookup/create/TTL
ownership.js    → ownership/security guards
errors.js       → PreviewWorkspaceError
input.js        → shared normalization
case.js         → production Case discovery, complete Case clone transaction, Preview Case lifecycle/Topics
fixed-images.js → ongoing fixed-image reads, attach/bulk attach, caption, detach/normalize, reorder
```

`case.js` deliberately retains clone-time copying of fixed Case assets because the complete Case clone is one transaction. Alternative Set conversion/orchestration, question-domain operations, `ensurePreviewWorkspace()`, and workspace-wide cleanup remain in the façade pending later focused extraction.

Global Shared Questions, Reusable Image Questions, and higher-resolution Asset replacement remain production-only mutation domains.

## 16. Developer execution model

Repository work now uses capability-based execution:

```text
usable checkout + commands → Local checkout mode
GitHub-only repository access → Remote GitHub mode
both → Hybrid mode
```

Local validation authority is exposed through `agent:doctor`, `agent:checks`, `validate:fast`, and `validate:full`; specialized runtime/slide-review checks are selected based on changed subsystems.

`npm run dev` and `npm run preview` use deterministic repository-owned launchers and repository-local Wrangler/XDG state. Local `npm run preview` is not Preview Worker deployment.

## 17. Current priorities

1. curate the real ECG/content corpus;
2. promote genuinely reusable Shared/Image Questions only where scope is proven;
3. add useful Study Topics/stimulus variants;
4. observe Admin/learner friction;
5. continue focused modularity/performance work where it reduces measured or reasoning cost;
6. implement learner-account administration;
7. implement basic learner-progress administration.

## 18. Deliberately deferred

Keep deferred until real evidence justifies them:

- compound/multiple Shared Question reuse scopes;
- Tag hierarchy/aliases and Study-by-Tag;
- Review Tag snapshots and AI Tag inference;
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
