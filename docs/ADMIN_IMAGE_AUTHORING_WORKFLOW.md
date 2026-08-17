# Admin image authoring workflow

_Last updated: 17 August 2026_

This document records the Admin image-authoring UX introduced by `agent/admin-case-image-workflow`. It is a UI/query workflow change only: no learner selection semantics or content schema are changed.

## Case editor order

The Case editor follows the product-facing authoring sequence:

```text
Topics → Case → Images → Case questions → Preview
```

Images are part of the clinical presentation and therefore appear before Case questions.

The top-level **Images** section contains both existing image relationship types without flattening them:

- **Fixed image** — a `case_assets` relationship; shown in every applicable Review.
- **Alternative image set** — a `stimulus_groups` relationship whose active options are `stimulus_group_options`; existing learner logic selects one active option from each active set.

Case-specific captions remain on `case_assets` / `stimulus_group_options` relationships. Asset-level filename, alt text, source and licence remain reusable global Asset metadata.

## Attached-image inspection

Fixed Case images use a large, available-width preview with `object-fit: contain` and responsive height. Clinically relevant content is not cropped.

Clicking a fixed image or an alternative thumbnail opens the shared `AdminImageViewer` native-dialog viewer. The viewer:

- preserves full image aspect ratio;
- uses most of the available viewport;
- exposes a visible Close button;
- closes through native Escape/cancel behaviour;
- uses native modal focus containment;
- can close from a backdrop click;
- shows the Admin image filename when available.

The same viewer is available from `/admin/images` through each card's **Enlarge** action.

## Alternative image sets

Alternative sets are compact rather than rendering a long sequence of large image cards.

Each set displays a responsive thumbnail grid. Every option retains:

- active/inactive status;
- ordering controls;
- caption/name context;
- enlargement;
- exact-option question authoring.

Image-specific questions remain linked to their exact `stimulus_group_option`. When existing image-specific questions are present, their disclosure is collapsed by default and labelled with the exact question count. A new/empty option keeps its question disclosure open so the authoring affordance is discoverable.

Set-wide `stimulus_group_questions` remain separate from exact-option questions and stay under an advanced set-wide disclosure. Coverage, set activation and other set settings also remain under advanced controls.

## Add images from library

The Case editor no longer eagerly loads or permanently renders every unused Asset.

**Add images from library** opens a contained picker. The Case server loader queries picker Assets only when the picker is requested. The query:

- requires an active Case;
- returns only active image Assets;
- excludes Assets already used by that Case as fixed images or alternative options;
- searches filename/Admin name, alt text, source label and source URL;
- returns at most 60 results plus a one-row lookahead;
- asks the administrator to refine the search if more than 60 Assets match.

The picker supports multi-selection, an explicit selected count and one final attach action. The same picker can target either fixed Case images or one existing active alternative set.

### Picker selection safety

Picker selection is scoped to the current Case/attachment target and current server-returned result set.

- A search/result refresh prunes selected Asset IDs that are no longer visible while retaining still-visible selected Assets.
- Changing from fixed-image attachment to an alternative set, changing alternative-set target, or changing Case context resets the picker selection entirely.
- A requested `target_group` must resolve to an active alternative set belonging to the current Case. Missing, inactive, or foreign targets fail closed with a client error; they never silently fall back to fixed-image attachment.

This prevents stale hidden selection or a stale target URL from changing the meaning of a later attach action.

### Upload from Case authoring

Uploading is available as a disclosure inside the picker rather than as a permanent large Case form.

The upload delegates to the existing `createAssetFromUpload()` path, preserving:

- JPEG/PNG validation;
- existing image-size limits;
- managed R2 storage limits;
- immutable teaching-image object handling;
- source URL validation;
- source/attribution/licence metadata;
- Admin authorization.

For upload-to-alternative-set, the target is validated **before** creating the Asset or R2 object. The prevalidation checks that the set and parent Case are active, the set belongs to the current Case, and a newly created blank option can satisfy current minimum stimulus-specific coverage using its set-wide questions.

The target is validated again when the new relationship is written. If a concurrent change occurs after Asset creation and that final relationship write fails, the response explicitly reports partial success and the newly created reusable Asset ID. The valid reusable Asset is retained instead of presenting the upload itself as failed or attempting unsafe post-creation cleanup; the Admin can reattach it from the library after resolving the Case/set state.

## `/admin/images` multi-selection

The existing Image Library filters and sorting remain authoritative for the displayed order.

Selection behaviour:

- visible checkbox: toggles one Asset without clearing other selected Assets;
- Ctrl-click: toggles the clicked Asset while preserving the current selection;
- Cmd-click: same behaviour on macOS;
- Shift-click: adds the contiguous range between the current anchor and clicked Asset using the exact currently displayed filtered/sorted order;
- ordinary click outside Select mode: continues to navigate to the Asset detail page;
- **Select images** mode: provides a touch/mobile path where an ordinary card tap toggles selection;
- **Clear selection** resets both selection and range anchor.

Selection is only over the currently rendered result set. Filtering/sorting is server-driven and creates a new displayed result set; selected IDs no longer displayed are discarded and an invisible Shift anchor is cleared.

## Bulk grouping semantics

The current schema has no global Asset-folder/group relationship. The only relevant image grouping model is Case-scoped alternative stimulus sets:

```text
Case
└── stimulus_group
    └── stimulus_group_option → Asset
```

For that reason, the sticky bulk bar exposes **Add to alternative set**, not a fabricated global group or ambiguous Move operation.

The target list contains only active stimulus groups whose parent Case is active.

The server validates the complete submitted batch before intentional relationship writes:

- every Asset ID must exist;
- every Asset must be active and type `image`;
- the target set and parent Case must be active;
- an Asset already active in that exact target set is an idempotent no-op;
- an Asset already fixed in the target Case is rejected rather than silently converted;
- an Asset already in another alternative set in the target Case is rejected rather than silently moved;
- an inactive existing option in the target set is rejected and must be explicitly reactivated in the Case editor;
- unrelated Asset relationships in other Cases are preserved;
- minimum stimulus-specific coverage is checked before adding new options.

This deliberately avoids a generic **Move** operation because moving a stimulus option can involve exact-option questions, captions and activation state that require a more explicit product decision.

### Batch limit

One multi-attach or bulk-grouping action is limited to **30 unique Assets**.

This keeps the server work bounded and leaves D1 query headroom around validation, relationship reads, ordering and writes. New relationship writes are issued as one bounded D1 batch after validation. The UI states the limit and the server enforces it independently of browser state.

## Select all matching filters

**Select all N matching images is deliberately deferred in this PR.**

The current Image Library does not have a server-side pagination/selection-token contract. Implementing a browser-only approximation would make it too easy to imply that invisible/future records were selected, while submitting a very large ID set would conflict with bounded Worker/D1 writes.

The safe future implementation should pair pagination or a stable server-represented filter query with explicit matching count and bounded chunked actions. Ctrl/Cmd and Shift-range selection over the current displayed result set remain implemented now.

## Learner/data-model invariants

This workflow does not change:

- `case_assets` fixed-image semantics;
- `stimulus_groups` selection count/activation semantics;
- `stimulus_group_options` selection semantics;
- exact-option or set-wide question precedence;
- Case Topic routing;
- Case/Question Tags;
- shared Question Prompt semantics;
- Review image/question provenance or snapshots;
- learner Review composition.

No schema migration is introduced.
