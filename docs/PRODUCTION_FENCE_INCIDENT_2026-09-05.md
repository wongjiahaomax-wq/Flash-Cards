# Production learner-runtime fence incident — 2026-09-05

Status: **LKG identified; implementation and recovery verification in progress**

This document is updated alongside the incident fix. It records evidence and safety decisions so recovery does not depend on an ambiguous variable name or stale artifact.

## Safety boundaries

- Do **not** apply D1 migrations as part of incident recovery.
- Do **not** delete, reset, or otherwise modify learner data.
- A Worker rollback is permitted only when the interrupted deployment is proven to be pre-migration.
- Once a D1 migration may have started, do not roll the application back to an older schema contract automatically.
- Preserve the first-v2 exact-zero learner-data gate, including `learner_fsrs_profiles`, and preserve the schema-aware cutover gate introduced by PR #151.
- Merging to `main` does not itself constitute a Production deploy; Production changes continue through the supported deployment workflow.

## Observed incident sequence

### Last successful normal deploy

- Deploy-production run: `33749984574` (run #20)
- Job: `100631086758`
- Source commit: `a4f481f95b6b4c487c0b8eeafa9c205c44aba599`
- Result: successful normal Production Worker deployment.
- Wrangler recorded `Current Version ID: 0ac08060-18ae-4809-87ec-a5f14defd8ae` immediately after the Worker upload and trigger deployment.
- This deployment predates the temporary learner-runtime fence deployment introduced in the next incident run.

### First failed fenced run

- Deploy-production run: `33943357801` (run #21)
- Job: `101244869099`
- Source commit: `276309848515545c6d10f5fe721e80c206ef5e22`
- The temporary learner-runtime fence deployment step succeeded.
- Wrangler recorded `Current Version ID: b0eb8a02-60fb-4292-8a6c-52792151aa76` for that fence deployment.
- The very next verification step expected `/study` to return HTTP `503` and then failed while validating the fence response.
- Migration and v2 cutover steps did not run.

This establishes an independent control-plane provenance chain: run #20 deployed `0ac08060-…` as the normal application, and run #21 replaced it with `b0eb8a02-…` as the temporary learner-runtime fence.

### Unsafe rollback target captured after Production was already fenced

Later failed deployment runs captured the then-current Worker version as their `pre_fence` target without first proving the public Worker was unfenced:

- Run `33948930167` (run #22) artifact target: `b0eb8a02-60fb-4292-8a6c-52792151aa76`
- Run `33950327781` (run #23) artifact target: `b0eb8a02-60fb-4292-8a6c-52792151aa76`

The recovery workflow for the later run restored that exact version in the Cloudflare control plane, but `/study` continued returning the temporary fence response (`503` with `X-Learner-Runtime-Fence: active`) throughout the edge-verification window.

Therefore:

> `b0eb8a02-60fb-4292-8a6c-52792151aa76` is the temporary fence Worker and is **rejected as a last-known-good recovery target**. It must not be restored again merely because an artifact calls it `pre_fence`.

## Root cause

The deployment workflow captured the current Worker version before installing a new fence, but did not first establish that the already-running public Worker was a healthy, unfenced application. After run #21 left Production fenced, later runs treated that already-fenced Worker as a valid rollback baseline. The recovery workflow then trusted the artifact's syntactic version ID and migration-state check, so it could faithfully restore a bad baseline.

A second validation weakness exists in rollback/recovery edge checks: absence of `X-Learner-Runtime-Fence: active` alone is not sufficient proof of a healthy application. A generic Cloudflare 5xx without that header must also fail recovery verification.

## Positive public application identity

The application supplies a stronger health signal than merely observing that the temporary fence header disappeared. `src/routes/study/+layout.server.js` redirects an unauthenticated request for `/study` with HTTP `303` to `/sign-in?redirect=%2Fstudy`.

Production deploy/recovery probes are unauthenticated and use manual redirect handling. Therefore a verified unfenced `/study` response must satisfy all of the following:

1. HTTP status is exactly `303`.
2. `Location` resolves to `/sign-in?redirect=%2Fstudy` on the Production origin.
3. `X-Learner-Runtime-Fence` is not `active`.

A generic Cloudflare `5xx`, a different redirect, a success page from an unrelated service, or any response carrying the active fence header is not proof of a recovered application and must fail closed.

## Required fix properties

The hardened flow must:

1. Fail before recovery-target capture, fence installation, or migration if Production is already fenced or cannot be positively identified as an application response.
2. Bind a captured Worker version to positive unfenced public-edge evidence, with control-plane stability across the probe.
3. Persist structured, provenance-bearing recovery metadata rather than a bare version-ID file.
4. Reject legacy, unverified, mismatched, or fenced recovery metadata.
5. Restore exactly the verified Worker version and verify both Cloudflare control-plane state and the positive public `/study` application contract above.
6. Treat generic 5xx responses as recovery failure even when the fence header is absent.
7. Preserve pre-migration failure/cancellation rollback behavior.
8. Refuse automatic old-application rollback after migration may have started.

## Verified LKG Worker version

- Worker version ID: `0ac08060-18ae-4809-87ec-a5f14defd8ae`
- Direct deployment evidence: successful run #20 Wrangler output records this exact version immediately after upload/deploy.
- Independent fence evidence: run #21 Wrangler output records a different exact version, `b0eb8a02-60fb-4292-8a6c-52792151aa76`, for the temporary fence deployment.
- Migration boundary: run #21 did not execute D1 migration or v2 cutover steps.
- Public unfenced identity after restore: **PENDING supported recovery execution**.
- Restore action/run: **PENDING supported recovery execution**.

The Worker UUID is now independently established as the correct pre-fence target. It is not derived from the later `pre_fence` artifacts.

## Validation log

- Branch created from current `main` commit `d39b0e9b7b5bc89f08a2efe124113f3a9ce24d62`: `fix/production-fence-lkg-hardening`.
- Current `main` already contains PR #151 cutover-gate recovery logic and `test/production-fence-recovery.test.js`; implementation is based on this revision rather than earlier workflow snapshots.
- Positive edge identity selected from the application route contract: unauthenticated `/study` must produce `303` to `/sign-in?redirect=%2Fstudy`; header absence by itself is deliberately insufficient.
- Independently identified normal Worker: `0ac08060-18ae-4809-87ec-a5f14defd8ae` from successful run #20.
- Independently identified temporary fence Worker: `b0eb8a02-60fb-4292-8a6c-52792151aa76` from run #21.
