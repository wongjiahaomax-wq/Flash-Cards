# Image Management V2 — Implementation Plan

_Status: planned next product milestone after the merged PR #29 image-authoring baseline._

_Last updated: 17 August 2026_

## Purpose

PR #29 substantially improved Case image authoring, but it intentionally left several library-management problems unresolved. Image Management V2 should make the Image Library scale beyond the currently rendered result set and add explicit, safe reorganisation semantics without weakening the existing Case/stimulus model.

This is an Admin workflow milestone. It must preserve learner Review composition, image provenance, R2 immutability and Preview isolation.

## Current baseline to preserve

Current `main` already provides:

- `/admin/images` search/filter/sort and visual cards;
- reusable `AdminImageViewer` enlargement;
- checkbox, Ctrl/Cmd toggle, Shift-range and touch Select mode over the currently displayed result set;
- pruning of selections that disappear after filter/sort changes;
- a 30-Asset server-enforced bound for one relationship-write action;
- bulk **Add to alternative set** for active Case-scoped stimulus groups;
- a bounded Case image picker with at most 60 results plus look-ahead;
- fixed Case images and alternative stimulus sets as distinct relationship types;
- exact-option questions bound to `stimulus_group_option`;
- Case-specific captions on Case/option relationships rather than global Asset metadata;
- Preview-compatible image selection/attachment with production Assets reused read-only.

See `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`.

## V2 goals

### 1. Paginated/scalable Image Library

`/admin/images` should no longer depend on one unbounded rendered result set.

Implement server-backed pagination using the existing authoritative search/filter/sort semantics.

Requirements:

- preserve existing search and filter behaviour;
- preserve deterministic displayed ordering;
- expose exact matching-result count;
- expose current page and total pages;
- keep page size bounded; 60 is the preferred default unless repository constraints justify a smaller value;
- changing search/filter/sort resets to page 1;
- ordinary navigation to Asset detail remains unchanged;
- selection state must never imply that off-page items are selected unless the user explicitly chooses an all-matching action.

### 2. Explicit `Select all N matching`

Add a deliberate action after the user has an active filtered result set:

```text
Select all N matching images
```

This must not be a browser-only guess based on the current page.

V2 should use a server-backed exact ID selection for the current canonical filter/sort query, with a conservative upper bound. Preferred first implementation:

- server resolves the exact matching active image Asset IDs for the current filters;
- cap one all-matching selection at 300 Assets;
- if more than 300 match, show the exact count and require the Admin to refine the filters rather than silently truncating;
- return/store the explicit selected IDs in client selection state;
- keep the existing distinction between selected IDs and the Shift-range anchor;
- `Clear selection` clears the all-matching selection normally;
- changing the filter/sort query clears an all-matching selection rather than pretending it still represents the new query.

This is intentionally bounded. It provides exact semantics without introducing a persistent bulk-job schema merely to support arbitrarily large selections.

### 3. Chunked bulk execution above 30 selected Assets

The existing server invariant of at most 30 unique Assets per relationship-write request should remain.

When the UI has more than 30 explicit selected IDs, execute the requested bulk operation as sequential bounded chunks of at most 30 IDs.

Requirements:

- one request at a time;
- visible progress such as `60 / 143 processed`;
- each server request independently revalidates authorization, Assets, target Case/group and conflicts;
- a failed chunk stops later chunks;
- report completed versus remaining IDs clearly;
- do not claim whole-selection atomicity;
- completed chunks remain committed;
- leave the remaining IDs selected so the administrator can inspect/retry;
- refresh/browser close may stop the client loop; V2 does not require a new persistent bulk-job table.

This mirrors the project's preference for bounded Worker/D1 work while avoiding a new schema for a convenience workflow.

### 4. Explicit Case-scoped reorganisation

PR #29 deliberately rejected ambiguous generic Move behaviour. V2 may now add an explicit reorganisation workflow, but only with defined relationship semantics.

The first supported Move should be:

```text
Move existing alternative image option
from one alternative set
→ another alternative set
within the same Case
```

Required semantics:

- same Case only;
- source and target stimulus groups must both be active and valid mutation targets;
- preserve the existing `stimulus_group_option` identity where the schema safely permits it, so its Case-specific caption, exact-option question relationships, active state and other option-owned metadata remain attached;
- assign a valid target display order;
- group-level questions remain owned by their groups and do not move;
- preflight source and target group coverage/invariants before mutation;
- reject the move if it would leave either group in an invalid state;
- reject duplicate/conflicting target membership rather than silently merging records;
- preserve unrelated relationships and other Cases;
- use one bounded D1 write/batch per chunk after complete prevalidation.

