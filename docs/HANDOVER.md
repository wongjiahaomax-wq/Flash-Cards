# Flash-Cards agent handover

_Refreshed: 19 August 2026_

## Current outcome

The project has a D1-backed learner Study flow, protected/private R2 teaching images, an Admin CMS, optional stimulus groups, multi-Topic Case routing, Tagging Stage A and Stage B, Image Management V2, a wide responsive Admin workspace, the reviewed/resumable content-import path, and a fully imported/verified initial ECG Anki corpus.

Recent merged infrastructure/product milestones include:

- PR #29 — Admin Case image-authoring workflow;
- PR #30 — Production-backed Preview Admin workspace;
- PR #31 — production Admin identity reuse for Preview through `admin,preview_admin`;
- PR #32 — Restore Main to Preview workflow;
- PR #33 — Image Management V2 planning and refreshed product roadmap;
- PR #34 — Image Management V2, including migration `0007_image_collections.sql`;
- PR #40 — wide responsive Admin workspace;
- PR #41/#42 — Tagging Stage B schema foundation and production application of `0008_tag_shared_questions.sql`;
- PR #43 — Tagging Stage B behavior/Admin authoring, merged and deployed to production;
- PR #44–#46 — one-time read-only production verification of the completed ECG migration;
- PR #56 — moving an existing Case-wide question to an exact option in an Alternative image set.

The stimulus-scope authoring follow-up is implemented on `agent/stimulus-scope-authoring-ux` for review. It changes the Admin author mental model from database relationships to **Applies to: This whole Case / A specific image or stimulus**. Fixed images and existing alternative options are both selectable targets. Assigning an exact-image question to a fixed image transparently converts that Case relationship to a one-option active Stimulus Group in the same D1 batch as question assignment, preserving Asset identity and Case-specific caption. No schema change is required.

The Case Questions section continues to return/display only active Case-wide questions. Exact-image questions are summarized and managed beside their image. Topic reuse remains compatible only with Case-wide scope and contradictory stimulus+Topic submissions are rejected server-side. Cross-Stimulus-Group Prompt conflict protection remains authoritative.

Preview does not gain this production mutation authority. The new production scope endpoint is not mirrored into Preview; shared UI controls that would invoke fixed conversion or production scope moves are hidden in Preview while existing Preview-safe named actions remain available.

## Read first

```text
docs/CURRENT_PRODUCT_ROADMAP.md
docs/IMAGE_MANAGEMENT_V2_PLAN.md
docs/ADMIN_IMAGE_AUTHORING_WORKFLOW.md
docs/TAGGING_MODEL_DECISIONS.md
docs/TAGGING_STAGE_B_BEHAVIOR.md
docs/STAGE_A_TAG_FOUNDATION.md
docs/AUTHORING_MODEL.md
docs/V1_DATA_MODEL.md
docs/CONTENT_MODEL_EXAMPLES.md
docs/PREVIEW_ADMIN_WORKSPACE.md
docs/PREVIEW_ADMIN_IDENTITY.md
docs/CLOUDFLARE.md
docs/IMPLEMENTATION_PLAN.md
docs/R2_COST_GUARDRAILS.md
```

## Product/content model

The authoring hierarchy remains:

```text
Topic
└── Case
    ├── fixed Assets                 -> case_assets
    ├── alternative stimulus groups -> stimulus_groups
    │   └── options                  -> stimulus_group_options
    └── contextual questions
```

`concepts` are Topics in Admin UI. A Case has one primary/default Topic and may have additional Study Topics through `case_concepts`.

The ordinary question-authoring choice is now:

```text
Applies to this whole Case
→ case_questions
→ may also reuse in Topic where valid

Applies to this stimulus
→ stimulus_option_questions
→ managed beside the image
```

A currently fixed image may be transparently represented internally as a one-option Stimulus Group when an exact-image question is assigned. This is intentionally an authoring implementation detail, not a new fixed-image-question schema. With one active option and `selection_count = 1`, learner-visible image selection remains effectively equivalent to the previous fixed image.

Questions belong at the highest context where the answer remains correct. Stage B adds a global reusable knowledge scope:

```text
question_prompts
= reusable wording only

shared_questions
= reusable medical meaning + answer

shared_question_tags
= descriptive knowledge tested

reuse_scope_tag_id
= exactly one Case Tag controlling eligibility
```

Tags are cross-cutting metadata. Case Tags and contextual Case Question Tags do not replace Topic/Case ownership. The Reuse Scope Tag is separate from descriptive Shared Question Tags and is not automatically copied into `shared_question_tags`.

Case-specific image captions remain relationship metadata. Exact-image questions stay attached to their exact `stimulus_group_option`. A Case-specific `stimulus_group` is a learner alternative-stimulus concept, not a generic media folder.

## Tagging Stage B behavior

For the selected production Case, a Shared Question is eligible exactly when:

```text
shared_questions.is_active = true
AND question_prompts.is_active = true
AND question_prompts.preview_session_id IS NULL
AND the reuse_scope_tag is active
AND case_tags contains (Case, reuse_scope_tag_id)
```

