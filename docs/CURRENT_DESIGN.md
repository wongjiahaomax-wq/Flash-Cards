# Flash-Cards — Current Design Summary

_Last updated: 18 August 2026_

This is the living design summary for Flash-Cards. For the shortest current-status view, read `CURRENT_PRODUCT_ROADMAP.md`; for implementation handover, read `HANDOVER.md`; for exact schema semantics, read `V1_DATA_MODEL.md`.

## 1. Product goal and current phase

Flash-Cards is a private medical learning application built around **Cases**, not permanently fixed front/back cards.

The platform baseline is implemented and deployed: learner Study/Review persistence, private teaching images, browser Admin content management, multi-Topic routing, optional stimulus groups, Tags, tag-scoped Shared Questions, reviewed/resumable imports, Preview Admin, and Image Management V2 are all in place.

The main constraint is no longer missing platform architecture. Current work should be driven by real content curation and observed learner/Admin friction.

The first ECG Anki source deck is fully represented in production: **66/66 source notes**. Ongoing ECG work is enrichment and medical/content review rather than source ingestion.

## 2. Four different organising concepts

Several names that sound similar have deliberately different semantics.

### Topic

A **Topic** is a curated learner study route and hierarchy. The database table is `concepts`.

Examples:

- Hypocalcaemia
- Prolonged QTc
- Cardiology
- Anterior STEMI

A Case has exactly one primary/default Topic and may have additional Study Topics through `case_concepts`.

### Case

A **Case** is one coherent clinical presentation/study unit.

It may contain:

- no vignette, for neutral image recognition;
- a clinical vignette;
- fixed images that always appear;
- one or more independent alternative stimulus groups;
- contextual questions.

Cases are not merged merely because they share a diagnosis or Tags. Different patients/presentations may remain different Cases.

### Tag

A **Tag** is flat, manually curated, cross-cutting clinical metadata.

Case Tags describe clinically meaningful concepts covered by the Case. Contextual Question Tags describe knowledge tested by that Question. Case Tags do not automatically become Question Tags.

Tags also support the current Shared Question reuse model, but they are not learner-navigation hierarchy in V1.

### Image Collection

A **Collection** is an Admin Image Library organisational bucket. An Asset may be in zero or one Collection; no Collection is shown as **Unsorted**.

Collections have no educational routing semantics. They do not change Topics, Tags, Case relationships, questions, learner selection, Review snapshots, or R2 identity.

## 3. The Case is the learner-facing study unit

The core learner model is:

```text
Choose Topic
    ↓
Resolve eligible Case + Study Topic
    ↓
Select fixed and alternative stimuli
    ↓
Resolve eligible questions
    ↓
Apply Case question-count/coverage rules
    ↓
Create immutable Review snapshots
    ↓
Learner reviews all parts
    ↓
Reveal answers
    ↓
Again / Good
```

The target examination permits movement between question parts, so later questions may provide clues to earlier ones. V1 does not gate question parts into diagnosis-first/management-later stages.

Internal diagnosis-bearing Case titles remain Admin-facing and are not exposed to learners when they would reveal the answer.

## 4. Multi-Topic Case routing

A Case can be a legitimate example of more than one Topic without being duplicated.

Example:

```text
Case: Post-thyroidectomy hypocalcaemia with prolonged QTc

Topics:
- Hypocalcaemia   [Default]
- Prolonged QTc   [Additional Study Topic]
```

The Case is stored once. Entering Study through either valid Topic may select the same Case. The actual Topic route used for that Review becomes `reviews.study_concept_id` and supplies exact-Topic reusable questions.

The primary/default Topic remains the canonical administrative classification and is also snapshotted separately as `primary_concept_id`.

Important validity rule:

> Attach a Topic as a study route only when every valid random configuration of the Case remains a legitimate example of that Topic.

A finding present only in one alternative image should normally remain exact-image teaching content rather than a Case-level Study Topic.

## 5. Assets and stimulus groups

An **Asset** is reusable teaching media. V1 learner rendering currently uses images.

An Asset does not inherently belong to one diagnosis or one Case. The same R2-backed Asset can be attached to several Cases without copying the object.

### Fixed stimuli

`case_assets` are shown whenever the Case is reviewed.

Several images that must be interpreted together belong in the same Case as ordered fixed stimuli.

### Alternative stimulus groups

