# Flash-Cards agent handover

_Refreshed: 17 August 2026_

## Current outcome

The project has a D1-backed learner Study flow, protected/private R2 teaching images, an Admin CMS, optional stimulus groups, multi-Topic Case routing, Tagging Stage A, and the reviewed/resumable content-import path.

Recent infrastructure/product milestones are merged:

- PR #29 — Admin Case image-authoring workflow;
- PR #30 — Production-backed Preview Admin workspace;
- PR #31 — reuse an existing production Admin identity for Preview access through the combined `admin,preview_admin` role;
- PR #32 — Restore Main to Preview workflow.

Migration `0006_preview_admin_workspace.sql` has been applied successfully to the existing production D1. The production `flash-cards` Worker and separate `flash-cards-preview` Worker are deployed. The Preview Worker has its own independently generated `BETTER_AUTH_SECRET` while sharing the same Better Auth database tables.

Live unauthenticated boundary smoke verification passed after rollout: Preview `/admin`, `/study`, and `/api/auth/admin` return `403`, while Preview and production `/sign-in` return `200`.

Documentation does not assume that the owner identity has already been promoted/bootstrap-tested interactively. If that operator step has not yet been performed, use `npm run preview-admin:bootstrap` from current `main`, then sign into Preview and smoke-test Create Preview Copy → edit → Reset.

The next major product-facing implementation tracks are **Image Management V2** and **Tagging Stage B/shared tag-reusable Questions**, while ECG/Anki content ingestion continues in parallel.

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
    ├── fixed Assets
    ├── optional alternative stimulus groups/options
    └── contextual questions
```

`concepts` are called Topics in Admin UI. A Case has one primary/default Topic and may have additional Study Topics through `case_concepts`.

Questions belong at the highest context where the answer remains correct:

```text
reusable Topic
→ Case
→ stimulus group
→ exact stimulus option
```

Tags are cross-cutting metadata. Case Tags and contextual Case Question Tags do not replace Topic/Case ownership.

Tagging Stage A is merged. Tagging Stage B remains pending and is the learner-visible shared-question extension described in `TAGGING_MODEL_DECISIONS.md`.

## Current roadmap boundary

Do not confuse the following merged foundations with completion of their larger product areas:

```text
PR #29 image authoring baseline ≠ Image Management V2 complete
Tagging Stage A                ≠ shared/tag-reusable Questions complete
```

Image Management V2 is planned in `IMAGE_MANAGEMENT_V2_PLAN.md` and should add scalable pagination/selection plus explicit safe Case-scoped reorganisation without inventing ambiguous media semantics.

Tagging Stage B should add the dedicated shared-knowledge Question model, descriptive shared Question Tags, one reuse-scope Tag initially, Case eligibility from matching Tags, and learner resolver integration.

## Production-backed Preview Admin workspace

The Preview architecture is intentionally:

```text
ONE D1
ONE R2

Production Worker: flash-cards
Preview Worker:    flash-cards-preview
                    -> same DB binding
                    -> same MEDIA binding
