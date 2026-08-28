# Flash-Cards

Private, case-based medical learning application built on SvelteKit and Cloudflare.

_Last project-wide documentation refresh: 28 August 2026._

## Current status

Flash-Cards is a working private application whose repository can be ahead of the last explicitly verified production deployment. The project has **not yet been made available to learners**.

Established repository capabilities include:

- D1-backed Study and durable Review flows;
- Better Auth with private access and server-side role enforcement;
- private Cloudflare R2 teaching-image storage and authenticated serving;
- Production Admin CMS for Cases, Questions, Shared Questions, Images, Systems/Topics, Tags, and reviewed imports;
- exactly one canonical Primary Topic per current Case plus zero or more Case Tags;
- contextual System → Topic / exposed Tag / All learner navigation behind rollout control;
- fixed images plus independent Alternative Sets with exact-option/set-wide questions;
- Original/Core versus Expanded Learning question-pool selection;
- Automatic / All / Fixed Case question-count selection;
- tag-scoped Shared Questions and exact-Asset Reusable Image Questions;
- Image Management V2, Collections, lifecycle views, and same-image higher-resolution replacement;
- visual Systems & Topics taxonomy/Case-classification workspace;
- Production Case Active/Inactive lifecycle with preserved deactivation and validated restore;
- inline/bulk Case Tag curation and bulk Primary Topic assignment;
- strict reviewed Import Package v1 plus resumable/chunked execution;
- local slide-review/deterministic-finalizer tooling;
- local-first production-like D1/R2 development workflow;
- repository-owned coding-agent validation, including Draft-fast / Ready-full PR CI;
- first real ECG Anki corpus represented in production: **66/66 source notes**.

Do not infer deployment from repository state. Merge state, production D1 migration application, Worker deployment, taxonomy/content curation, learner-feature enablement, and explicit production verification are separate facts.

## Start with the documentation index

Read [`docs/DOCUMENTATION_INDEX.md`](docs/DOCUMENTATION_INDEX.md) before using older plans or implementation prompts.

For orientation:

1. [`docs/CURRENT_PRODUCT_ROADMAP.md`](docs/CURRENT_PRODUCT_ROADMAP.md)
2. [`docs/HANDOVER.md`](docs/HANDOVER.md)
3. [`docs/CURRENT_DESIGN.md`](docs/CURRENT_DESIGN.md)
4. [`docs/V1_SPEC.md`](docs/V1_SPEC.md)
5. [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md)
6. [`docs/AUTHORING_MODEL.md`](docs/AUTHORING_MODEL.md)
7. [`docs/CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md`](docs/CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md)

Coding agents should also read root [`AGENTS.md`](AGENTS.md) and [`docs/AGENT_TASK_MAP.md`](docs/AGENT_TASK_MAP.md).

## Product mental model

The learner-facing unit is a **Case**, not a permanently fixed front/back card.

```text
System
├── descendant Topics
└── explicitly exposed Tags

Case
├── exactly one behaviorally active Primary Topic
├── zero or more Case Tags
├── vignette
├── fixed Assets
├── zero or more Alternative Sets
│   └── one selected active, non-removed option per active group
└── contextual Questions
```

Terminology:

- **System** = top-level learner-navigation grouping.
- **Primary Topic** = what the Case fundamentally teaches and its direct reusable Topic-question context.
- **Case** = one coherent clinical presentation.
- **Tag** = flat cross-cutting clinical metadata; an exposed Tag may provide contextual learner discovery inside a System.
- **System↔Tag exposure** = global learner-navigation curation; it does not make the Tag belong to that System.
- **Asset** = reusable teaching media, currently images.
- **Collection** = Image Library organisation only.
- **Question Prompt** = reusable wording only.
- **Shared Question** = reusable medical meaning whose eligibility is controlled by one matching Case Reuse Scope Tag.
- **Reusable Image Question** = canonical question/answer intrinsic to one exact Asset and explicitly opted into each exact stimulus usage.

### Legacy secondary Topic rows

The historical schema still permits:

```text
case_concepts.role = primary | secondary
```

Current product behavior uses only `primary`.

Stored `secondary` rows are legacy compatibility data: current authoring/read models hide them, current learner routing ignores them, and current Admin/Preview/import paths do not create them. No cleanup migration is required merely to retire Additional Study Topics.

## Question authoring and resolution

Author questions at the broadest scope where the answer remains reliably correct:

```text
Topic Question
Case Question
Stimulus Group Question
Case-specific exact-image Question
Tag-scoped Shared Question
Reusable Image Question for one exact Asset
```

