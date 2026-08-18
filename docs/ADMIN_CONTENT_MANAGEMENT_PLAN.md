# Flash-Cards — Admin Content Management

_Last updated: 18 August 2026_

## Status

The original Admin content-management plan has become an **implemented product contract**. This file keeps its historical filename for links, but it now describes the current production Admin baseline rather than a future PR sequence.

For project-wide status read `CURRENT_PRODUCT_ROADMAP.md`; for exact authoring semantics read `AUTHORING_MODEL.md`; for image-specific interaction rules read `ADMIN_IMAGE_AUTHORING_WORKFLOW.md` and `IMAGE_MANAGEMENT_V2_PLAN.md`.

## Current production navigation

```text
Dashboard
Cases
Questions
Shared Questions
Images
Topics
Tags
Import package
```

Current route families include:

```text
/admin
/admin/cases
/admin/questions
/admin/shared-questions
/admin/images
/admin/topics
/admin/tags
/admin/import
```

The Admin shell provides a wide responsive workspace for library/content-management surfaces while form-heavy editors may use narrower readable layouts.

## Design principles

1. **Navigate by content object.** Dedicated routes are preferred to one monolithic Admin page.
2. **Keep product concepts separate.** Topic, Tag, Image Collection, stimulus group, and Shared Question have different semantics.
3. **Preserve contextual answers.** `question_prompts` is wording; answers live at the context where they are correct.
4. **Preserve reusable Asset identity.** Case captions/relationships are separate from global Asset metadata and immutable R2 keys.
5. **Prefer deactivate/archive over destructive content deletion.**
6. **Protect global edits by usage/blast-radius checks.**
7. **Use bounded server operations.** Large browser selections are orchestrated through small independently revalidated requests.
8. **Do not change learner behavior as an accidental side effect of library/UI work.**
9. **Production and Preview mutation authority remain distinct.**
10. **Let real corpus/admin friction justify additional schema.**

## 1. Dashboard and Cases

Production Case management supports:

- searchable/browsable Case library;
- dedicated Case creation/editing;
- internal Case title and learner-facing vignette;
- exactly one primary/default Topic;
- zero or more Additional Study Topics;
- promotion of a secondary Study Topic to primary while preserving the old route as secondary;
- visibility of inactive historical Topic relationships during safe editing;
- `automatic`, `all`, and `fixed` question-selection configuration;
- Case question authoring/reorder/archive behavior;
- reusable Topic-question authoring where appropriate;
- Tags on Cases and contextual Case Questions;
- fixed image authoring;
- alternative image sets/options;
- set-wide and exact-option questions;
- stimulus-specific coverage controls;
- Preview/Study inspection flows where permitted.

Routine Case editor order is:

```text
Topics → Case → Images → Case questions → Preview
```

### Multi-Topic invariant

Every learner-presentable active Case has exactly one primary/default Topic. Additional Study Topics are real learner-routing relationships, not generic metadata.

The Topic used to reach a Case becomes the Review's Study Topic and supplies direct Topic questions. The product never combines every attached Topic question bank into one Review merely because several routes exist.

## 2. Questions Library

Production routes:

```text
/admin/questions
/admin/questions/[promptId]
```

The Questions Library supports:

- search over Prompt wording and active contextual/Shared answers;
- scope/Topic/Tag-oriented inspection where implemented;
- active usage counts;
- Case, Topic, and Shared Question usage inspection;
- context-specific answers;
- inheritance visibility;
- navigation back to owning content;
- explicit confirmation before globally editing reused Prompt wording;
- stale-usage/blast-radius protection.

`question_prompts` remains wording only. A reused Prompt may have different answers in different contexts.

Current active usage accounting must respect the activity of the Prompt, contextual relationship, and owning active object. Shared Question usages are included in global Prompt usage/edit protection.

## 3. Shared Questions

Production routes:

```text
/admin/shared-questions
/admin/shared-questions/[sharedQuestionId]
```

Administrators can:

- list/search Shared Questions;
- create one using an existing active production Question Prompt or new Prompt wording;
- edit the reusable answer;
- choose exactly one active **Reuse Scope Tag**;
- assign zero or more independent **Descriptive Tags**;
- archive/reactivate Shared Questions.

The UI must preserve the semantic distinction:

```text
Reuse Scope Tag
= which tagged Cases make the Shared Question eligible

Descriptive Tags
= what the reusable Question teaches/tests
```

Descriptive Tags never create eligibility. The Reuse Scope Tag is not automatically inserted into descriptive tags.

Shared Questions are global production-curated objects. They are not Preview-owned and production validation/database triggers reject Preview-owned Prompts as Shared Question backing Prompts.

## 4. Images / Asset Library

Production routes:

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

The Image Library supports:

- protected image preview/enlargement;
- search by image name, alt text, source label, and source URL;
- usage/status/source/Topic/Collection filters as implemented;
- deterministic server-backed pages of 60 Assets;
- exact total matching counts;
- deterministic sorting with Asset-ID tie-breaks;
- cross-page explicit selection within one canonical query context;
- exact Select All when `<=300` Assets match;
- refusal rather than silent truncation above 300;
- server-enforced maximum `30` unique Assets per mutation request;
- sequential client chunks for larger explicit selections;
- progress plus stop-on-first-failure semantics;
- Asset metadata editing;
- Case usage/context inspection;
- protected upload through the existing R2 guardrails.

### Image naming and R2 identity

`assets.original_filename` is the administrator-facing image name/search label.

Renaming it is a D1 metadata operation only. It must never rename/move/replace the immutable production R2 object or change `assets.storage_key`.

