# R2 cost guardrails

_Last reviewed: 20 August 2026._

The production teaching-image bucket is bound to the Worker as `MEDIA` and remains private. The Preview Worker uses the same bucket under explicit Preview ownership/prefix rules.

## 1. Application limits

All ordinary teaching-image uploads, including Production Admin and disposable Preview Admin uploads, must use the central storage path rather than arbitrary route-level bucket writes.

Current application policy includes:

- maximum image size: **5 MiB**;
- maximum application-managed R2 storage: **5 GiB**;
- Standard storage class;
- immutable object-key behavior so an existing teaching object is not silently overwritten;
- media-type and ownership validation through the established storage path.

The 5 GiB value is an **application safety ceiling**, not a permanent statement about Cloudflare pricing/free allowances. Provider billing and plan limits are external and may change; verify current provider documentation/dashboard before intentionally changing the ceiling or making cost assumptions.

## 2. Production versus Preview keys

Production teaching images use normal immutable teaching-image keys.

Preview uploads use the shared bucket under the isolated Preview prefix:

```text
preview/<preview-session-id>/...
```

Preview code must not bypass size/storage/immutability rules with arbitrary direct bucket writes.

Preview cleanup may delete only media proven to belong to the current Preview Session and safe to remove under Preview ownership/usage rules.

Ambiguous ownership fails closed. Existing production Assets reused by a Preview Case are never deleted during Preview Reset.

## 3. Reviewed import staging is separate operational data

Reviewed Import Package staging uses private R2 but is operational import data rather than learner Asset rows.

The staging namespace remains:

```text
imports/staging/...
```

Import staging is governed by the import package/runtime cleanup rules and the same overall managed-storage awareness.

Do not treat staging objects as teaching Assets, and do not make general Asset cleanup code target `imports/staging/...`.

## 4. Higher-resolution Asset replacement

Current `main` includes the same-underlying-image higher-resolution replacement workflow.

Its R2 rule is deliberately immutable:

```text
old Asset A → old immutable R2 object retained
new Asset B → new immutable R2 object
```

A successful replacement does **not** overwrite or delete A's old object. Historical Reviews may still depend on `review_assets.storage_key_snapshot` pointing to those exact old bytes.

The failure boundary is different:

```text
new replacement object uploaded
→ D1 semantic replacement fails
→ delete only that newly uploaded object
```

Do not delete the old object during rollback.

This means superseded Assets/objects may legitimately continue consuming managed storage. That retention is required historical data, not automatically orphaned garbage.

Do not add a blanket cleanup job that deletes objects merely because the current `assets` row is inactive or has `superseded_by_asset_id` set.

See `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md` for the full lineage/Review-snapshot contract.

## 5. Local production-like replica

The local replica derives R2 copying from allowlisted mirrored Asset rows rather than cloning the complete bucket.

It uses production object GET and local object PUT operations. It does not mirror unrelated Preview/import staging objects merely because they exist in production R2.

Superseded historical Assets may be mirrored where they remain part of the allowed production content/lineage state.

The local replica is not a backup/garbage-collection authority and must not delete production R2 objects.

## 6. Billing warning layer

Cloudflare billing/budget alerts are informational; application code must not assume they prevent usage automatically.

Keep an appropriately low account budget alert configured for this project and review provider billing settings after resource/plan changes.

Do not hard-code provider UI labels or free-tier allowances as application invariants.

## 7. Operation-cost guardrails

The managed-storage ceiling protects stored bytes, but object storage may also meter operations according to the provider plan.

Preserve these architectural controls:

- private R2 bucket;
- authenticated/authorized image-serving routes;
- role-gated upload/delete actions;
- central write/delete helpers;
- bounded Admin bulk operations;
- conservative caching behavior where implemented;
- no public R2 development URL as the normal learner image source;
- explicit ownership checks before cleanup;
- immutable current/historical image identities.

The Preview Worker shares the production R2 binding. This is application-level isolation, not a separate storage sandbox.

## 8. Deletion authority by object class

Keep object cleanup paths distinct:

```text
production teaching object
→ never delete ambiguously; historical Review/supersession references matter

Preview-owned object
→ delete only through proven Preview ownership/usage cleanup

import staging object
→ delete according to resumable import job/finalization/cancellation rules

new failed replacement object
→ delete only when this replacement attempt created it and D1 replacement failed
```

Do not combine these into a generic prefix-free R2 cleanup operation.

## 9. Review checklist for R2 work

Before merging code that writes or deletes media:

1. Confirm ordinary teaching-image writes use the established central storage path.
2. Confirm deletes use an explicit safe cleanup path rather than arbitrary route-level bucket calls.
3. Keep Standard storage unless a deliberate architecture/cost review changes it.
4. Keep the 5 MiB per-image and 5 GiB managed-storage limits unless explicitly reviewed/documented.
5. Keep production upload/delete actions Admin-only.
6. Keep Preview media mutation `preview_admin` + session-ownership gated.
7. Require Preview uploads under the Preview session prefix.
8. Fail closed before deleting anything whose ownership/usage is ambiguous.
9. Preserve immutable production object-key semantics.
10. Preserve old replacement bytes needed by historical Review snapshots.
11. Clean up only the new object on a failed higher-resolution replacement attempt.
12. Do not enable a public R2 URL as a shortcut around authenticated serving.
13. Verify current Cloudflare pricing/limits before changing cost assumptions.

See `PREVIEW_ADMIN_WORKSPACE.md`, `IMAGE_PROVENANCE.md`, `CONTENT_IMPORT_PACKAGES.md`, `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md`, and `LOCAL_DEVELOPMENT_REPLICA.md` for related boundaries.