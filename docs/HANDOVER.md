# Flash-Cards agent handover

_Refreshed: 17 August 2026_

## Current outcome

The project has a D1-backed learner Study flow, protected/private R2 teaching images, an Admin CMS, optional stimulus groups, multi-Topic Case routing, tags, and the reviewed/resumable content-import path.

PR #30 — **Production-backed Preview Admin workspace** — has been merged and deployed. Migration `0006_preview_admin_workspace.sql` was applied successfully to the existing production D1; the production `flash-cards` Worker and separate `flash-cards-preview` Worker are deployed; and the Preview Worker now has its own independently generated `BETTER_AUTH_SECRET`.

Live read-only smoke verification also passed: Preview `/admin`, `/study`, and `/api/auth/admin` return `403`, while Preview and production `/sign-in` return `200`.

The remaining Preview rollout work is human identity/authenticated smoke testing only: bootstrap the dedicated `preview_admin` login that the owner will actually use, then smoke-test Create Preview Copy -> edit -> Reset. No second D1 database or R2 bucket is required.

## Read first

```text
docs/AUTHORING_MODEL.md
docs/V1_DATA_MODEL.md
docs/CONTENT_MODEL_EXAMPLES.md
docs/PREVIEW_ADMIN_WORKSPACE.md
docs/CLOUDFLARE.md
docs/ADMIN_IMAGE_AUTHORING_WORKFLOW.md
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

A dedicated `preview_admin` identity on the Preview Worker can browse real Cases and create disposable Preview copies. Preview-owned Cases, contextual Question Prompts and Preview uploads carry an explicit `preview_session_id`.

The Preview clone copies Case-owned authoring relationships, including Case↔Topic links, Case/Question tags, fixed image relationships/captions, stimulus groups/options and contextual questions. Existing production Assets are reused read-only. Editable contextual Question Prompts are cloned so Preview edits cannot reach production prompts.

Global Topic editing, production Asset metadata editing, production Question Prompt editing, learner/user administration, learner Study/Review creation, Better Auth Admin-plugin user-management operations, and imports remain unavailable in Preview Mode.

## Hard request boundaries

The Preview Worker has real production bindings and shared production auth tables, so route isolation is enforced before page/action/auth-handler code runs:

```text
Preview Worker /admin/**              -> 403
Preview Worker /study/**              -> 403
Preview Worker /api/auth/admin/**     -> 403
preview_admin on production /study/** -> 403
```

The request hook is the primary boundary. Admin/Study layouts and Study Review actions repeat the relevant guards as defense in depth. This prevents direct form-action POSTs from bypassing a layout check.

The Better Auth Admin-plugin subtree is also rejected in the hook before Better Auth handles the request. Ordinary Preview authentication endpoints under `/api/auth` remain available for sign-in, sign-out and session lookup.

A normal production `admin` therefore cannot sign into the Preview Worker and use either the unrestricted production Admin CMS or Better Auth's privileged Admin APIs against the shared production D1/auth tables.

A `preview_admin` cannot create, reveal, rate, complete, or continue ordinary learner Reviews.

The deployed Preview Worker boundaries were live-smoke-tested after rollout: `/admin`, `/study`, and `/api/auth/admin` returned HTTP `403`, while `/sign-in` returned HTTP `200`.

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

Current normal Admin filtering covers:

- Cases;
- Questions;
- Images/Assets;
- Topic Case/question counts and detail;
- Tag Case/question counts, taggable targets, and assignment detail;
- the legacy Admin dashboard Asset list and Question count.

Production Assets may be reused read-only by Preview clones, but those Preview Case relationships are excluded from production Asset usage counts/details. Preview-owned Assets themselves are also excluded and are not valid normal Asset metadata targets.

## Shared Case editor contract

Preview renders the real production Case-editor Svelte component. It does not maintain a copied editor UI.

`test/admin-editor-preview-contract.test.js` is therefore a CI contract between that UI and `/preview-admin/cases/[caseId]`:

- every named form action used by the shared editor must exist in the Preview adapter (implemented safely or explicitly blocked with a named `403` action);
- every top-level `data.*` key read by the shared editor must be supplied by `loadPreviewCaseEditor()`.

When later Admin-editor work such as PR #29 is rebased, new editor actions/data must receive safe Preview support in the same change. This is intended to catch server/UI drift automatically rather than relying on manual preview testing to discover it.

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

This includes Preview Case fixed-image relationships, Preview stimulus groups/options, copied Preview Question Prompts and their image/set question relationships, plus Preview-uploaded Assets and their `preview/<preview-session-id>/...` R2 objects. Production Cases, production Question Prompts, production Assets, production R2 objects, and production Case relationships remain unchanged.

D1 Time Travel is emergency recovery only, not Preview Reset.

## Preview deployment

A manual GitHub Actions workflow, **Deploy PR to Preview**, accepts a PR number and:

- resolves the exact PR head SHA;
- requires an open same-repository PR targeting `main`;
- rejects fork heads before Cloudflare credentials are used;
- blocks D1 migration/schema-changing PRs;
- blocks any PR modifying `wrangler.jsonc`;
- installs with `npm ci`;
- runs standard validation;
- deploys only with Wrangler `--env preview`;
- reports the exact SHA and Preview URL in the Actions summary;
- never runs a remote D1 migration.

Worker configuration changes must be reviewed/merged separately before another PR can be used as a Preview candidate. The candidate PR is not allowed to redefine the Preview deployment target through its own `wrangler.jsonc`.

The Preview Worker still has production D1/R2 bindings and shared production auth tables. This is not hard resource isolation, so only trusted same-repository PRs should be deployed.

## Normal operator lifecycle

```text
main on Preview → Deploy PR to Preview → inspect PR → Reset Preview Workspace → Restore Main to Preview → next PR
```

Deploy changes Preview code without migrations; Reset removes disposable Preview content without changing code; Restore Main to Preview replaces the Worker code with current `main` without deleting workspace content or running migrations. Normally perform Reset, then Restore Main to Preview.

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

Migration `0006` was applied successfully to production D1 database `flash-cards-db` during deployment run `31994300533` on 17 August 2026.

## Admin UI state

Normal production Admin surfaces remain:

```text
Dashboard
Cases
Questions
Images
Topics
Import package
```

The Case editor's current authoring order is:

```text
Topics → Case → Images → Case questions → Preview
```

Fixed Case Assets and alternative stimulus sets are presented under one top-level Images section while retaining separate `case_assets` versus `stimulus_groups` / `stimulus_group_options` semantics. Fixed images receive large contain-fit previews and both fixed/alternative images can open the reusable Admin image viewer.

The Case page no longer eagerly loads or renders the full unused Asset Library. **Add images from library** opens a server-backed picker only when requested. It searches reusable Asset metadata, excludes Assets already used by the Case, returns at most 60 matches, supports multi-select, and can target either fixed Case images or an active alternative set. Uploading a new Asset is available inside the picker and still uses the existing protected R2/storage/provenance path.

Alternative sets use compact thumbnail cards. Exact-option questions stay bound to the exact option and are collapsed by default when existing questions are present; set-wide questions and coverage remain advanced set-level controls.

`/admin/images` supports visible checkbox selection, Ctrl/Cmd toggle, Shift-range against the currently displayed filtered/sorted order, and an explicit Select mode for touch/mobile. A sticky bar can add selected Assets to an existing active Case alternative set.

Important grouping boundary: there is no global Asset-group schema. Bulk grouping therefore means **add to an existing Case-scoped stimulus group only**. It deliberately does not implement implicit Move/Remove semantics that could lose or obscure option-specific questions, captions, or activation state. One bulk attach/group action is capped at 30 unique Assets and is revalidated server-side.

`Select all N matching images` is deliberately deferred until there is a server-represented pagination/filter selection contract that can remain explicit and bounded. See `docs/ADMIN_IMAGE_AUTHORING_WORKFLOW.md`.

Preview UI is deliberately separate at:

```text
/preview-admin
```

Preview navigation also exposes `/preview-admin/images`, a read-only visual review of the shared Images-library selection UI. Production Assets may be searched, enlarged, and selected there, but bulk writes can target only active alternative sets owned by the current Preview Session; they create Preview relationship rows and never mutate production Asset or Case rows.

Normal Admin libraries/aggregates exclude disposable Preview ownership. Normal `/admin` is unavailable on the Preview Worker.

## R2 rules

Teaching images remain private and all normal/Preview teaching-image writes must continue through `putTeachingImage()` and the existing media guardrails.

Production teaching-image keys are immutable. Preview uploads use only the isolated Preview prefix and are deleted during workspace Reset after ownership/usage checks.

Reviewed import staging remains separate operational data under its existing import staging prefix and is not an Asset.

## Authentication boundaries

- normal `admin` -> production Admin CMS on the production Worker only;
- Better Auth Admin-plugin API -> production Worker only, never Preview Worker;
- dedicated `preview_admin` + `PREVIEW_MODE=true` -> Preview Admin;
- normal learner -> Study on the production Worker only.

`preview_admin` does not automatically satisfy production `admin` authorization. Authorization is server-side and is not based on a hard-coded email address.

The Preview Worker uses an independently generated `BETTER_AUTH_SECRET`; it does not reuse the production Worker secret. The value was generated inside a GitHub Actions runner and piped directly to Wrangler, so it was neither committed nor printed in the action log.

## Validation required before handoff

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

PR #30 CI passed before merge. The production rollout workflow then passed dependency installation, migration checks, all 169 tests, Svelte checks, build, production D1 migration, and Worker deployment. The Preview deployment/auth-secret workflow also passed migration checks, all 169 tests, Svelte checks, build, Preview Worker deployment, and secret configuration.

A separate read-only live smoke run (`31994864289`) confirmed:

```text
Preview /admin           -> 403
Preview /study           -> 403
Preview /api/auth/admin  -> 403
Preview /sign-in         -> 200
Production /sign-in      -> 200
```

Regression coverage includes Preview Worker `/admin`, `/study`, and Better Auth Admin-API boundaries, Preview Admin Study/Review denial, deployment candidate restrictions, shared-editor adapter drift, and Preview ownership exclusion from Topic/Tag/Asset normal Admin views.

## Current rollout status

Completed on 17 August 2026:

- PR #30 merged to `main` as squash commit `ef5be5afee0b89c0364ceaf904c8ba06e32f6c59`;
- migration `0006_preview_admin_workspace.sql` applied successfully to the existing production D1;
- production Worker `flash-cards` deployed successfully;
- production deployment Worker version: `9a4d9fbc-ba3f-49db-a56c-e9e3af15ab63`;
- production URL reported by Wrangler: `https://flash-cards.mmed-fm-flashcardstest.workers.dev`;
- Preview Worker `flash-cards-preview` deployed successfully against the same D1/R2;
- Preview deployment immediately before secret configuration reported Worker version `8347fd15-cca5-4159-b076-8dd43f614296`;
- Preview URL reported by Wrangler: `https://flash-cards-preview.mmed-fm-flashcardstest.workers.dev`;
- an independent cryptographically generated `BETTER_AUTH_SECRET` was uploaded successfully to the Preview Worker;
- live unauthenticated access-boundary smoke checks passed;
- temporary one-shot Preview deployment/smoke workflows were removed after successful rollout.

Still required before the owner can inspect UI as Preview Admin:

- bootstrap the dedicated `preview_admin` identity with an owner-chosen email/password;
- sign in to the Preview Worker and smoke-test Create Preview Copy -> edit -> Reset, confirming the production source Case remains unchanged.

## Next intended workflow after Preview identity bootstrap

```text
Admin UI PR (for example PR #29)
→ make sure the PR does not change D1 schema or wrangler.jsonc
→ CI enforces Admin-editor ↔ Preview-adapter contract
→ Deploy PR to Preview
→ sign in as Preview Admin
→ browse current real Cases read-only
→ Create Preview Copy
→ exercise the editor UI against disposable records
→ Reset Preview Workspace
→ disposable clone/uploads removed
→ production source remains unchanged
```
