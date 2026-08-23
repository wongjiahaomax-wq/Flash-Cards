# Flash-Cards

Private, case-based medical learning application built on SvelteKit and Cloudflare.

_Last project-wide documentation refresh: 24 August 2026._

## Current status

Flash-Cards is a working production application with a current `main` that is intentionally ahead of the last explicitly verified production baseline.

The explicitly recorded production baseline includes:

- D1-backed learner Study and durable Review flows;
- Better Auth with private access and server-side role enforcement;
- private Cloudflare R2 teaching-image storage and authenticated serving;
- a production Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags, and reviewed imports;
- multi-Topic Case study routes;
- fixed images plus independent alternative stimulus groups with exact-option and set-wide questions;
- configurable Case question selection (`automatic`, `all`, or `fixed`);
- Tagging Stage A and Stage B, including tag-scoped Shared Questions and Review provenance;
- Image Management V2 with Image Collections and bounded library operations;
- a production-backed Preview Admin workspace with explicit isolation rules;
- strict reviewed Import Package v1 plus resumable/chunked imports;
- the first real ECG Anki deck fully imported and production-verified: **66/66 source notes represented**.

Current `main` also contains later merged work including Reusable Image Questions, same-image higher-resolution Asset replacement, alternative-option archival/removal, Image Library lifecycle views, bounded Admin Case/Question read models, Compact Case-editor fast-review UX, hardened local/agent workflows, the Case-editor component decomposition, and the staged Preview-workspace backend decomposition through fixed-image operations.

Production Worker:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

Do not assume an arbitrary branch, merged PR, migration file, or rollout-trigger commit is deployed. Repository merge state, production D1 migration application, Worker deployment, and explicit production behavior verification are separate facts.

## Start with the documentation index

Read [`docs/DOCUMENTATION_INDEX.md`](docs/DOCUMENTATION_INDEX.md) before using older plans or decision records. It identifies current authoritative documents, subsystem contracts, operational runbooks, pending work, and historical records.

For a short project orientation, start with:

1. [`docs/CURRENT_PRODUCT_ROADMAP.md`](docs/CURRENT_PRODUCT_ROADMAP.md)
2. [`docs/HANDOVER.md`](docs/HANDOVER.md)
3. [`docs/CURRENT_DESIGN.md`](docs/CURRENT_DESIGN.md)
4. [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md)
5. [`docs/AUTHORING_MODEL.md`](docs/AUTHORING_MODEL.md)

Coding agents should also read root [`AGENTS.md`](AGENTS.md) and [`docs/AGENT_TASK_MAP.md`](docs/AGENT_TASK_MAP.md) to choose the smallest relevant context and the correct execution/validation mode.

## Product mental model

The learner-facing unit is a **Case**, not a permanently fixed front/back card.

```text
Topic / Study route
└── Case
    ├── vignette
    ├── fixed Assets
    ├── zero or more alternative stimulus groups
    │   └── one selected active, non-removed option per active group
    └── contextual questions

Cross-cutting metadata
├── Case Tags
└── contextual Question Tags

Global reusable knowledge
├── Shared Question
│   ├── reusable Question Prompt wording
│   ├── reusable answer
│   ├── exactly one Reuse Scope Tag
│   └── zero or more descriptive Tags
└── Reusable Image Question
    ├── one exact Asset
    ├── reusable Question Prompt wording
    ├── canonical Asset-specific answer
    └── explicit opt-in for each exact Case/stimulus usage
```

Terminology is deliberately separated:

- **Topic** = curated learner study route / hierarchy (`concepts`).
- **Case** = one coherent clinical presentation.
- **Tag** = flat cross-cutting clinical metadata and Shared Question reuse scope.
- **Asset** = reusable teaching media, currently images.
- **Collection** = Image Library organisation only; it has no learner-routing meaning.
- **Question Prompt** = reusable wording only.
- **Shared Question** = reusable medical meaning whose eligibility is controlled by one Reuse Scope Tag.
- **Reusable Image Question** = canonical question/answer intrinsic to one exact Asset and never automatically reused merely because the Asset appears in another Case.

A Case has exactly one primary/default Topic and may have additional Study Topics. The Topic through which the learner reaches a Case becomes the Review's Study Topic and supplies exact-Topic reusable questions for that Review.

