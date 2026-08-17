# Flash-Cards agent handover

_Refreshed: 17 August 2026_

## Current outcome

The project has a D1-backed learner Study flow, protected/private R2 teaching images, an Admin CMS, optional stimulus groups, multi-Topic Case routing, Tagging Stage A, and the reviewed/resumable content-import path.

Recent merged infrastructure/product milestones are:

- PR #29 — Admin Case image-authoring workflow;
- PR #30 — Production-backed Preview Admin workspace;
- PR #31 — production Admin identity reuse for Preview through `admin,preview_admin`;
- PR #32 — Restore Main to Preview workflow;
- PR #33 — Image Management V2 planning and refreshed product roadmap.

**Draft PR #34 (`agent/image-management-v2`) is the current Image Management V2 implementation.** It is based on the post-PR-#33 `main`, remains a draft, adds D1 migration `0007_image_collections.sql` and does not modify `wrangler.jsonc`.

Its implemented Admin workflow includes:

- 60-item server-backed Image Library pages with exact matching counts;
- deterministic search/filter/sort pagination;
- cross-page explicit selection within one canonical query context;
- exact `Select all N matching images` up to 300 Assets and explicit refusal above 300;
- retention of the 30-Asset server mutation bound with sequential client chunks for larger selections;
- visible progress and stop-on-first-failure completed/remaining accounting;
- an identity-preserving same-Case `stimulus_group_option` Move between active alternative sets;
- production/Preview ownership enforcement for every new relationship workflow;
- unchanged learner stimulus and Review semantics.

It also adds Image Library Collections: Topic remains educational Case classification, Tag remains cross-cutting clinical metadata, and Collection is a separate organisational bucket. Each Asset has zero or one Collection; null is displayed as Unsorted. Production Admin can create Collections, filter/sort by them, assign selected Assets in bounded sequential chunks, reset them to Unsorted and edit one Asset's Collection. Preview can display/filter/sort the global metadata but cannot mutate production assignments.

The next major product-facing implementation track after Image Management V2 is **Tagging Stage B/shared tag-reusable Questions**, while ECG/Anki content ingestion continues in parallel.

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

Questions belong at the highest context where the answer remains correct:

```text
reusable Topic
→ Case
→ stimulus group
→ exact stimulus option
```

Tags are cross-cutting metadata. Case Tags and contextual Case Question Tags do not replace Topic/Case ownership.

Case-specific image captions remain relationship metadata. Exact-image questions stay attached to their exact `stimulus_group_option`. A Case-specific `stimulus_group` is a learner alternative-stimulus concept, not a generic media folder.

## Image Management V2 implementation boundary

Draft PR #34 extends the PR #29 baseline without flattening image relationships.

### Paginated Image Library

`/admin/images` and `/preview-admin/images` use 60-item server pages. The server provides exact result count, normalized current page and total pages. Stable Asset-ID tie-breakers make each sort deterministic. Applying a changed search/filter/sort query starts on page 1.

Only the current bounded Asset page is loaded for rendering. Production Image Library reads exclude Preview-owned Assets and exclude Preview Case relationships from production usage counts.

### Cross-page selection

Explicit selected Asset IDs persist while navigating page 1 -> page 2 within the same canonical search/filter/sort query.

Changing search text, Topic, usage, active/inactive, source, or sort clears the old selection universe. Page number alone does not. Ctrl/Cmd and touch Select mode remain explicit-ID operations. Shift ranges remain limited to the currently loaded page/order. `Clear selection` clears all cross-page IDs and the Shift anchor.

The Case-editor Asset picker remains a separate bounded workflow and retains hidden-result pruning.

### Exact Select All

The exact all-matching cap is 300 Assets.

- `<=300`: the server resolves the exact matching Asset IDs;
- `>300`: Select All is refused and the Admin must narrow the query;
- there is no silent first-300 truncation and no implicit selection token.

### Bulk mutation bound

The server still accepts at most 30 unique Asset IDs per relationship-write request. Larger explicit selections are split into sequential <=30-ID requests, with only one request in flight at a time.

Each request independently revalidates authorization, Asset validity, target Case/group ownership, relationship conflicts and coverage. If a chunk fails, later chunks stop, earlier commits remain, and failed/unprocessed IDs remain selected where practical.

There is no persistent bulk-job table in V2.

### Same-Case option Move

Schema inspection confirmed that `stimulus_group_options.id` can remain stable while `stimulus_group_id` changes. Exact-option questions reference the option ID, so V2 safely updates the existing option row rather than delete/recreate.

