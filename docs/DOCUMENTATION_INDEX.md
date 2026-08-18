# Flash-Cards Documentation Index

_Last reviewed: 18 August 2026_

This file explains which repository documents describe the **current deployed product**, which are subsystem contracts/runbooks, and which are historical decision records.

The project moved quickly through Admin CMS, multi-Topic routing, reviewed/resumable imports, Tags, Preview Admin, Image Management V2, Tagging Stage B, and the first real ECG migration. Older documents are intentionally retained because they explain why decisions were made, but they must not be mistaken for pending requirements.

## Conflict rule

When documentation appears to disagree, use this order:

1. current code and applied migrations;
2. `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` for merged/deployed status;
3. `V1_DATA_MODEL.md` and the relevant current subsystem behavior document for exact semantics;
4. `CURRENT_DESIGN.md`, `V1_SPEC.md`, and `AUTHORING_MODEL.md` for the product mental model;
5. historical plans/proposals only for decision context.

An old PR instruction, draft rollout note, or agent task is never authority over current `main`.

## Current production baseline

As of 18 August 2026, current `main` includes the documentation finalization merged in PR #49. The production baseline includes:

- learner Study/Review persistence;
- private R2 teaching images;
- Admin CMS for Cases, Questions, Shared Questions, Images, Topics, Tags, and reviewed imports;
- multi-Topic Case routing;
- optional stimulus groups/options;
- Tagging Stage A and deployed Stage B;
- reviewed Import Package v1 and resumable imports;
- production-backed Preview Admin;
- Image Management V2 and Image Collections;
- wide responsive Admin workspace;
- the first 66-note ECG source deck fully represented in production.

Current ECG source accounting is `13 + 51 + 2 = 66/66`. Remaining ECG work is curation/enrichment.

## Start here — current authoritative orientation

### `CURRENT_PRODUCT_ROADMAP.md`

Shortest merged/deployed-versus-next-work status map. Read this first when deciding what to build next.

### `HANDOVER.md`

Detailed current technical/product state for the next implementation agent. Includes migrations, Preview boundaries, Stage B semantics, Image Management V2, ECG migration verification, and next sequence.

### `CURRENT_DESIGN.md`

Living product/design summary. Explains the current Topic → Case → stimulus model, Tags, Shared Questions, Collections, learner resolver, imports, Preview model, and product priorities.

### `V1_SPEC.md`

Current V1 behavior specification. Treat this as the product contract for what V1 does now and what the next V1 Admin increments are.

### `V1_DATA_MODEL.md`

Authoritative implemented domain model and relationship semantics, including multi-Topic routing, stimulus groups/options, Tags, Shared Questions, Review snapshots/provenance, and Preview ownership fields.

### `AUTHORING_MODEL.md`

Preferred administrator mental model and question-placement rules. Use this when deciding how real teaching material should be represented.

### `CONTENT_MODEL_EXAMPLES.md`

Concrete modelling examples for stems, fixed/alternative images, multiple Study Topics, contextual questions, Tags, Shared Questions, Collections, and progressive Anki enrichment.

## Current subsystem contracts

### Admin/content management

