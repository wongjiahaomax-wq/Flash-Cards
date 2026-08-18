# Flash-Cards agent handover

_Refreshed: 18 August 2026_

## Current outcome

The project has a D1-backed learner Study flow, protected/private R2 teaching images, an Admin CMS, optional stimulus groups, multi-Topic Case routing, Tagging Stage A, Image Management V2, a wide responsive Admin workspace, and the reviewed/resumable content-import path.

Recent merged infrastructure/product milestones include:

- PR #29 — Admin Case image-authoring workflow;
- PR #30 — Production-backed Preview Admin workspace;
- PR #31 — production Admin identity reuse for Preview through `admin,preview_admin`;
- PR #32 — Restore Main to Preview workflow;
- PR #33 — Image Management V2 planning and refreshed product roadmap;
- PR #34 — Image Management V2, including migration `0007_image_collections.sql`;
- PR #40 — wide responsive Admin workspace.

Tagging Stage B is now split deliberately:

1. **schema foundation** — migration `0008_tag_shared_questions.sql`, Shared Question tables, and Review provenance;
2. **behavior/authoring** — learner Tag matching/resolution plus Shared Question Admin authoring.

The schema foundation is the current landed code direction in this PR. It does **not** change learner Question eligibility and does **not** add the Shared Question Admin UI. After this PR merges, `0008_tag_shared_questions.sql` must be applied to production D1 through the normal reviewed migration path before the Stage B behavior PR is deployed or Preview-tested against the production-backed database.

No Worker deployment or production D1 migration belongs in the schema-foundation PR itself.

## Read first

```text
docs/CURRENT_PRODUCT_ROADMAP.md
docs/IMAGE_MANAGEMENT_V2_PLAN.md
docs/ADMIN_IMAGE_AUTHORING_WORKFLOW.md
docs/TAGGING_MODEL_DECISIONS.md
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

Questions belong at the highest context where the answer remains correct. The currently active learner scopes remain:

```text
reusable Topic
→ Case
→ stimulus group
→ exact stimulus option
```

Tagging Stage B adds a schema object for another reusable knowledge scope without activating it yet:

```text
question_prompts
= reusable wording only

shared_questions
= reusable medical meaning + answer

shared_question_tags
= descriptive knowledge tested

