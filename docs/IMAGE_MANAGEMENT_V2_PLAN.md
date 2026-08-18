# Image Management V2 — Implemented Behaviour

_Status: merged in PR #34 and part of the current deployed baseline. Migration `0007_image_collections.sql` was landed/applied before the code-only Preview verification path used during rollout._

_Last updated: 18 August 2026_

## Purpose

Image Management V2 makes the production and Preview Image Libraries practical for a larger corpus while preserving the existing Case/stimulus model.

It is an Admin workflow and media-organisation feature. It does **not** change learner stimulus selection, contextual-question precedence, Review snapshots/provenance, or protected R2 object identity.

Terminology remains deliberate:

```text
Topic      = learner/curriculum Case classification
Tag        = cross-cutting clinical metadata
Collection = Image Library organisational bucket
```

A Collection is not a Topic, Tag, stimulus group, or learner category.

## Preserved stimulus model

```text
fixed Case image            = case_assets
alternative image set       = stimulus_groups
image in an alternative set = stimulus_group_options
```

Case-specific captions remain relationship metadata. Exact-image questions remain attached to the exact `stimulus_group_option`. A stimulus group is a Case-scoped learner alternative set, not a global media folder.

Image Management V2 does not add Asset Tags or a generic global Asset Move semantic.

## 1. Image Collections

Migration `0007_image_collections.sql` adds global Image Library organisation.

Each Asset has zero or one Collection through nullable `assets.image_collection_id`.

```text
image_collection_id = NULL
→ Unsorted
```

Current semantics:

- Collection name is unique;
- rename preserves Collection ID and assignments;
- setting a Collection replaces the Asset's prior Collection;
- choosing Unsorted removes the assignment;
- deleting a Collection uses `ON DELETE SET NULL` semantics and returns affected Assets to Unsorted;
- deleting a Collection never deletes Assets, R2 objects, Case/stimulus relationships, questions, Topics, Tags, or Reviews.

Collections are operational library metadata only. They do not change learner behavior or educational classification.

Preview can display/filter/sort production Collection metadata read-only but cannot mutate production Collection definitions or Asset assignments.

## 2. Server-backed pagination

`/admin/images` and `/preview-admin/images` use server-backed pages of **60 Assets**.

The server resolves:

- exact total matching count;
- normalized current page;
- total pages;
- deterministic page rows with stable Asset-ID tie-breakers;
- canonical search/filter/sort context.

Only the current bounded page and its needed relationship/context rows are loaded for rendering.

Changing search/filter/sort starts at page 1. Invalid pages normalize safely. Page navigation preserves canonical filters.

## 3. Cross-page explicit selection

Selected Asset IDs can persist across page navigation while the canonical search/filter/sort context stays the same.

Example:

```text
Page 1: select A + B
Page 2: select C
Selection = A + B + C
```

Changing an authoritative query criterion clears the old selection universe. Page number alone does not.

Current query-context reset dimensions include search text, Topic/context filter, usage, active/inactive status, source filter, Collection, and sort order.

`Clear selection` clears the full cross-page selection.

Ctrl/Cmd toggle and touch Select mode operate on explicit IDs. Shift-range remains intentionally current-page/current-order only.

The bounded Case-editor Asset picker is a separate contained workflow and does not inherit the full cross-page library selection model.

## 4. Exact Select All

The server computes exact matching count before exposing all-matching selection.

Current bound:

```text
maximum exact all-matching selection = 300 Assets
```

When `<=300` Assets match, the server resolves the exact matching IDs and the client converts them into explicit selection.

When `>300` match, the operation is refused with guidance to refine filters. It never silently selects the first 300 or labels a partial set as all matching.

## 5. Server mutation bound and client chunking

The server relationship-write invariant remains:

```text
one mutation request <= 30 unique Asset IDs
```

Larger explicit selections are executed client-side as sequential chunks of at most 30 IDs. Only one chunk is in flight at a time.

Every request independently revalidates authorization, Asset validity, target ownership, conflicts, and applicable coverage constraints. A successful earlier chunk never authorizes later work by implication.

There is no persistent general-purpose bulk-job table for Image Library actions.

## 6. Partial-failure semantics

Bulk Image Library operations are intentionally not represented as one atomic transaction across hundreds of Assets.

If a chunk fails:

- successful earlier chunks remain committed;
- later chunks do not run;
- the UI reports completed versus remaining work;
- failed/unprocessed IDs remain selected where practical for inspection or retry;
- displayed data is invalidated/refreshed after completed work.

This makes failure explicit rather than pretending a large browser-orchestrated operation was all-or-nothing.

## 7. Bulk Add-to-alternative-set safety

Current server rules include:

- already active in the exact target set → idempotent/no-op where supported;
- fixed in the target Case → reject rather than silently convert;
- already in another alternative set in the target Case → reject rather than silently move through the bulk Add path;
- inactive existing option → do not silently reactivate;
- inactive/missing target → reject;
- unrelated other-Case relationships → preserve;
- Preview bulk Add → target only current-session Preview-owned active groups.

Reorganisation between existing sets uses the explicit Move operation instead.

## 8. Identity-preserving same-Case option Move

Image Management V2 supports:

```text
existing stimulus_group_option
Case A / Set 1
→ Case A / Set 2
```

The operation updates the existing option's parent group in place and preserves:

- `stimulus_group_options.id`;
- Asset identity;
- Case-specific option caption;
- active state;
- exact-option Question relationships and answers;
- option-owned metadata.

A safe new target `display_order` is assigned.

Set-wide/group-level questions stay attached to their original groups.

### Move validation

Before mutation, the server validates:

- current production or Preview ownership;
- active Case/source/target state;
- source and target groups belong to the same Case;
- no conflicting target option for the Asset;
- source-after-removal and target-after-addition coverage validity;
- compatibility with fixed Case question-count limits where relevant.

Cross-Case, inactive, duplicate/conflicting, ownership-invalid, and coverage-invalid moves are rejected.

Production Admin cannot mutate Preview-owned relationships. Preview Move is limited to current-session Preview-owned Case/group/option relationships.

## 9. Fixed images remain distinct

Fixed `case_assets` are not silently reinterpreted as alternative options by the Move operation.

Fixed-image → alternative-set conversion remains an explicit authoring operation with its own safety rules.

Case Questions are not automatically re-scoped to exact-image questions merely because a Case previously had one image. Question scope remains an explicit educational decision.

## 10. Preview parity and isolation

`/preview-admin/images` shares scalable browsing/selection behavior against production Assets read-only.

Preview may, within current ownership rules:

- search/filter/sort;
- paginate;
- enlarge;
- select across pages;
- Select All exact matching Assets within the 300 bound;
- bulk-add production Assets into current-session Preview-owned alternative sets;
- move Preview-owned stimulus options between Preview-owned groups in the same Preview Case.

Preview may not mutate:

- production Asset metadata;
- production Collection assignments;
- production R2 objects;
- production Cases;
- production stimulus relationships.

## 11. Learner behavior remains unchanged

Image Management V2 does not change:

- fixed Case Asset semantics;
- one-option-per-active-group selection;
- option randomization at Review creation;
- exact-option or group-level question semantics;
- contextual question precedence;
- Case Topics/Tags;
- Review Asset snapshots;
- Review Question snapshots/provenance.

Historical Reviews continue rendering persisted snapshots regardless of later library organisation or same-Case option movement.

## 12. Deployment history and current state

The rollout required careful separation of schema and code because the approved **Deploy PR to Preview** workflow rejects candidate PRs that change D1 migrations/schema or `wrangler.jsonc`.

The completed rollout sequence was:

1. land/review the Image Collection migration/schema foundation;
2. apply `0007_image_collections.sql` to the intended D1 environment through the protected migration path;
3. ensure the Preview candidate became code-only relative to `main`;
4. deploy that code-only head through the existing Preview workflow;
5. manually inspect Image Management V2 against the production-backed Preview workspace;
6. merge the implementation to `main`.

This is historical rollout context, not a pending instruction for PR #34. PR #34 is merged and Image Management V2 is part of the current baseline.

Do not weaken the Preview schema guard merely to deploy future schema-changing PRs. Preserve the same schema-first/code-only-preview sequencing when applicable.

## 13. Regression expectations

Coverage should continue to protect:

- deterministic 60-item pagination and exact counts;
- out-of-range page normalization;
- canonical query context excluding page number;
- exact all-matching IDs at `<=300`;
- explicit refusal above 300;
- production exclusion of Preview-owned Assets;
- cross-page selection preservation/reset rules;
- current-page Shift behavior;
- retained bounded Case-picker behavior;
- 1/30/31/60/61 chunk boundaries;
- sequential execution and stop-on-first-failure accounting;
- same-Case Move identity/caption/exact-question preservation;
- cross-Case/inactive/duplicate/coverage-invalid Move rejection;
- group-level questions remaining with their groups;
- production/Preview ownership enforcement;
- Collection nullable/Unsorted semantics;
- Collection create/rename/delete/assignment/filter/sort;
- Preview read-only Collection metadata.

## 14. Validation standard

Implementation changes touching this subsystem should pass:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

## 15. Definition of done/current contract

Image Management V2 means the Image Library can be paged deterministically, selected exactly across pages within explicit bounds, organised by one-Collection-per-Asset metadata with Unsorted, mutated through server-safe sequential chunks, and reorganised through identity-preserving same-Case option Move without losing contextual teaching data or violating Preview isolation.
