# Resumable Import Runtime Safety

_Status: implemented and production-validated as part of the reviewed/resumable importer. These safeguards remain authoritative for current Import Package v1 execution._

_Last updated: 18 August 2026_

## Scope

The importer is a browser-orchestrated sequence of bounded Worker requests:

```text
browser
→ one bounded Worker process request
→ D1 checkpoint
→ browser requests next step
→ ...
→ complete
```

It does not require Cloudflare Queues, Durable Objects, Cron, or a scheduled/background Worker.

Import Package v1 remains intentionally Tag-free even though Tagging Stage A/B are now deployed. Initial ingestion is ordinary Topic → Case → Questions → Images/Stimuli, followed by progressive curation.

## 1. Atomic immutable teaching-image creation

Teaching-image keys are immutable and deterministic.

A preflight `HEAD` alone is not sufficient under a stale-lease race: two requests could both observe an absent key before either writes it.

`putTeachingImage()` therefore makes object creation itself conditional using:

```http
If-None-Match: *
```

Only one concurrent request can create the deterministic R2 key.

The losing request must not later treat the object as one it created and delete another request's successful object during D1 cleanup.

Regression coverage includes `test/r2-conditional-immutability.test.js`.

## 2. Lease fencing before side effects

The import lease is a concurrency throttle, but lease expiry alone is not proof that an older Worker request stopped executing.

After a request claims a job and loads the current execution staging data, the runtime conditionally renews the exact:

```text
lease token + phase + cursor
```

immediately before bounded validation/domain side effects.

If another request reclaimed an expired lease while the older request was reading staging data, the renewal affects zero rows and the older request fails before starting new chunk side effects.

Final checkpoint advancement is also conditional on the same lease token + phase + cursor.

The current side-effect safety layers are:

1. conditional D1 lease renewal before the bounded chunk;
2. deterministic/idempotent application IDs and relationships;
3. atomic conditional R2 creation for immutable teaching-image keys;
4. conditional D1 checkpoint advancement.

## 3. Server-derived execution snapshot

The importer does not re-read/re-hash/re-decompress the complete ZIP on every seven-item process request.

The exact confirmed ZIP is parsed/hardened when the job starts and remains staged at:

```text
imports/staging/<job-id>.zip
```

The server derives immutable execution sidecars from that reviewed package:

```text
imports/staging/<job-id>.plan.json
imports/staging/<job-id>/media/<asset-id>   # create-Asset media only
```

The plan sidecar contains normalized manifest data plus the confirmed package SHA.

Subsequent process requests read:

- the plan sidecar for validation/non-Asset work; and
- only media needed for the current `import_assets` chunk.

All staging objects remain private operational data. They are never Asset rows and are never learner-served.

Completion/cancellation removes the exact ZIP, plan sidecar, and staged media under the current cleanup rules. Cleanup is idempotent so finalization can retry safely after a lost response.

Regression coverage includes `test/resumable-runtime-safety.test.js`.

## 4. Request-size philosophy

Current orchestration uses the conservative project limits recorded in the importer contract:

```text
IMPORT_ITEMS_PER_REQUEST = 7
IMPORT_D1_OPERATION_BUDGET = 40
```

The design objective is predictable bounded requests with headroom rather than maximum throughput.

At the time the PR #23 runtime safeguards were designed (16 August 2026), the repository's Cloudflare-limit review used:

```text
Workers Free CPU time: 10 ms per invocation
D1 queries:            50 per Worker invocation
```

Those platform limits are external and may change; verify current Cloudflare documentation before changing budgets or making new plan-level claims about Free/Paid execution.

The architectural statement remains narrower and stable:

- no paid-only Cloudflare primitive is required;
- modest reviewed packages can be processed in bounded requests;
- if Preview/Start CPU work becomes too large for the selected Worker plan, split the reviewed migration into smaller packages or choose an appropriate plan;
- package splitting is an operational option, not a schema change.

Do not raise request budgets simply to force a monolithic migration through one Worker invocation.

## 5. No whole-package atomicity claim

A resumable import spans many Worker invocations and is therefore not whole-package atomic.

All database conflict validation completes before the first domain write, but after import begins, earlier successful chunks may remain committed if a later chunk fails.

This is safe because domain identities/keys are deterministic, item writes are idempotent/fail-closed, and exact progress is durable.

Failure preserves phase/cursor/error and staging for retry/investigation.

Cancellation after writes begin stops future work but does not roll back already committed chunks.

## 6. Browser is not authority

The browser only requests the next bounded step.

D1 remains authoritative for:

- job status;
- phase/cursor;
- progress;
- package identity/hash;
- lease state;
- errors.

R2 staging is addressed only through server-derived job keys.

The browser never supplies application IDs, R2 teaching keys, phase, cursor, or a mutation plan.

Closing the browser or pressing Pause simply stops sending new process requests. Resume starts from persisted D1 state.

## 7. Tagging Stage A/B compatibility

The current product now includes deployed Tagging Stage A and Stage B, but this importer contract remains intentionally tag-agnostic.

Do not add the following to Import Package v1 merely because the runtime now supports them elsewhere:

- Case Tags;
- contextual Question Tags;
- Shared Questions;
- Reuse Scope Tags;
- descriptive Shared Question Tags;
- Asset Tags.

Tags/Shared Questions remain progressive post-import curation unless a separately reviewed package-version change demonstrates repeated value.

## 8. Production validation

The runtime has been exercised successfully by the real ECG migration.

Production verification on 18 August 2026 confirmed both reviewed import jobs complete with their reviewed package hashes and no recorded errors:

```text
Batch 01: 13 imported Cases/ECGs
Batch 02: 51 imported Cases/ECGs
```

Together with two pre-existing mapped calcium Cases, the initial source deck is fully represented: **66/66 notes**.

This production result validates the bounded/resumable strategy for the intended content workflow. It does not remove the need for the safety invariants above.

## 9. Regression expectations

Changes to resumable import execution should preserve tests for:

- conditional immutable R2 creation;
- lease renewal/fencing before side effects;
- conditional checkpoint advancement;
- deterministic retry;
- server-derived immutable execution sidecars;
- idempotent staging cleanup;
- bounded D1 operation instrumentation;
- no domain writes before database validation completes;
- accurate failed/cancelled/completed state transitions.

See `CONTENT_IMPORT_PACKAGES.md` for the full package/job contract and `ANKI_TO_FLASHCARDS_MIGRATION_WORKFLOW.md` for the production migration record.
