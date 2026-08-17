# Production-backed Preview Admin Workspace

Status: implementation prepared for review. Production rollout is intentionally separate.

## Purpose

Admin UI changes need a real browser and current teaching content. The owner does not want a second D1 database, second R2 bucket, or synchronized staging dataset. The Preview design therefore uses a separate Worker while binding it to the same existing D1 database and same existing R2 bucket as production.

This is not equivalent to an independently isolated staging database. Safety depends on narrow Preview capabilities, explicit ownership, database constraints, central learner filtering, hard route boundaries, manual deployment, and deliberate restrictions on global editing.

## Worker and resource layout

```text
Production Worker: flash-cards
  -> DB:    flash-cards-db
  -> MEDIA: flash-cards-media

Preview Worker: flash-cards-preview
  -> DB:    flash-cards-db       (same D1)
  -> MEDIA: flash-cards-media    (same R2)
  -> PREVIEW_MODE=true
  -> Preview BETTER_AUTH_URL
  -> separate Preview BETTER_AUTH_SECRET configured by the operator
```

No second D1 database or R2 bucket is created.

The named Wrangler environment is `preview`. D1/R2 bindings and vars are repeated in that environment because bindings/vars are environment-specific. Deploy the Preview Worker with `wrangler deploy --env preview`.

## Preview Admin identity

Preview authority requires both:

1. a Better Auth user whose role set includes `preview_admin`; and
2. a runtime where `PREVIEW_MODE=true`.

Roles are treated as a comma-separated set. A dedicated Preview-only identity may have `preview_admin`, while an existing production owner/admin may intentionally have:

```text
admin,preview_admin
```

The combined role preserves normal production Admin authorization through `admin` and grants Preview authorization through `preview_admin`. The same email/password can therefore be used on both Workers when the existing production Admin is promoted. Production and Preview still use separate `BETTER_AUTH_SECRET` values, so their browser sessions remain separate.

A normal `admin` does not automatically satisfy Preview authorization, and a Preview-only `preview_admin` does not satisfy production Admin authorization. Email addresses are not authorization rules.

See `PREVIEW_ADMIN_IDENTITY.md` for the identity-specific operator rules and implications.

### Bootstrap procedure