When the same Prompt is eligible from several sources, current precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for the selected option
> stimulus group
> Case
> exact canonical Primary Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final pool is deduplicated by `question_prompt_id`.

A Tag route does not substitute a second direct Topic bank: the Case's canonical Primary Topic remains direct Topic-question context for current Reviews.

## Question-pool versus count modes

These are separate decisions:

```text
Original/Core
→ Case + stimulus-owned question sources

Expanded Learning
→ Original/Core + Topic/ancestor + tag-shared + opted-in reusable Asset sources
```

Then the Case applies:

```text
Automatic | All | Fixed N
```

to the already eligible/deduplicated pool.

## Administrator surfaces

Production Admin includes:

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

Routine Case authoring is:

```text
choose/confirm Primary Topic
→ add clinically useful Case Tags
→ Case details
→ Images / Alternative Sets
→ contextual Questions
→ Preview
```

The Case Library also provides Active/Inactive lifecycle views, validated deactivate/restore, inline/bulk Case Tag curation, bulk Primary Topic assignment, and bounded filtering/pagination.

The Systems & Topics page is a visual tree/inspector workspace for taxonomy and Case classification. Topic hierarchy, Case Primary Topic, and Case Tag changes can coexist in one staged review and are submitted through one unified workspace apply action. All requested stale-state/preflight checks complete before the first canonical write; the underlying domain writers still run separately, so this is not one cross-domain serializable/rollback transaction. System↔Tag exposure remains a separate global System workflow.

The shared Case editor is implemented as focused components under `src/lib/components/case-editor/`; Preview Admin reuses that editor rather than maintaining a copy.

## Learner routing

Where System navigation is enabled:

```text
System → Topic
→ Cases whose canonical Primary Topic lies in that Topic/subtree

System → Tag
→ Cases carrying that explicitly exposed Tag
→ canonical Primary Topic remains direct Topic-question context

System → All
→ deduplicated union of native Topic and exposed-Tag reachability
```

Review snapshots preserve both effective route provenance and the learner-selected navigation route where applicable.

Historical/development Reviews created under the retired multi-Topic design may retain `study_concept_id != primary_concept_id`; those rows remain readable historical provenance and are not rewritten.

## Images and media

Learner images are served from private R2. External URLs are attribution/reference metadata, not runtime image sources.

Keep separate:

```text
Case stimulus relationship  → learner presentation semantics
Tag                         → clinical/educational metadata
Image Collection            → Admin organisation
Asset status                → Active / Inactive
Derived usage               → Current / Historical only / Unused
```

`Remove from Case` archives an alternative-option relationship; it is not Asset deletion. Higher-resolution replacement is restricted to a better-quality copy of the same underlying image and preserves historical bytes/provenance.

Permanent Asset/R2 deletion remains deliberately conservative and separate.

## Reviewed imports and source reconstruction

The Production application does not ingest arbitrary `.apkg`, PowerPoint, or PDF sources directly.

```text
source
→ external extraction / semantic reconstruction
→ human review
→ Flash-Cards Import Package v1
→ Admin validation + resumable import
→ post-import curation
```

Import Package v1 keeps the historical `secondaryTopicIds` Case field only as an empty compatibility array. Non-empty values are rejected.

For slide review, the machine-consumed review-map shape is owned by `tools/slide-import-review/schemas/review-map-v1.schema.json`; copied prose examples must not override that strict schema.

## Preview Admin

The Preview Worker uses the same Production D1/R2 resources, so safety comes from explicit ownership and route/data boundaries rather than a rollback model.

Preview follows **clone then mutate**. It copies the canonical Primary Topic and Case Tags but not legacy secondary Topic rows.

Since the local-first workflow decision, remote Preview is retained as an optional/safety-sensitive capability rather than the normal development integration gate. Further staged Preview backend decomposition is paused unless a concrete maintenance need reopens it.

## Developer validation

Repository-owned validation is the authority; do not maintain independent hard-coded test lists in each task prompt.

```text
Draft PR            → fast ordinary CI
Ready-for-Review PR → full ordinary CI
Draft → Ready       → full validation on the same PR head
same-PR newer run   → cancel superseded run
different PRs       → independent
```

Use root `AGENTS.md` and `docs/AGENT_TASK_MAP.md` for the current execution/validation contract.

## Technical stack

```text
SvelteKit
└── Cloudflare Workers
    ├── Better Auth
    ├── Drizzle ORM
    │   └── Cloudflare D1
    └── Cloudflare R2
```
