# Flash-Cards agent handover

_Refreshed: 17 August 2026_

## Current outcome

The project has a D1-backed learner Study flow, protected/private R2 teaching images, an Admin CMS, optional stimulus groups, multi-Topic Case routing, tags, and the reviewed/resumable content-import path.

The current infrastructure work is the **Production-backed Preview Admin workspace** described in `PREVIEW_ADMIN_WORKSPACE.md`.

Its purpose is to make Admin UI PRs visually testable in a browser without creating or synchronizing a second D1 database or R2 bucket.

## Read first

```text
docs/AUTHORING_MODEL.md
docs/V1_DATA_MODEL.md
docs/CONTENT_MODEL_EXAMPLES.md
docs/PREVIEW_ADMIN_WORKSPACE.md
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

Global Topic editing, production Asset metadata editing, production Question Prompt editing, learner/user administration and imports remain unavailable in Preview Mode.

## Critical learner isolation invariant

Normal learner Case eligibility is centrally constrained to:

```text
cases.preview_session_id IS NULL
```

Normal Review source loading also excludes Preview-owned Question Prompts and Assets.

Migration `0006_preview_admin_workspace.sql` adds a database trigger that rejects a learner Review insert for a Preview Case as defense in depth.

Preview content must never be made learner-visible simply to make Preview testing easier.

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

## Preview deployment

A manual GitHub Actions workflow, **Deploy PR to Preview**, accepts a PR number and:

- resolves the exact PR head SHA;
- requires an open same-repository PR targeting `main`;
- rejects fork heads before Cloudflare credentials are used;
- blocks D1 migration/schema-changing PRs;
- runs standard validation;
- deploys only with Wrangler `--env preview`;
- reports the exact SHA and Preview URL in the Actions summary;
- never runs a remote D1 migration.

The Preview Worker still has production D1/R2 bindings. This is not hard resource isolation, so only trusted same-repository PRs should be deployed.

## Current migrations

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
0004_resumable_import_jobs.sql
0005_tag_foundation.sql
0006_preview_admin_workspace.sql   # introduced by current Preview workspace PR
```

Migration `0006` is **not** to be applied as part of PR review. Production rollout is a separate operator action after review/merge.

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

Preview UI is deliberately separate at:

```text
/preview-admin
```

Normal Cases/Questions/Images libraries exclude disposable Preview-owned rows.

## R2 rules

Teaching images remain private and all normal/Preview teaching-image writes must continue through `putTeachingImage()` and the existing media guardrails.

Production teaching-image keys are immutable. Preview uploads use only the isolated Preview prefix and are deleted during workspace Reset after ownership/usage checks.

Reviewed import staging remains separate operational data under its existing import staging prefix and is not an Asset.

## Authentication boundaries

- normal `admin` -> production Admin CMS;
- dedicated `preview_admin` + `PREVIEW_MODE=true` -> Preview Admin;
- normal learner -> Study only.

`preview_admin` does not automatically satisfy production `admin` authorization. Authorization is server-side and is not based on a hard-coded email address.

## Validation required before handoff

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

GitHub CI must be green before this Preview infrastructure is considered merge-ready.

## Production release boundary

This PR prepares code, migration, workflow and documentation only. Do not during review:

- apply migration `0006` remotely;
- deploy production;
- deploy the Preview Worker;
- create Cloudflare secrets;
- bootstrap the Preview Admin;
- merge the PR.

After review, follow the operator release procedure in `PREVIEW_ADMIN_WORKSPACE.md`.

## Next intended workflow after release

```text
Admin UI PR (for example PR #29)
→ Deploy PR to Preview
→ sign in as Preview Admin
→ browse current real Cases read-only
→ Create Preview Copy
→ exercise the UI against disposable records
→ Reset Preview Workspace
→ disposable clone/uploads removed
→ production source remains unchanged
```
