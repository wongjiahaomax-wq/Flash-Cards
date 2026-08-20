# Flash-Cards agent handover

_Refreshed: 20 August 2026_

## Current outcome

The project has a D1-backed learner Study flow, protected/private R2 teaching images, an Admin CMS, optional stimulus groups, multi-Topic Case routing, Tagging Stage A/B, Image Management V2, Reusable Image Questions, a wide responsive Admin workspace, the reviewed/resumable content-import path, and a fully imported/verified initial ECG Anki corpus.

Current `main` before this branch is `9171e2cc5355017508377df172560f7bae2abb77`.

This feature branch adds the narrow production Admin workflow **Replace with higher-resolution version**. It is for a better-quality copy of the **same underlying image**, not a different ECG/X-ray/photograph/diagram showing the same condition.

The feature is tracked in draft PR #59 and must remain draft/unmerged until review/validation is complete.

## Read first

```text
docs/DOCUMENTATION_INDEX.md
docs/CURRENT_PRODUCT_ROADMAP.md
docs/AUTHORING_MODEL.md
docs/ADMIN_IMAGE_AUTHORING_WORKFLOW.md
docs/ASSET_HIGHER_RESOLUTION_REPLACEMENT.md
docs/V1_DATA_MODEL.md
docs/CONTENT_MODEL_EXAMPLES.md
docs/REUSABLE_IMAGE_QUESTIONS.md
docs/IMAGE_MANAGEMENT_V2_PLAN.md
docs/TAGGING_MODEL_DECISIONS.md
docs/TAGGING_STAGE_B_BEHAVIOR.md
docs/PREVIEW_ADMIN_WORKSPACE.md
docs/PREVIEW_ADMIN_IDENTITY.md
docs/CLOUDFLARE.md
docs/R2_COST_GUARDRAILS.md
```

## Product/content model

The authoring hierarchy remains:

```text
Topic
└── Case
    ├── fixed Assets                 -> case_assets
    ├── alternative stimulus groups -> stimulus_groups
    │   └── options                  -> stimulus_group_options
    └── contextual questions
```

`concepts` are Topics in Admin UI. A Case has one primary/default Topic and may have Additional Study Topics through `case_concepts`.

Question wording remains separate from contextual answer meaning:

```text
question_prompts
= reusable wording only

case_questions
= Case-wide answer/context

stimulus_option_questions
= exact Case + option answer/context

asset_questions
= canonical reusable question/answer intrinsic to one exact Asset

shared_questions
= reusable medical knowledge eligible through a Case Tag
```

Reusable Image Questions enter a Case only through explicit `stimulus_option_asset_questions` opt-in. Reusing the same Asset elsewhere does not automatically carry its reusable questions.

Resolver precedence remains:

```text
Case-specific exact stimulus option
> explicitly reused Asset Question for selected option
> stimulus group
> Case
> exact Study Topic
> Tag-shared Question
> nearest eligible inheritable ancestor Topic
> more distant ancestors
```

Higher-resolution replacement does not alter question-selection or precedence semantics.

## Image authoring baseline

Image Management V2 remains authoritative for the normal Image Library and Case/stimulus operations:

- server-backed Image Library pagination/search/filter/sort;
- bounded explicit selection/bulk mutations;
- Image Collections as organisational metadata only;
- fixed `case_assets` and alternative `stimulus_group_options` learner relationships;
- same-Case option Move preserving option identity;
- clinically useful contain-fit previews;
- protected R2 uploads with immutable teaching-image keys;
- production/Preview ownership boundaries.

Case-specific exact-image questions belong to `stimulus_group_options.id`. Reusable Image Questions belong to exact `assets.id` and are independently opted into each stimulus usage.

## Higher-resolution Asset replacement

Use the new production Image detail action only when:

```text
same underlying image + better quality/resolution
→ Replace with higher-resolution version

different image + same diagnosis/condition
→ separate independent Asset
```

The operation deliberately does **not** introduce Asset families, `image_identity`, generic version history, automatic visual matching/deduplication, bulk replacement, or different-image substitution.

### Schema

