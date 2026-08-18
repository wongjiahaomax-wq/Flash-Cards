# Admin image authoring workflow

_Status: implemented. PR #29 established the Case image-authoring baseline and merged PR #34/Image Management V2 extended it with scalable library behavior, Image Collections, bounded bulk operations, and same-Case option Move._

_Last updated: 18 August 2026_

This document records the current Admin image-authoring interaction contract. Learner stimulus semantics remain defined by fixed Case Assets and optional stimulus groups/options; Image Library organisation must not change those semantics.

Terminology:

```text
Topic      = educational / learner Case classification
Tag        = cross-cutting clinical metadata
Collection = Image Library organisational bucket
```

A Collection is not a Topic, Tag, or stimulus group.

## 1. Case editor order

The common authoring flow is:

```text
Topics → Case → Images → Case questions → Preview
```

Images appear before Case questions because the selected stimuli often determine which exact questions are useful.

The Images section preserves two learner relationship types:

- **Fixed image** — `case_assets`; shown in every applicable Review.
- **Alternative image set** — `stimulus_groups` containing `stimulus_group_options`; one active option is selected per active set when a Review begins.

Case-specific captions remain on the Case/stimulus relationship. Filename, alt text, source, licence, and Collection remain global Asset metadata.

## 2. Attached-image inspection

Fixed Case images use a clinically useful contain-fit preview rather than a crop that could hide diagnostic information.

Fixed images and alternative thumbnails can open the shared Admin image viewer for enlargement.

Alternative option cards expose relevant authoring state/actions including:

- active/inactive state;
- ordering;
- Case-specific caption;
- enlargement;
- exact-option question authoring;
- explicit **Move to another set…** when another valid active set exists in the same Case.

Set-wide questions and coverage controls remain visible at the alternative-set level rather than being confused with exact-option questions.

## 3. Add images from library is a contained picker

The Case editor must not permanently render the entire unused Image Library.

**Add images from library** opens a bounded searchable picker showing only the data needed for the contained workflow.

This picker remains separate from the full paginated `/admin/images` library and intentionally has simpler selection/pruning semantics.

Administrators can:

- search/browse eligible Assets;
- select several Assets;
- attach them as fixed images where the workflow permits;
- add them to an alternative set through the safe relationship endpoint;
- upload a new image from the contained authoring flow when needed.

The picker must respect production/Preview ownership rules and avoid loading an unbounded corpus into the Case editor.

## 4. Upload from Case authoring

Case authoring may upload a new JPEG/PNG through the same protected R2 media pipeline used by the Image Library.

All normal guardrails remain authoritative:

- authenticated/authorized write;
- current media type/size checks;
- managed R2 storage ceiling;
- immutable production object key;
- optional source/provenance metadata;
- no invented attribution.

A successful upload creates/reuses the resulting Asset relationship through explicit server logic; client UI state is not authorization.

## 5. Fixed versus alternative semantics stay explicit

Do not silently convert an image between fixed and alternative relationship types merely because the same Asset is selected in a different control.

If an Asset is already fixed in the target Case, bulk Add-to-alternative-set rejects rather than silently converting it.

If an Asset is already in another alternative set in the same Case, bulk Add rejects rather than silently moving it. Use the explicit same-Case Move operation.

Inactive options are not silently reactivated by a bulk Add.

These rules make relationship changes reviewable and protect contextual question/coverage semantics.

## 6. Exact-option questions remain attached to option identity

An exact-image question belongs to the `stimulus_group_option`, not to the global Asset.

This matters because one Asset may be reused in another Case without carrying unrelated questions.

Example:

```text
Case A / Option X
Prompt: What additional conduction abnormality is present?
Answer: Right bundle branch block.
```

Reusing the same ECG Asset in Case B does not make that Case inherit this question.

## 7. Same-Case option Move

Image Management V2 permits:

```text
Case A / Alternative Set 1 / Option X
→ Case A / Alternative Set 2 / Option X
```

