# Flash-Cards

Private case-based medical learning application.

## Current status

The Version 1 educational model and the first real end-to-end vertical slice are now implemented.

The repository contains:

- a SvelteKit application targeting Cloudflare Workers;
- Cloudflare D1 + Drizzle learning-domain schema and migrations;
- Better Auth 1.6.25 with D1-backed user/account/session/verification tables;
- protected learner/admin routes with public sign-up disabled;
- Cloudflare R2 teaching-image storage with application-level cost/size guardrails;
- authenticated image serving from private R2;
- D1-backed learner Reviews with question and Asset snapshots;
- whole-Case `Again` / `Good` review completion;
- a browser-based administrator workflow for creating topics/Cases, editing Case stems, uploading and attaching images, and managing Case questions.

Production Worker:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

PRs #7, #8, and #9 established the current integrated path:

```text
Admin creates topic / Case
        ↓
Case stem / vignette
        ↓
Upload teaching image to private R2
        ↓
Attach reusable Asset(s) to Case
        ↓
Add Case-specific and/or reusable topic questions
        ↓
Learner starts D1-backed Review
        ↓
Review snapshots Case, questions, and Assets
        ↓
Reveal answers → Again / Good
```

The merged `main` state after PR #9 passed post-merge CI run #67.

## Current content model

The main study unit is a **Case**, not a fixed front/back flashcard.

Important rules:

- a Case can have an optional clinical stem/vignette;
- a Case can show one or several ordered Assets together;
- an Asset is reusable and can be attached to more than one Case;
- a Case may use Case-specific questions/answers;
- reusable Concept questions can also be drawn into compatible Cases;
- the same Question Prompt may have different Case-specific answers;
- internal diagnosis-bearing Case titles are not shown to learners;
- later question parts may give clues to earlier parts, matching the target exam format.

A useful example is one ECG that demonstrates prolonged QTc and is also used in a post-operative hypocalcaemia Case. The ECG should be stored once as an Asset and reused across separate Cases with different stems and question sets.

See [`docs/CONTENT_MODEL_EXAMPLES.md`](docs/CONTENT_MODEL_EXAMPLES.md) for concrete modelling examples.

## Administrator workflow

The current `/admin` interface supports:

- create a topic/Concept;
- create a Case with an internal title and optional vignette;
- edit the Case vignette;
- upload JPEG/PNG teaching images;
- paste, drag/drop, or choose an image;
- store optional source label, source URL, and licence metadata;
- attach an existing uploaded Asset to a Case without re-uploading;
- attach the same Asset to more than one Case;
- order multiple Case images and add Case-specific captions;
- add/edit/remove/reorder Case questions;
- optionally save a question as reusable for the Case's primary Concept;
- preview the resulting content through the learner Study flow.

The image shown to learners always comes from private R2. External source URLs are attribution/reference metadata only.

## Learner workflow

The current `/study` flow is D1-backed:

1. learner chooses a topic;
2. the system selects an eligible Case while avoiding an immediate repeat where possible;
3. the Case vignette and ordered Assets are shown;
4. compatible questions are selected with Case-specific precedence;
5. the learner reveals all answers;
6. the learner rates the whole Case `Again` or `Good`;
7. the Review, selected questions, and Assets remain snapshotted in D1.

## Documentation

- [`docs/CURRENT_DESIGN.md`](docs/CURRENT_DESIGN.md) — broader educational model and design rationale.
- [`docs/V1_SPEC.md`](docs/V1_SPEC.md) — Version 1 product/behaviour specification.
- [`docs/V1_DATA_MODEL.md`](docs/V1_DATA_MODEL.md) — relational model and selection algorithms.
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

1. Add the smallest administrator workflow for creating/managing learner accounts.
2. Verify a normal learner can access `/study` but cannot access `/admin`.
3. Add basic administrator progress views: learner list, recent Reviews, and `Again`/`Good` summaries.
4. Enter a small representative pilot set from ECG, ENT, Eye, and Dermatology using the browser admin workflow.
5. Test explicit secondary-Concept/tagging needs, including Cases that legitimately belong to more than one topic.
6. Improve content-administration ergonomics only where real content entry exposes friction.
7. Defer FSRS, bulk Anki import, advanced analytics, and structured marking until the current model has been exercised with more real teaching material.

## Cloudflare development

The Worker is configured with D1 (`DB`), R2 (`MEDIA`), and static-asset (`ASSETS`) bindings. Wrangler persists local simulations under `.wrangler/`.

```sh
npm install
npm run db:migrate:local
cp .dev.vars.example .dev.vars
npm run dev
```

### Wrangler version note

`package.json` is still pinned to Wrangler 4.115.0, while production/local release validation has used Wrangler 4.123.0 because of the project compatibility date.

Until the dependency pin is updated, prefer explicit release commands such as:

```sh
npx --yes wrangler@4.123.0 d1 migrations apply DB --remote
npm run build
npx --yes wrangler@4.123.0 deploy
```

See [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) before applying production migrations or deploying.