Migration `0011_asset_supersession.sql` adds only:

```text
assets.superseded_by_asset_id
```

as a nullable self-FK plus index.

After successful A → B replacement:

```text
A.is_active = false
A.superseded_by_asset_id = B.id

B.is_active = true
B.superseded_by_asset_id = null
```

A later quality upgrade replaces B to form A → B → C. An already-superseded A is not directly replaceable/reactivatable.

### R2 identity

Production teaching-image keys remain immutable.

Replacement creates:

```text
new Asset ID
+
new immutable teaching-images/<new-id>.<ext> R2 object
```

The old Asset row and old R2 bytes remain. The old object is historical Review data and is not garbage-collected by this workflow.

The existing storage helpers remain authoritative for JPEG/PNG validation, per-image byte limit, total managed-R2 capacity, immutable-key enforcement, and narrow rollback deletion.

### Current fixed Case relationships

Current production `case_assets.asset_id` references move A → B in place. Case ID, display order and Case-specific caption remain unchanged.

### Current Stimulus Option relationships

Current production `stimulus_group_options.asset_id` references move A → B in place.

Critically, the existing Stimulus Option ID is preserved, along with:

- Stimulus Group ID;
- display order;
- caption;
- active state.

Because Case-specific exact-image questions belong to the option identity, existing `stimulus_option_questions` rows/answers remain untouched and continue applying to the replacement image in future Reviews.

### Reusable Image Questions

Existing A `asset_questions` are never mutated to point at B.

Instead each A Asset Question is cloned to B with:

- a new Asset Question ID;
- the same `question_prompt_id`;
- the same canonical `answer_md`;
- the same active/inactive state.

Question Prompts are reused, not duplicated.

Old A Asset Questions remain attached to A for historical `review_questions.source_asset_question_id` provenance.

Current production `stimulus_option_asset_questions` opt-ins are remapped to the corresponding cloned B Asset Questions. The preserved option is moved A → B before the opt-in remap so the existing D1 Asset-identity trigger remains valid.

### Metadata inheritance

B carries forward appropriate semantic/provenance metadata from A, including:

- alt text;
- source label;
- source URL;
- licence/permission;
- Image Collection.

The uploaded replacement filename may become B's `original_filename`; it does not invent or replace provenance.

## Historical Review media integrity

Before this branch, `review_assets.storage_key_snapshot` already froze the exact media key selected when a Review started, but the Study page built image URLs through the ordinary Asset endpoint. That endpoint intentionally rejects inactive Assets, so superseding A could make an old Review's image unavailable.

This branch completes the snapshot contract.

Study now constructs Review-specific image URLs and the authenticated route:

1. rejects Preview Worker/Preview Admin learner access under the existing Study boundary;
2. requires a logged-in learner;
3. verifies the Review belongs to that learner;
4. verifies the requested `review_assets` row belongs to that Review;
5. uses only `review_assets.storage_key_snapshot` as the R2 key;
6. serves the immutable historical object even when the referenced Asset is inactive/superseded;
7. never accepts an arbitrary R2 key from the request;
8. uses private immutable caching;
9. returns not-found/denial for another learner without reading R2.

The ordinary:

```text
/api/assets/{assetId}/image
```

route keeps its current active-production-Asset semantics and still rejects inactive Assets.

Therefore:

```text
old Review
→ old Asset A provenance
→ old Asset Question provenance
→ old storage_key_snapshot / old R2 bytes

new Review
→ current Asset B
→ cloned B Asset Question
→ new R2 bytes
```

Historical `review_questions.prompt_snapshot_md`, `answer_snapshot_md`, and `source_asset_question_id` are never rewritten by replacement.

## R2/D1 failure safety

R2 and D1 do not share a transaction. The domain operation follows:

```text
1. validate source Asset and semantic preflight
2. upload one new immutable R2 object
3. execute one D1 semantic batch containing:
     new Asset
     cloned Asset Questions
     production fixed Case relationship moves
     production Stimulus Option Asset moves
     production reusable opt-in remaps
     old Asset deactivation + supersession link
4. if D1 fails:
     delete only the newly uploaded R2 object
     keep A active and original D1 relationships unchanged
```