- `ADMIN_CONTENT_MANAGEMENT_PLAN.md` — despite the historical filename, this now records the current implemented Admin CMS contract and next Admin work.
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` — detailed Case/Image Library authoring behavior established by PR #29 and Image Management V2.
- `IMAGE_MANAGEMENT_V2_PLAN.md` — implemented Image Management V2 behavior record: pagination, selection, Collections, bounded bulk execution, option Move, and Preview parity/isolation.

### Topics and multi-Topic routing

- `MULTI_TOPIC_STUDY_ROUTES.md` — design and learner provenance for one primary/default Topic plus additional Study Topics.
- `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md` — fixed-purpose production taxonomy operation record/runbook. Do not interpret it as a generic taxonomy mutation API.

### Tags and Shared Questions

- `TAGGING_MODEL_DECISIONS.md` — authoritative Tag/Shared Question architecture decisions.
- `STAGE_A_TAG_FOUNDATION.md` — implemented Stage A schema/Admin behavior record.
- `TAGGING_STAGE_B_BEHAVIOR.md` — deployed Stage B eligibility, precedence, Admin authoring, and Review provenance contract.

### Reviewed imports and Anki migration

- `CONTENT_IMPORT_PACKAGES.md` — Import Package v1 format and safety contract.
- `RESUMABLE_IMPORT_RUNTIME_SAFETY.md` — bounded resumable import runtime/checkpoint/lease rules.
- `ANKI_APKG_EXTRACTION.md` — APKG extraction/normalization workflow outside the production app.
- `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` — canonical end-to-end Anki migration workflow plus the completed ECG production accounting.
- `ECG_ANKI_INGESTION_RULES.md` — ECG-specific reviewed-package naming/content rules.

### Preview Admin

- `PREVIEW_ADMIN_WORKSPACE.md` — production-backed Preview ownership/isolation model.
- `PREVIEW_ADMIN_IDENTITY.md` — role/identity bootstrap and security boundaries.
- `PREVIEW_DEPLOYMENT.md` — approved Preview deploy/restore lifecycle and restrictions.

### Cloudflare / operations

- `CLOUDFLARE.md` — Worker/D1/R2 development and deployment notes.
- `R2_COST_GUARDRAILS.md` — managed storage limits and media-write guardrails.
- `IMAGE_PROVENANCE.md` — image source/licence/runtime-serving rules.
- `PRODUCTION_CONTENT_SNAPSHOT.md` — read-only production-content snapshot workflow and credential troubleshooting.
- `LOCAL_REAL_DATA_UX_WORKFLOW.md` — local/real-data UX inspection procedure; use only within its documented safety boundary.

## Current implementation tracking

### `IMPLEMENTATION_PLAN.md`

Milestone ledger. It is current through deployed Tagging Stage B and completed initial ECG migration. Use `CURRENT_PRODUCT_ROADMAP.md` for the shorter decision-oriented version.

## Historical / superseded design records

These files are intentionally retained for rationale. They are **not active implementation plans** unless a current document explicitly revives an item.

### `PROPOSED_TAGGING_MODEL.md`

Historical proposal that led to `TAGGING_MODEL_DECISIONS.md`. The decision record supersedes open alternatives in this file.

### `PARALLEL_WORK_PLAN.md`

Historical record of the completed PR #11/#12/#13 parallel Admin-library phase plus reusable parallel-work lessons. It does not define current product priorities.

### `agent-tasks/`

Historical implementation prompts for already-completed PR work. Never treat an agent task file as evidence that the feature is still pending.

## Implemented design records that retain historical rollout context

Some documents contain rollout history because that history explains safety decisions. Their **behavior/invariants remain useful**, but old phrases such as “draft PR”, “after merge”, or “apply next” should be read as historical when the document's current status header says the feature is merged/deployed.

Examples include:

- `STIMULUS_GROUPS_DESIGN.md`;
- `MULTI_TOPIC_STUDY_ROUTES.md`;
- `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`;
- `IMAGE_MANAGEMENT_V2_PLAN.md`;
- `STAGE_A_TAG_FOUNDATION.md`;
- `TAGGING_STAGE_B_BEHAVIOR.md`;
- Preview deployment/runbook documents.

## Current next product sequence

Unless a new concrete requirement overrides it, the current sequence is:

```text
curate real ECG Case Tags
→ promote genuinely reusable knowledge into Shared Questions
→ add alternate Study Topics/stimuli where they improve learning
→ observe real Admin/learner friction
→ implement learner-account administration
→ implement basic learner-progress administration
```

Do not expand schema/taxonomy merely for conceptual completeness.

## Documentation maintenance rules

For future PRs:

1. Update the subsystem behavior document in the same PR when behavior changes.
2. Update `V1_DATA_MODEL.md` in the same PR when schema/relationship semantics change.
3. Update `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md` when a milestone is merged/deployed or materially changes next priorities.
4. Convert “planned/draft/for review” language to an implemented/deployed record after merge and rollout.
5. Keep schema migration state separate from Worker deployment state; never imply one occurred because the other occurred.
6. Preserve historical decision records, but label them clearly as historical/superseded.
7. Record production content migrations with exact accounting and verification rather than vague “done” statements.
8. Keep product terminology consistent: Topic, Case, Tag, Asset, Collection, Question Prompt, Shared Question.
9. Prefer current behavior/invariants over PR chronology in living documents; keep detailed rollout chronology in dedicated runbooks or historical sections.
10. When in doubt, compare documentation against current code, migrations, merged PR state, and explicitly verified production state before editing it.
