# Admin image authoring workflow

_Last updated: 17 August 2026_

This document records the Admin image-authoring UX introduced by PR #29 and extended by Image Management V2 in draft PR #34. These remain Admin UI/query/relationship workflow changes only: learner selection semantics and the learning-content schema are unchanged.

## Case editor order

The Case editor follows:

```text
Topics → Case → Images → Case questions → Preview
```

The Images section preserves the two relationship types:

- **Fixed image** — `case_assets`; shown in every applicable Review.
- **Alternative image set** — `stimulus_groups`, containing `stimulus_group_options`; learner logic selects one active option from each active set.

Case-specific captions remain on `case_assets` / `stimulus_group_options`. Asset filename, alt text, source and licence remain global reusable Asset metadata.

## Attached-image inspection

Fixed Case images use a large contain-fit preview. Fixed images and alternative thumbnails open the shared `AdminImageViewer`. Clinically relevant image content is not cropped.

Alternative option cards retain:

- active/inactive state;
- ordering controls;
- Case-specific caption editing;
- enlargement;
- exact-option question authoring;
- V2's explicit **Move to another set…** operation when another active set exists in the same Case.

Set-wide `stimulus_group_questions` remain separate from exact-option questions. Coverage, set activation and set-wide questions remain group-owned controls.

## Add images from library in the Case editor

The Case editor uses the existing bounded contained Asset picker rather than the paginated Image Library contract.

The picker:

- requires an active Case;
- returns only active image Assets;
- excludes Assets already used by that Case as fixed images or alternative options;
- searches filename/Admin name, alt text, source label and source URL;
- returns at most 60 results plus one-row lookahead;
- asks the Admin to refine the search if more than 60 Assets match;
- supports multi-selection and an explicit selected count;
- can target fixed images or one active alternative set.

Picker selection remains intentionally scoped to its current bounded result set. Hidden results are pruned, and a Case/target change resets selection. This differs deliberately from the paginated `/admin/images` cross-page selection model.

### Upload from Case authoring

Upload continues through `createAssetFromUpload()` and the central protected media helpers, preserving JPEG/PNG validation, image-size and R2 ceilings, immutable keys, attribution/source validation and Admin authorization.

For upload-to-alternative-set, the target is validated before the Asset/R2 write and again before the relationship write. A concurrent post-upload relationship failure reports partial success and retains the valid reusable Asset rather than deleting it unsafely.

## `/admin/images` V2 pagination

The Image Library now uses server-backed **60-Asset pages** instead of one large rendered result set.

For the canonical search/filter/sort query the server returns:

- deterministic page rows with Asset-ID tie-breaks;
- exact matching count;
- current normalized page;
- total pages;
- bounded exact all-matching IDs when the total is at most 300.

The UI shows the displayed range and page and provides Previous/Next navigation. Page links preserve search/filter/sort. Applying filter/search/sort changes does not submit a page number and therefore starts at page 1.

Normal Asset-card navigation to `/admin/images/[assetId]` remains unchanged.

## Cross-page Image Library selection

Selection behaviour remains:

- visible checkbox toggles one Asset;
- Ctrl/Cmd toggles while preserving other IDs;
- ordinary click outside Select mode navigates to Asset detail;
- Select mode gives a touch/mobile ordinary-tap toggle path;
- Clear selection clears the full selection and range anchor.

V2 changes page-navigation semantics: explicit selected Asset IDs survive page 1 -> page 2 while the canonical search/filter/sort context is unchanged.

Changing search, Topic, usage filter, active/inactive filter, source filter or sort clears the previous cross-page selection. Page number alone is not part of that authoritative context.

Shift-range remains relative to the currently displayed page/order. It never infers a range through unloaded pages, and an anchor from another page is cleared when the displayed page changes.

Selection state is explicit IDs rather than an implicit “everything matching” flag.

## Exact `Select all N matching images`

When the exact current matching count is at most **300**, the server resolves the exact matching Asset IDs for the canonical filters and the UI can select all of those IDs.

