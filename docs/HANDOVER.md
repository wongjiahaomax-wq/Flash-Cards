# Flash-Cards agent handover

_Refreshed: 18 August 2026_

## Current outcome

The project has a D1-backed learner Study flow, protected/private R2 teaching images, an Admin CMS, optional stimulus groups, multi-Topic Case routing, Tagging Stage A, Image Management V2, a wide responsive Admin workspace, the reviewed/resumable content-import path, and the Tagging Stage B schema foundation.

Recent merged infrastructure/product milestones include:

- PR #29 — Admin Case image-authoring workflow;
- PR #30 — Production-backed Preview Admin workspace;
- PR #31 — production Admin identity reuse for Preview through `admin,preview_admin`;
- PR #32 — Restore Main to Preview workflow;
- PR #33 — Image Management V2 planning and refreshed product roadmap;
- PR #34 — Image Management V2, including migration `0007_image_collections.sql`;
- PR #40 — wide responsive Admin workspace;
- Tagging Stage B schema foundation — migration `0008_tag_shared_questions.sql`, already applied to production D1.

PR #43 is the schema-free **Tagging Stage B behavior/authoring** implementation and remains Draft for review. It adds learner Case-Tag eligibility, Shared Question Admin authoring, resolver integration, Prompt-ID deduplication, normal Automatic/All/Fixed behavior, and `tag_shared` Review provenance. No Worker deployment or production D1 migration belongs in PR #43.

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

Production Admin navigation now includes:

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

## Image Management V2 baseline

Image Management V2 is merged. `/admin/images` and `/preview-admin/images` use 60-item server pages with exact matching counts, deterministic search/filter/sort pagination, cross-page explicit selection within one canonical query context, exact Select All up to 300 Assets, and the retained 30-Asset server mutation bound with sequential client chunks for larger explicit selections.

Same-Case option Move preserves `stimulus_group_options.id`, Asset identity, Case-specific caption, active state and exact-option questions while changing the parent alternative set. Cross-Case/ownership/conflict/coverage-invalid moves are rejected.

Image Collections are organisational metadata separate from Topics and Tags. An Asset has zero or one Collection; deleting a Collection preserves Assets and relationships and returns affected images to Unsorted.

Image management does not change learner stimulus semantics or Review snapshots/provenance.

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

`shared_questions` is deliberately **not** Preview-owned and has no `preview_session_id`. PR #43 does not add Preview Shared Question mutation routes or global mutation authority.

Because `0008` is already applied and PR #43 changes no schema/`wrangler.jsonc`, PR #43 is technically eligible for the existing **manual** Deploy PR to Preview workflow if an operator later chooses to inspect it. Opening/updating the Draft PR does not deploy a Worker automatically.

## Shared Case editor contract

Preview renders the real production Case-editor Svelte component. It does not maintain a copied editor UI.

`test/admin-editor-preview-contract.test.js` remains the contract for shared named form actions/data. Any future named shared-editor action must have a safe Preview implementation or an explicit named `403` block.

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

No Preview deployment has been performed as part of PR #43 implementation.

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

`0008_tag_shared_questions.sql` adds:

- `shared_questions`;
- `shared_question_tags`;
- one non-null `reuse_scope_tag_id` per Shared Question;
- at most one active Shared Question per `question_prompt_id` via a partial unique index, while inactive history may coexist;
- nullable `review_questions.source_shared_question_id` with `ON DELETE RESTRICT`;
- `tag_shared` as an allowed Review Question source type;
- D1 triggers rejecting Preview-owned Question Prompt references from Shared Questions.

SQLite/D1 cannot alter the existing Review source-type CHECK in place, so `0008` conservatively rebuilds `review_questions`, preserving existing historical IDs/snapshots/provenance.

The migration does not seed production content and does not snapshot Tag IDs onto Reviews.

**PR #43 schema boundary:** do not create/apply another migration unless a genuine schema defect is discovered. Current implementation found no such defect.

## R2 rules

Teaching images remain private. All production/Preview image writes continue through the existing protected media helpers and R2 cost guardrails.

Production teaching-image keys are immutable. Preview uploads use only the isolated Preview prefix and are cleaned during Reset after ownership/usage checks. Reviewed import staging remains separate operational data and is not an Asset.

Tagging Stage B does not change R2.

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

PR CI covers this exact validation set. In the ChatGPT execution environment used for PR #43, `gh` is unavailable and outbound DNS prevents a local repository clone, so these commands cannot be truthfully reported as locally executed. The final PR description must record GitHub CI results for the final head instead.

## Intentionally deferred after Stage B

- multiple Reuse Scope Tags or ANY/ALL expressions;
- Tag hierarchy;
- aliases/synonyms;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- Tag fields in Import Package v1;
- Preview editing of global Shared Questions.

## Next intended implementation workflow

For PR #43:

```text
finish behavior/Admin implementation
→ keep schema unchanged
→ run/get PR CI green
→ optional manual Preview deployment only if the operator explicitly requests it
→ human review
→ merge only after review
```

ECG/Anki content ingestion may continue in parallel and can progressively promote genuinely reusable knowledge into Shared Questions once this behavior is merged.
