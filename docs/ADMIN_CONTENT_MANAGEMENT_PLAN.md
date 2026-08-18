# Flash-Cards — Admin Content Management Implementation Plan

_Last updated: 15 August 2026_

## Status

The planned Admin content-management redesign is **complete for the current V1 phase**.

Merged milestones:

```text
PR #10 — Admin shell + Case management redesign
PR #11 — Questions Library
PR #12 — Image/Asset Library + rename/edit metadata
PR #13 — Topics dashboard
```

Merge commits:

```text
PR #10 21f349b4869f59a8bccbf440437ce67088776b58
PR #11 b78e7c9c0af4b4024adb3e5d373aef8631482914
PR #12 e1af88633f67b9a4bca1778684664b863fe62adb
PR #13 02853083518d0228e8aaffa9c7566822e6c8d7c5
```

The Admin navigation is now fully live:

```text
Dashboard · Cases · Questions · Images · Topics
```

The next product phase is **representative pilot content entry** after completing the focused multi-Topic Case authoring milestone.

---

## Product goal achieved

An administrator can now:

- find and edit Cases without using one monolithic page;
- search the question bank globally;
- inspect Question Prompt usage and context-specific answers;
- safely edit shared Question Prompt wording with blast-radius visibility;
- find uploaded images visually;
- rename images after upload without changing immutable R2 identity;
- edit Asset metadata and inspect Case usage;
- browse Topics with Case/shared-question counts;
- inspect Topic-level reusable questions and parent/child relationships;
- preview learner-facing Cases.

---

## Design principles that remain authoritative

1. **Navigate by content object.** Use dedicated routes rather than rebuilding a large `/admin` page.
2. **Reuse the existing domain model.** Prefer D1 queries/UI changes over unnecessary schema changes.
3. **Preserve shared-object semantics.** Question Prompt and context-specific answer are separate; Asset and Case-specific caption are separate.
4. **Prefer deactivate/archive over destructive deletion.**
5. **Use ordinary D1 search for V1.** No external search service is needed.
6. **Do not redesign learner Study behaviour as a side effect of Admin work.**

The shared Admin shell supports a wide desktop workspace for content-management pages while preserving sensible outer gutters and responsive navigation. Individual editor/form pages may keep narrower readable widths. Responsive content grids should use available space with an appropriate minimum item width instead of a fixed desktop column count.

---

# Implemented Admin surfaces

## Dashboard / Case management — PR #10

Routes:

```text
/admin
/admin/cases
/admin/cases/new
/admin/cases/[caseId]
```

Implemented:

- persistent Admin shell;
- dashboard overview;
- searchable Case library;
- dedicated Case creation;
- focused Case editor;
- internal title, primary/default Topic, and vignette editing;
- Additional Study Topic add/remove authoring;
- secondary Topic promotion and primary Topic demotion while preserving relationships;
- safe display of inactive historical Topic relationships;
- Case question add/edit/remove/reorder;
- reusable Topic-question creation from Case editor;
- image upload, attach-existing, detach, reorder, and Case-specific captions;
- learner Study preview.

---

## Questions Library — PR #11

Routes:

```text
/admin/questions
/admin/questions/[promptId]
```

Implemented:

- search Question Prompt text and current active Case/Concept answer text;
- Topic/scope filtering;
- current active usage counts;
- Case and Concept usage inspection;
- context-specific answers;
- inheritance visibility;
- links to Case editors;
- explicit confirmation before editing reused prompt wording;
- stale-usage protection.

Authoritative current-active usage rules:

### Case usage

Requires all of:

```text
question_prompts.is_active = true
case_questions.is_active = true
cases.is_active = true
```

### Concept usage

Requires all of:

```text
question_prompts.is_active = true
concept_questions.is_active = true
concepts.is_active = true
```

Inactive/historical relationships may be shown on detail pages but must not inflate current active counts.

The content model remains:

```text
Question Prompt
      ↓
Case or Concept usage
      ↓
context-specific answer
```

A reused prompt may have different answers in different Cases.

---

## Image / Asset Library — PR #12

Routes:

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

Implemented:

- visual thumbnail grid;
- search by image name, alt text, source label, and source URL;
- used/unused, active/inactive, and source-known/source-unknown filters;
- protected Asset preview;
- Asset metadata editing;
- usage counts and Case links;
- dedicated upload route using the established protected R2 pipeline.

### Image-renaming contract

The existing field:

```text
assets.original_filename
```

is the administrator-editable image name.

Do not add a separate `display_name` merely to preserve the uploaded filename. The actual original upload filename does not need separate preservation for V1.

Renaming updates D1 metadata only. It must never rename, move, copy, replace, or delete the R2 object/key.

The following remain stable:

- `assets.id`;
- `assets.storage_key`;
- R2 object/key;
- Case Asset relationships;
- Review relationships/snapshots.

Case-specific captions remain in the Case editor because they belong to `case_assets`, not the global Asset.