Stage A `case_tags` has no relationship-level archive flag; current semantics are the existence of the relationship plus an active Tag.

`shared_question_tags` never creates learner eligibility. Topic/Concept ancestry never infers Tag eligibility.

Resolver duplicate-Prompt precedence is:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic/Concept
> tag-shared Question
> nearest inheritable ancestor Topic/Concept
> more distant ancestors
```

The final candidate set is deduplicated by `question_prompt_id`; higher-priority context wins.

Shared Questions enter the normal eligible pool before Automatic/All/Fixed selection. Automatic semantics and stimulus-specific coverage remain unchanged, All includes all deduplicated eligible Questions, and Fixed does not exceed the configured count because Shared Questions were added.

Selected Shared Questions snapshot Prompt wording and answer like every other Review Question and persist:

```text
source_type = 'tag_shared'
source_shared_question_id = <shared_questions.id>
```

Reuse Scope Tag IDs, descriptive Tag IDs, and Case Tag IDs are not snapshotted. Those remain mutable curation metadata.

## Shared Question Admin state

Production Admin navigation includes:

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

`/admin/shared-questions` supports list/create/archive/reactivate and a detail editor supports Shared Question editing.

Creation can reuse an existing active production Question Prompt or create new production Prompt wording. Every Shared Question requires exactly one active Reuse Scope Tag and may carry zero or more independent descriptive Tags. The UI explicitly states that only the Reuse Scope Tag controls Case eligibility.

Shared Questions are global production-curated objects and are not Preview-owned. Application validation rejects Preview-owned Prompts; migration `0008` provides D1 trigger defense in depth. Existing Questions detail/edit pages include Shared Question Prompt usages in global-wording blast-radius/stale-edit protection.

## ECG Anki migration status

The initial real ECG Anki deck migration is complete and production-verified.

Source accounting:

```text
66 source notes/cards
- 13 imported in Batch 01
- 51 imported in Batch 02
- 2 represented by pre-existing mapped calcium Cases
= 66 / 66 represented
```

Read-only production D1 verification on 18 August 2026 confirmed:

- Batch 01 package SHA matches the reviewed package; import job is `complete`, `phase = finalize`, 264/264 processed, `last_error = null`;
- Batch 02 package SHA matches the reviewed package; import job is `complete`, `phase = finalize`, 848/848 processed, `last_error = null`;
- exactly 13 Batch 01 and 51 Batch 02 active production Cases;
- exactly 13 Batch 01 and 51 Batch 02 active production ECG Assets with the adopted Case-aligned ECG filename convention;
- exactly 13 Batch 01 and 51 Batch 02 Case↔ECG links;
- both pre-existing mapped Hypocalcaemia/Hypercalcaemia Cases are active and have at least one active production image.

An initial verification query using a long `LIKE` pattern hit Cloudflare D1 internal error 7500 (`LIKE or GLOB pattern too complex`). This was an audit-query-shape failure, not an import failure. The final verification used simple deterministic-prefix comparisons and passed.

Initial source migration is therefore complete. Ongoing ECG work is curation/enrichment: Tags, Shared Questions, additional Study Topics/stimulus variants and medical content review where useful.

## Image Management V2 baseline

Image Management V2 is merged. `/admin/images` and `/preview-admin/images` use 60-item server pages with exact matching counts, deterministic search/filter/sort pagination, cross-page explicit selection within one canonical query context, exact Select All up to 300 Assets, and the retained 30-Asset server mutation bound with sequential client chunks for larger explicit selections.

Same-Case option Move preserves `stimulus_group_options.id`, Asset identity, Case-specific caption, active state and exact-option questions while changing the parent alternative set. Cross-Case/ownership/conflict/coverage-invalid moves are rejected.

Image Collections are organisational metadata separate from Topics and Tags. An Asset has zero or one Collection; deleting a Collection preserves Assets and relationships and returns affected images to Unsorted.

Image management does not change learner stimulus semantics or Review snapshots/provenance.

## Stimulus-scope authoring safety

The production semantic helper centralizes the new authoring operation rather than duplicating route-specific conversion logic.

For a fixed target it preflights:

- active production Case and primary Topic;
- active production image Asset;
- current fixed Case relationship;
- absence of a conflicting option relationship;
- cross-group Prompt usage;
- Prompt/Case-question state as applicable;
- Topic-reuse cleanup semantics.

Only then does one D1 batch create the group/option, preserve caption/Asset identity, remove/reorder the fixed relationship, create the exact-image question, deactivate the Case-wide relationship for a move, and conditionally remove Topic reuse. Failure of the assignment must therefore not leave the fixed image partially converted.

The same Question Prompt may carry different option-specific answers for ECG A and ECG B inside one group. It remains forbidden to independently attach that Prompt to two active groups in the same Case where both groups can be selected in one Review.

## Production-backed Preview Admin workspace

The Preview architecture remains:

```text
ONE D1
ONE R2