## Question authoring and resolution

Questions should be authored at the broadest scope where the answer remains reliably correct. In the Case editor, the ordinary author-facing distinction is:

```text
Applies to this whole Case
Applies to a specific image / stimulus
```

Assigning exact-image teaching to a currently fixed image may transparently convert that Case relationship to a one-option active Stimulus Group while preserving the Asset and Case-specific caption.

When the same Question Prompt is available from several sources, current-main resolver precedence is:

```text
selected exact stimulus-option question
> explicitly reused Asset Question for the selected option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate pool is deduplicated by `question_prompt_id`, so the more contextual answer wins.

Shared Question eligibility requires an active production Prompt, active Shared Question, active Reuse Scope Tag, and an explicit matching Case Tag. Descriptive Shared Question Tags do not create eligibility. Reusable Image Questions require an explicit opt-in for the exact stimulus usage.

## Administrator surfaces

Production Admin currently includes:

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

Important current-main capabilities include:

- multi-Topic Case authoring and inline Topic creation from the Case editor;
- Case vignette and question authoring;
- fixed images and Alternative Sets;
- whole-Case, set-wide, Case-specific exact-image, and Reusable Image Questions;
- author-facing question scope changes between whole-Case and exact stimulus contexts;
- Case-specific captions, option movement, deactivation, and distinct **Remove from Case** archival semantics;
- Compact/Classic Case-editor layout preference, Compact fast-review summaries/image strips, and an **All questions in this Case** audit;
- Image Library search/filter/pagination, Collections, lifecycle filters, bounded selection/bulk operations, and oldest-first cleanup views;
- protected R2 upload, image provenance metadata, and narrow same-image higher-resolution replacement;
- strict reviewed-package preview/start/resume workflow.

Routine Case authoring remains:

```text
Topics → Case → Images → Case questions → Preview
```

The shared Case editor is now implemented as focused components under `src/lib/components/case-editor/`; the route remains the cross-section/server-data coordinator. Preview Admin continues to reuse the production editor rather than maintaining a separate copy.

## Learner workflow

```text
Sign in
  ↓
Choose Topic
  ↓
Resolve eligible Case and Study Topic
  ↓
Select fixed + active non-removed alternative stimuli
  ↓
Resolve and deduplicate eligible questions
  ↓
Apply Automatic / All / Fixed selection and coverage rules
  ↓
Snapshot the exact Review
  ↓
Reveal answers
  ↓
Again / Good
```

Review snapshots preserve the content the learner actually saw, including Case context, question wording/answers, stimulus references, order, source provenance, and historical media storage keys. Later content curation, image replacement, deactivation, or option removal does not rewrite completed Review meaning.

## Images and media organisation

Learner images are served from private R2. External URLs are attribution/reference metadata only and are never the runtime image source.

The model deliberately keeps separate:

```text
Case stimulus relationship  → learner presentation semantics
Tag                         → clinical/educational metadata
Image Collection            → Admin library organisation
Asset lifecycle status      → Active / Inactive
Derived usage state         → Current / Historical only / Unused
```

**Current** means an active Asset participates in an active production Case as a fixed image or through an active, non-removed option in an active Alternative Set. **Historical only** means no current use exists but retained relationships, Reviews, Reusable Image Questions, or supersession lineage still require provenance. **Unused** means neither current usage nor retained historical/provenance dependency exists. Preview relationships do not affect production lifecycle classification.

`Remove from Case` for an alternative option is relationship archival, not Asset deletion. Higher-resolution replacement is restricted to a better-quality copy of the same underlying image; it creates a new immutable R2 object/new Asset, preserves historical bytes/provenance, and records supersession rather than overwriting the old object.

Permanent Asset/R2 deletion remains intentionally separate and conservative.

## Reviewed imports and source reconstruction

The production application does not ingest arbitrary `.apkg`, PowerPoint, or PDF sources directly.

For Anki/APKG material:

```text
source
→ external extraction + clinical/content review
→ Flash-Cards Import Package v1
→ Admin preview of exact reviewed ZIP
→ resumable bounded import
→ post-import curation
```

For PowerPoint/PDF slide material, the repository also contains a local/offline review and deterministic-finalization toolchain. Semantic source reconstruction remains a separate upstream step; the local reviewer edits the actual production-shaped manifest and the deterministic finalizer emits the strict production package.

The initial ECG deck is complete in production:

```text
Batch 01 imported Cases/ECGs:      13
Batch 02 imported Cases/ECGs:      51
Pre-existing mapped calcium Cases:  2
                         ----
