# Flash-Cards agent handover

_Refreshed: 20 August 2026_

## Current outcome

The project has a D1-backed learner Study flow, protected/private R2 teaching images, an Admin CMS, optional stimulus groups, multi-Topic Case routing, Tagging Stage A and Stage B, Image Management V2, Reusable Image Questions, a wide responsive Admin workspace, the reviewed/resumable content-import path, a local production-like development replica, a local slide-review/deterministic-finalizer toolchain, narrow higher-resolution Asset replacement on current `main`, and a fully imported/verified initial ECG Anki corpus.

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
- PR #53 — local/offline slide review and deterministic finalizer tooling;
- PR #54 — Case-editor Topic management and inline Topic creation;
- PR #55 — production-like local D1/R2 development replica;
- PR #56 — moving an existing Case-wide question to an exact option in an Alternative image set;
- PR #57 — author-facing whole-Case vs specific-image/stimulus question scope, including transparent fixed-image conversion;
- PR #58 — Reusable Image Questions and explicit per-stimulus opt-ins;
- PR #59 — safe same-image higher-resolution Asset replacement and supersession lineage.

Merge status and production deployment status are intentionally separate. Current `main` contains migrations `0009`–`0011` and the PR #53–#59 code above. The repository also contains an explicit production rollout trigger commit for merged PR #56, but a trigger commit alone is not treated as proof that the workflow completed successfully. Do not label later merged features or migrations as deployed/applied without explicit rollout verification.

The stimulus-scope authoring follow-up changes the Admin author mental model from database relationships to **Applies to: This whole Case / A specific image or stimulus**. Fixed images and existing alternative options are both selectable targets. Assigning an exact-image question to a fixed image transparently converts that Case relationship to a one-option active Stimulus Group in the same D1 batch as question assignment, preserving Asset identity and Case-specific caption. No second fixed-image-question schema is required.

The Case Questions section continues to return/display only active Case-wide questions. Exact-image questions are summarized and managed beside their image. Topic reuse remains compatible only with Case-wide scope and contradictory stimulus+Topic submissions are rejected server-side. Cross-Stimulus-Group Prompt conflict protection remains authoritative.

Preview does not gain production mutation authority for reusable production content or higher-resolution Asset replacement. Shared UI controls that would mutate production-only content remain gated while existing Preview-safe named actions remain available.

PR #59 is merged on current `main` and provides the narrow production Admin workflow **Replace with higher-resolution version** for a better-quality copy of the **same underlying image**. Its presence on `main` does not by itself establish that migration `0011_asset_supersession.sql` is applied to production or that the corresponding Worker behavior is deployed.

## Read first

```text
docs/CURRENT_PRODUCT_ROADMAP.md
docs/IMAGE_MANAGEMENT_V2_PLAN.md
docs/ADMIN_IMAGE_AUTHORING_WORKFLOW.md
docs/REUSABLE_IMAGE_QUESTIONS.md
docs/ASSET_HIGHER_RESOLUTION_REPLACEMENT.md
docs/LOCAL_DEVELOPMENT_REPLICA.md
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

A currently fixed image may be transparently represented internally as a one-option Stimulus Group when an exact-image question or explicit reusable-image opt-in is assigned. This is intentionally an authoring implementation detail, not a new fixed-image-question schema. With one active option and `selection_count = 1`, learner-visible image selection remains effectively equivalent to the previous fixed image.

Questions belong at the highest context where the answer remains correct. Current global reusable scopes include:

```text
question_prompts
= reusable wording only

asset_questions
= canonical answer/meaning intrinsic to one exact Asset

stimulus_option_asset_questions
= explicit decision to reuse an Asset Question in one exact stimulus usage

shared_questions
= reusable medical meaning + answer

shared_question_tags
= descriptive knowledge tested

reuse_scope_tag_id
= exactly one Case Tag controlling Shared Question eligibility
```

Tags are cross-cutting metadata. Case Tags and contextual Case Question Tags do not replace Topic/Case ownership. The Reuse Scope Tag is separate from descriptive Shared Question Tags and is not automatically copied into `shared_question_tags`.

Case-specific image captions remain relationship metadata. Exact-image questions stay attached to their exact `stimulus_group_option`. A Case-specific `stimulus_group` is a learner alternative-stimulus concept, not a generic media folder.

Reusable Image Questions belong to an exact global Asset, not to a Case. Reusing an Asset in another Case never silently reuses its Asset Questions; each stimulus usage must explicitly opt in.

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
selected exact stimulus option question
> explicitly reused Asset Question for the selected option
> stimulus group
> Case
> exact Study Topic/Concept
> tag-shared Question
> nearest inheritable ancestor Topic/Concept
> more distant ancestors
```

The final candidate set is deduplicated by `question_prompt_id`; higher-priority context wins.

Shared Questions and explicitly reused Asset Questions enter the normal eligible pool before Automatic/All/Fixed selection. Automatic semantics and stimulus-specific coverage remain unchanged, All includes all deduplicated eligible Questions, and Fixed does not exceed the configured count because a reusable source was added.

