# R2 cost guardrails

The production teaching-image bucket is bound to the Worker as `MEDIA` and should remain private.

## Application limits

All future teaching-image uploads must go through `putTeachingImage()` in
`src/lib/server/storage/media.js`. Do not call `env.MEDIA.put()` directly from routes or admin code.

The helper enforces:

- maximum image size: **5 MiB** (`5 * 1024 * 1024` bytes);
- maximum managed R2 storage: **5 GiB** (`5 * 1024 * 1024 * 1024` bytes);
- **Standard** R2 storage class only;
- immutable object keys, so an existing object is not silently replaced.

Before a write, the helper lists the current R2 objects, totals their actual byte sizes, and rejects
an upload if the projected total would exceed 5 GiB. This deliberately keeps the application well
below Cloudflare R2's Standard-storage free allowance.

The current application has no R2 upload route yet, so these guardrails become the required write
path when the administrator image-upload feature is implemented.

## Billing warning layer

Cloudflare budget alerts are informational; they do not stop or cap usage. Configure a **$1 USD**
account budget alert in the Cloudflare dashboard under **Manage Account > Billing > Billable Usage**.

The application storage ceiling protects stored bytes, but R2 also meters operations. Keep the R2
bucket private, require authentication for future image-serving routes, keep uploads administrator-only,
and use HTTP/Cloudflare caching when the learner image-serving endpoint is implemented.

## Review checklist for future R2 work

Before merging any code that writes teaching images:

1. Confirm it calls `putTeachingImage()` rather than `MEDIA.put()` directly.
2. Keep the bucket on Standard storage.
3. Keep upload/delete actions administrator-only.
4. Do not enable a public R2 development URL for learner access.
5. Preserve the 5 MiB per-image and 5 GiB total limits unless a deliberate cost review changes them.
