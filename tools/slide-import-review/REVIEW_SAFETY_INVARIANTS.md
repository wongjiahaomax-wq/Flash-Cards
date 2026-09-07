# Slide Review Safety Invariants

This note records the safety behavior added during the PR #53 review correction pass and later reviewer UX hardening.

## Rejected manifest-backed children

A reviewer may reject an individual fixed Case Asset or Case Question without rejecting the whole Case.

The reviewed bundle keeps the original manifest-backed child and its `rejected` review metadata so the human decision remains auditable. During deterministic finalization only, the finalizer works from a cloned view that removes rejected Case-Asset relationships and rejected Case Questions before dependency closure is calculated.

Consequences:

- the original reviewed bundle is not mutated by finalization;
- rejected child review history remains available in `review-map.json`;
- rejected child Assets, Question Prompts, media, and other now-orphaned dependencies are omitted from `flashcards-import-v1.zip` unless another retained relationship still requires them;
- missing review metadata is still a failure rather than an implicit rejection;
- pending or `needs_review` children still block an approved Case.

The browser Case-approval action follows the same rule: a child explicitly marked `rejected` is intentionally excluded rather than converted back to `approved` or used to block the parent Case.

## Explicit blocking-warning reconciliation

Blocking warnings remain fail-closed by default. Automation and bulk Q&A approval must not silently convert a warned record to `approved`.

A human reviewer may explicitly approve an individual Case, manifest-backed Case Question, or fixed Case Asset despite that record's own blocking warning. The browser requires an explicit warning-override confirmation for that transition. The warning remains present in `review-map.json` and remains visible/auditable in the reviewer and reviewed backup bundle.

For deterministic readiness and finalization only, `reviewStatus: "approved"` is treated as durable human reconciliation of that same record's own blocking warnings. The public core performs this on a clone and does not mutate or delete the persisted warnings.

The override boundary is intentionally narrow:

- approving a Case reconciles only that Case's own blocking warnings;
- approving a Question reconciles only that Question's own blocking warnings;
- approving an Asset reconciles only that Asset's own blocking warnings;
- structural/content validation still runs and may still fail;
- missing review metadata still fails;
- unresolved questions are not overrideable through this mechanism;
- batch-level blocking warnings are not overrideable through this mechanism;
- a parent Case approval does not waive an unapproved warned child.

The Case-question bulk action is deliberately stricter: it only approves pending, manifest-backed questions that have review metadata, valid prompt/answer content, and no blocking warning. It never approves the parent Case.

## Source page bounds and complete coverage

Every review source reference is constrained by its declared `sourceFiles[].pageCount`.

This applies to:

- Case `sourceRefs`;
- Asset `sourceRefs`;
- Question Prompt and answer source references;
- unresolved-question Prompt and answer source references;
- `sourceCoverage[].page`.

A reference to a positive page number beyond the declared page count is rejected. Existing checks for missing source IDs and missing preview files remain in force.

In addition, `sourceCoverage[]` must contain exactly one row for every page/slide declared by every `sourceFiles[]` record. Duplicate coverage rows are rejected by the base v1 validator and missing rows are rejected by the public review core. This prevents a source page from disappearing silently simply because the reconstruction step omitted its coverage entry.

## Local persistence identity

IndexedDB persistence is still keyed by `bundleId`, but saved state is restored only when the newly opened ZIP has the same SHA-256 fingerprint as the ZIP from which that local state was created.

This prevents a regenerated bundle that deliberately reuses a stable `bundleId` from silently inheriting stale manifest content or review decisions from an older local copy.

Opening the exact same ZIP resumes local edits. Opening a different ZIP with the same `bundleId` treats the newly opened ZIP as authoritative and replaces the saved checkpoint on the next persistence write.

Legacy IndexedDB rows without a source fingerprint are not restored automatically.

## Standalone build identity

The standalone HTML build uses the same public `src/core.js` facade consumed by the browser source, CLI, and tests. The builder embeds the core modules as local `data:` module URLs; it does not bypass the review-safety facade or introduce a network dependency.

## Regression coverage

The slide-review regression suite covers:

- rejection of one Asset and one Question while retaining the parent Case;
- deterministic pruning of rejected child dependencies without mutating review history;
- explicitly approved warned Cases surviving persistence/reload and deterministic finalization;
- record-scoped warned-child reconciliation without weakening batch or unresolved-question blockers;
- out-of-range source references and source coverage;
- mandatory coverage for every declared source page;
- exact-fingerprint persistence matching;
- browser wiring for rejected-child approval behavior and input ZIP fingerprinting;
- parsing and loading of the embedded public-core module graph used by the standalone reviewer build.