reuse_scope_tag_id
= exactly one Case Tag that will make the Shared Question eligible
```

Tags are cross-cutting metadata. Case Tags and contextual Case Question Tags do not replace Topic/Case ownership. The reuse-scope Tag is separate from descriptive Shared Question Tags and is not automatically copied into `shared_question_tags`.

Case-specific image captions remain relationship metadata. Exact-image questions stay attached to their exact `stimulus_group_option`. A Case-specific `stimulus_group` is a learner alternative-stimulus concept, not a generic media folder.

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

`shared_questions` is deliberately **not** Preview-owned and has no `preview_session_id`. It is a global production-curated knowledge object.

Because Preview uses production D1, the Deploy PR to Preview workflow blocks schema/migration candidates. Therefore the Stage B schema-foundation PR is not a Preview-deployable candidate. Merge it, apply `0008` to production D1 normally, then keep the subsequent behavior/Admin PR schema-free if practical so it can be inspected safely in Preview.

## Shared Case editor contract

Preview renders the real production Case-editor Svelte component. It does not maintain a copied editor UI.

`test/admin-editor-preview-contract.test.js` remains the contract for shared named form actions/data. Any future named shared-editor action must have a safe Preview implementation or an explicit named `403` block.

The Stage B schema-foundation PR adds no Shared Question UI and therefore does not alter this contract.

## Critical request/data isolation

Preview Worker boundaries remain:

```text
Preview Worker /admin/**              -> 403
Preview Worker /study/**              -> 403
Preview Worker /api/auth/admin/**     -> 403
preview_admin on production /study/** -> 403
```

Normal learner Case eligibility remains constrained to:

```text
cases.preview_session_id IS NULL
```

Normal Review loading also excludes Preview-owned Question Prompts and Assets, and the database trigger added by migration `0006_preview_admin_workspace.sql` rejects learner Reviews for Preview Cases.

Normal production Admin libraries/counts/details continue excluding disposable Preview ownership.

The Stage B schema-foundation PR does not change learner resolution. `src/lib/server/db/learning.js` and `src/lib/server/learning/questions.js` continue to resolve only the existing Case/Topic/stimulus sources.

## Preview reset/deployment lifecycle

V1 supports one live workspace per Preview Admin with a 24-hour expiry. Reset deletes only explicitly Preview-owned rows and Preview R2 objects under:

```text
preview/<preview-session-id>/...
```

Cleanup is idempotent; failed cleanup is surfaced and retried later.

Manual **Deploy PR to Preview** resolves an exact open same-repository PR head targeting `main`, blocks migration/schema/`wrangler.jsonc` candidates, runs standard validation, deploys only `--env preview`, and never runs a remote migration.

Normal lifecycle for Preview-compatible PRs:

```text
main on Preview
→ Deploy PR to Preview
→ inspect PR
→ Reset Preview Workspace
→ Restore Main to Preview
→ next PR
```

Do not use that workflow for the Stage B schema-foundation PR.

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
- `tag_shared` as an allowed Review Question source type.

SQLite/D1 cannot alter the existing Review source-type CHECK in place, so `0008` conservatively rebuilds `review_questions`. The migration copies every existing Review Question ID, Review ID, Prompt ID, source type, Concept/stimulus provenance, display order, prompt snapshot and answer snapshot unchanged, initializes `source_shared_question_id` to `NULL`, then recreates the existing unique/index constraints plus a shared-provenance lookup index.

The migration does not seed production content and does not snapshot Tag IDs onto Reviews.

**Operational gate:** this PR must not apply `0008` remotely. After merge, apply `0008` to production D1 before starting/deploying the Stage B behavior PR.

## Admin UI state

The shared Admin shell intentionally supports a wide desktop content-management workspace: it uses a larger responsive maximum width while retaining an approximately 210px navigation rail, a bounded outer gutter, and a fluid gap before the main content. Wide pages such as Image Library should use that available width; form-heavy pages may still constrain their own readable fields. Responsive grids should adapt to available space with intrinsic minimum card sizes rather than assuming a fixed desktop column count.

Production Admin surfaces remain:

```text
Dashboard
Cases
Questions
Images
Topics
Tags
Import package
```

The Case editor order remains:

```text
Topics → Case → Images → Case questions → Preview
```

There is **no Shared Question Admin authoring UI yet**. Do not add one in the schema-foundation PR.

There is still no Asset Tag model or generic library-wide stimulus Move. Do not reinterpret stimulus groups as media folders.

## Tagging state

### Stage A — merged

- flat canonical Tags;
- Case↔Tag;
- contextual Case Question↔Tag;
- Admin curation/filtering;
- no Case Tag inheritance onto Questions;
- no clinical Tags on `question_prompts`;
- no learner resolver change.

### Stage B schema foundation — landed in this PR

- dedicated `shared_questions` entity;
- descriptive `shared_question_tags`;
- exactly one reuse-scope Tag per Shared Question;
- active-prompt uniqueness with archived history allowed;
- future `tag_shared` Review source type and Shared Question provenance;
- no Preview ownership column;
- no learner behavior change;
- no Shared Question Admin UI.

### Stage B behavior/authoring — next PR

Implement only after production D1 has `0008`:

- matching Case Tag creates Shared Question eligibility, not mandatory inclusion;
- Shared Question Admin authoring/curation;
- learner resolver integration using the agreed precedence;
- Prompt deduplication;
- Automatic / All / Fixed interaction;
- Review creation with `source_type = tag_shared` and `source_shared_question_id`;
- learner/regression coverage.

Agreed future precedence:

```text
selected stimulus option
> stimulus group
> Case
> exact Study Topic
> tag-shared Question
> eligible ancestor Topic
```

## R2 rules

Teaching images remain private. All production/Preview image writes continue through the existing protected media helpers and R2 cost guardrails.

Production teaching-image keys are immutable. Preview uploads use only the isolated Preview prefix and are cleaned during Reset after ownership/usage checks. Reviewed import staging remains separate operational data and is not an Asset.

Tagging Stage B schema work does not change R2.

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

PR CI covers this exact validation set. The Stage B schema-foundation PR is not ready for merge consideration until its final head is green.

## Next intended implementation workflow

For Stage B specifically:

```text
merge schema-foundation PR
→ apply 0008_tag_shared_questions.sql to production D1
→ confirm production schema is current
→ start fresh behavior/authoring branch from current main
→ implement Shared Question Admin authoring + Tag eligibility + resolver integration
→ preserve current precedence/Review snapshot guarantees
→ get CI green
→ if the behavior PR is schema-free, Deploy PR to Preview for human review
→ merge only after review
```

ECG/Anki content ingestion may continue in parallel, but should not depend on learner tag-shared behavior until the behavior PR lands.
