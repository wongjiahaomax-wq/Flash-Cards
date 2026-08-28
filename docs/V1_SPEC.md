# Flash-Cards — Version 1 Specification

_Last updated: 28 August 2026_

## 1. Purpose and status

This document specifies the **current V1 product behavior represented by the repository**. It is not a production-deployment ledger. Use `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` for merged-versus-deployed status, and `V1_DATA_MODEL.md` for exact schema/relationship semantics.

Flash-Cards is a private case-based medical learning web application in which administrators curate structured teaching content and learners complete durable, reproducible Reviews.

The project has not yet been made available to learners. Learner rollout, production deployment, schema application, taxonomy/content curation, and behavior verification remain separate operational decisions.

## 2. Current V1 learner behavior

Where the relevant learner navigation is enabled, a learner can:

1. sign in;
2. choose a Topic, or a System → Topic / exposed Tag / All route;
3. receive an eligible active Production Case through its canonical Primary Topic or an exposed matching Case Tag;
4. see the vignette plus fixed images and one selected active, non-removed option from each active Alternative Set;
5. choose **Original/Core** or **Expanded Learning** for a new Review;
6. receive a valid deduplicated Question pool from the eligible source families for that mode;
7. reveal all answers;
8. rate the whole Case **Again** or **Good**;
9. continue studying;
10. have the exact attempt recorded with immutable Prompt/answer/media/navigation provenance.

A current new Review uses the Case's canonical Primary Topic as direct Topic-question context even when the Case was reached through an exposed Tag.

## 3. Current V1 administrator behavior

Production Admin currently supports:

- create/browse/edit Cases and learner-facing context;
- exactly one canonical Primary Topic per current Case;
- Case Tags for cross-cutting classification/contextual discovery;
- inline Topic creation/replacement from the Case editor;
- bulk Case Primary Topic assignment from the Case Library;
- inline and bulk Case Tag curation from the Case Library;
- global System/Topic hierarchy management and separate System↔Tag exposure;
- the visual Systems & Topics tree/inspector workspace, including staged Topic hierarchy, Case Primary Topic, and Case Tag changes with separate per-domain apply boundaries;
- Active/Inactive Case lifecycle views, safe deactivation, recovery inspection, and validated restore;
- whole-Case, Topic, set-wide, Case-specific exact-image, tag-scoped Shared, and exact-Asset Reusable Image Questions;
- reusable Prompt wording with usage/blast-radius protection;
- fixed image and Alternative Set/option authoring;
- explicit Reusable Image Question opt-in per exact stimulus usage;
- option Move, Deactivate, and distinct **Remove from Case** behavior;
- private R2 image upload/reuse, Image Collections, lifecycle filtering, bounded bulk operations, and narrow same-image higher-resolution replacement;
- strict reviewed Import Package v1 preview/start/resume workflows;
- Classic/Compact Case-editor layout, Compact fast-review surfaces, and final **All questions in this Case** audit.

Additional Study Topics are **not** a current authoring feature. Historical `case_concepts.role = 'secondary'` rows may remain in storage as compatibility data, but current Admin/read/import/Preview/learner paths do not use them as active classification or create new secondary relationships.

Routine learner-account administration and learner-progress administration are not yet part of the merged V1 Admin baseline. `ACCOUNT_MANAGEMENT_PLAN.md` is design context, not proof that its implementation prompts have merged.

Permanent destructive Asset/R2 deletion also remains intentionally separate.

## 4. Technical stack and migration boundary

```text
SvelteKit
└── Cloudflare Workers
    ├── Better Auth
    ├── Drizzle ORM → Cloudflare D1
    └── private media service → Cloudflare R2
```

Current repository learning-domain migrations extend through:

```text
0015_contextual_system_topic_tag_navigation.sql
```

There is intentionally no additional migration solely for retiring Additional Study Topics. The physical `primary | secondary` compatibility shape remains; only Primary relationships participate in current Case behavior.

Repository presence of a migration is not proof of production application.

## 5. Authentication and roles

Public self-registration is disabled.

Current role concepts include:

- `admin` — Production Admin CMS;
- `user` — normal learner;
- `preview_admin` — Preview Admin when `PREVIEW_MODE=true`.

The owner may hold `admin,preview_admin`. Production and Preview Workers use separate Better Auth secrets/sessions even when the underlying identity is shared.

Important server-side boundaries include:

