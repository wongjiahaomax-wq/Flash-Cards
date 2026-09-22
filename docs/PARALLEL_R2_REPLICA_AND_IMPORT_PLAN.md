# Parallel R2 transfers for the local replica and reviewed import

Status: planning handoff; implementation belongs in **this same Draft PR**.

## Goal

Reduce waiting caused by sequential independent R2 object operations in two existing workflows. No performance benchmarks are requested; a bounded-concurrency implementation with correct behavior is sufficient.

## Tranche A — local production-asset replica

Owner: `scripts/refresh-local-replica.mjs` and directly related tests/helpers.

Current behavior: `refreshR2()` synchronously downloads each production R2 object with Wrangler, then synchronously puts it into local R2, before starting the next asset.

- Use a simple bounded pool of **four assets** in flight. For each asset, its remote GET completes before that asset's local PUT; separate assets can run concurrently. Keep the repository-pinned Wrangler and existing argument builders.
- Use async child-process execution so multiple Wrangler operations genuinely overlap; preserve cross-platform Node execution, safe per-key staging filenames, per-asset cleanup, and useful bounded failure reporting. Local Wrangler processes may contend for shared local R2 state: allow overlapping local PUTs only if reliable; if contention occurs, serialize **local PUTs only** while keeping up to four remote downloads running. Each asset's PUT still follows its successful GET. Wait for all started transfers before removing the shared staging directory.
- Preserve the current content/Asset allowlist, production D1 SELECT and R2 GET **only**, local D1/R2 writes only, original object keys/MIME types, existing local reset semantics and commands, and the existing zero-success failure behavior.
- Keep a bounded concurrency limit even for large asset libraries. Do not add a dependency, new credential, remote write path, or storage redesign. Leave unrelated sequential D1 table snapshot reading unchanged.

## Tranche B — reviewed-import startup staging

Owner: `src/lib/server/storage/import-packages.js` and directly related tests.

Current behavior: `stageImportPackage()` stores the ZIP, then stores the execution-plan sidecar and each create-Asset media object sequentially. The Admin Start action waits for this staging to finish before returning a job and starting the browser's resumable processing loop.

- Preserve package preflight, exact-preview SHA confirmation, capacity/accounting checks, immutable conditional object creation, canonical private keys, and the original ZIP/plan snapshot contracts.
- Keep ZIP and plan staging in their existing order; use a bounded **four-upload** pool for independent derived create-Asset media objects only. Do not parallelize jobs, D1 import/validation phases, or browser process requests.
- On a failed media upload, stop scheduling new uploads and await settlement of **all started writes before compensation**. Track every successfully created staging key (including ZIP/plan), remove only keys owned by this job, and never race cleanup against an in-flight PUT. A failed cleanup may leave private staging debris, but must never make the job processable. Keep the existing staging-cleanup/cancel pathway available; do not delete another job's objects or imported teaching media.
- **Explicit staging readiness gate (blocker):** The current job is inserted with `status='validating'` before staging, and ordinary `status='failed'` jobs can be resumed. Do not rely on a ZIP/plan's existence, successful response delivery, or best-effort cleanup as proof of complete staging. Represent pre-completion staging durably using the existing `phase` field (for example, `staging` while starting and `staging_failed` on failure; existing schema permits text phases), and advance to the first validation phase **only after every required R2 PUT succeeds**. If a Worker dies mid-stage, the job remains unprocessable. The server-side process/claim path must reject or safely decline both incomplete-staging phases, even on a forged/direct process request, without beginning validation or domain writes. Do not permit a failed staging job to use ordinary Retry/Resume; the administrator may start a new import from the exact reviewed ZIP after a staging failure. Preserve Retry/Resume for jobs that passed staging and later failed during validation or import. Keep existing cancellation/cleanup available for stranded staging jobs. No schema migration or new infrastructure.
- Keep `import_assets` processing, leases/fencing, deterministic teaching-image immutability, D1 checkpoints/budgets and idempotency unchanged. No schema, new endpoint, Queue, Durable Object, background worker, ZIP re-upload redesign, or generalized concurrency framework.

## Executable acceptance

1. Focused local-replica tests with stubbed asynchronous Wrangler operations prove: at most four assets in flight, multiple remote GETs can overlap, each PUT follows its matching successful GET, independent failures are reported, staging files are cleaned only after workers settle, and no production mutation argument is introduced. Cover the local-PUT contention fallback only if needed by the chosen implementation. No live production reads/writes solely for testing.
2. Focused import-staging tests with a controllable R2 fake prove: media PUTs overlap up to four; no more than four are in flight; ZIP/plan and SHA/key/content contracts remain intact; a failed PUT settles other in-flight PUTs before cleanup, including when cleanup itself fails; and success is unchanged.
3. **Actual runtime/process-action regression:** hold a staging PUT pending, then issue a direct processing request against its D1 job; prove it cannot validate or write. Reject direct Retry/Resume of a failed/incomplete staging job even if cleanup failed and the ZIP/plan remain present. Simulate interrupted staging without reaching its success checkpoint. Prove successful full staging advances to normal validation, and a later validation/import failure retains its existing resumable behavior. Cover the Admin Retry/Resume affordance for staging failures with the smallest appropriate UI/controller test. Reuse existing runtime-safety tests for other lease/checkpoint behavior rather than introducing new architecture.
4. Run focused tests during iteration, then repository-required `agent:checks` handoff validation and specialized checks. Report what ran and exact-head CI. No speed benchmarks or timing thresholds.

## Luna 5.6 implementation handoff

Continue this **existing Draft PR and branch** at their actual current head; do not create another PR or restart from `main`. Inspect current repository guidance and relevant implementation/tests using progressive retrieval. Implement tranche A, then tranche B in this same PR, with a coherent commit/push for each if useful. Follow current scoped `AGENTS.md` guidance for privileged local replica and R2 storage paths. Keep scope minimal and preserve all safety boundaries above. Do not mark Ready, merge, deploy, or mutate production data.
