# Flash-Cards

Private, case-based medical learning application built on SvelteKit and Cloudflare.

_Last project-wide documentation refresh: 19 August 2026._

## Current status

Flash-Cards is now a working production application rather than an early prototype. The deployed baseline includes:

- D1-backed learner Study and Review flows;
- Better Auth with private access and server-side role enforcement;
- private Cloudflare R2 teaching-image storage and authenticated serving;
- a production Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags, and reviewed imports;
- multi-Topic Case study routes;
- fixed images plus independent alternative stimulus groups with exact-option and set-wide questions;
- configurable Case question selection (`automatic`, `all`, or `fixed`);
- Tagging Stage A and Stage B, including tag-scoped Shared Questions and Review provenance;
- Image Management V2, including Image Collections, server-backed pagination, bounded cross-page bulk selection, and identity-preserving same-Case stimulus-option moves;
- a production-backed Preview Admin workspace with explicit isolation rules;
- strict reviewed Import Package v1 plus resumable/chunked browser-orchestrated imports;
- the first real ECG Anki deck fully imported and production-verified: **66/66 source notes represented**.

Production Worker:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

Do not assume an arbitrary branch or open PR is deployed. Deployment and migration state must be verified explicitly.

## Start with the documentation index

Read [`docs/DOCUMENTATION_INDEX.md`](docs/DOCUMENTATION_INDEX.md) before using older plans or decision records. It identifies the current authoritative documents, subsystem contracts, operational runbooks, and historical records.

For a short project status, start with:

1. [`docs/CURRENT_PRODUCT_ROADMAP.md`](docs/CURRENT_PRODUCT_ROADMAP.md)
2. [`docs/HANDOVER.md`](docs/HANDOVER.md)
3. [`docs/CURRENT_DESIGN.md`](docs/CURRENT_DESIGN.md)
4. [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md)
5. [`docs/AUTHORING_MODEL.md`](docs/AUTHORING_MODEL.md)

## Product mental model

The learner-facing unit is a **Case**, not a permanently fixed front/back card.

```text
Topic / Study route
└── Case
    ├── vignette
    ├── fixed Assets
    ├── zero or more alternative stimulus groups
    │   └── one selected option per active group
    └── contextual questions

Cross-cutting metadata
├── Case Tags
└── contextual Question Tags

Global reusable knowledge
└── Shared Question
    ├── reusable Question Prompt wording
    ├── reusable answer
    ├── exactly one Reuse Scope Tag
    └── zero or more descriptive Tags
```

Terminology is deliberately separated:

- **Topic** = curated learner study route / hierarchy (`concepts`).
- **Case** = one coherent clinical presentation.
- **Tag** = flat cross-cutting clinical metadata and Shared Question reuse scope.
- **Asset** = reusable teaching media, currently images.
- **Collection** = Image Library organisation only; it has no learner-routing meaning.
- **Question Prompt** = reusable wording only.
- **Shared Question** = reusable medical answer/meaning whose eligibility is controlled by one Reuse Scope Tag.

A Case has exactly one primary/default Topic and may have additional Study Topics. The Topic through which the learner reaches a Case becomes the Review's Study Topic and supplies exact-Topic reusable questions for that Review.

## Question resolution

Questions should be authored at the broadest scope where the answer remains reliably correct. When the same Question Prompt is available from several sources, the current resolver precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant eligible ancestors
```

The final candidate pool is deduplicated by `question_prompt_id`, so the more contextual answer wins.

Shared Question eligibility is exact: the Shared Question and its production Prompt must be active, its Reuse Scope Tag must be active, and the selected Case must explicitly have that Tag. Descriptive Shared Question Tags do not create eligibility, and Topic ancestry does not infer Tag matches.

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

Important current capabilities include:

- multi-Topic Case authoring;
- Case vignette and question authoring;
- fixed-image and alternative-image-set authoring;
- exact-image and set-wide contextual questions;
- reusable Topic questions;
- Case and contextual Question Tags;
- Shared Question authoring with separate Reuse Scope and descriptive Tags;
- Image Library search/filter/pagination, Collections, exact bounded Select All, and sequential bulk operations;
- protected R2 image upload and provenance metadata;
- strict reviewed-package preview/start/resume workflow.

Routine Case authoring should feel like:

```text
Topics → Case → Images → Case questions → Preview
```

Advanced stimulus and reuse controls should refine that workflow rather than replace it.

## Learner workflow

```text
Sign in
  ↓