The operation re-parents the existing option in place and preserves:

- option ID;
- Asset identity;
- Case-specific caption;
- active state;
- exact-option questions/answers.

Set-wide questions remain with their original sets.

Server validation rejects cross-Case, inactive, conflicting, ownership-invalid, or coverage-invalid moves.

The Image Library does not expose a generic global Asset Move command; this is a Case relationship operation.

## 8. Image Library scalable selection

The full `/admin/images` and `/preview-admin/images` libraries use the Image Management V2 behavior:

- 60 Assets per server-backed page;
- exact matching result count;
- deterministic search/filter/sort;
- explicit selection that can persist across page navigation within one canonical query context;
- exact Select All up to 300 matching Assets;
- explicit refusal above 300 rather than truncation;
- current-page Shift-range only;
- selection reset when authoritative search/filter/sort context changes.

This larger library selection model is intentionally distinct from the bounded Case picker.

## 9. Bounded mutation rule

Relationship/metadata bulk mutation requests remain bounded to:

```text
<= 30 unique Asset IDs per server request
```

Larger explicit selections are split into sequential client-side chunks. Each chunk independently revalidates authorization, Assets, target ownership/conflicts, and applicable coverage rules.

The first failed chunk stops later work. Successful earlier chunks stay committed, and completed versus remaining work is reported explicitly.

Do not describe these browser-orchestrated operations as globally atomic.

## 10. Image Collections

Production Image Library supports one optional Collection per Asset.

- null Collection = **Unsorted**;
- create/rename/delete Collection in production Admin;
- assign selected Assets to one Collection or Unsorted;
- deleting a Collection returns affected Assets to Unsorted without deleting media/content;
- Collection mutations use the same bounded sequential bulk pattern where applicable.

Preview can display/filter/sort production Collection metadata but cannot mutate production Collections or Asset assignments.

Collections never change Case/stimulus relationships, learner routing, Tags, questions, Reviews, or R2 identity.

## 11. Production/Preview behavior

The same shared Case-editor UI is used for production and Preview where possible, but server mutation authority differs.

Production Admin may mutate production-owned Case/stimulus relationships subject to normal validation.

Preview may mutate only current-session Preview-owned Case/group/option relationships. Production Assets may be selected/reused read-only into Preview-owned relationships where the explicit Preview contract permits it.

Preview must not mutate:

- production Asset metadata;
- production Collection assignments;
- production R2 objects;
- production Cases;
- production stimulus relationships.

Any new shared editor action must have a safe Preview implementation or explicit named block covered by the shared-editor contract tests.

## 12. Stimulus-specific coverage

Coverage rules are learner-authoring semantics, not library convenience rules.

Bulk Add, detach, deactivate, conversion, reorder, and same-Case Move operations must preserve/validate configured stimulus-specific coverage and fixed question-count compatibility where relevant.

Do not bypass coverage validation merely because an operation originated from the Image Library.

## 13. Asset metadata versus Case metadata

Global reusable Asset metadata includes:

- administrator-facing filename/name;
- alt text;
- source label;
- source URL;
- licence;
- Collection;
- active state;
- immutable storage key/R2 object identity.

Case relationship metadata includes:

- fixed/alternative membership;
- display order;
- Case-specific caption;
- exact-option/contextual questions;
- group membership and group-level settings/questions.

Keep those scopes separate when adding future authoring controls.

## 14. Regression expectations

Changes to image authoring should continue to protect:

- clinically useful contain-fit display/enlargement;
- bounded Case picker behavior;
- fixed versus alternative relationship safety;
- exact-option question identity;
- 30-Asset mutation bound;
- sequential bulk failure semantics;
- scalable library selection rules;
- Collection semantics;
- same-Case Move identity preservation;
- stimulus coverage validation;
- production/Preview ownership isolation;
- learner Review semantics remaining unchanged.

## 15. Validation standard

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```
