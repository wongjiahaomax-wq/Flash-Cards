# Production-backed Preview Admin Workspace

_Status: implemented, merged, and part of the current operational baseline. Preview Admin uses a separate Worker with the same production D1 and R2 resources under explicit ownership/isolation rules._

_Last updated: 18 August 2026_

## Purpose

Admin UI changes need real browser inspection against current teaching content, but the project deliberately does not maintain a second synchronized D1 database or R2 bucket.

Preview therefore uses a separate Worker while binding to the same existing D1 database and R2 bucket as production.

This is **not** equivalent to an independently isolated staging database. Safety depends on explicit Preview ownership, narrow mutation capability, database constraints, central learner filtering, hard route boundaries, separate authentication secrets/sessions, manual deployment, and deliberate restrictions on global production objects.

The safety model is:

> **Clone then mutate Preview-owned content. Never mutate production content and rely on rollback as the normal Preview workflow.**

## 1. Worker/resource layout

```text
Production Worker: flash-cards
  -> DB:    production D1
  -> MEDIA: production R2

Preview Worker: flash-cards-preview
  -> DB:    same production D1
  -> MEDIA: same production R2
  -> PREVIEW_MODE=true
  -> Preview BETTER_AUTH_URL
  -> separate Preview BETTER_AUTH_SECRET
```

There is no second D1 or R2 resource in the current design.

## 2. Identity and role boundary

The owner may use the same Better Auth user identity for both production Admin and Preview Admin by holding:

```text
admin,preview_admin
```

The production and Preview Workers use separate `BETTER_AUTH_SECRET` values, so browser sessions remain cryptographically separate even when the identity/password is the same.

Authorization remains server-side.

See `PREVIEW_ADMIN_IDENTITY.md` for bootstrap/identity details.

## 3. Hard request boundaries

Current hard boundaries include:

```text
Preview Worker /admin/**              -> forbidden
Preview Worker /study/**              -> forbidden
Preview Worker /api/auth/admin/**     -> forbidden
preview_admin on production /study/** -> forbidden by current policy
```

The Preview Worker is not a general production Admin endpoint and is not a learner Study endpoint.

## 4. Preview ownership

Preview-owned domain rows use explicit `preview_session_id` ownership where the schema supports disposable Preview content.

Preview uploads use an isolated R2 prefix:

```text
preview/<preview-session-id>/...
```

Production content has no Preview session ownership.

The normal learner path excludes Preview-owned Cases, Question Prompts, and Assets before Review creation. Production Admin read models/counts also exclude disposable Preview ownership where required.

## 5. Clone then mutate

Preview may inspect/reuse production content read-only and create disposable Preview-owned derivatives where the existing contracts permit it.

Typical safe model:

```text
production Case/content
→ clone relevant authoring state into Preview-owned rows
→ mutate only Preview-owned relationships/content
→ inspect shared production editor UI against real assets/data
→ Reset Preview Workspace
```

Do not implement Preview by editing production rows and attempting to restore their previous values later.

## 6. Production Assets in Preview

Preview can browse/search/filter/paginate/select real production Assets read-only.

Where the current Case/image authoring contracts allow it, Preview may attach selected production Assets to **current-session Preview-owned** Cases/groups/options without mutating the production Asset itself.

Preview may not edit production Asset metadata, Collection assignment, R2 bytes/object identity, or production Case/stimulus relationships.

Image Management V2 behavior in Preview includes scalable browsing/selection and safe relationship reuse into Preview-owned content. See `IMAGE_MANAGEMENT_V2_PLAN.md` and `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`.

## 7. Shared production Case editor

Preview renders the real production Case-editor Svelte component rather than maintaining a copied editor UI.

`test/admin-editor-preview-contract.test.js` protects the shared named-action/data contract.

When a new named action is added to the shared Case editor, Preview must provide either:

- a safe Preview implementation; or
- an explicit named `403`/blocked implementation.

Never leave a new production action ambiguously reachable through Preview.

## 8. Shared Questions remain production-only global content

`shared_questions` deliberately has no `preview_session_id`.

