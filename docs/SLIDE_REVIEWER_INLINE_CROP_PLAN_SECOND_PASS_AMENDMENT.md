# Slide Import Reviewer — Inline Crop Plan Second-Pass Amendment

_Status: required amendment to `SLIDE_REVIEWER_INLINE_CROP_PLAN.md` for Draft PR #172. Planning only. Together, the base plan and this amendment are implementation-ready. Do not mark the PR Ready or merge until implementation and review are complete._

## Purpose

Second-pass planning review confirmed the existing source-selection, protected-operation serialization, strict precommit, pointer-capture, metadata-preservation, no-dependency, and no-schema contracts. One remaining lifecycle invariant must be explicit: once crop Save acquires the existing `operationGuard`, that exact operation must always be released on every exit path.

This amendment is normative and supersedes any base-plan wording that could be read as releasing the guard only on the success path.

## Protected crop-Save cleanup invariant

After `Save crop` successfully acquires its `operationGuard` token, ownership must follow a `try/finally`-equivalent rule.

Conceptual structure:

```text
cropSaveToken = operationGuard.begin(...)
if token not acquired:
    do not start crop Save

mark crop Save as protected/in-flight
try:
    prepare source/decode/raster/encode
    validate MIME + size
    compute SHA-256
    re-check exact operation + generation + bundle + Case + Asset + crop session
    commit prepared bytes + review metadata
    await existing persistence path
finally:
    clear crop-Save in-flight/unload state owned by this Save
    restore crop/reviewer controls as appropriate
    operationGuard.finish(cropSaveToken) only if that exact token is still owned/current
```

The concrete implementation may use the existing guard API's established idiom rather than literal JavaScript `try/finally`, but the lifetime guarantee must be equivalent.

### Exact-token ownership

Cleanup must never release another operation.

Required behavior:

- retain the exact token returned for this crop Save;
- call `finish`/release only for that exact token according to the existing guard contract;
- if the Save has become stale/aborted, cleanup still runs for its own token;
- stale completion must not finish a newer backup, Finalize, bundle-open, or crop-Save token;
- cleanup must be idempotent where multiple local error/abort paths converge;
- do not add a second mutex, global busy flag, or independent crop lock.

## Exit paths that must release ownership

Once guard acquisition succeeded, cleanup is mandatory for all of these outcomes:

1. successful crop + successful persistence;
2. source decode failure;
3. Canvas/context/rasterization failure;
4. Blob/byte materialization failure;
5. MIME validation failure;
6. production-size validation failure;
7. SHA-256 failure;
8. stale generation/session/Asset/bundle revalidation failure before commit;
9. commit-path exception;
10. persistence/autosave failure after commit;
11. stale/aborted completion after any asynchronous boundary.

No failure may strand `operationGuard.active`, leave crop-Save unload protection latched, or permanently disable protected reviewer controls.

## State semantics on failure

Preserve the base plan's existing precommit/commit semantics.

### Precommit failures

For decode/raster/encode/MIME/size/SHA and ownership-revalidation failures that occur before Phase C commit:

- original learner bytes remain unchanged;
- media override remains unchanged;
- manifest Asset metadata remains unchanged;
- linked Asset review SHA/status/extraction method remain unchanged;
- warnings/confidence/sourceRefs/reviewNotes remain unchanged;
- learner-image cache/object URL remains unchanged;
- no crop mutation is persisted;
- crop editor may remain available for retry where practical;
- regardless of UI choice, protected-operation and unload state are released.

### Persistence failure after commit

Do not invent rollback semantics beyond the existing reviewer persistence architecture.

If Phase C has already committed the prepared bytes/review metadata in memory and persistence then fails:

- preserve the existing autosave/persistence failure semantics for the current in-memory edited state;
- do not silently restore old bytes merely to simplify guard cleanup;
- surface the existing save/persistence failure state so the reviewer knows work is not durably saved;
- release the crop operation guard in all cases;
- clear only the crop-Save-specific in-flight unload condition, while any ordinary existing unsaved/failed-persistence protection must remain active according to current reviewer behavior;
- controls/protected operations become available again subject to whatever existing general unsaved-state rules already apply.

This amendment does not introduce a new rollback transaction or persistence model.

## Unload-protection cleanup

The accepted crop Save must continue to count as protected/in-flight work from successful guard acquisition through success or failure.

Cleanup requirements:

- precommit failure: crop-Save-specific unload protection clears when the owned operation is released;
- successful commit + persistence: crop-Save-specific unload protection clears when the owned operation is released;
- persistence failure: crop-Save-specific in-flight protection clears, but existing general dirty/failed-save unload protection must continue if current reviewer semantics require it;
- stale/aborted completion: its own crop-Save-specific protection clears without affecting protection belonging to a newer operation/state.