When more than 300 match, Select All is refused and the Admin is told to refine the query. V2 never silently truncates to the first 300 and never calls a partial selection “all matching”.

A query-context change or normal Clear selection clears an all-matching selection.

## Bulk Add to alternative set

The Image Library still exposes the relationship-safe operation:

```text
Add selected images
→ existing active alternative set
```

It does not expose a generic Asset folder/group or ambiguous global Move.

The server primitive keeps all existing safety rules:

- every Asset must exist, be active and be an image;
- target set and parent Case must be active and valid;
- already active in exact target -> idempotent no-op where supported;
- fixed in the target Case -> reject rather than silently convert;
- in another alternative set in the target Case -> reject rather than silently move;
- inactive existing option -> do not silently reactivate;
- unrelated other-Case relationships remain unchanged;
- current group coverage requirements are validated.

## 30-Asset server bound and V2 chunk orchestration

One relationship-write request remains limited to **30 unique Assets**. The server limit has not been raised to match Select All.

When the explicit selection is larger than 30, the Image Library splits IDs into sequential chunks of at most 30 and submits only one mutation request at a time.

Every request independently re-runs server authorization, ownership, Asset and conflict validation. A successful earlier chunk does not authorize a later chunk.

The UI reports progress such as:

```text
Adding images… 60 / 143 processed
```

On a failed chunk:

- later chunks are not sent;
- successful earlier chunks remain committed;
- the UI does not claim atomicity;
- completed and remaining counts are shown;
- the failed/unprocessed IDs remain selected for inspection/retry where practical;
- successful relationship changes cause page data to refresh.

V2 adds no persistent bulk-job table; browser close/refresh can interrupt the client loop.

## Same-Case alternative-option Move

V2 implements the narrow relationship operation that PR #29 deliberately deferred:

```text
existing stimulus_group_option
source alternative set
→ another alternative set
within the SAME Case
```

The control is on the existing option card in the Case editor. It is not an `/admin/images` Asset Move command.

Schema inspection established that `stimulus_group_options.id` can remain stable while `stimulus_group_id` changes. V2 updates the existing option row in place, preserving:

- option ID;
- Asset identity;
- Case-specific caption;
- active state;
- exact-option Question relationships/answers;
- other option-owned metadata.

The moved option receives the next valid target display order. Group-level questions do not move; they stay attached to their original groups.

Before the update, the server validates current ownership, active source/target, same-Case identity, duplicate target membership, and simulated source-after-removal/target-after-addition coverage. It also rejects a move whose required stimulus-specific coverage cannot fit a fixed Case question-count configuration.

Cross-Case moves, inactive relationships, duplicate/conflicting target membership and Preview/production ownership violations fail closed.

## Fixed-image conversion remains separate

A fixed `case_assets` relationship is not the same operation as moving a `stimulus_group_option`.

Existing fixed-image -> alternative-set conversion remains explicit and delegates to the established conversion logic. The application does not infer that Case Questions authored while one image existed are exact-image questions. Question re-scoping remains an explicit Admin action.

## Preview Admin behaviour

`/preview-admin/images` uses the same pagination, exact count, cross-page selection, <=300 Select All and sequential chunk UI against real production Assets read-only.

Preview relationship mutations can target only current-session Preview-owned Cases/groups/options. Production Asset metadata/R2 objects remain read-only.

The shared Case editor also exposes Move in Preview, but its endpoint requires the current live Preview Session and moves only a Preview-owned option between active groups in the same Preview-owned Case/session.

Normal production Admin read/mutation paths continue excluding or rejecting Preview-owned relationships.

## Learner/data-model invariants

Image Management V2 does not change:

- fixed `case_assets` semantics;
- `stimulus_groups` learner selection count/activation semantics;
- random alternative selection;
- exact-option or set-wide question precedence;
- Case Topics/Tags;
- Review Asset/Question snapshots and provenance;
- learner Review composition;
- R2 object identity.

No D1 migration and no `wrangler.jsonc` change are introduced.

See `IMAGE_MANAGEMENT_V2_PLAN.md` for final limits, tests and manual Preview review procedure.