Before implementing this mutation, inspect the current schema, foreign keys, triggers and helper assumptions. If preserving option identity by changing its group relationship is not safe under the current schema, do not substitute delete/recreate silently. Document the blocker and narrow the PR to the scalable library/selection work.

### 5. Fixed-image conversion remains explicit

Existing fixed-image → alternative-option conversion is a different operation from moving an existing stimulus option.

Do not reinterpret Case Questions as exact-image questions automatically. A fixed image may have Case Questions whose semantics cannot be inferred from the Asset relationship.

If V2 surfaces fixed-image conversion from the Image Library, it must delegate to the existing safe conversion path and state clearly that Case Questions remain Case Questions unless the Admin explicitly re-scopes them.

### 6. Preview Admin parity and isolation

Every shared UI/action introduced by V2 must be considered against the Preview workspace.

Requirements:

- shared editor/image-library UI must continue satisfying `test/admin-editor-preview-contract.test.js` where applicable;
- `/preview-admin/images` may paginate/search/select real production Assets read-only;
- Preview bulk relationship writes may target only active stimulus groups owned by the current Preview Session;
- Preview move/reorganisation may mutate only Preview-owned relationship/group/option records;
- normal production Admin actions must reject Preview-owned Cases/groups/options/Assets as already required;
- production Asset metadata and R2 objects remain read-only from Preview;
- Preview Reset must continue cleaning the disposable workspace correctly after V2 operations.

## Deliberate non-goals

Do not add the following merely as part of Image Management V2:

- a global Asset folder/group schema;
- Asset Tags;
- learner-visible image grouping changes;
- changes to random stimulus selection semantics;
- automatic migration of Case Questions to exact-option questions;
- destructive R2 deletion or storage-key renaming;
- broad non-image file support;
- a new general-purpose background job system;
- D1 schema changes unless a separately reviewed architecture decision proves they are required.

The current Case-scoped stimulus-group relationship is a learner-content concept, not a generic media-library folder.

## Data/schema expectation

Preferred V2 scope is **no migration**.

Pagination, exact bounded all-matching selection, client-orchestrated 30-item chunks and same-Case option reorganisation should first be attempted with the existing model.

If implementation discovers that safe Move semantics require a schema change, stop that subfeature and document the required migration separately rather than bundling it into a Preview-deployable UI PR.

## Required regression coverage

At minimum cover:

- deterministic pagination and matching counts;
- search/filter/sort preservation across pages;
- reset to page 1 after query changes;
- exact all-matching selection under the cap;
- refusal when matching count exceeds the all-matching cap;
- no silent truncation;
- clearing all-matching selection after filter/sort change;
- chunking into at most 30 IDs per mutation request;
- stop-on-error with completed/remaining accounting;
- authorization on every chunk;
- production exclusion of Preview-owned targets;
- Preview target ownership enforcement;
- same-Case option move success if implemented;
- cross-Case move rejection;
- inactive source/target rejection;
- duplicate/conflict rejection;
- preservation of option caption and exact-option questions on a successful move;
- source/target group coverage validation;
- preservation of unrelated relationships;
- existing Ctrl/Cmd/Shift/touch selection behaviour;
- existing Case picker behaviour;
- existing learner Review/stimulus tests unchanged.

## Validation

Before handoff:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

The PR should be deployable through **Deploy PR to Preview**, which means it should not modify D1 migrations/schema or `wrangler.jsonc`.

## Manual Preview review

After CI is green:

1. Deploy the exact PR head through **Deploy PR to Preview**.
2. Sign into `/preview-admin` with the Preview-capable owner identity.
3. Create a Preview Copy of a Case with several images/stimulus options.
4. Verify Image Library pagination/search/counting.
5. Test ordinary page selection, Ctrl/Cmd, Shift and touch Select mode.
6. Test `Select all N matching` with fewer than and more than the configured cap.
7. Test a bulk action spanning more than 30 selected Assets and verify progress/chunk accounting.
8. If Move is implemented, move an existing option between two alternative sets in the Preview Case and confirm caption/exact-option questions remain correctly attached.
9. Verify production source Case relationships remain unchanged.
10. Reset Preview Workspace.
11. Restore current `main` to Preview after review.

## Definition of done

Image Management V2 is complete when the administrator can manage a paginated image corpus, make an exact bounded selection across pages, perform large selections through bounded chunks, and safely reorganise supported Case-scoped image relationships without ambiguity or loss of contextual teaching data.
