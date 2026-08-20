# Higher-resolution Asset replacement

_Status: implemented on the current feature branch_

_Last updated: 20 August 2026_

This document defines the narrow production Admin operation **Replace with higher-resolution version**.

## Purpose

Use this operation only when the administrator has a better-quality copy of the **same underlying image**.

```text
same image + higher quality/resolution
→ replacement workflow

different image + same condition/diagnosis
→ new independent Asset
```

A different ECG, X-ray, photograph, diagram or other clinical image remains a separate Asset even when it represents the same diagnosis.

This is not generic Asset versioning. There is no Asset family, `image_identity`, version-history table or automatic visual-similarity system.

## Immutable media and Asset supersession

Production teaching-image R2 keys remain immutable. Replacement therefore creates:

```text
new immutable R2 object
+
new Asset row / Asset ID
```

The old object is never overwritten.

The only lineage field is:

```text
assets.superseded_by_asset_id
```

After a successful replacement:

```text
Asset A
is_active = false
superseded_by_asset_id = Asset B

Asset B
is_active = true
superseded_by_asset_id = null
```

A later quality upgrade replaces B and can naturally produce:

```text
A → B → C
```

An already-superseded A cannot be replaced again directly or reactivated through the normal metadata form.

## Metadata inheritance

The new Asset receives the new uploaded file's immutable storage key, MIME type and appropriate original filename. It carries forward the old Asset's semantic/provenance metadata where applicable, including:

- alt text;
- source label;
- source URL;
- licence/permission;
- Image Collection.

Changing the upload filename does not invent or replace provenance.

## Current fixed Case relationships

Current production `case_assets` rows are updated in place from A to B. The operation preserves:

- Case ID;
- display order;
- Case-specific caption;
- relationship creation/history fields not involved in replacement.

The Case is not recreated.

Preview-owned Case relationships are outside this mutation and are not silently rewritten.

## Current Stimulus Option relationships

Current production `stimulus_group_options.asset_id` references move from A to B **without changing the Stimulus Option ID**.

The operation preserves:

- Stimulus Option ID;
- Stimulus Group ID;
- display order;
- caption;
- active state.

This identity preservation is what keeps existing Case-specific exact-image `stimulus_option_questions` intact. Those question rows and answers are not moved, cloned or rewritten.

## Reusable Image Questions

Reusable Image Questions have historical Asset provenance, so existing `asset_questions` rows are never changed from A to B.

Instead:

```text
Asset A
├── AQ1
└── AQ2

replacement
↓

Asset A                Asset B
├── AQ1                ├── BQ1
└── AQ2                └── BQ2
```

BQ1/BQ2 receive new Asset Question IDs and keep the original:

- `question_prompt_id`;
- canonical `answer_md`;
- active/inactive state.

Question Prompts are reused, not duplicated.

Current production `stimulus_option_asset_questions` opt-ins are then remapped from the old Asset Question IDs to the corresponding cloned IDs. Stimulus Option IDs stay unchanged.

The old Asset Questions remain attached to A so historical `review_questions.source_asset_question_id` continues to identify the exact canonical relationship that existed when the Review started.

## Review question history

Replacement never rewrites historical Review questions.

Existing rows retain:

```text
prompt_snapshot_md
answer_snapshot_md
source_asset_question_id
source_stimulus_group_id
source_stimulus_option_id
```

Future Reviews resolve current authoring relationships and therefore use Asset B plus B's cloned reusable Asset Questions. Resolver precedence is unchanged.

## Historical Review media delivery

`review_assets.storage_key_snapshot` is the authoritative historical media identity.

Study pages use an authenticated Review-specific image URL instead of the ordinary current-Asset route. The endpoint:

1. requires authentication;
2. verifies the Review belongs to the requesting learner;
3. verifies the requested `review_assets` row belongs to that Review;
4. reads only `review_assets.storage_key_snapshot` as the R2 key;
5. serves that immutable object even if its original Asset is now inactive;
6. does not accept an arbitrary R2 key from the request;
7. uses private immutable cache semantics;
8. returns not-found/denial without reading R2 when ownership does not match.

The ordinary `/api/assets/{assetId}/image` path keeps its existing contract for active current Assets and continues to reject inactive Assets.

Therefore:

```text
old Review
→ old Review Asset snapshot
→ old R2 object

new Review
→ current Asset B
→ new R2 object
```

## R2/D1 failure safety

R2 and D1 do not share a transaction. The operation follows this sequence:

```text
1. validate source Asset and full semantic preflight
2. upload one new immutable R2 object through existing media guardrails
3. execute the D1 replacement semantics in one D1 batch
4. if D1 fails:
     delete only the newly uploaded object
     leave A and all original relationships unchanged
```

The D1 batch contains the new Asset, cloned reusable questions, current fixed relationship moves, current Stimulus Option Asset changes, reusable opt-in remapping, and old-Asset deactivation/supersession.

After success both old and new R2 objects remain. Old media is historical Review data and is not garbage-collected by this workflow.

## Media guardrails

Replacement uses the existing teaching-image storage helpers and therefore retains:

- JPEG/PNG-only validation;
- the current per-image byte limit;
- the current total managed-R2 capacity ceiling;
- immutable-key enforcement;
- rollback deletion through the narrow teaching-image cleanup helper.

No direct overwrite of an existing teaching-image key is permitted.

## Production / Preview boundary

This is a production Admin mutation.

- the source Asset must be production-owned;
- Preview-owned Assets are rejected;
- only production Case/stimulus relationships are migrated;
- Preview Admin receives no equivalent replacement action;
- Preview-owned relationships are not silently rewritten.

## Import boundary

Import Package v1 is unchanged. Higher-resolution replacement is an Admin authoring operation performed after an Asset exists; replacement lineage and Review-only media delivery are not added to the import manifest.

## Non-goals

This workflow does not add:

- generic image version history UI;
- Asset families;
- `image_identity`;
- automatic visual similarity/identity checking;
- automatic deduplication;
- bulk replacement;
- different-clinical-image replacement;
- Import Package v2;
- learner workflow redesign;
- question resolver redesign;
- Tag/Shared Question/taxonomy redesign;
- automatic R2 garbage collection.
