# Resumable Import Runtime Safety

_Last updated: 16 August 2026_

This note records the focused PR #23 safety corrections made after review against the merged PR #24 tagging decisions and the current Cloudflare platform limits.

## Scope

PR #23 remains a browser-orchestrated resumable reviewed-package importer:

```text
browser
→ one bounded Worker process request
→ D1 checkpoint
→ browser requests the next step
→ ...
→ complete
```

It still does not use Cloudflare Queues, Durable Objects, Cron, or a scheduled/background Worker.

PR #24 does not change this import contract. Import Package v1 deliberately remains tag-free. Initial ingestion can continue as Topic → Case → Questions → Images/Stimuli, with Case/Question Tags added later during curation according to `TAGGING_MODEL_DECISIONS.md`.

## Atomic immutable teaching-image creation

Teaching-image keys were already intended to be immutable, but a separate `HEAD` followed by an unconditional `PUT` was not sufficient under a stale-lease race: two Worker requests could both observe an absent deterministic key and both upload it.

`putTeachingImage()` now keeps the friendly preflight `HEAD` but makes the R2 write itself conditional with:

```http
If-None-Match: *
```

Cloudflare R2 returns no stored object when that precondition fails. Therefore only one concurrent request may create a deterministic teaching-image key.

This matters for resumable imports because the losing request cannot subsequently treat the same object as one that it successfully created and delete the winning request's object during D1 cleanup.

Reference: Cloudflare R2 Workers API conditional `PUT` documentation:

- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations

Regression coverage: `test/r2-conditional-immutability.test.js`.

## Lease fencing before side effects

The five-minute import lease remains a concurrency throttle, but expiry alone is not treated as proof that an older request has ceased executing.

The production Admin route now uses `resumable-content-package-runtime.js`. After a request claims a job and reads the current staging data, it conditionally renews the exact lease token + phase + cursor immediately before bounded validation/domain work.

If another request reclaimed the expired lease while the older request was reading staging data, the renewal update affects zero rows. The older request then fails before starting the new chunk's domain side effects.

The final checkpoint remains conditional on the same lease token + phase + cursor.

Side-effect safety is therefore layered:

1. conditional D1 lease renewal before the bounded chunk;
2. deterministic/idempotent application IDs and relationships;
3. atomic conditional R2 creation for immutable teaching-image keys;
4. conditional D1 checkpoint advancement.

## Server-derived execution snapshot

The original PR #23 implementation re-read the entire staged ZIP, recalculated SHA-256, ran hardened ZIP preflight, decompressed entries, and rebuilt the complete import plan on every seven-item process request.

That repeated CPU-heavy work has been removed from the normal process loop.

The exact confirmed ZIP is still parsed/hardened when the job starts. The server then stages an immutable execution snapshot derived from that already-reviewed package:

```text
imports/staging/<job-id>/
├── package.zip          # exact confirmed ZIP
├── plan.json            # normalized server-derived manifest + package SHA
└── media/
    ├── <asset-id>       # only create-Asset media
    └── ...
```

Subsequent process requests read:

- `plan.json` for validation/non-Asset work; and
- only the media objects required for the current `import_assets` chunk.

They do not re-read, re-hash, or re-decompress the complete ZIP.

All staging objects remain private operational data. They are never Asset rows and are never learner-served. Completion/cancellation removes the whole job prefix. Prefix cleanup is idempotent, so finalization remains retryable after a response is lost during cleanup.

Regression coverage: `test/resumable-runtime-safety.test.js`.

## Workers Free limits: precise claim

As of 16 August 2026, Cloudflare documents:

- Workers Free CPU time: **10 ms per invocation**;
- Workers Free D1 queries: **50 per Worker invocation**.

References:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/limits/

PR #23 keeps the internal D1 target below the 50-query ceiling and removes repeated whole-package parsing from ordinary process requests.

However, the application still has to parse/harden the complete ZIP during Preview and Start. Therefore PR #23 must **not** claim that an arbitrary package up to the maximum 25 MiB compressed / 40 MiB decompressed limits is guaranteed to complete on Workers Free CPU limits.

The accurate operational position is:

- the architecture does not require a paid-only Cloudflare primitive;
- use modest reviewed packages on Workers Free;
- if Preview/Start hits Worker CPU limits, split the reviewed migration into smaller packages;
- Workers Paid remains an optional operational upgrade, not an architectural dependency.

This is compatible with the intended ECG migration strategy: material may be uploaded in reviewed batches over time rather than as one monolithic package.

## PR #24 compatibility

Merged PR #24 explicitly keeps Import Package v1 unchanged and defers Tag fields from ingestion. PR #23 therefore remains intentionally tag-agnostic.

Do not add any of the following to Import Package v1 as part of this PR:

- Case Tags;
- Question Tags;
- shared/tag-reusable Questions;
- reuse-scope Tags;
- Asset Tags.

Those belong to the staged tagging implementation documented in `TAGGING_MODEL_DECISIONS.md`, after ordinary reviewed ECG content can already be imported and curated.
