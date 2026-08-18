# R2 cost guardrails

_Last reviewed: 18 August 2026_

The production teaching-image bucket is bound to the Worker as `MEDIA` and remains private. The Preview Worker uses the same bucket under explicit Preview ownership/prefix rules.

## Application limits

All teaching-image uploads, including Production Admin and disposable Preview Admin uploads, must go through:

```text
putTeachingImage()
src/lib/server/storage/media.js
```

Do not call `env.MEDIA.put()` directly from route/Admin code for teaching-image writes.

The central media helper enforces the current application policy:

- maximum image size: **5 MiB** (`5 * 1024 * 1024` bytes);
- maximum application-managed R2 storage: **5 GiB** (`5 * 1024 * 1024 * 1024` bytes);
- **Standard** storage class;
- immutable object-key behavior so an existing teaching object is not silently replaced;
- normal media-type and ownership validation from the current storage path.

Before a write, the helper accounts for current managed objects and rejects an upload when the projected managed total would exceed the configured ceiling.

The 5 GiB value is an **application safety ceiling**, not a permanent statement about Cloudflare plan pricing or free allowances. Cloudflare billing/plan limits are external and may change; verify current provider documentation/dashboard before making cost assumptions or intentionally changing this ceiling.

## Production versus Preview keys

Production teaching images use normal immutable teaching-image keys.

Preview uploads use the same R2 bucket but an isolated prefix:

```text
preview/<preview-session-id>/...
```

Preview code must still use the central media helper and must not bypass size/storage/immutability rules with direct bucket writes.

Preview cleanup may delete only media proven to belong to the current Preview Session and safe to remove under the Preview usage/ownership rules.

Ambiguous ownership fails closed. Existing production Assets reused by a Preview Case are never deleted during Preview Reset.

## Reviewed import staging is separate operational data

Reviewed Import Package staging also uses private R2, but staged ZIP/plan/media sidecars are operational import data rather than learner Asset rows.

Import staging remains governed by the import package/runtime cleanup rules and the same overall managed-storage awareness.

Do not treat `imports/staging/...` as a teaching Asset namespace.

## Billing warning layer

Cloudflare billing/budget alerts are informational; application code must not assume they prevent usage automatically.

Keep an appropriately low account budget alert configured in the Cloudflare dashboard for this project and review provider billing settings after any plan/resource change.

Do not hard-code documentation around a dashboard navigation label or external allowance as though it were an application invariant; those provider UI/pricing details may change independently of this repository.

## Operation-cost guardrails

The managed storage ceiling protects stored bytes, but object storage also meters operations according to the provider plan.

Therefore preserve these architectural controls:

- private R2 bucket;
- authenticated/authorized image-serving routes;
- role-gated upload/delete actions;
- central write/delete helpers;
- bounded Admin bulk operations;
- conservative caching behavior where implemented;
- no public R2 development URL as the normal learner image source.

The Preview Worker shares the production R2 binding. This is application-level isolation, not a separate storage sandbox. Only trusted reviewed code should reach that environment.

## Review checklist for R2 work

Before merging code that writes or deletes teaching images:

1. Confirm teaching-image writes use `putTeachingImage()` rather than direct `MEDIA.put()`.
2. Confirm teaching-image deletes use the central storage helper/explicit safe cleanup path rather than arbitrary route-level bucket calls.
3. Keep Standard storage unless a deliberate architecture/cost review changes it.
4. Keep the current 5 MiB per-image and 5 GiB managed-storage limits unless the change is explicitly reviewed/documented.
5. Keep production upload/delete actions Admin-only.
6. Keep Preview media mutation `preview_admin` + session-ownership gated.
7. Require Preview uploads under `preview/<preview-session-id>/...`.
8. Fail closed before deleting anything whose ownership/usage is ambiguous.
9. Preserve immutable production object-key semantics.
10. Do not enable a public R2 URL as a shortcut around authenticated serving.
11. Verify current Cloudflare pricing/limits before changing any cost assumption in code or documentation.

See `PREVIEW_ADMIN_WORKSPACE.md`, `IMAGE_PROVENANCE.md`, and `CONTENT_IMPORT_PACKAGES.md` for the related ownership/provenance/import boundaries.