`stimulus_groups` and `stimulus_group_options` model interchangeable examples inside one Case.

For each active group, one active option is selected when the Review begins and is frozen into Review provenance.

A Case may contain several independent groups, for example:

```text
Case
├── ECG alternatives — choose one
└── X-ray alternatives — choose one
```

Exact-option questions remain bound to the selected option. Set-wide questions remain bound to the group.

Image Management V2 also permits an existing option to move between active alternative sets in the same Case while preserving the stable option ID, caption, active state, and exact-option questions. Cross-Case moves are not inferred.

## 6. Reusable wording and contextual answers

`question_prompts` stores reusable wording only.

The same Prompt may be valid in several contexts with different answers. Answers therefore live on the relationship that supplies their educational context:

- `concept_questions` — Topic answer;
- `case_questions` — exact Case answer;
- `stimulus_group_questions` — set-wide answer;
- `stimulus_option_questions` — exact selected-option answer;
- `shared_questions` — reusable medical answer/meaning selected by one Reuse Scope Tag.

Example:

```text
Prompt: Describe this ECG.

Option A answer: Sinus rhythm with prolonged QTc.
Option B answer: Sinus rhythm with prolonged QTc and right bundle branch block.
```

The Prompt is reusable; the answer remains contextual.

## 7. Shared Questions and Tags

Tagging Stage B adds a dedicated reusable-knowledge object:

```text
question_prompts
= reusable wording only

shared_questions
= reusable answer/meaning
  + exactly one Reuse Scope Tag
  + active/archive state

shared_question_tags
= descriptive knowledge metadata only
```

A Shared Question is eligible for a selected production Case exactly when:

```text
Shared Question active
AND Prompt active
AND Prompt is production-owned
AND Reuse Scope Tag active
AND selected Case explicitly has that Tag
```

Descriptive Shared Question Tags do not create eligibility. Topic ancestry does not infer a Tag match. The Reuse Scope Tag is not automatically copied into descriptive Tags.

The current first implementation intentionally supports one Reuse Scope Tag rather than compound ANY/ALL expressions.

## 8. Question resolver precedence

Questions are attached at the broadest context where their answer remains reliably correct, but more contextual sources must override broad reusable knowledge when the same Prompt is available more than once.

Current precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The candidate pool is deduplicated by `question_prompt_id` after precedence is applied.

This lets a broadly reusable Shared Question or ancestor Topic Question exist without overriding an exact image/Case answer.

## 9. Question-count behavior

Cases support three selection modes:

- **Automatic** — existing target/cap behavior plus stimulus-specific coverage rules;
- **All** — all deduplicated eligible questions;
- **Fixed** — configured number of questions, without exceeding the requested count because additional sources are eligible.

Stimulus-specific coverage is a separate Case/group constraint. It should guarantee educationally important selected-stimulus questions only where configured, not force artificial variety across all source types.

## 10. Review snapshots and provenance

A Review preserves what the learner actually saw rather than depending on live content later.

Current Review data records/snapshots include:

- selected Case;
- canonical primary Topic and actual Study Topic;
- Case title/vignette snapshots;
- selected fixed/alternative Asset references and storage-key/caption/alt-text snapshots;
- selected Question Prompt/answer/order snapshots;
- source provenance for contextual questions;
- reveal/completion timestamps;
- whole-Case `Again` or `Good` rating.

For a selected Shared Question:

```text
source_type = 'tag_shared'
source_shared_question_id = <shared_questions.id>
```

Tag IDs themselves are not Review snapshots. They remain mutable curation metadata, while historical wording/answers/source-object identity remain stable.

## 11. Image storage, provenance, and library organisation

Learner-visible images are stored in private Cloudflare R2.

External source URLs are attribution/reference metadata only and are never runtime image sources.

Current teaching-image guardrails include:

- JPEG/PNG in the current upload path;
- 5 MiB maximum per image;
- application-managed 5 GiB storage ceiling;
- immutable production object keys;
- optional source label, source URL, and licence metadata;
- unknown provenance remains valid and must not be fabricated.

Image Management V2 adds scalable Admin library behaviour:

- server-backed pages of 60 Assets;
- exact matching counts;
- deterministic search/filter/sort pagination;
- explicit cross-page selection within one canonical query context;
- exact Select All up to 300 matching Assets;
- sequential server-safe chunks of at most 30 Asset IDs per mutation request;
- Image Collections with an explicit Unsorted state;
- same-Case alternative-option Move with identity preservation.