Prefer deriving this from the exact owned `operationGuard` token/current operation identity rather than adding an unsynchronized boolean.

## Reviewer control recovery

Every cleanup path must leave the reviewer usable.

After the exact crop operation is released:

- crop Save is not permanently disabled by stale local state;
- backup/export and Finalize can be attempted again;
- opening another bundle can be attempted again;
- a subsequent crop Save can acquire the guard normally;
- failure messaging may remain visible, but must not masquerade as an active protected operation.

If control disabled/enabled state is already derived from `operationGuard.active`, keep that single source of truth. Do not add parallel UI-lock state solely for crop Save.

## Implementation-plan integration

Apply this amendment primarily to the base plan's:

- **Protected-operation serialization** section;
- **Strict precommit boundary / Phase C** section;
- **Async stale-work rules**;
- **Tranche 3 — protected Canvas Save + atomic commit**;
- **Executable acceptance matrix**;
- **Minimum regression inventory**.

The intended orchestration is now:

```text
acquire exact operation token
→ enter guaranteed cleanup scope
→ perform zero-mutation fallible precommit work
→ revalidate exact ownership
→ commit prepared result
→ await persistence
→ success/failure handling
→ guaranteed exact-token cleanup
```

All existing product and architecture scope remains unchanged.

## Required executable coverage

Static/regex source inspection does not satisfy these requirements.

Add executable failure-path tests using the actual crop-Save orchestration with deferred/rejected dependencies.

### Representative precommit failure

At minimum force one representative precommit rejection (SHA-256 failure is preferred because the base plan already requires it) after guard acquisition and prove:

- old learner bytes are unchanged;
- linked review status/SHA/extraction method and preserved metadata are unchanged;
- `operationGuard.active` no longer contains the crop Save after failure;
- crop-Save-specific unload protection is cleared;
- protected controls are usable again;
- a subsequent crop Save can acquire the guard and start normally;
- a subsequent backup or Finalize can acquire the guard and start normally.

Existing separate raster/MIME/size atomicity tests remain required; they may share the same cleanup assertions where practical.

### Persistence failure

Force the existing persistence/autosave path to reject after the crop prepared result has committed and prove:

- in-memory learner bytes/review metadata follow the existing persistence-failure semantics rather than being silently rolled back;
- the persistence failure remains visible/represented through the current reviewer save-state behavior;
- the crop operation guard is released;
- crop-Save-specific unload protection is cleared while any general dirty/failed-save unload protection remains correct;
- reviewer controls are usable again;
- a later protected operation can acquire the guard normally once allowed by existing general state rules.

### Exact-token stale cleanup

Use a deferred/stale completion harness where practical to prove cleanup for an old crop Save cannot release a later operation token. The assertion should distinguish token identity, not merely check a boolean busy state.

## Regression inventory additions

Add these requirements to the existing minimum regression inventory:

37. guard acquisition followed by SHA/precommit failure releases the exact crop token;
38. precommit failure clears crop-Save in-flight unload protection;
39. precommit failure restores protected-operation/control usability;
40. a subsequent crop Save can start after representative precommit failure;
41. a subsequent backup/Finalize can start after representative precommit failure;
42. persistence rejection releases the exact crop token;
43. persistence rejection clears crop-Save-specific in-flight protection without suppressing existing dirty/failed-save protection;
44. persistence rejection does not silently roll back already-committed in-memory crop state unless the existing persistence architecture already does so;
45. a later permitted protected operation can start after persistence-failure cleanup;
46. stale crop-Save cleanup cannot finish/release a newer operation token.

## Luna/Codex implementation instruction amendment

When implementation begins, use this together with the base plan:

> Continue Draft PR #172. Implement `docs/SLIDE_REVIEWER_INLINE_CROP_PLAN.md` plus `docs/SLIDE_REVIEWER_INLINE_CROP_PLAN_SECOND_PASS_AMENDMENT.md` as one implementation contract. Once crop Save acquires the existing `operationGuard`, guarantee exact-token cleanup with a try/finally-equivalent lifetime on success, all precommit failures, persistence failure, and stale/aborted exits. Preserve the strict zero-mutation precommit boundary and current persistence-failure semantics. Add executable failure-path tests proving guard/unload/control recovery and that later protected operations can start normally. Keep all current UX, source-selection, metadata, dependency, schema, and subsystem scope unchanged. Do not mark Ready or merge.

## Readiness

With this amendment, planning for PR #172 is complete and implementation-ready. No further planning review is required unless implementation discovers a materially changed safety or persistence boundary.