```text
Preview Worker /admin/**          → forbidden
Preview Worker /study/**          → forbidden
Preview Worker /api/auth/admin/** → forbidden

preview-only preview_admin on production /study/** → forbidden
combined admin,preview_admin on production /study/** → allowed
```

UI hiding is not the authorization boundary.

## 6. Core content model

```text
System
└── Topic hierarchy
    └── Case
        ├── exactly one Primary Topic relationship
        ├── zero or more Case Tags
        ├── fixed Assets
        ├── zero or more Alternative Sets
        │   └── Stimulus Options
        └── contextual Questions
```

Definitions:

- **System** — top-level learner-navigation grouping.
- **Topic** — canonical educational home/direct reusable Topic-question scope for a Case.
- **Case** — one coherent clinical presentation/study unit.
- **Tag** — flat manually curated cross-cutting metadata; may support Shared Question eligibility and contextual discovery.
- **Asset** — one exact reusable teaching-media identity; current learner media is image-based.
- **Collection** — Image Library organisation only.
- **Question Prompt** — reusable wording only; no universal answer.
- **Shared Question** — reusable medical/teaching meaning controlled by exactly one Reuse Scope Tag.
- **Reusable Image Question** — canonical question/answer intrinsic to one exact Asset, requiring explicit opt-in per exact stimulus usage.

System↔Tag exposure determines contextual learner navigation; it does not make a Tag belong to a System and does not itself make a Shared Question eligible.

## 7. Primary Topic and contextual Tag routing

A current learner-presentable Case has exactly one behaviorally active Primary Topic.

### Topic route

Topic routes use Primary Case↔Topic relationships only, including descendant Topic hierarchy semantics.

```text
primary_concept_id = canonical Primary Topic
study_concept_id   = canonical Primary Topic
route_type         = topic
```

### Tag route

A contextual Tag route requires:

```text
Case has selected Tag
AND selected System exposes that Tag
```

The Tag supplies route provenance, not a substitute Topic bank:

```text
primary_concept_id = canonical Primary Topic
study_concept_id   = canonical Primary Topic
route_type         = tag
study_tag_id       = selected Tag
```

### System → All

`All` is the deduplicated union of native descendant Primary-Topic reachability and exposed Tag reachability. When the same Case is reachable both ways, native canonical Topic provenance wins while learner-selected `navigation_route_type = all` remains separately snapshotted.

Historical Reviews created under the retired multi-Topic design may retain `study_concept_id != primary_concept_id`; those rows remain historical truth and are not rewritten.

## 8. Images, Alternative Sets, and lifecycle distinctions

Fixed `case_assets` appear whenever the Case is reviewed.

Each active Alternative Set selects one active, non-removed option when a Review starts and freezes that selection into Review provenance.

Keep these states distinct:

```text
Option Deactivate
→ relationship stays in normal authoring; exclude from learner selection

Option Remove from Case
→ archive relationship from current authoring/selection; preserve identity/history

Asset Active/Inactive
→ global Asset lifecycle state

Asset Current/Historical only/Unused
→ derived production usage classification

Same-image higher-resolution replacement
→ new immutable Asset/R2 object; preserve historical bytes/provenance

Permanent Asset/R2 deletion
→ separate, not routine V1 behavior
```

A different ECG/X-ray/photo/diagram showing the same diagnosis is a separate Asset, not a higher-resolution replacement.

## 9. Question scope, eligibility, and precedence

Answers live at the context where they remain correct:

- Topic Question;
- whole-Case Question;
- set-wide Stimulus Group Question;
- Case-specific exact Stimulus Option Question;
- tag-scoped Shared Question;
- exact-Asset Reusable Image Question.

Normal Case-editor scope choice is:

```text
Applies to this whole Case
Applies to a specific image / stimulus
```

A fixed image targeted for exact-image teaching may be atomically converted to a one-option active Stimulus Group while preserving Asset identity/caption/effective visibility.

Shared Question eligibility requires an active Shared Question/Prompt/Reuse Scope Tag and explicit matching Case Tag membership. Topic ancestry and System↔Tag exposure do not infer membership.

Reusable Image Question eligibility requires an active canonical Asset Question plus explicit opt-in for the exact selected stimulus usage.

When the same Prompt ID is eligible from several sources, current precedence is:

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

The final candidate set is deduplicated by `question_prompt_id`.

A cross-Stimulus-Group invariant prevents the same Prompt becoming independently stimulus-specific in multiple active groups that may both be selected in one Review.

## 10. Question pool mode versus Case count mode