These are Admin/library operations, not learner stimulus semantics.

## 12. Current Admin workflow

Production Admin navigation is:

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

Routine Case authoring is intentionally presented as:

```text
Topics → Case → Images → Case questions → Preview
```

Administrators can author multi-Topic routes, fixed/alternative images, Case questions, Topic questions, contextual Tags, Shared Questions, and image metadata/Collections. Global Prompt edits remain protected by usage/blast-radius and stale-usage checks, including Shared Question usages.

The Admin shell is intentionally wide/responsive for library workflows while individual forms may remain narrower for readability.

## 13. Reviewed imports and progressive enrichment

The production app does not attempt to understand arbitrary Anki packages, OCR images, infer diagnoses, or generate taxonomy.

The supported migration boundary is:

```text
source deck/APKG
→ external extraction/normalization
→ clinical/content review
→ strict Flash-Cards Import Package v1
→ Admin preview + exact package confirmation
→ resumable bounded import
→ post-import curation
```

Import Package v1 intentionally remains independent of Tags. Content can enter as ordinary Topic/Case/Asset/questions and later gain:

- additional Study Topics;
- alternative stimulus groups;
- Case/Question Tags;
- Shared Questions;
- Image Collections.

This progressive-enrichment model was validated by the real ECG corpus and avoids requiring a complete ontology before useful content can be imported.

## 14. Initial ECG migration status

The original ECG source contained 66 notes/cards with 66 front-side ECG references.

Production verification on 18 August 2026 confirmed:

```text
Batch 01 imported Cases/ECGs:      13
Batch 02 imported Cases/ECGs:      51
Pre-existing mapped calcium Cases:  2
                         ----
Source notes represented:          66 / 66
```

Both reviewed import jobs completed with their reviewed package SHA-256 values and no recorded import error. The 64 imported Cases/ECG Assets/links and two pre-existing mapped calcium Cases were verified active/image-backed.

The initial source migration is complete. Future ECG work should improve clinical curation rather than re-import the same source.

## 15. Preview Admin model

Preview uses a separate Worker but the same D1 and R2 resources as production.

The safety model is **clone then mutate**, not “mutate production and roll back”. Preview-owned Cases/Prompts/Assets are marked by `preview_session_id`; Preview uploads use `preview/<preview-session-id>/...`.

Hard boundaries prevent the Preview Worker from becoming a general production Admin or learner endpoint. Production objects reused in Preview remain read-only where required.

Global Shared Questions deliberately have no Preview ownership and cannot be edited through Preview Admin.

Manual Preview deployment checks an exact trusted PR head and blocks candidate schema/migration/`wrangler.jsonc` changes. Restore Main to Preview returns the Preview Worker to current `main` after inspection.

## 16. Technical direction

```text
GitHub
└── SvelteKit
    └── Cloudflare Workers
        ├── Better Auth
        ├── Drizzle ORM
        │   └── Cloudflare D1
        └── Cloudflare R2
```

Current learning-domain migrations run through:

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
0004_resumable_import_jobs.sql
0005_tag_foundation.sql
0006_preview_admin_workspace.sql
0007_image_collections.sql
0008_tag_shared_questions.sql
```

There is no current reason to replace the Cloudflare stack while it satisfies the product needs.

## 17. Current product priorities

Current priority order is:

1. curate real ECG Case Tags;
2. promote genuinely reusable knowledge to Shared Questions where the prompt/answer remains reliable across the intended Reuse Scope;
3. add secondary Study Topics and stimulus alternatives where they improve learning rather than merely normalize data;
4. observe real Admin/learner friction;
5. implement the smallest learner-account Admin workflow;
6. implement basic learner-progress Admin.

## 18. Deliberately deferred

Keep these deferred until real evidence justifies them:

- compound/multiple Shared Question reuse scopes;
- Tag hierarchy and aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- FSRS/sophisticated scheduling;
- advanced analytics;
- WYSIWYG rich authoring;
- broad non-image stimulus/upload types;
- institutional multi-tenancy;
- payments, gamification, leaderboards, native apps, and offline mode.

The design principle remains: **extend the model because real content or learner behavior requires it, not because a theoretically complete taxonomy is possible.**
