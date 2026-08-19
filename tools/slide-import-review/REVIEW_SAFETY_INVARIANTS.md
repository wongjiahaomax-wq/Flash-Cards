# Slide Review Safety Invariants

This note records the safety behavior added during the PR #53 review correction pass.

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
- out-of-range source references and source coverage;
- mandatory coverage for every declared source page;
- exact-fingerprint persistence matching;
- browser wiring for rejected-child approval behavior and input ZIP fingerprinting;
- parsing and loading of the embedded public-core module graph used by the standalone reviewer build.
