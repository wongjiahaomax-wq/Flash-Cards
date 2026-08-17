# Production-backed Preview Admin Workspace

Status: implementation prepared for review. Production rollout is intentionally separate.

## Purpose

Admin UI changes need a real browser and current teaching content. The owner does not want a second D1 database, second R2 bucket, or synchronized staging dataset. The Preview design therefore uses a separate Worker while binding it to the same existing D1 database and same existing R2 bucket as production.

This is not equivalent to an independently isolated staging database. Safety depends on narrow Preview capabilities, explicit ownership, database constraints, central learner filtering, manual deployment, and deliberate restrictions on global editing.

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

1. a Better Auth user with the dedicated `preview_admin` role; and
2. a runtime where `PREVIEW_MODE=true`.

`preview_admin` does not satisfy normal production Admin authorization. A normal `admin` also does not automatically satisfy Preview authorization.

Email addresses are not authorization rules.

### Bootstrap procedure

After the migration has been reviewed, merged and applied, run:

```bash
npm run preview-admin:bootstrap
```

The script is interactive, requires an explicit confirmation phrase, requires a password of at least 12 characters, refuses a second Preview Admin, refuses an already-used email, writes the Better Auth user/credential rows, and verifies the resulting role. No identity, password, API token, or secret is committed to the repository.

Do not run this bootstrap during PR review.

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

Production `/admin` continues to require the normal `admin` role. Normal Cases, Questions and Images libraries apply production-ownership filtering so disposable Preview rows do not appear as ordinary teaching content.

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
- content import.

Existing Case Tags and contextual Case Question Tags are preserved when a Case is cloned. Global Tag definition editing is not expanded by this V1.

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
7. runs `npm run db:check`, `npm test`, `npm run check`, `npm run build`, `node scripts/local-auth-smoke.mjs`, and `git diff --check`;
8. verifies the Preview target;
9. exposes Cloudflare API credentials only to the deploy step;
10. deploys with `npx --yes wrangler@4.123.0 deploy --env preview`;
11. writes the exact deployed SHA and Preview URL into the Actions summary.

The workflow has no remote D1 migration command and does not use the D1 write token.

## Schema-changing PR limitation

A production-backed Preview cannot safely run an arbitrary unmerged D1 schema against production data.

The manual workflow blocks PRs that change `drizzle/`, `drizzle.config.js`, `src/lib/server/db/schema.js`, or schema-named DB modules. A migration must first be separately reviewed, merged and applied through the normal production release process.

The Preview workflow never applies a PR migration simply to make a PR previewable.

## Residual production-resource risk

The Preview Worker shares production D1/R2 bindings, so this is not hard resource isolation. Only trusted same-repository PRs should be deployed; deployment stays manual; validation runs before deployment; schema-changing PRs are blocked; Preview capabilities are narrow; and global/shared editing remains unavailable.

D1 recovery/Time Travel is catastrophe recovery only, not normal Preview Reset.

## Operator release procedure

Do not execute these steps until this PR is reviewed and intentionally released.

1. Merge the reviewed Preview Admin workspace PR to `main`.
2. Apply `drizzle/0006_preview_admin_workspace.sql` to the production D1 through the normal migration/release process.
3. Re-run production validation/smoke checks.
4. Configure a separate `BETTER_AUTH_SECRET` for the `preview` Wrangler environment. Do not commit it.
5. Confirm GitHub has `CLOUDFLARE_ACCOUNT_ID` and a least-privilege `CLOUDFLARE_API_TOKEN` able to deploy Workers. The Preview deployment workflow does not need a D1 write token.
6. Deploy the reviewed infrastructure to the Preview Worker with `npx --yes wrangler@4.123.0 deploy --env preview` (or the equivalent reviewed operator deployment).
7. Confirm the Preview Worker is reachable and clearly shows Preview Mode.
8. Run `npm run preview-admin:bootstrap` once to create the dedicated Preview Admin identity.
9. Sign in to the Preview Worker, create one Preview copy, edit it, then Reset and confirm the source production Case remains unchanged.
10. For a later UI PR such as PR #29, run GitHub Actions -> **Deploy PR to Preview**, enter the PR number, verify the reported exact SHA, and test the Preview URL.

## Emergency recovery distinction

Routine Preview cleanup always uses explicit Preview ownership and Reset. If a serious defect ever changes production data outside those intended boundaries, stop Preview deployment and use the normal production incident/recovery process. D1 recovery/Time Travel is reserved for that situation and is not part of normal workspace cleanup.
