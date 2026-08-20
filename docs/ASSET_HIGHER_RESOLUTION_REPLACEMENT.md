# Higher-resolution Asset replacement

_Status: implemented and merged on current `main` via PR #59. Production migration application and Worker deployment remain separate facts that must be verified explicitly._

_Last updated: 20 August 2026_

This document defines the narrow production Admin operation **Replace with higher-resolution version**.

Current `main` contains `0011_asset_supersession.sql`, which adds the narrow Asset supersession lineage required by this workflow. Presence of the migration on `main` does not by itself prove that it has been applied to production.

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

This identity preservation is what keeps existing Case-specific Image Questions (`stimulus_option_questions`) intact. Those question rows and answers are not moved, cloned or rewritten.

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
7. uses `Cache-Control: private, max-age=0, must-revalidate` so a browser must re-run the ownership check before reusing an owner-specific Review response, while retaining ETag-based `304 Not Modified` support;
8. returns not-found/denial without reading R2 when ownership does not match.

Review-specific URLs deliberately do not use the ordinary one-year fresh immutable browser-cache policy. On a shared browser, a long fresh lifetime could otherwise allow a previously cached learner-owned Review image to be reused after application logout/login without contacting the authenticated endpoint again.

The ordinary `/api/assets/{assetId}/image` path keeps its existing contract for active current Assets and continues to reject inactive Assets. Ordinary active teaching Assets may retain the existing long-lived private immutable cache policy because their authorization contract is not bound to one specific Review owner.

Therefore:

```text
old Review
→ old Review Asset snapshot
→ old R2 object

new Review
→ current Asset B
→ new R2 object
```

## Live Preview protection

Preview-owned relationships are never migrated by production replacement. In addition, replacement must not deactivate A while a **live Preview workspace** is currently showing A, because the ordinary current-Asset media route rejects inactive Assets.

A Preview workspace is live under the existing Preview contract when:

```text
preview_sessions.status = 'active'
AND preview_sessions.expires_at > now
```

Both of these usages block replacement:

- a live Preview Case has A in `case_assets`;
- a live Preview Case has A in one of its `stimulus_group_options`.

The domain operation checks for those relationships before R2 upload and returns a clear Admin error instructing the administrator to reset the Preview workspace or allow it to expire.

The same no-live-Preview condition is repeated inside the D1 source-Asset claim. That closes the interval between preflight and commit: if a Preview becomes live while replacement is underway, the D1 batch fails and the newly uploaded replacement object is cleaned up. The Preview relationship itself is still never rewritten.

Expired/non-live Preview rows do not block production replacement and remain outside the mutation set.

## Race-safe source claim

Two concurrent/double submissions for the same source Asset must not both succeed.

The D1 batch therefore treats A as a claimable source. A claim is permitted only while A is:

```text
production-owned
AND active
AND superseded_by_asset_id IS NULL
AND not referenced by a live Preview workspace
```

The batch conditionally updates A to `is_active = false` and `superseded_by_asset_id = B.id`, then immediately performs a database-enforced assertion that the claim belongs to that exact B.

A conditional D1 `UPDATE` that affects zero rows is not sufficient by itself because zero-row updates do not make `db.batch()` fail. The assertion deliberately relies on an existing NOT NULL constraint: if A was already claimed by another submission, or became blocked by a live Preview, the assertion produces a D1 constraint error and rolls back the entire batch.

Therefore under two concurrent replacement submissions:

```text
one batch claims A and succeeds
other batch loses the claim and rolls back
loser's newly uploaded R2 object is deleted
old A object remains
winner's B object remains
```

No second replacement Asset/question/relationship state survives the losing D1 transaction.

## R2/D1 failure safety

R2 and D1 do not share a transaction. The operation follows this sequence:

```text
1. validate source Asset and full semantic preflight, including live Preview usage
2. upload one new immutable R2 object through existing media guardrails
3. execute the D1 replacement semantics in one D1 batch
4. claim A exactly once inside that batch
5. if the claim or any later D1 statement fails:
     roll back the entire D1 batch
     delete only the newly uploaded object
     leave the prior committed source state intact
```

The D1 batch contains the new Asset, the source claim/deactivation, cloned reusable questions, current fixed relationship moves, current Stimulus Option Asset changes, and reusable opt-in remapping.

After success both old and new R2 objects remain. Old media is historical Review data and is not garbage-collected by this workflow.

## Media guardrails

Replacement uses the existing teaching-image storage helpers and therefore retains:

- JPEG/PNG-only validation;
- the current per-image byte limit;
- the current total managed-R2 capacity ceiling;
- immutable-key enforcement;
- rollback deletion through the narrow teaching-image cleanup helper.

No direct overwrite of an existing teaching-image key is permitted.

## Local production-like replica

The local replica must reproduce the current image-authoring state introduced by Reusable Image Questions and supersession.

Its D1 allowlist therefore includes:

```text
asset_questions
stimulus_option_asset_questions
```

in addition to the existing Asset/Case/stimulus tables.

Because `assets.superseded_by_asset_id` is an immediate self-FK, local import must not rely on arbitrary Asset ID ordering. For lineage:

```text
A → B → C
```

Asset rows are inserted **successor-first**:

```text
C
B
A
```

Missing successor rows or cycles fail closed. During local reset, the local-only workflow clears `assets.superseded_by_asset_id` before deleting Asset rows and deletes reusable-image child relationships before their parent rows.

This changes only read-production/write-local development behavior. It creates no production mutation path.

## Production / Preview boundary

This is a production Admin mutation.

- the source Asset must be production-owned;
- Preview-owned Assets are rejected;
- only production Case/stimulus relationships are migrated;
- Preview Admin receives no equivalent replacement action;
- Preview-owned relationships are not silently rewritten;
- a live Preview reference temporarily blocks source-Asset deactivation.

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