The old R2 key/object is never deleted or overwritten by rollback.

## Production / Preview boundary

The replacement operation is a production Admin mutation.

- Preview-owned source Assets are rejected.
- Production relationship migration filters out Preview-owned Cases.
- Preview Admin receives no equivalent replacement action.
- Preview-owned Case/stimulus relationships are not silently rewritten.
- Historical Review media endpoints keep the existing Preview learner-access denial.

Preview remains clone/mutate/reset rather than mutating production and rolling back later.

## Import boundary

Import Package v1 is unchanged.

Higher-resolution replacement, supersession lineage and Review-specific historical image delivery are post-import production Admin behavior. Do not add replacement/version fields to `flashcards-import-v1` for this feature.

## Other current product baselines

Tagging Stage B remains based on global `shared_questions` eligible through exactly one active Case Reuse Scope Tag. Descriptive Shared Question Tags do not create learner eligibility.

The initial ECG Anki migration remains fully represented in production:

```text
66 source notes/cards
- 13 Batch 01
- 51 Batch 02
- 2 pre-existing mapped calcium Cases
= 66 / 66 represented
```

Ongoing ECG work is curation/enrichment: Tags, Shared Questions, Reusable Image Questions, Additional Study Topics/stimulus variants, and medical content review where useful.

## Current migrations

```text
0000_dashing_centennial.sql
0001_better_auth.sql
0002_optional_stimulus_groups.sql
0003_multi_topic_study_routing.sql
0004_resumable_import_jobs.sql
0005_tag_foundation.sql
0006_preview_admin_workspace.sql
0007_image_collections.sql
0008_tag_shared_questions.sql
0009_reusable_image_questions.sql
0010_reusable_image_reactivation_guard.sql
0011_asset_supersession.sql
```

`0011` is the only schema addition for higher-resolution replacement.

## R2 rules

Teaching images remain private. All production/Preview image writes continue through the protected media helpers and R2 cost guardrails.

Production teaching-image keys are immutable. Preview uploads use the isolated Preview prefix and are cleaned during Reset under Preview ownership checks. Reviewed import staging remains separate operational data and is not an Asset.

Replacement is the narrow case where two immutable production objects intentionally remain: the historical old object and the current replacement object.

## Authentication boundaries

- `admin` → production Admin CMS on production Worker;
- `preview_admin` + `PREVIEW_MODE=true` → Preview Admin;
- Better Auth Admin-plugin API → production Worker only;
- normal learner → Study on production Worker only;
- identities carrying `preview_admin` remain denied production learner Study by policy.

Authorization is server-side, not hard-coded by email.

## Validation required before handoff

```sh
git diff --check
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
```

PR CI covers this validation set. When an agent cannot execute the repository locally, use the PR workflow result as the executable validation source and report any environment-specific inability precisely.

For draft PR #59, do not mark ready or merge merely because the implementation exists. Review CI and the final diff first.

## Intentionally deferred / non-goals

- Asset families or `image_identity`;
- generic Asset/image version-history UI;
- automatic visual similarity or same-image detection;
- automatic deduplication;
- bulk Asset replacement;
- replacing one clinical image with a different image under this workflow;
- Import Package v2 or replacement fields in Import Package v1;
- automatic R2 garbage collection;
- multiple Reuse Scope Tags or ANY/ALL expressions;
- Tag hierarchy/aliases;
- learner Study-by-Tag;
- Review Tag snapshots;
- automatic/AI Tag inference;
- Asset Tags;
- Preview editing of global Shared Questions or production replacement authority.

## Next intended implementation workflow

After this PR is validated/reviewed, continue prioritizing real content curation and observed learner/Admin friction rather than schema expansion for completeness:

```text
curate real ECG Case Tags
→ promote genuinely reusable knowledge into Shared Questions / Reusable Image Questions
→ add useful Study Topics and stimulus variants
→ observe learner/Admin behavior
→ implement smallest learner-account Admin workflow
→ implement basic learner-progress Admin
```