These are orthogonal.

```text
Original/Core
→ Case
→ Stimulus Group
→ Stimulus Option

Expanded Learning
→ all Original/Core sources
→ direct/ancestor Topic
→ tag-shared
→ explicitly opted-in Asset Questions
```

Then the Case applies:

```text
Automatic | All | Fixed N
```

to the already eligible/deduplicated pool.

The question-pool mode is chosen for each new Review and snapshotted on that Review; it is not a permanent learner preference.

## 11. Review historical fidelity

Review creation resolves Case, canonical Study Topic, effective/selected navigation provenance, stimuli, Questions, answers, order, and source provenance before learner interaction.

Review data freezes what the learner actually saw, including:

- Case title/vignette;
- primary and Study Topic provenance;
- effective System/Tag route and learner-selected navigation route where applicable;
- fixed/selected media with storage-key/caption/alt-text snapshots;
- Prompt/answer/order snapshots;
- question-pool mode;
- contextual source IDs including Shared Question and Asset Question provenance.

Later authoring, deactivation, option removal, taxonomy changes, or Asset replacement do not rewrite existing Review snapshots.

## 12. Production Admin taxonomy workspace

`/admin/topics` is now one visual tree + inspector workspace rather than the former duplicated flat taxonomy/hierarchy-manager presentation.

Current behavior includes:

- Systems as top-level roots;
- arbitrarily nested Topics;
- contextual System/Topic/subtopic creation;
- direct Case visibility by canonical Primary Topic;
- staged Topic hierarchy moves;
- staged Case Primary Topic changes, including bounded bulk changes;
- staged Case Tag additions/removals;
- expected-state preflight before canonical mutation functions;
- separate mutation-domain apply semantics.

The implementation does **not** claim one atomic transaction across hierarchy + Primary Topic + Case Tags. A pending batch must be applied/discarded before another mutation domain is staged.

System↔Tag exposure remains a separate System-level workflow.

## 13. Production Case lifecycle and Case Library

Current Case lifecycle is:

```text
Active Production Case
→ Deactivate
→ Inactive Production Case, fully preserved
→ validated Restore
→ Active Production Case
```

Deactivate changes only `cases.is_active`; it does not delete teaching content/media/relationships/history.

Restore validates Production ownership plus exactly one active canonical Primary Topic classified as a Topic. Recovery remains compatible with pre-migration-0015 databases through the taxonomy compatibility layer.

The Case Library currently supports:

- Active / Inactive views;
- bounded server-side filtering/sorting/pagination;
- explicit Search/Enter submission for Case/Topic/System text filters rather than navigation on each typing pause;
- lifecycle-correct Tag filtering;
- bulk Primary Topic assignment;
- single/bulk deactivate and restore;
- inline active-Case Tag add/remove/create-and-attach;
- bulk Case Tag All/Some/None state with add/remove/create-and-add.

Bulk Case mutations use the established maximum of 60 unique Cases where that domain specifies the 60-Case limit and fail closed on invalid Production/lifecycle membership.

## 14. Image Library behavior

Current Image Library behavior includes:

- 60-item server-backed pages;
- exact matching totals;
- deterministic search/filter/sort;
- Active/Inactive and Current/Historical only/Unused filtering;
- source/Topic/Collection context;
- bounded cross-page selection/bulk operations;
- Image Collection management;
- same-Case option Move;
- lifecycle-oriented cleanup views;
- narrow same-image higher-resolution replacement.

These features do not physically delete Assets/R2 objects.

## 15. Bounded read-model direction

Current repository code uses page-specific read models:

- `/admin` → aggregate counts + bounded Case work queue;
- Case detail → exact active Production Case by ID;
- `/admin/cases` → 60-row SQL-filtered/count page + visible-ID enrichment;
- `/admin/questions` → 60-row bounded Prompt page with bounded Unicode-aware search verification;
- taxonomy workspace → Primary-Topic-only current Case coverage/detail reads.

PR #102 additionally removed the active Case Library's previous duplicate compatible-taxonomy supporting read and stopped text-filter auto-navigation while typing.

Performance work remains measurement-driven. Do not introduce cache/index frameworks solely for theoretical completeness.

## 16. Reviewed Import Package v1

Production accepts a strict reviewed Flash-Cards package, not arbitrary Anki/PPTX/PDF input.

```text
source
→ external extraction / semantic reconstruction
→ human review
→ deterministic finalization
→ Flash-Cards Import Package v1
→ Production Admin resumable importer
```