Case-specific captions remain Case/stimulus relationship data, not global Asset metadata.

### Image Collections

Image Management V2 adds `image_collections` plus nullable `assets.image_collection_id`.

- one Asset has zero or one Collection;
- null is displayed as **Unsorted**;
- Collection rename preserves ID/assignments;
- Collection deletion detaches affected Assets to Unsorted;
- Collection operations never delete Assets, Case/stimulus relationships, questions, Topics, Tags, Reviews, or R2 objects.

A Collection is Admin organisation only. It has no learner-routing meaning.

### Same-Case alternative-option Move

The Case editor supports moving an existing alternative option between active groups in the **same Case** when validation passes.

The operation preserves:

- `stimulus_group_options.id`;
- Asset identity;
- Case-specific caption;
- active state;
- exact-option questions.

Group-level questions remain with their groups. Cross-Case, ownership-invalid, conflict-invalid, or coverage-invalid moves are rejected.

## 5. Topics

Production routes include:

```text
/admin/topics
/admin/topics/[conceptId]
```

Topics are the product-facing name for `concepts` and remain the learner-routing hierarchy.

Admin Topic views provide browsing/search, parent/child orientation, Case relationships, reusable Topic questions, and links into relevant content.

Do not use Tags or Image Collections as a substitute for the Topic hierarchy.

## 6. Tags

Production route:

```text
/admin/tags
```

Tagging Stage A/B supports:

- canonical flat Tag creation/rename/deactivate/reactivate;
- Case Tag assignment/removal;
- contextual Case Question Tag assignment/removal;
- Case/Question filtering/inspection by Tag;
- Shared Question Reuse Scope usage;
- Shared Question descriptive Tag usage;
- usage details that distinguish reuse-scope from descriptive semantics.

Tags remain manually curated and flat in the current model. There is no automatic Case Tag → Question Tag inheritance, Tag hierarchy, alias system, or learner Study-by-Tag in V1.

## 7. Reviewed imports

Production route:

```text
/admin/import
```

The production app accepts strict **Flash-Cards Import Package v1** ZIPs rather than arbitrary Anki/APKG input.

The Admin import workflow supports:

- hardened package validation;
- exact reviewed-ZIP confirmation/hash binding;
- deterministic create/use/skip semantics;
- dependency/conflict checking before domain writes;
- resumable browser-orchestrated processing;
- authoritative D1 job phase/cursor/progress/error state;
- bounded server work per request;
- private R2 staging;
- safe retry/cancel/finalize semantics.

Tags are deliberately not required by Import Package v1. Imported content can be enriched later.

The first real ECG migration is complete and production-verified: 13 Batch 01 + 51 Batch 02 + 2 pre-existing mapped calcium Cases = **66/66 source notes represented**.

## 8. Preview Admin relationship to production Admin

Preview is not a second independent content database. The Preview Worker uses the same D1/R2 resources with explicit Preview ownership and hard boundaries.

Preview should reuse the production editor/components where safe, but Preview mutation authority is intentionally narrower.

Key rules:

- production objects are read-only in Preview except for explicitly safe relationship reuse into Preview-owned content;
- Preview-owned Cases/Prompts/Assets use `preview_session_id`;
- Preview uploads use `preview/<preview-session-id>/...`;
- Reset removes disposable Preview-owned workspace data only;
- production Admin, learner Study, and Better Auth Admin-plugin routes are hard-blocked on the Preview Worker;
- Shared Questions remain global production-curated and cannot be mutated in Preview.

The shared Case-editor contract must stay covered by tests whenever named actions/data requirements change.

## 9. Production/read-model isolation

Normal production Admin counts, libraries, and usage details exclude disposable Preview-owned content/relationships where required.

Learner selection also excludes Preview-owned Cases, Prompts, and Assets. Database triggers provide defense in depth for critical ownership/provenance boundaries.

## 10. Admin work completed since the original plan

The original PR #10–#13 Admin-library milestone was only the beginning. The current Admin baseline also incorporates major follow-up work including:

- multi-Topic Case authoring;
- Tagging Stage A;
- reviewed/resumable import authoring;
- PR #29 Case image-authoring redesign;
- production-backed Preview Admin;
- Image Management V2 and Collections;
- wide responsive Admin workspace;
- Tagging Stage B Shared Question authoring/usage integration.

Older documents that describe Tags, bulk operations, imports, secondary Topics, or scalable Image Library workflows as future work are historical unless a current roadmap explicitly defers a more advanced version.

## 11. Current next Admin work

The next Admin priorities are deliberately smaller than the completed content-management expansion:

### Learner-account administration

Implement the smallest safe workflow for administrator-created/managed learner accounts while preserving production/Preview role boundaries.

### Basic learner-progress administration

Initial useful scope:

- learner list;
- recent Reviews;
- simple filters;
- Again/Good summaries;
- repeated-Again flags/signals.

Avoid sophisticated analytics until real learner use establishes requirements.

## 12. Deferred Admin expansion

Do not implement merely for completeness:

- compound/multiple Shared Question reuse-scope expressions;
- Tag hierarchy/aliases;
- learner Study-by-Tag;
- Asset Tags;
- complex Topic tree editor;
- advanced analytics;
- rich WYSIWYG page builder;
- broad non-image upload types;
- permanent destructive content deletion;
- AI-generated/inferred clinical metadata without an explicit reviewed workflow.

## 13. Validation standard

Implementation PRs should continue to run:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

GitHub CI must be green before merge. Migration application, Worker deployment, and content/data operators remain separate explicitly verified operations rather than assumptions inferred from CI.
