# Flash-Cards

Private, case-based medical learning application built on SvelteKit and Cloudflare.

_Last project-wide documentation refresh: 25 August 2026._

## Current status

Flash-Cards is a working private application whose repository can be ahead of the last explicitly verified production deployment. The project has **not yet been made available to learners**.

Established capabilities include:

- D1-backed Study and durable Review flows;
- Better Auth with private access and server-side role enforcement;
- private Cloudflare R2 teaching-image storage and authenticated serving;
- Production Admin CMS for Cases, Questions, Shared Questions, Images, Systems/Topics, Tags, and reviewed imports;
- one canonical Primary Topic per current Case plus contextual Case Tags;
- System → Topic / exposed Tag / All learner-navigation support behind the existing rollout boundary;
- fixed images plus independent Alternative Sets with exact-option/set-wide questions;
- Original/Core versus Expanded Learning question-pool selection;
- Automatic / All / Fixed Case question-count selection;
- tag-scoped Shared Questions and Reusable Image Questions;
- Image Management V2, Collections, lifecycle views, and same-image higher-resolution replacement;
- production-backed Preview Admin with explicit ownership/isolation;
- strict reviewed Import Package v1 plus resumable/chunked execution;
- first real ECG Anki corpus represented in production: **66/66 source notes**.

Do not infer deployment from repository state. Merge state, production D1 migration application, Worker deployment, taxonomy/content curation, learner-feature enablement, and explicit production verification are separate facts.

## Start with the documentation index

Read [`docs/DOCUMENTATION_INDEX.md`](docs/DOCUMENTATION_INDEX.md) before using older plans or decision records.

For orientation:

1. [`docs/CURRENT_PRODUCT_ROADMAP.md`](docs/CURRENT_PRODUCT_ROADMAP.md)
2. [`docs/HANDOVER.md`](docs/HANDOVER.md)
3. [`docs/CURRENT_DESIGN.md`](docs/CURRENT_DESIGN.md)
4. [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md)
5. [`docs/AUTHORING_MODEL.md`](docs/AUTHORING_MODEL.md)
6. [`docs/CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md`](docs/CONTEXTUAL_SYSTEM_TOPIC_TAG_NAVIGATION.md)

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
└── contextual questions
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
- **Reusable Image Question** = canonical question/answer intrinsic to one exact Asset and explicitly opted into each stimulus usage.

### Legacy secondary Topic rows

The historical schema still permits:

```text
case_concepts.role = primary | secondary
```

Current product behavior uses only `primary`.

Stored `secondary` rows are legacy compatibility data: current authoring/read models hide them, current learner routing ignores them, and current Admin/Preview/import/clone paths do not create them. **No cleanup migration is required merely to retire Additional Study Topics.**

Because learners have not yet been rolled out, clinically useful alternate discovery can be curated explicitly through Case Tags + System↔Tag exposure before launch rather than by migrating secondary rows.

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
> exact canonical Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final pool is deduplicated by `question_prompt_id`.

A Tag route does not substitute a second direct Topic bank: the Case's canonical Primary Topic remains `study_concept_id` for current Reviews. Matching Case Tags may independently make Shared Questions eligible.

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
→ contextual questions
→ Preview
```

Global System/Topic hierarchy and System↔Tag exposure are curated separately from the Case-local editor.

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

The production application does not ingest arbitrary `.apkg`, PowerPoint, or PDF sources directly.

```text
source
→ external extraction / semantic reconstruction
→ human review
→ Flash-Cards Import Package v1
→ Admin validation + resumable import
→ post-import curation
```

Import Package v1 keeps the historical `secondaryTopicIds` Case field only as an empty compatibility array. Non-empty values are rejected; the importer does not recreate retired Additional Study Topics. Case Tags and System↔Tag exposure are curated separately unless a future reviewed package contract explicitly adds them.

The initial ECG corpus is complete in production:

```text
Batch 01:                         13
Batch 02:                         51
Pre-existing mapped calcium:       2
                                  --
Source notes represented:         66 / 66
```

## Preview Admin

The Preview Worker uses the same production D1/R2 resources, so safety comes from explicit ownership and route/data boundaries rather than a rollback model.

Preview follows **clone then mutate**:

- clone copies the canonical Primary Topic and Case Tags;
- legacy secondary Topic rows are not recreated;
- Preview may replace its canonical Topic but cannot create Additional Study Topics;
- Case Tags/global Tags/System exposure remain read-only where required by the Preview contract;
- disposable rows carry `preview_session_id`;
- Preview uploads use `preview/<preview-session-id>/...`;
- Reset deletes only Preview-owned workspace data.

Global Shared Questions, Reusable Image Questions, and production Asset replacement remain production-curated operations.

## Technical stack

```text
SvelteKit
└── Cloudflare Workers
    ├── Better Auth
    ├── Drizzle ORM
    │   └── Cloudflare D1
    └── Cloudflare R2
```

Current repository learning-domain migrations run through:

```text
0015_contextual_system_topic_tag_navigation.sql
```

See `docs/V1_DATA_MODEL.md` for the exact ledger and semantics. There is intentionally no migration solely to remove the historical secondary Topic representation.

## Local development and coding-agent workflow

For a fresh local clone with production-like teaching content/media copied locally:

```sh
npm ci
npm run local:setup
npm run local:admin
npm run dev
```

Useful repository-owned commands include:

```sh
npm run agent:doctor
npm run agent:checks
npm run validate:fast
npm run validate:full
npm run local:stop
```

`npm run preview` is production-style **local** verification, not remote Preview Worker deployment. Remote GitHub-only agents must report GitHub CI evidence separately from locally executed commands.

See:

- [`docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`](docs/DEVELOPMENT_EXECUTION_WORKFLOW.md)
- [`docs/LOCAL_DEVELOPMENT_REPLICA.md`](docs/LOCAL_DEVELOPMENT_REPLICA.md)
- [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md)

## Current priorities

1. curate canonical Primary Topics, clinically useful Case Tags, and System↔Tag exposure before learner rollout;
2. promote genuinely reusable Shared Questions / Reusable Image Questions only where scope is proven;
3. add useful stimulus alternatives;
4. observe real Admin and later learner friction before expanding schema;
5. continue focused modularity/performance work where it reduces reasoning or measured runtime cost;
6. implement learner-account administration;
7. implement basic learner-progress administration.

Keep compound Tag reuse rules, Tag hierarchy/aliases, global/unscoped Study-by-Tag, FSRS, advanced analytics, AI inference, generic Asset families, permanent media deletion, and broader media taxonomy deferred until real evidence justifies them.