```

No second D1 or R2 resource is part of this design.

The safety model is **clone then mutate**, never update production rows and attempt to roll them back later.

An identity carrying `preview_admin` on the Preview Worker can browse real Cases and create disposable Preview copies. The owner may use a dedicated Preview-only identity or an existing valid production Admin promoted to `admin,preview_admin` through the guarded bootstrap path.

Preview-owned Cases, contextual Question Prompts and Preview uploads carry an explicit `preview_session_id`.

The Preview clone copies Case-owned authoring relationships, including Case↔Topic links, Case/Question Tags, fixed image relationships/captions, stimulus groups/options and contextual questions. Existing production Assets are reused read-only. Editable contextual Question Prompts are cloned so Preview edits cannot reach production prompts.

Global Topic editing, production Asset metadata editing, production Question Prompt editing, learner/user administration, learner Study/Review creation, Better Auth Admin-plugin user-management operations, and imports remain unavailable in Preview Mode.

## Hard request boundaries

The Preview Worker has real production bindings and shared production auth tables, so route isolation is enforced before page/action/auth-handler code runs:

```text
Preview Worker /admin/**              -> 403
Preview Worker /study/**              -> 403
Preview Worker /api/auth/admin/**     -> 403
preview_admin on production /study/** -> 403
```

The request hook is the primary boundary. Admin/Study layouts and Study Review actions repeat relevant guards as defense in depth.

The Better Auth Admin-plugin subtree is rejected in the hook before Better Auth handles the request. Ordinary Preview authentication endpoints under `/api/auth` remain available for sign-in, sign-out and session lookup.

A production Admin identity does not gain Preview authoring merely by being `admin`; Preview requires `preview_admin` plus `PREVIEW_MODE=true`. Conversely, an identity promoted to `admin,preview_admin` can use production Admin and Preview Admin in their respective Workers, while the current safety policy denies that identity from learner Study.

## Critical learner isolation invariant

Normal learner Case eligibility is centrally constrained to:

```text
cases.preview_session_id IS NULL
```

Normal Review source loading also excludes Preview-owned Question Prompts and Assets.

Migration `0006_preview_admin_workspace.sql` adds a database trigger that rejects a learner Review insert for a Preview Case as defense in depth.

Preview content must never be made learner-visible simply to make Preview testing easier.

## Normal Admin isolation invariant

Disposable Preview ownership must not appear in normal production Admin counts/details.

Normal Admin filtering covers Cases, Questions, Images/Assets, Topic counts/details, Tag counts/details/taggable targets, and the legacy Admin dashboard aggregates.

Production Assets may be reused read-only by Preview clones, but those Preview Case relationships are excluded from production Asset usage counts/details. Preview-owned Assets are also excluded and are not valid normal Asset metadata targets.

## Shared Case editor contract

Preview renders the real production Case-editor Svelte component. It does not maintain a copied editor UI.

`test/admin-editor-preview-contract.test.js` is the CI contract between that UI and `/preview-admin/cases/[caseId]`:

- every named form action used by the shared editor must exist in the Preview adapter, either implemented safely or explicitly blocked with a named `403` action;
- every top-level `data.*` key read by the shared editor must be supplied by `loadPreviewCaseEditor()`.

Any Image Management V2 change touching shared Case-editor actions/data must maintain this contract in the same PR.

## Preview session/reset lifecycle

V1 supports one live workspace per Preview Admin with a 24-hour expiry.

Normal Preview logout performs:

```text
Reset Preview Workspace
→ Sign out
```

Reset deletes only explicitly Preview-owned records and Preview R2 objects under:

```text
preview/<preview-session-id>/...
```

Cleanup is idempotent. If cleanup fails, the session is marked `cleanup_required`, the error is surfaced, and a later Reset/login retries. Browser close/auth expiry is safe because abandoned Preview content remains structurally isolated.

D1 Time Travel is emergency recovery only, not Preview Reset.

## Preview deployment/operator lifecycle

Manual **Deploy PR to Preview**:

- accepts a PR number;
- resolves the exact PR head SHA;
- requires an open same-repository PR targeting `main`;
- rejects fork heads before Cloudflare credentials are used;
- blocks D1 migration/schema-changing PRs;
- blocks any PR modifying `wrangler.jsonc`;
- installs with `npm ci`;
- runs standard validation;
- deploys only with Wrangler `--env preview`;
- never runs a remote D1 migration.

**Restore Main to Preview** is also merged and restores current `main` code to the Preview Worker without running migrations or deleting Preview workspace data.

Normal lifecycle:

```text
main on Preview
→ Deploy PR to Preview
→ inspect PR
→ Reset Preview Workspace
→ Restore Main to Preview
→ next PR
```

Normally perform Reset before Restore Main.

## Current migrations

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
0004_resumable_import_jobs.sql
0005_tag_foundation.sql
0006_preview_admin_workspace.sql   # applied to production 17 August 2026
```

## Admin UI state

Normal production Admin surfaces include:

```text
Dashboard
Cases
Questions
Images
Topics
Tags
Import package
```

The Case editor authoring order is:

```text
Topics → Case → Images → Case questions → Preview
```

PR #29 provides the current image-authoring baseline:

- fixed Case Assets and alternative stimulus sets under one top-level Images section while retaining distinct relationship semantics;
- large contain-fit fixed-image previews;
- reusable image enlargement;
- compact alternative-option cards;
- a bounded server-backed **Add images from library** picker;
- upload-and-attach through existing R2/storage/provenance safeguards;
- `/admin/images` checkbox selection, Ctrl/Cmd toggle, Shift-range and touch Select mode;
- sticky bulk **Add to alternative set**;
- 30 unique Assets maximum per relationship-write action;
- Preview-compatible shared image workflows and production/Preview isolation hardening.

The following remain Image Management V2 work:

- server-backed pagination/exact result counts for a larger library;
- exact `Select all N matching` across pages with a conservative bound;
- sequential chunked bulk execution above 30 selected Assets;
- explicit safe same-Case alternative-option Move/reorganisation semantics where current schema can preserve option identity/context;
- clear failure/progress accounting for multi-request bulk operations.

There is still no global Asset-folder schema. Do not reinterpret Case stimulus groups as generic media folders.

## Tagging state

Stage A is merged:

- flat canonical Tags;
- Case↔Tag;
- contextual Case Question↔Tag;
- Admin curation/filtering;
- no Case Tag inheritance onto Questions;
- no clinical Tags on `question_prompts`;
- no learner resolver change.

Stage B is pending:

- dedicated shared/tag-reusable Question entity;
- descriptive shared Question Tags;
- one reuse-scope Tag initially;
- matching Case Tag creates eligibility, not mandatory inclusion;
- learner resolver integration using the agreed precedence;
- Review provenance/snapshot and deduplication regression coverage.

## R2 rules

Teaching images remain private and all normal/Preview teaching-image writes must continue through `putTeachingImage()` and the existing media guardrails.

Production teaching-image keys are immutable. Preview uploads use only the isolated Preview prefix and are deleted during workspace Reset after ownership/usage checks.

Reviewed import staging remains separate operational data under its existing import staging prefix and is not an Asset.

## Authentication boundaries

- `admin` -> production Admin CMS on the production Worker;
- `preview_admin` + `PREVIEW_MODE=true` -> Preview Admin;
- `admin,preview_admin` -> allowed for the owner identity across the respective production/Preview Admin surfaces while preserving separate sessions/secrets;
- Better Auth Admin-plugin API -> production Worker only, never Preview Worker;
- normal learner -> Study on the production Worker only;
- any identity carrying `preview_admin` is currently denied production learner Study by policy.

Authorization is server-side and is not based on a hard-coded email address.

## Validation required before handoff

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

For Admin UI changes intended for Preview, also maintain Preview-adapter contracts and production-vs-Preview ownership regression coverage.

## Current rollout status

Completed on 17 August 2026:

- Preview workspace code merged;
- migration `0006_preview_admin_workspace.sql` applied to production D1;
- production Worker deployed;
- Preview Worker deployed against the same D1/R2;
- separate Preview `BETTER_AUTH_SECRET` configured;
- live unauthenticated access-boundary smoke checks passed;
- existing production Admin identities can now be promoted safely to `admin,preview_admin` without changing their password;
- Restore Main to Preview workflow merged;
- PR #29 image-authoring workflow merged with Preview compatibility.

Operator identity bootstrap/promotion and authenticated Create Preview Copy → edit → Reset should be performed if not already completed by the owner. Do not infer completion merely from the code being merged.

## Next intended implementation workflow

For Image Management V2 or another Preview-deployable Admin UI PR:

```text
start from current main
→ read IMAGE_MANAGEMENT_V2_PLAN.md and related image/Preview docs
→ implement without migration/wrangler changes where possible
→ CI enforces shared-editor/Preview contracts
→ Deploy PR to Preview
→ sign in as Preview Admin
→ create disposable Preview Copy
→ exercise the UI against disposable records
→ verify production source unchanged
→ Reset Preview Workspace
→ Restore Main to Preview
→ merge only after review
```