Shared Questions are global production-curated knowledge objects and Preview Admin currently has **no mutation authority** over them.

Preview-owned Question Prompts are rejected as backing Prompts for Shared Questions by application validation plus D1 triggers from `0008_tag_shared_questions.sql`.

The learner resolver also requires production-owned Prompts for tag-shared eligibility.

Tagging Stage B therefore does not weaken Preview isolation.

## 9. Preview Session lifecycle

V1 supports one live Preview workspace per Preview Admin with a 24-hour expiry.

Workspace state is represented in D1 rather than only in browser memory.

Reset/cleanup removes explicitly Preview-owned rows and Preview R2 objects after ownership/usage checks.

Cleanup is designed to be idempotent. A failed cleanup is surfaced rather than silently declaring the workspace reset.

Production rows and production R2 objects must remain untouched.

## 10. Preview R2 cleanup

Preview media writes must use the isolated Preview prefix and the same central media/storage guardrails as production teaching-image writes.

Reset may remove only objects proven to belong to the relevant Preview session.

Reviewed import staging is a separate operational concept and must not be confused with Preview Asset ownership.

## 11. Deploy PR to Preview

The permanent manual workflow is:

```text
.github/workflows/deploy-pr-to-preview.yml
```

It resolves an exact open same-repository PR head targeting `main`, runs the standard validation set, and deploys only to the Preview environment.

The workflow deliberately blocks candidate PRs that change:

- D1 migrations/schema;
- `wrangler.jsonc`.

It never applies a remote migration.

This protects the production-backed D1 binding from unreviewed schema changes.

For schema-changing features, land/apply the reviewed schema foundation first through the protected migration path, then Preview a code-only head once those schema files are no longer candidate changes relative to `main`.

See `PREVIEW_DEPLOYMENT.md` for the operator playbook.

## 12. Restore Main to Preview

After inspecting a PR, return the Preview Worker to current `main` through the permanent Restore Main workflow rather than leaving an arbitrary candidate deployed.

Normal lifecycle:

```text
main on Preview
→ Deploy PR to Preview
→ inspect candidate
→ Reset Preview Workspace
→ Restore Main to Preview
→ next candidate
```

The exact operator order may vary when a reset is required before restore, but the end state should not leave stale candidate code or disposable workspace data unintentionally active.

## 13. Production data isolation requirements

Future code must preserve these boundaries:

- learner Case eligibility excludes Preview Cases;
- Review loading excludes Preview-owned Prompts/Assets;
- production Admin libraries/counts/details exclude disposable Preview ownership;
- Preview cannot mutate production Cases, production Asset metadata, production Collections, production R2 objects, or production stimulus relationships;
- Shared Questions remain production-only global mutable content;
- Better Auth Admin-plugin API remains production Worker only.

Database constraints/triggers should continue providing defense in depth where practical rather than relying exclusively on UI hiding.

## 14. Current migrations related to Preview

Preview ownership foundation is migration:

```text
0006_preview_admin_workspace.sql
```

Later migrations remain compatible with the Preview boundary:

- `0007_image_collections.sql` adds global production Asset organisation; Preview reads Collection metadata but cannot mutate production assignments;
- `0008_tag_shared_questions.sql` adds global Shared Questions and triggers preventing Preview-owned Prompt references.

Do not infer Preview mutation authority merely because a new global table is visible through the same D1 binding.

## 15. Validation expectations

Preview-related changes should preserve the repository validation standard:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

Focused tests should continue covering route hard blocks, production/Preview ownership filtering, shared-editor action contracts, Preview Reset idempotency, R2 prefix safety, and subsystem-specific Preview restrictions.

## 16. Non-goals

Current Preview V1 deliberately does not provide:

- a second independently synchronized D1/R2 staging stack;
- automatic deployment of every PR;
- Preview application of unmerged migrations;
- unrestricted editing of global production objects;
- multiple simultaneous Preview workspaces per owner;
- learner Study on the Preview Worker;
- production Admin-plugin operations through Preview;
- Preview editing of global Shared Questions.

Add broader Preview capabilities only when the ownership and rollback/failure model is explicit and testable.