Selected Shared Questions snapshot Prompt wording and answer like every other Review Question and persist:

```text
source_type = 'tag_shared'
source_shared_question_id = <shared_questions.id>
```

Selected Reusable Image Questions persist:

```text
source_type = 'asset'
source_asset_question_id = <asset_questions.id>
```

Reuse Scope Tag IDs, descriptive Tag IDs, Case Tag IDs, and mutable authoring relationships are not used in place of Review snapshots.

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

## Reusable Image Question Admin state

Production Image detail and Case image **Manage questions** surfaces expose Reusable Image Questions separately from Case-specific exact-image questions.

The compact Case image-card contract remains:

```text
Case-specific Image Questions · N

Reusable Image Questions · N
X used in this Case · Y available to reuse
```

The reusable total counts active `asset_questions` backed by active `question_prompts`. `used in this Case` means an explicit opt-in for that exact stimulus usage; `available to reuse` is the remainder. Archived Asset Questions/inactive Prompts are omitted from visible active counts.

The canonical answer lives on `asset_questions`, not on `question_prompts`. Removing one opt-in never archives the canonical Asset Question or affects another Case's opt-in.

For one selected stimulus context, exact Case-specific option content has precedence over an explicitly reused Asset Question with the same Prompt. The existing cross-Stimulus-Group Prompt conflict invariant remains authoritative.

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

Initial source migration is therefore complete. Ongoing ECG work is curation/enrichment: Tags, Shared Questions, Reusable Image Questions, additional Study Topics/stimulus variants and medical content review where useful.

## Image Management V2 baseline

Image Management V2 is merged. `/admin/images` and `/preview-admin/images` use 60-item server pages with exact matching counts, deterministic search/filter/sort pagination, cross-page explicit selection within one canonical query context, exact Select All up to 300 Assets, and the retained 30-Asset server mutation bound with sequential client chunks for larger explicit selections.

Same-Case option Move preserves `stimulus_group_options.id`, Asset identity, Case-specific caption, active state, exact-option questions, and reusable-image opt-ins while changing the parent alternative set. Cross-Case/ownership/conflict/coverage-invalid moves are rejected.

Image Collections are organisational metadata separate from Topics and Tags. An Asset has zero or one Collection; deleting a Collection preserves Assets and relationships and returns affected images to Unsorted.

Image management does not change learner stimulus semantics or Review snapshots/provenance.

## Stimulus-scope authoring safety

The production semantic helper centralizes stimulus-scope authoring rather than duplicating route-specific conversion logic.

For a fixed target it preflights:

- active production Case and primary Topic;
- active production image Asset;
- current fixed Case relationship;
- absence of a conflicting option relationship;
- cross-group Prompt usage;
- Prompt/Case-question state as applicable;
- Topic-reuse cleanup semantics.

Only then does one D1 batch create the group/option, preserve caption/Asset identity, remove/reorder the fixed relationship, create the exact-image question or explicit reusable opt-in, deactivate the Case-wide relationship for a move where applicable, and conditionally remove Topic reuse. Failure of the assignment must therefore not leave the fixed image partially converted.

The same Question Prompt may carry different option-specific answers for ECG A and ECG B inside one group. It remains forbidden to independently attach that Prompt to two active groups in the same Case where both groups can be selected in one Review.

## Higher-resolution Asset replacement — merged on current `main`

Use **Replace with higher-resolution version** only for the same underlying image at better quality/resolution. A different ECG, X-ray, photograph or diagram remains an independent Asset even when it shows the same diagnosis.

Production R2 keys remain immutable. Successful A → B replacement creates a new R2 object and new Asset B, moves current production fixed/stimulus relationships to B, preserves Stimulus Option IDs, clones A's Asset Questions to new B Asset Questions, remaps current production reusable opt-ins, then leaves A inactive with:

```text
A.superseded_by_asset_id = B.id
```

Old A Asset Questions and old R2 bytes remain for historical provenance. Historical Review Prompt/answer snapshots are not rewritten.

`review_assets.storage_key_snapshot` is authoritative for historical media. Study uses an authenticated Review-owned media route that serves the snapshotted R2 key even when the original Asset has since become inactive/superseded. The ordinary Asset route continues to serve only active current Assets.

### Race safety

Exactly one concurrent/double submission may claim an active unsuperseded source Asset. The D1 batch conditionally claims A and immediately performs a database-enforced assertion that the claim belongs to that exact B. A lost claim makes the entire D1 batch fail. The losing submission's newly uploaded R2 object is deleted; no losing Asset/question/relationship state survives.

### Live Preview safety

Replacement never rewrites Preview-owned relationships. It also refuses to deactivate A while a live Preview workspace currently references it. Live means:

```text
preview_sessions.status = 'active'
AND expires_at > now
```

Both Preview fixed `case_assets` and Preview `stimulus_group_options` references block replacement. The check runs before R2 upload and is repeated in the D1 claim, so a Preview that becomes live during the operation causes D1 rollback plus cleanup of only the new replacement object.

