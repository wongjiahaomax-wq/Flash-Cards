# R2 cost guardrails

The production teaching-image bucket is bound to the Worker as `MEDIA` and remains private.

## Application limits

All teaching-image uploads, including Production Admin uploads and disposable Preview Admin uploads, must go through `putTeachingImage()` in `src/lib/server/storage/media.js`. Do not call `env.MEDIA.put()` directly from routes or admin code.

The helper enforces:

- maximum image size: **5 MiB** (`5 * 1024 * 1024` bytes);
- maximum managed R2 storage: **5 GiB** (`5 * 1024 * 1024 * 1024` bytes);
- **Standard** R2 storage class only;
- immutable object keys, so an existing object is not silently replaced.

Before a write, the helper lists the current R2 objects, totals their actual byte sizes, and rejects an upload if the projected total would exceed 5 GiB. This deliberately keeps the application well below Cloudflare R2's Standard-storage free allowance.

Production teaching images use normal immutable teaching-image keys. The Production-backed Preview Admin workspace uses the **same R2 bucket** but isolates disposable uploads under:

```text
preview/<preview-session-id>/...
```

Preview code must still use the central media helper. It must not bypass storage limits with direct bucket writes.

Preview cleanup may delete only an Asset that is explicitly owned by the current Preview Session, whose key is under that session's Preview prefix, and that has no production/foreign/historical usage. Ambiguous ownership fails closed and leaves the Preview Session retryable. Existing production Assets reused by a Preview Case are never deleted during Preview Reset.

## Billing warning layer

Cloudflare budget alerts are informational; they do not stop or cap usage. Configure a **$1 USD** account budget alert in the Cloudflare dashboard under **Manage Account > Billing > Billable Usage**.

The application storage ceiling protects stored bytes, but R2 also meters operations. Keep the R2 bucket private, require authentication for image-serving routes, keep upload/delete actions role-gated, and preserve the existing caching strategy where applicable.

The Preview Worker shares the production R2 binding. This is application-level isolation, not a separate storage sandbox. Only trusted same-repository PRs should be deployed to that Worker; see `PREVIEW_ADMIN_WORKSPACE.md` for the residual-risk model.

## Review checklist for R2 work

Before merging code that writes or deletes teaching images:

1. Confirm writes call `putTeachingImage()` rather than `MEDIA.put()` directly.
2. Confirm deletes use the central media helper rather than arbitrary route-level bucket calls.
3. Keep the bucket on Standard storage.
4. Keep production upload/delete actions administrator-only and Preview mutations `preview_admin` + session-ownership gated.
5. Do not enable a public R2 development URL for learner access.
6. Preserve the 5 MiB per-image and 5 GiB total limits unless a deliberate cost review changes them.
7. For Preview uploads, require `preview/<preview-session-id>/...` keys and fail closed before deleting anything whose ownership or usage is ambiguous.
