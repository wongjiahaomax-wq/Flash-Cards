# Flash-Cards

Private case-based medical learning application.

## Current status

The application has a working end-to-end learner flow and a first-pass browser Admin CMS.

The repository contains:

- a SvelteKit application targeting Cloudflare Workers;
- Cloudflare D1 + Drizzle learning-domain schema and migrations;
- Better Auth with D1-backed authentication and administrator roles;
- protected learner/admin routes with public sign-up disabled;
- Cloudflare R2 teaching-image storage with application-level cost/size guardrails;
- authenticated image serving from private R2;
- D1-backed learner Reviews with question, Case, and Asset snapshots;
- whole-Case `Again` / `Good` review completion;
- Admin libraries for Cases, Questions, Images, and Topics;
- optional alternative stimulus groups with exact-image contextual questions and frozen Review provenance.

Production Worker:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

Do not assume every newest `main` commit is deployed unless deployment has been explicitly verified.

## Authoring model

The product-facing content hierarchy is:

```text
Topic
└── Case
    └── Stimulus / alternative stimulus
```

A **Topic** is the administrator-facing name for the existing Concept model and represents what is being taught.

A **Case** is one coherent clinical presentation. Several Cases can belong to the same Topic while having different stems, causes, findings, or educational intent.

A **stimulus** is what the learner sees within that Case. Fixed images appear whenever that Case is reviewed. Optional alternative image sets allow one interchangeable example to be selected and frozen for a Review.

Questions should be attached at the highest level where their answers remain valid:

```text
Topic question
    ↓
Case question
    ↓
Alternative-set question (advanced)
    ↓
Specific-image question
```

Example:

```text
Topic: Hypocalcaemia

├── shared Topic questions
│   └── How is severe symptomatic hypocalcaemia treated?
│
├── Case: Post-thyroidectomy hypocalcaemia
│   ├── distinct stem
│   ├── Case-specific questions
│   └── alternative ECG images
│       ├── ECG A + exact-image questions
│       └── ECG B + exact-image questions
│
└── Case: Vitamin-D-deficiency hypocalcaemia
    ├── different stem
    ├── different contextual questions
    └── its own stimuli
```

No additional Topic table or migration is required for this hierarchy. The existing Concept, Case, stimulus-group, and contextual-question tables already support it.

See [`docs/AUTHORING_MODEL.md`](docs/AUTHORING_MODEL.md) for the preferred content-entry mental model and examples.

## Current content model

The main learner-facing unit is a **Case**, not a fixed front/back flashcard.

Important rules:

- a Case can have an optional clinical stem/vignette;
- a Case belongs to one primary Topic and may have secondary Concept relationships;
- reusable Topic questions can be drawn into compatible Cases;
- a Case may add or override contextual questions/answers;
- a Case can show one or several fixed ordered Assets together;
- an Asset is reusable and can appear in more than one Case;
- interchangeable examples can be grouped as optional alternative stimuli without rewriting the Case;
- one option from each active alternative group is selected before questions are resolved and is frozen into the Review;
- exact-image questions apply only when that image was selected;
- the same Question Prompt may have different answers at more specific contexts;
- internal diagnosis-bearing Case titles are not shown to learners;
- later question parts may give clues to earlier parts, matching the target exam format.

Question precedence is:

```text
selected stimulus option
> stimulus group
> Case
> primary Topic/Concept
> nearest inheritable ancestor Topic/Concept
> more distant eligible ancestor
```

## Administrator workflow

Primary Admin navigation:

```text
Dashboard · Cases · Questions · Images · Topics
```

The browser Admin supports:

- browse Topics and their Cases/reusable questions;
- create a Topic/Concept;
- create and edit Cases with internal titles and learner-facing stems;
- configure how many eligible questions a Case should ask;
- add/edit/remove/reorder Case questions;
- optionally make a question reusable for the Case's primary Topic;
- upload JPEG/PNG teaching images to private R2;
- store optional source label, source URL, and licence metadata;
- attach and reorder reusable images with Case-specific captions;
- create optional alternative image groups;
- add/deactivate/reorder alternative images;
- add group-level and exact-image contextual questions;
- configure stimulus-specific question coverage;
- preview resulting content through the learner Study flow.

The preferred routine authoring language is **Topic → Case → Images / Alternative images**. Database terms such as Concept, Stimulus Group, and Stimulus Option are implementation details and should not dominate ordinary content entry.

The image shown to learners always comes from private R2. External source URLs are attribution/reference metadata only.

## Learner workflow

The current `/study` flow is D1-backed:

1. learner chooses a Topic;
2. the system selects an eligible active Case while avoiding an immediate repeat where possible;
3. fixed stimuli and one option from each active alternative set are selected;
4. questions are resolved using the selected stimuli and contextual precedence;
5. Case/question-count and stimulus-specific coverage rules choose the final set;
6. Case, stimuli, prompts, answers, order, and source provenance are snapshotted atomically;
7. the learner reveals answers and rates the whole Case `Again` or `Good`;
8. revisiting the same Review uses the persisted snapshots rather than re-randomizing content.

## Documentation

- [`docs/AUTHORING_MODEL.md`](docs/AUTHORING_MODEL.md) — Topic → Case → stimulus authoring model and question-placement rules.
- [`docs/CURRENT_DESIGN.md`](docs/CURRENT_DESIGN.md) — broader educational model and design rationale.
- [`docs/V1_SPEC.md`](docs/V1_SPEC.md) — Version 1 product/behaviour specification.
- [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md) — relational model and selection algorithms.
- [`docs/STIMULUS_GROUPS_DESIGN.md`](docs/STIMULUS_GROUPS_DESIGN.md) — optional alternative-stimulus behaviour and invariants.
- [`docs/CONTENT_MODEL_EXAMPLES.md`](docs/CONTENT_MODEL_EXAMPLES.md) — concrete Case/Asset/question modelling examples.
- [`docs/IMAGE_PROVENANCE.md`](docs/IMAGE_PROVENANCE.md) — image storage and attribution rules.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — implementation milestones and current status.
- [`docs/HANDOVER.md`](docs/HANDOVER.md) — current technical state and recommended next sequence.
- [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) — Cloudflare development/deployment notes.
- [`docs/R2_COST_GUARDRAILS.md`](docs/R2_COST_GUARDRAILS.md) — R2 storage and billing guardrails.

## V1 technical direction

```text
SvelteKit
└── Cloudflare Workers
    ├── Better Auth
    ├── Drizzle ORM
    │   └── Cloudflare D1
    └── Cloudflare R2
```

Better Auth is embedded as an application library; it is not a separate hosted service. Authentication tables and learning-domain tables live in the same D1 database, while teaching-image bytes live in private R2.

## Immediate next steps

1. Exercise Topic → Case → alternative-image authoring with representative real teaching content.
2. Simplify Admin terminology and workflows where real entry still exposes database machinery unnecessarily.
3. Add the smallest administrator workflow for creating/managing learner accounts.
4. Verify a normal learner can access `/study` but cannot access `/admin`.
5. Add basic administrator progress views: learner list, recent Reviews, and `Again`/`Good` summaries.
6. Continue representative ECG, ENT, Eye, and Dermatology content entry.
7. Defer FSRS, broad bulk-import automation, advanced analytics, and structured marking until the current model has been exercised with more real teaching material.

## Cloudflare development

The Worker is configured with D1 (`DB`), R2 (`MEDIA`), and static-asset (`ASSETS`) bindings. Wrangler persists local simulations under `.wrangler/`.

```sh
npm install
npm run db:migrate:local
cp .dev.vars.example .dev.vars
npm run dev
```

See [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) before applying production migrations or deploying.