Always start from current `main`:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run preview-admin:bootstrap
```

The script is interactive and fail-closed.

If the requested email already belongs to a non-banned production `admin`, the script reuses that same Better Auth identity and credential account, preserves the existing password and any other roles, and adds `preview_admin` after the explicit `ADD PREVIEW` confirmation. It refuses to elevate an existing non-admin/learner account, refuses an unexpected credential shape, and refuses a second distinct Preview Admin.

If the requested email does not exist and no Preview Admin exists, the original dedicated-account path remains available. That path requires a name, explicit `CREATE PREVIEW` confirmation, and a password of at least 12 characters, then creates a `preview_admin`-only Better Auth credential user.

If the requested existing production Admin already has both roles, the script is idempotent and reports that no change is needed. It verifies the resulting role/credential state after a write. No identity, password, API token, or secret is committed to the repository.

Do not run this bootstrap during PR review.

## Hard route boundaries

Because the Preview Worker has real production D1/R2 bindings, production routes and privileged shared-auth mutations are denied before their page/action/auth-handler code can run:

- `/admin` and every descendant return `403` on the Preview Worker, even for a real production `admin` account;
- `/study` and every descendant return `403` on the Preview Worker;
- `/api/auth/admin` and every descendant return `403` on the Preview Worker before Better Auth handles the request;
- a `preview_admin` identity is also denied from `/study` on the production Worker.

Better Auth's ordinary Preview authentication endpoints remain available, including sign-in, sign-out and session lookup under `/api/auth`. Only the Admin-plugin subtree is blocked on the Preview Worker.

The request hook enforces these boundaries so direct POSTs/form actions/auth API calls cannot bypass a layout loader. The Admin and Study layouts provide defense in depth, and learner Review creation/reveal/rate/next server actions repeat the Study guard.

Preview authoring is available only through `/preview-admin`. Any identity carrying Preview authority must never create ordinary learner Reviews or progress/history records, and neither a production `admin` nor a Preview user may use the Preview Worker to invoke Better Auth Admin-plugin user-management operations against the shared production auth tables.

The operator lifecycle is: deploy a candidate PR with **Deploy PR to Preview**, inspect it, use **Reset Preview Workspace** to delete disposable Preview content, then run **Restore Main to Preview** to replace the Preview Worker code with current `main`. Deploy changes code without migrations; Reset changes content without code deployment; Restore replaces code without deleting workspace content or running migrations. Normally perform Reset, then Restore.

## Preview Sessions

`preview_sessions` records:

- unique session ID;
- owning Better Auth user ID;
- status: `active`, `cleanup_required`, or `cleaned`;
- expiry timestamp;
- last cleanup error;
- creation/update timestamps.

V1 allows one live workspace per Preview Admin. Sessions expire after 24 hours.

On later Preview access, an expired or cleanup-required owned session is cleaned before a new workspace is created. If cleanup fails, the old session remains retryable and a replacement workspace is not silently created.

Browser close, connectivity loss, or authentication expiry does not make Preview content learner-visible because Preview ownership is structural rather than session-cookie-only.

## Explicit ownership

The migration adds nullable `preview_session_id` ownership to:

- `cases`;
- `question_prompts`;
- `assets`.

Production records use `preview_session_id IS NULL`. Preview-created records carry the current session ID. Ownership is immutable after creation.

`is_active` is not used to infer Preview ownership.

Database triggers provide defense in depth for important invariants:

- learner Reviews cannot reference Preview Cases;
- Preview Question Prompts cannot become reusable Topic questions;
- contextual Question Prompt ownership must match the owning Preview Case/session;
- Preview Assets can only be attached within their owning Preview Session;
- Case/Prompt/Asset Preview ownership cannot be switched later by update.

Application mutation helpers also validate the current session and target ownership. Browser form IDs are never treated as proof of authority.

## Learner isolation

The central learner data-access layer requires production Cases (`preview_session_id IS NULL`) for normal study eligibility.

The same layer excludes Preview-owned Question Prompts and Assets while constructing Reviews. This covers normal Topic availability/counts, Case selection, Review creation, fixed images, alternative stimulus images, and contextual question pools.

A D1 trigger separately rejects a raw Review insert that points at a Preview Case.

Preview-owned image delivery also requires the dedicated Preview Worker, `preview_admin`, and the exact owning live Preview Session. Knowing a Preview Asset ID is not enough to retrieve it as a normal learner.

## Normal Admin isolation

Production `/admin` requires the normal `admin` role and is unavailable on the Preview Worker.

Normal Admin read models exclude disposable Preview ownership rather than relying on the UI to hide rows. This includes:

- Case library/detail;
- Question library/detail;
- Image/Asset library/detail;
- Topic Case/question counts and Topic detail;
- Tag Case/question counts, taggable targets, and assignment detail;
- the legacy Admin dashboard Asset list and Question count.

Production Assets are intentionally reusable read-only inside Preview clones. Therefore normal Asset usage counts/details also exclude relationships whose owning Case is Preview-owned; a Preview clone must not make a production image look more heavily used in normal Admin.

Normal Tag mutation guards reject Preview Case/Question targets even if an ID is manually submitted.

Preview UI is separate under `/preview-admin` and is available only on the Preview Worker.

## Creating a Preview copy

The Preview home page browses real active production Cases read-only. `Create Preview Copy` creates a new Preview-owned Case and leaves the source Case unchanged.

The clone copies the Case-owned V1 authoring graph:

- Case row, vignette, question-selection settings and active state;
- Case <-> Topic relationships;
- Case Tags;
- fixed `case_assets`, display order and Case-specific captions;
- Case Questions and contextual Case Question Tags;
- stimulus groups and coverage settings;
- stimulus group options, captions/order/active state;
- group-specific questions;
- option/image-specific questions.

Existing production Assets are reused by ID. Their global metadata and R2 objects are not modified.

### Question Prompt isolation

Every contextual Question Prompt reachable from the cloned Case is cloned as a Preview-owned Question Prompt. If the source prompt is reused by multiple contextual relationships, that sharing is preserved inside the disposable Preview graph through one cloned prompt.

Preview edits therefore never update the corresponding production Question Prompt.

Topic-level reusable production questions are not copied into the Preview Case. Preview Mode cannot create Topic-level reusable sharing. The relevant UI is disabled and the server rejects that write.

## Preview editing scope

V1 supports the disposable Case and its owned/contextual relationships:

- Case title/vignette/question-selection settings;
- Case relationships to existing Topics (Topic records remain read-only);
- contextual Case questions;
- fixed image relationships and Case-specific captions/order;
- alternative stimulus groups/options;
- group- and option-specific contextual questions;
- reuse of existing production Assets;
- Preview-only image uploads.

The following remain unavailable/read-only in Preview Mode:

- global Topic metadata;
- production Asset metadata/activation/delete/replace;
- production Question Prompt editing;
- reusable Topic-question creation;
- learner/user administration;
- learner Study/Review creation;
- Better Auth Admin-plugin user-management APIs;
- content import.

Existing Case Tags and contextual Case Question Tags are preserved when a Case is cloned. Global Tag definition editing is not expanded by this V1.

## Shared Case editor contract

Preview deliberately renders the real production Case-editor Svelte component rather than maintaining a copied Preview UI.

That reuse creates a server-contract obligation: every named form action and every top-level `data.*` value consumed by the production editor must have a safe Preview counterpart.

`test/admin-editor-preview-contract.test.js` reads the shared editor and fails CI when:

- the production editor adds a named form action that `/preview-admin/cases/[caseId]` does not implement; or
- the production editor starts reading a top-level server-data key that `loadPreviewCaseEditor()` does not supply.

A Preview action may implement the operation with Preview ownership checks or explicitly return a named `403` when the capability is intentionally unavailable. It must not silently fall through to a production mutation helper.

This contract is especially important when rebasing later Admin-editor work such as PR #29. New actions/data (for example multi-attach/upload-and-attach/caption changes or a server-backed image picker) must be given safe Preview adapters as part of that rebase.

## Preview image uploads

Preview uploads use the same `MEDIA` bucket but continue through the existing central media guardrail helper. Keys use the isolated prefix:

```text
preview/<preview-session-id>/<uuid>.png
preview/<preview-session-id>/<uuid>.jpg
```

The Asset row is explicitly owned by the Preview Session.

Preview Mode does not provide an operation that replaces or deletes a production R2 object.

## Reset algorithm

`Reset Preview Workspace` means delete the disposable Preview workspace. It does not restore production rows to earlier values.

Cleanup is retryable:

1. verify session ownership;
2. enumerate only records with the current `preview_session_id`;
3. stop if a learner Review unexpectedly references an owned Preview Case;
4. before deleting a Preview-uploaded Asset, verify its key has the current Preview prefix, it has no Review history, and every current Case/stimulus usage belongs to the same session;
5. stop if a Preview-owned Question Prompt has acquired reusable Topic usage;
6. delete verified Preview R2 objects through the central delete helper;
7. delete contextual tags/questions, stimulus graph, Case assets/tags/topics, and Preview Cases in foreign-key-safe order;
8. delete unreferenced Preview Question Prompts and Preview Asset rows;
9. mark the session `cleaned`.

If cleanup fails, the session becomes `cleanup_required`, the error is retained, the UI reports failure, and a later Reset/login can retry. Repeating Reset after successful cleanup is safe.

Normal Preview logout runs Reset first and signs out only after successful cleanup. Logout is not the only safety mechanism; abandoned workspaces remain isolated and are recovered on later access.

## Manual Deploy PR to Preview workflow

`.github/workflows/deploy-pr-to-preview.yml` uses `workflow_dispatch` with a PR-number input.

It:

1. resolves the PR metadata through GitHub;
2. requires an open PR targeting `main`;
3. requires the PR head repository to equal this repository;
4. captures the exact immutable head SHA and base SHA;
5. checks out exactly that SHA;
6. blocks schema/migration-changing PRs;
7. blocks any PR that modifies `wrangler.jsonc`;
8. installs dependencies with `npm ci` from the reviewed lockfile;
9. runs `npm run db:check`, `npm test`, `npm run check`, `npm run build`, `node scripts/local-auth-smoke.mjs`, and `git diff --check`;
10. verifies the Preview target as defense in depth;
11. exposes Cloudflare API credentials only to the deploy step;
12. deploys with `npx --yes wrangler@4.123.0 deploy --env preview`;
13. writes the exact deployed SHA and Preview URL into the Actions summary.

The workflow has no remote D1 migration command and does not use the D1 write token.

## Schema- and Worker-config-changing PR limitation

A production-backed Preview cannot safely run an arbitrary unmerged D1 schema or unreviewed Worker binding configuration against production data.

The manual workflow blocks PRs that change `drizzle/`, `drizzle.config.js`, `src/lib/server/db/schema.js`, schema-named DB modules, or `wrangler.jsonc`.

A migration must first be separately reviewed, merged and applied through the normal production release process. A Worker configuration change must likewise be reviewed/merged separately before that configuration is used to preview another PR.

The Preview workflow never applies a PR migration simply to make a PR previewable and never accepts a candidate PR's own `wrangler.jsonc` changes as the authority for the deployment target.

## Residual production-resource risk

The Preview Worker shares production D1/R2 bindings and production Better Auth tables, so this is not hard resource isolation. Only trusted same-repository PRs should be deployed; deployment stays manual; validation runs before deployment; schema- and Worker-config-changing PRs are blocked; production `/admin`, learner `/study`, and Better Auth `/api/auth/admin` are unavailable on the Preview Worker; Preview capabilities are narrow; and global/shared editing remains unavailable.

D1 recovery/Time Travel is catastrophe recovery only, not normal Preview Reset.

## Operator release procedure

Do not execute these steps until the relevant changes are reviewed and intentionally released.

1. Merge the reviewed Preview Admin workspace changes to `main`.
2. Apply any reviewed Preview schema migration to the production D1 through the normal migration/release process.
3. Re-run production validation/smoke checks.
4. Configure a separate `BETTER_AUTH_SECRET` for the `preview` Wrangler environment. Do not commit it.
5. Confirm GitHub has `CLOUDFLARE_ACCOUNT_ID` and a least-privilege `CLOUDFLARE_API_TOKEN` able to deploy Workers. The Preview deployment workflow does not need a D1 write token.
6. Deploy the reviewed infrastructure to the Preview Worker with `npx --yes wrangler@4.123.0 deploy --env preview` (or the equivalent reviewed operator deployment).
7. Confirm the Preview Worker is reachable and clearly shows Preview Mode; verify `/admin`, `/study`, and `/api/auth/admin` all return `403` there while normal Preview sign-in/session endpoints still work.
8. From current `main`, run `npm run preview-admin:bootstrap`. For an existing production Admin email, confirm `ADD PREVIEW` so the existing identity/password is retained and the role set gains `preview_admin`; otherwise use the dedicated new-identity path.
9. Sign in to the Preview Worker, create one Preview copy, edit it, then Reset and confirm the source production Case remains unchanged.
10. For a later UI PR such as PR #29, first ensure it does not modify schema files or `wrangler.jsonc`, then run GitHub Actions -> **Deploy PR to Preview**, enter the PR number, verify the reported exact SHA, and test the Preview URL.

## Emergency recovery distinction

Routine Preview cleanup always uses explicit Preview ownership and Reset. If a serious defect ever changes production data outside those intended boundaries, stop Preview deployment and use the normal production incident/recovery process. D1 recovery/Time Travel is reserved for that situation and is not part of normal workspace cleanup.