Source notes represented:          66 / 66
```

The next ECG work is curation/enrichment, not source migration.

## Preview Admin

The Preview Worker uses the same production D1 and R2 resources, so safety comes from explicit ownership and route/data boundaries rather than a second database or rollback model.

Preview follows **clone then mutate**:

- production objects are reused read-only where permitted;
- disposable Preview-owned rows carry `preview_session_id`;
- Preview uploads use `preview/<preview-session-id>/...`;
- Reset deletes only Preview-owned workspace data;
- production `/admin`, learner `/study`, and Better Auth Admin-plugin boundaries remain hard-blocked on the Preview Worker.

Global Shared Questions and Reusable Image Questions remain production-curated. Production-only higher-resolution replacement remains blocked in Preview.

The Preview backend keeps `src/lib/server/db/preview-workspace.js` as its public façade while focused internal modules own Session lifecycle, ownership/security guards, Case lifecycle/cloning, and fixed Case-image operations. Alternative Set and question-domain extraction remains staged follow-up work.

## Authentication roles

A combined owner identity with `admin,preview_admin` may use production Study and retain Preview Admin access. A Preview-only `preview_admin` identity is still blocked from production Study, and all `/study/**` routes remain blocked on the Preview Worker.

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
0013_review_assets_asset_lookup.sql
```

See `docs/V1_DATA_MODEL.md` for the exact ledger and semantics. Presence on `main` does not prove production application.

## Performance/read-model direction

Current `main` includes two focused read-model passes:

- `/admin` uses dashboard-specific aggregate/bounded reads and Case detail uses an exact Case-by-ID read;
- `/admin/cases` and `/admin/questions` use bounded 60-row server pages with SQL filtering/counting and page-only relationship enrichment.

The performance rule is: query less data, filter/bound in SQL, keep dashboard/list/detail/editor reads distinct, and use measurement before speculative caching/index work.

## Local development and coding-agent workflow

For a fresh local clone that should contain production-like teaching content and media locally:

```sh
npm ci
npm run local:setup
npm run local:admin
npm run dev
```

`npm run dev` and `npm run preview` use repository-owned launchers and repository-local Wrangler/XDG state so local development does not depend on a writable global Wrangler directory. `npm run preview` is a production-style **local** verification command; it is not Preview Worker deployment.

When production content changes, refresh the local copy with:

```sh
npm run local:refresh
```

Coding-agent execution is capability-based rather than device-based. With a usable checkout, start with:

```sh
npm run agent:doctor
npm run agent:checks
npm run validate:full
```

`agent:checks` identifies subsystem-specific validation such as `npm run runtime:smoke` or slide-review checks. Remote GitHub-only sessions must report CI evidence separately from locally executed commands.

See:

- [`docs/DEVELOPMENT_EXECUTION_WORKFLOW.md`](docs/DEVELOPMENT_EXECUTION_WORKFLOW.md)
- [`docs/LOCAL_DEVELOPMENT_REPLICA.md`](docs/LOCAL_DEVELOPMENT_REPLICA.md)
- [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md)

## Current priorities

The platform architecture and first ECG ingestion are working baselines. Current product work should prioritize:

1. curate the real ECG corpus with Case Tags and genuinely reusable Shared/Re\-usable Image Questions;
2. add additional Study Topics or stimulus alternatives only where they improve learning/authoring;
3. continue behavior-preserving modularity/performance work where it reduces future coding-agent reasoning cost or measured runtime cost;
4. observe real Admin and learner friction before expanding the schema;
5. implement the smallest useful learner-account administration workflow;
6. implement basic learner-progress administration.

Keep compound Tag reuse rules, Tag hierarchy/aliases, Study-by-Tag, FSRS, advanced analytics, AI inference, generic Asset families, permanent media deletion, and broader media taxonomy deferred until real evidence justifies them.