The Case editor therefore exposes **Move to another set…** only on an existing alternative-option card. It supports:

```text
Case A / Set 1 / existing option
→ Case A / Set 2
```

It preserves:

- option ID;
- Asset identity;
- Case-specific caption;
- active state;
- exact-option Question relationships/answers;
- other option-owned metadata.

The target receives the next valid display order. Group-level questions remain attached to their original groups.

Move rejects cross-Case targets, inactive/missing source or target relationships, duplicate target membership, ownership violations and moves that violate current stimulus-specific coverage/fixed Case question-count constraints.

Fixed `case_assets` conversion remains a separate explicit authoring operation. Case Questions are never automatically re-scoped as exact-image questions.

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

Preview may browse/search/filter/paginate/select production Assets read-only. V2 Preview bulk Add may target only current-session Preview-owned active stimulus groups. Preview Move may move only a current-session Preview-owned option between Preview-owned active groups in the same Preview-owned Case.

Preview must never mutate production Case rows, production Asset metadata, production R2 objects or production stimulus relationships.

## Shared Case editor contract

Preview renders the real production Case-editor Svelte component. It does not maintain a copied editor UI.

`test/admin-editor-preview-contract.test.js` remains the contract for shared named form actions/data. New V2 Move uses matched production/Preview relationship endpoints rather than introducing an unmatched named `?/` action.

Any future named shared-editor action must still have a safe Preview implementation or an explicit named `403` block.

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

## Preview reset/deployment lifecycle

V1 supports one live workspace per Preview Admin with a 24-hour expiry. Reset deletes only explicitly Preview-owned rows and Preview R2 objects under:

```text
preview/<preview-session-id>/...
```

Cleanup is idempotent; failed cleanup is surfaced and retried later.

Manual **Deploy PR to Preview** resolves an exact open same-repository PR head targeting `main`, blocks migration/schema/`wrangler.jsonc` candidates, runs standard validation, deploys only `--env preview`, and never runs a remote migration.

Normal lifecycle:

```text
main on Preview
→ Deploy PR to Preview
→ inspect PR
→ Reset Preview Workspace
→ Restore Main to Preview
→ next PR
```

For draft PR #34, human review should follow the exact Image Management V2 procedure in `IMAGE_MANAGEMENT_V2_PLAN.md` and the PR description after CI is green.

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
```

Draft PR #34 adds `0007_image_collections.sql`; the migration/schema foundation must be reviewed and applied first. Because the Preview workflow blocks schema-bearing diffs, PR #34 must then be rebased/updated so those already-landed files are no longer in its diff before its code-only head is used against the production-backed Preview database.

## Admin UI state

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

There is still no global Asset-folder schema, Asset Tag model or generic library-wide Move. Do not reinterpret stimulus groups as media folders.

## Tagging state

Stage A is merged:

- flat canonical Tags;
- Case↔Tag;
- contextual Case Question↔Tag;
- Admin curation/filtering;
- no Case Tag inheritance onto Questions;
- no clinical Tags on `question_prompts`;
- no learner resolver change.

Stage B remains pending:

- dedicated shared/tag-reusable Question entity;
- descriptive shared Question Tags;
- one reuse-scope Tag initially;
- matching Case Tag creates eligibility, not mandatory inclusion;
- learner resolver integration using the agreed precedence;
- Review provenance/snapshot and deduplication regression coverage.

## R2 rules

Teaching images remain private. All production/Preview image writes continue through the existing protected media helpers and R2 cost guardrails.

Production teaching-image keys are immutable. Preview uploads use only the isolated Preview prefix and are cleaned during Reset after ownership/usage checks. Reviewed import staging remains separate operational data and is not an Asset.

Image Management V2 changes only relationship/query workflows; it does not rename/delete production R2 objects.

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

PR CI covers these checks. Do not call draft PR #34 ready for human review until its final head is green.

## Next intended implementation workflow

After Image Management V2 is reviewed/merged, proceed from fresh current `main` with Tagging Stage B or continued content-ingestion work. For every Preview-deployable Admin PR:

```text
start from current main
→ preserve product/data model boundaries
→ avoid migration/wrangler changes where possible
→ maintain Preview ownership/contracts in the same PR
→ get CI green
→ Deploy PR to Preview
→ exercise disposable Preview relationships
→ confirm production source unchanged
→ Reset Preview Workspace
→ Restore Main to Preview
→ merge only after human review
```