Choose Topic
  ↓
Resolve an eligible Case and Study Topic
  ↓
Select fixed + alternative stimuli
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

Review snapshots preserve the content the learner actually saw, including Case context, question wording/answers, stimulus references, order, and source provenance. Later content curation does not rewrite completed Review meaning.

## Images and media organisation

Learner images are served from private R2. External URLs are attribution/reference metadata only and are never the runtime image source.

The model deliberately keeps three concepts separate:

```text
Case stimulus relationship  → learner presentation semantics
Tag                         → clinical/educational metadata
Image Collection            → Admin library organisation
```

An Asset can be reused across Cases without duplicating its R2 object. A Collection never changes Case relationships, Topic routing, Tags, questions, Reviews, or R2 identity.

The Image Library keeps Asset status separate from derived usage state:

- **Asset status** is the independently managed **Active** / **Inactive** lifecycle. It controls whether an image is available for current learner use and future authoring.
- **Current** means an active Asset participates in an active production Case: either as a fixed attachment, or through an active alternative set and active, non-removed option.
- **Historical only** means there is no current use, but a retained production relationship, Review snapshot, reusable Asset Question, or Asset-supersession relationship still provides provenance and requires the Asset record.
- **Unused** means neither a current use nor a retained historical/provenance dependency exists.

Usage state is calculated from relationships; it is not a manually stored Asset flag. Preview-session relationships do not affect production Image Library classification. Historical-only and unused views are cleanup aids, not permanent deletion controls—removing Asset records and R2 objects requires a separate conservative workflow.

## Reviewed imports and Anki migration

The production application does not ingest arbitrary `.apkg` files directly. The supported path is:

```text
Anki/APKG source
→ external extraction + clinical/content review
→ Flash-Cards Import Package v1
→ Admin preview of exact reviewed ZIP
→ resumable bounded import
→ post-import curation
```

Import Package v1 remains deliberately conservative and does not require Tags. Tags, additional Study Topics, stimulus alternatives, and Shared Questions can be added progressively after ingestion.

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

Global Shared Questions are production-curated and are not Preview-owned.

## Technical stack

```text
SvelteKit
└── Cloudflare Workers
    ├── Better Auth
    ├── Drizzle ORM
    │   └── Cloudflare D1
    └── Cloudflare R2
```

Current learning-domain migrations run through `0008_tag_shared_questions.sql`; see [`docs/HANDOVER.md`](docs/HANDOVER.md) and [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md) for the exact migration and schema state.

## Current priorities

The platform architecture and first ECG ingestion are now a working baseline. Current product work should prioritize:

1. curate the real ECG corpus with Case Tags and genuinely reusable Shared Questions;
2. add additional Study Topics or stimulus alternatives only where they improve learning/authoring;
3. observe real Admin and learner friction before expanding the schema;
4. implement the smallest useful learner-account administration workflow;
5. implement basic learner-progress administration.

Keep compound Tag reuse rules, Tag hierarchy/aliases, Study-by-Tag, FSRS, advanced analytics, AI inference, and broader media taxonomy deferred until real evidence justifies them.

## Local development

For a fresh clone that should contain production-like teaching content and media locally:

```sh
npm ci
npm run local:setup
npm run local:admin
npm run dev
```

`local:setup` reads only the allowlisted production content plus R2 objects referenced by production-owned Asset rows, then writes those copies into local Wrangler D1/R2 state. Production Better Auth users/accounts/sessions, learner Reviews/progress, Preview sessions, and import-job state are excluded. Normal localhost mutations remain local.

When production content changes, refresh the local copy with:

```sh
npm run local:refresh
```

See [`docs/LOCAL_DEVELOPMENT_REPLICA.md`](docs/LOCAL_DEVELOPMENT_REPLICA.md) for the internal operational runbook, safety boundary, credentials, cleanup, and troubleshooting.

Before implementation handoff, the repository validation standard is:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

See [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) before production migrations or deployment.