The historical `secondaryTopicIds` Case field remains accepted only as an empty compatibility array. Non-empty values are rejected by current reviewed parsing and resumable staging/plan boundaries.

For slide review, the executable authorities are:

```text
src/lib/server/import/content-package.js
tools/slide-import-review/schemas/review-map-v1.schema.json
```

The review-map schema is strict and rejects unknown fields.

## 17. Preview Admin

Preview uses a separate Worker with the same D1/R2 resources as Production, so safety relies on explicit ownership and hard request/data boundaries.

Preview follows **clone then mutate Preview-owned content**. A clone copies the canonical Primary Topic and Case Tags but not legacy secondary Topic rows.

Global Systems/Topics/Tags, Shared Questions, Reusable Image Questions, and Production Asset replacement remain Production-curated mutation domains.

The public Preview DB façade remains `src/lib/server/db/preview-workspace.js`. Internal decomposition through Session/ownership, Case lifecycle/cloning, and fixed-image operations is complete through PRs #80/#82/#83.

Further staged Preview backend decomposition is **paused**, not pending required work. Since PR #92, the normal development/testing path is local-first. Do not resume the former PR2D/PR2E/PR2F sequence merely to finish it.

## 18. Developer/CI execution model

Repository work uses capability-based execution:

```text
usable checkout + commands → Local checkout mode
GitHub-only access          → Remote GitHub mode
both                        → Hybrid mode
```

Repository-owned validation authority is exposed through:

```text
npm run agent:doctor
npm run agent:checks
npm run validate:fast
npm run validate:full
```

PR #106 establishes ordinary PR CI behavior:

```text
Draft PR            → fast validation
Ready-for-Review PR → full validation
Draft → Ready       → full validation on the same head
same-PR newer run   → cancel superseded run
different PRs       → independent
```

The ordinary status/job remains `check`. Fast/full composition is owned by `scripts/validation-contract.mjs`; CI state/orchestration is owned by `.github/workflows/ci.yml` and `scripts/validate-ci.mjs`.

Specialized runtime/slide-review checks remain separate where required by the task map.

## 19. Current V1 acceptance standard

A current regression/acceptance exercise should include:

- exactly one canonical Primary Topic per current Case;
- legacy secondary Topic rows remaining inert/hidden;
- Case Tags plus System↔Tag contextual discovery;
- System → Topic / Tag / All route behavior and deduplication;
- fixed and alternative stimuli;
- active, inactive, and removed option behavior;
- overlapping Prompt precedence across contextual/reusable sources;
- Original/Core and Expanded Learning source eligibility;
- Automatic, All, and Fixed Case modes;
- immutable Review Prompt/answer/media/navigation snapshots;
- Production Admin vs learner vs Preview authorization;
- Preview isolation for Preview-tested workflows;
- reviewed/resumable import rejection of non-empty `secondaryTopicIds`;
- Systems & Topics staged mutation-domain behavior;
- Case deactivate/recovery/restore preservation and validation;
- inline/bulk Case Tag and bulk Primary Topic behavior;
- Case Library no-navigation-while-typing baseline;
- same-image replacement historical fidelity where that subsystem changes.

Repository implementation work should use the repository-owned validation workflow rather than copying an independent command list here.

## 20. Next V1 increments

1. curate canonical Primary Topics, Case Tags, System↔Tag exposure, Shared/Image Questions, and useful stimulus variants;
2. user-test the merged taxonomy/lifecycle/Case Library workflows with real content;
3. finish the Account Management v1 implementation from the separately reviewed design;
4. add basic learner-progress Admin;
5. continue focused maintainability/performance work when evidence justifies it.

Existing secondary rows do not need to be deleted before learner rollout. If cleanup is ever useful, treat it as a separate reviewed data operation.

## 21. Deferred beyond current V1

Unless real evidence creates a requirement, defer:

- revival of Additional Study Topics;
- compound/multiple Shared Question reuse scopes;
- Tag hierarchy/aliases and unscoped global Study-by-Tag;
- AI/automatic clinical classification without reviewed workflow;
- Asset Tags;
- permanent destructive media deletion;
- generic Asset-family/version-history architecture;
- FSRS/sophisticated scheduling;
- advanced cohort analytics;
- automated free-text marking/per-question rating;
- branching/gated question flows;
- WYSIWYG authoring;
- broad non-image upload types;
- gamification, payments, native apps, offline mode, institutional multi-tenancy.