Production Worker: flash-cards
Preview Worker:    flash-cards-preview
                    -> same DB binding
                    -> same MEDIA binding
```

No second D1 or R2 resource is part of this design. The safety model is clone then mutate, never mutate production and roll back later.

Preview may browse/search/filter/paginate/select production Assets read-only. Preview bulk relationship writes may target only current-session Preview-owned Cases/groups/options where the existing contracts allow them.

Preview must never mutate production Case rows, production Asset metadata, production R2 objects or production stimulus relationships.

`shared_questions` is deliberately **not** Preview-owned and has no `preview_session_id`. Preview has no mutation authority over them.

The new `/admin/cases/[caseId]/question-scope` production endpoint is deliberately not implemented under `/preview-admin`. Shared Svelte markup guards production-only scope controls with `data.previewMode`, and the contract test asserts that Preview has not gained that route/action.

## Shared Case editor contract

Preview renders the real production Case-editor Svelte component. It does not maintain a copied editor UI.

`test/admin-editor-preview-contract.test.js` remains the contract for shared named form actions/data. Any future named shared-editor action must have a safe Preview implementation or an explicit named `403` block. Production-only non-named endpoints must likewise be gated so Preview cannot submit to them.

The Shared Question Admin UI is a separate production Admin surface and therefore does not extend the shared Case-editor contract.

## Critical request/data isolation

Preview Worker boundaries remain:

```text
Preview Worker /admin/**              -> 403
Preview Worker /study/**              -> 403
Preview Worker /api/auth/admin/**     -> 403
preview_admin on production /study/** -> 403
```

Normal learner Case eligibility remains constrained to production Cases (`cases.preview_session_id IS NULL`).

Normal Review loading also excludes Preview-owned Question Prompts and Assets. Stage B uses the same active production Prompt map for Shared Question candidates, so a Preview-owned Prompt cannot enter learner eligibility even before the D1 Shared Question trigger is considered.

Normal production Admin libraries/counts/details continue excluding disposable Preview ownership.

## Preview reset/deployment lifecycle

V1 supports one live workspace per Preview Admin with a 24-hour expiry. Reset deletes only explicitly Preview-owned rows and Preview R2 objects under:

```text
preview/<preview-session-id>/...
```

Cleanup is idempotent; failed cleanup is surfaced and retried later.

Manual **Deploy PR to Preview** resolves an exact open same-repository PR head targeting `main`, blocks migration/schema/`wrangler.jsonc` candidate changes, runs standard validation, deploys only `--env preview`, and never runs a remote migration.

Normal lifecycle for Preview-compatible PRs:

```text
main on Preview
→ Deploy PR to Preview
→ inspect PR
→ Reset Preview Workspace
→ Restore Main to Preview
→ next PR
```

## Current migrations

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

No migration is required for stimulus-scope authoring. Do not add a second fixed-image-question schema.

`0008_tag_shared_questions.sql` adds Shared Question tables/links, `tag_shared` Review provenance, and D1 trigger defense against Preview-owned Prompts. It does not seed production content and does not snapshot Tag IDs onto Reviews.

## R2 rules

Teaching images remain private. All production/Preview image writes continue through the existing protected media helpers and R2 cost guardrails.

Production teaching-image keys are immutable. Preview uploads use only the isolated Preview prefix and are cleaned during Reset after ownership/usage checks. Reviewed import staging remains separate operational data and is not an Asset.

Stimulus-scope authoring changes only Case/stimulus/question relationships; it does not rewrite or duplicate R2 media.

## Authentication boundaries

- `admin` -> production Admin CMS on production Worker;
- `preview_admin` + `PREVIEW_MODE=true` -> Preview Admin;
- `admin,preview_admin` -> owner may use the respective Admin surfaces while sessions/secrets stay separate;
- Better Auth Admin-plugin API -> production Worker only;
- normal learner -> Study on production Worker only;
- any identity carrying `preview_admin` is currently denied production learner Study by policy.

Authorization is server-side, not hard-coded by email.

## Validation required before handoff

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

PR CI covers this validation set. When an agent cannot execute the repository locally, use the PR workflow result as the validation source and document any environment-specific failure precisely rather than broadening the product PR.

## Intentionally deferred

- multiple Reuse Scope Tags or ANY/ALL expressions;
- Tag hierarchy;
- aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- Tag fields in Import Package v1;
- Preview editing of global Shared Questions;
- a generic redesign of fixed/alternative image management beyond the narrow transparent conversion required for exact-image question scope.

## Next intended implementation workflow

The platform baseline and initial ECG ingestion are complete. After this stimulus-scope UX is reviewed, prioritize real content curation and learner/Admin friction rather than expanding schema for completeness:

```text
curate real ECG Case Tags
→ promote genuinely reusable knowledge into Shared Questions
→ exercise Case-wide vs exact-image authoring on real ECG variants
→ observe learner/Admin behavior
→ implement smallest learner-account Admin workflow
→ implement basic learner-progress Admin
```