Unknown provenance is valid. Never fabricate attribution. `source_url` is attribution/reference metadata only and never the runtime image source.

---

## Topics dashboard — PR #13

Routes:

```text
/admin/topics
/admin/topics/[conceptId]
```

Implemented:

- Topic name search;
- current active primary-Case count;
- current active reusable Concept-question count;
- Topic detail with primary Cases;
- Topic-specific reusable answers and links to Question Prompt detail;
- `inherit_to_descendants` visibility;
- parent Topic navigation;
- direct child Topic navigation;
- inactive/historical relationships retained for administrative orientation.

Current active reusable-question count requires:

```text
concepts.is_active = true
concept_questions.is_active = true
question_prompts.is_active = true
```

Topic metadata editing is intentionally deferred. Existing slugs remain stable. No sophisticated tree/hierarchy editor has been added.

---

# Schema impact

PRs #10–#13 required **no schema migrations**.

The existing relationships remain sufficient:

```text
Cases
↕
Case Questions
↕
Question Prompts

Concepts
↕
Concept Questions
↕
Question Prompts

Cases
↕
Case Assets
↕
Assets
```

---

## Multi-Topic Case authoring

The Case editor is the authoring surface for multiple Case↔Topic relationships. It clearly separates:

```text
Primary/default Topic
Additional Study Topics
```

An active Case must have exactly one primary/default Topic. The primary is also an active `case_concepts` relationship. Administrators can select an active primary, add active secondary Study Topics, remove secondary relationships, and promote an attached secondary Topic to primary. A primary change demotes the old primary to secondary and preserves unrelated secondary relationships. A primary cannot be removed directly. Topic IDs are validated server-side, duplicate relationships are rejected by both application validation and the database primary key, and inactive existing relationships remain visible with an inactive marker rather than being discarded.

The secondary relationship has learner-routing meaning established by PR #18: when a learner enters through that Topic, it may become `reviews.study_concept_id`; it is not a generic tag and does not mix all attached Topic question pools.

## Agreed production taxonomy operator

The production content change is deliberately separate from deployment. Use the manually triggered workflow:

```text
.github/workflows/apply-agreed-production-taxonomy.yml
scripts/apply-agreed-taxonomy.mjs
```

The operator accepts only `--dry-run` or explicit `--apply`; it has no free-form SQL or record-ID inputs. It resolves the six agreed Topics by fixed slugs, reuses existing rows, creates missing rows with reserved IDs, updates only the agreed hierarchy, and changes only the two known Case route sets. It preserves Cardiology and all unrelated content. It performs a pre-flight read, a D1 transaction, and a post-flight read-back. Configure the separate `CLOUDFLARE_D1_WRITE_TOKEN` secret with D1 write/edit permission and keep `CLOUDFLARE_D1_READ_TOKEN` read-only.

Before applying, run the workflow with `apply = false` and inspect the pre-flight output against the latest [Production content snapshot](PRODUCTION_CONTENT_SNAPSHOT.md). Then run with `apply = true`, verify the post-flight output, and run the snapshot workflow again. If verification fails, stop and use a reviewed rollback operator change to restore the two prior direct Cardiology relationships and prior parents; do not run ad-hoc SQL.

## Agreed content example

```text
Hypercalcemia Case
- primary/default Topic: Hypercalcemia
- secondary Study Topic: Short QTc

Hypocalcemia Case
- primary/default Topic: Hypocalcemia
- secondary Study Topic: Prolonged QTc
```

## Next phase — pilot content validation

Enter representative content from:

- ECG/Cardiology;
- ENT;
- Eye;
- Dermatology.

Deliberately test:

- stem + image + multiple questions;
- image-only recognition;
- multi-image Cases;
- alternative Cases for one condition;
- same Asset reused in multiple Cases;
- same Question Prompt with different Case-specific answers;
- Concept-level reusable questions;
- inherited questions;
- content that may eventually justify secondary Concepts.

Use this real content-entry exercise to identify:

- unnecessary clicks;
- confusing labels;
- missing search/filter affordances;
- difficult reuse workflows;
- model assumptions that break under real educational content.

Only fix friction that is demonstrated by actual use before expanding the Admin model further.

---

# Deferred Admin work

Do not build these unless pilot use demonstrates a clear need:

- sophisticated Concept tree editor;
- drag/drop hierarchy management;
- bulk operations;
- permanent deletion;
- WYSIWYG page builder;
- complex tagging;
- AI-generated questions;
- advanced analytics;
- structured marks/weighting;
- broad stimulus types.

---

# Recommended sequence

1. Enter representative ECG/Cardiology, ENT, Eye, and Dermatology pilot content.
2. Fix concrete Admin friction/model issues discovered during entry.
3. Implement learner-account administration and role-boundary acceptance.
4. Implement basic learner-progress administration.
5. Reassess FSRS, Anki import, structured marks, richer analytics, hierarchy tooling, and other deferred features later.

---

# Validation standard

Implementation PRs should continue to run:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

GitHub CI must be green before merge.