Expired/non-live Preview relationships remain outside the mutation set and are not rewritten.

### R2/D1 failure safety

R2 and D1 are not transactional together. Replacement uploads the new immutable object first, then performs one D1 semantic batch. If D1 fails for a lost claim, live Preview race, or any other semantic/database failure, the new object is deleted through the narrow teaching-image cleanup helper. The old object is never deleted or overwritten.

Import Package v1 remains unchanged.

## Local production-like development replica

`npm run local:refresh` remains read-production/write-local only. Production D1 access is hard-coded SELECT-only and production R2 access is object GET-only.

The replica allowlist includes current image-question authoring state:

```text
asset_questions
stimulus_option_asset_questions
```

along with the existing production content tables. Production Better Auth identities/sessions, learner Reviews, Preview sessions and import jobs remain excluded.

Because `assets.superseded_by_asset_id` is an immediate self-FK, Asset import is dependency-ordered rather than ID-ordered. For A → B → C, local import inserts C, then B, then A. Missing successors/cycles fail closed. Local reset clears the Asset self-FK before deleting Assets and deletes reusable-image child rows before their parents.

See `docs/LOCAL_DEVELOPMENT_REPLICA.md` for the operational contract.

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

`shared_questions` and `asset_questions` are global production content and are not Preview-owned authoring targets. Preview has no mutation authority over them.

Production-only question-scope and higher-resolution replacement actions are deliberately not implemented under `/preview-admin`.

## Shared Case editor contract

Preview renders the real production Case-editor Svelte component. It does not maintain a copied editor UI.

`test/admin-editor-preview-contract.test.js` remains the contract for shared named form actions/data. Any future named shared-editor action must have a safe Preview implementation or an explicit named `403` block. Production-only non-named endpoints must likewise be gated so Preview cannot submit to them.

The Shared Question Admin UI and production Image Asset reusable-question/replacement actions are separate production Admin surfaces and therefore do not extend the shared Case-editor Preview mutation contract.

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

The historical Review media route requires Review ownership and retains the existing Preview Worker/Preview Admin learner-access denial.

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

Current `main` includes migration `0011_asset_supersession.sql` from merged PR #59. The existing Preview deployment guard remains authoritative for candidate PRs containing migration changes; production/Preview schema application must still be verified separately from merge status.

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
0009_reusable_image_questions.sql
0010_reusable_image_reactivation_guard.sql
0011_asset_supersession.sql
```

No second fixed-image-question schema is required.

`0008_tag_shared_questions.sql` adds Shared Question tables/links, `tag_shared` Review provenance, and D1 trigger defense against Preview-owned Prompts. It does not seed production content and does not snapshot Tag IDs onto Reviews.

`0009`/`0010` establish Reusable Image Question identity/opt-in integrity. `0011` adds only the narrow nullable Asset supersession self-FK and index required for higher-resolution replacement.

Migrations `0009`–`0011` are present on current `main`. Their production application is not inferred from merge status and should be recorded as applied only after explicit remote migration verification.

## R2 rules

Teaching images remain private. All production/Preview image writes continue through the existing protected media helpers and R2 cost guardrails.

Production teaching-image keys are immutable. Preview uploads use only the isolated Preview prefix and are cleaned during Reset after ownership/usage checks. Reviewed import staging remains separate operational data and is not an Asset.

Stimulus-scope/reusable-question authoring changes relationships/content without rewriting existing R2 media.

Higher-resolution replacement intentionally creates a second immutable production object while retaining the old object for historical Review delivery. Failed replacement removes only the new uncommitted object.

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
git diff --check
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
```

PR CI covers this validation set. When an agent cannot execute the repository locally, use the PR workflow result as the validation source and document any environment-specific failure precisely rather than broadening the product PR.

Merged PR #59's final CI passed the repository-authoritative suite, including 342 tests, but CI/merge success does not substitute for production migration/deployment verification.

## Intentionally deferred

- multiple Reuse Scope Tags or ANY/ALL expressions;
- Tag hierarchy;
- aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- Tag fields in Import Package v1;
- Preview editing of global Shared Questions or Reusable Image Questions;
- generic Asset families or `image_identity`;
- generic image version-history UI;
- automatic visual similarity/same-image detection;
- automatic deduplication;
- bulk Asset replacement;
- different-clinical-image replacement through the higher-resolution action;
- automatic R2 garbage collection;
- a generic redesign of fixed/alternative image management beyond the narrow transparent conversion required for image-specific question scope.

## Next intended implementation workflow

The platform baseline, recent PR #53–#59 implementation sequence and initial ECG ingestion are complete on current `main`. Prioritize real content curation and learner/Admin friction rather than expanding schema for completeness:

```text
curate real ECG Case Tags
→ promote genuinely reusable knowledge into Shared Questions / Reusable Image Questions
→ exercise Case-wide vs exact-image authoring on real ECG variants
→ observe learner/Admin behavior
→ implement smallest learner-account Admin workflow
→ implement basic learner-progress Admin
```
