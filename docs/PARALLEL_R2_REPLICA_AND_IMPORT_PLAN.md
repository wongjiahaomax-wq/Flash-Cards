# Parallel R2 transfers for the local replica and reviewed import

Status: planning handoff; implementation belongs in **this same Draft PR**.

## Goal

Reduce waiting caused by sequential independent R2 object operations in two existing workflows. No performance benchmarks are requested; a bounded-concurrency implementation with correct behavior is sufficient.

## Tranche A — local production-asset replica

Owner: `scripts/refresh-local-replica.mjs` and directly related tests/helpers.

Current behavior: `refreshR2()` synchronously downloads each production R2 object with Wrangler, then synchronously puts it into local R2, before starting the next asset.

- Use a simple bounded pool of **four assets** in flight. For each asset, its remote GET completes before that asset's local PUT; separate assets can run concurrently. Keep the repository-pinned Wrangler and existing argument builders.
- Use async child-process execution so multiple Wrangler operations genuinely overlap; preserve cross-platform Node execution, safe per-key staging filenames, per-asset cleanup, and useful bounded failure reporting. Wait for all started tasks before removing the shared staging directory.
- Preserve the current content/Asset allowlist, production D1 SELECT and R2 GET **only**, local D1/R2 writes only, original object keys/MIME types, existing local reset semantics and commands, and the existing zero-success failure behavior.
- Keep a bounded concurrency limit even for large asset libraries. Do not add a dependency, new credential, remote write path, or storage redesign. Leave unrelated sequential D1 table snapshot reading unchanged.

## Tranche B — reviewed-import startup staging

Owner: `src/lib/server/storage/import-packages.js` and directly related tests.

Current behavior: `stageImportPackage()` stores the ZIP, then stores the execution-plan sidecar and each create-Asset media object sequentially. The Admin Start action waits for this staging to finish before returning a job and starting the browser's resumable processing loop.

- Preserve package preflight, exact-preview SHA confirmation, capacity/accounting checks, immutable conditional object creation, canonical private keys, and the original ZIP/plan snapshot contracts.
- Keep ZIP and plan staging in their existing order; use a bounded **four-upload** pool for independent derived create-Asset media objects only. Do not parallelize jobs, D1 import/validation phases, or browser process requests.
- On a failed media upload, await settlement of **all started writes before compensation**. Track every successful staging key and clean only objects owned by this new job; do not race cleanup against in-flight puts or leave a partially staged job processable. Preserve the existing failed-job state and retry/finalize/cancel behavior.
- Keep `import_assets` processing, leases/fencing, deterministic teaching-image immutability, D1 checkpoints/budgets and idempotency unchanged. No schema, new endpoint, Queue, Durable Object, background worker, ZIP re-upload redesign, or generalized concurrency framework.

## Executable acceptance

1. Focused local-replica tests with stubbed asynchronous Wrangler operations prove: at most four assets in flight, more than one can overlap, each PUT follows its matching successful GET, independent failures are reported, staging files are cleaned only after workers settle, and no production mutation argument is introduced. No live production reads/writes solely for testing.
2. Focused import-staging tests with a controllable R2 fake prove: media puts overlap up to four; no more than four are in flight; ZIP/plan and SHA/key/content contracts remain intact; any failed put waits for other in-flight puts before cleanup; resulting failed jobs cannot process incomplete staging; success is unchanged. Use existing runtime-safety tests for lease/checkpoint behavior rather than inventing new architecture.
3. Run focused tests during iteration, then repository-required `agent:checks` handoff validation and specialized checks. Report what ran and exact-head CI. No speed benchmarks or timing thresholds.

## Luna 5.6 implementation handoff

Continue this **existing Draft PR and branch** at their actual current head; do not create another PR or restart from `main`. Inspect current repository guidance and relevant implementation/tests using progressive retrieval. Implement tranche A, then tranche B in this same PR, with a coherent commit/push for each if useful. Follow current scoped `AGENTS.md` guidance for privileged local replica and R2 storage paths. Keep scope minimal and preserve all safety boundaries above. Do not mark Ready, merge, deploy, or mutate production data.
