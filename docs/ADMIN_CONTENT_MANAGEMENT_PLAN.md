# Flash-Cards — Admin Content Management

_Last updated: 24 August 2026_

## Status

The original Admin content-management plan is now an **implemented product contract**. This historical filename is retained for links, but this document describes current `main`, not a future PR sequence.

For project-wide status read `CURRENT_PRODUCT_ROADMAP.md`; for authoring semantics read `AUTHORING_MODEL.md`; for image-specific rules read `ADMIN_IMAGE_AUTHORING_WORKFLOW.md`, `REUSABLE_IMAGE_QUESTIONS.md`, and `ASSET_HIGHER_RESOLUTION_REPLACEMENT.md`.

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

Routes include:

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

The shell provides a wide responsive workspace for library/content-management surfaces while form-heavy editors may constrain readable width.

## Design principles

1. Navigate by content object rather than one monolithic Admin page.
2. Keep Topic, Tag, Image Collection, stimulus group, and reusable-knowledge semantics separate.
3. Keep Prompt wording separate from contextual/canonical answers.
4. Preserve reusable Asset identity and immutable R2 keys.
5. Prefer deactivate/archive over destructive deletion.
6. Protect global edits through usage/blast-radius checks.
7. Use bounded server operations and page-specific read models.
8. Do not change learner behavior as an accidental side effect of library/UI work.
9. Keep production and Preview mutation authority distinct.
10. Let real corpus/Admin friction justify new schema.
11. Refactor implementation ownership without duplicating product semantics.

## 1. Dashboard and Case Library

`/admin` uses dashboard-specific aggregate/bounded reads rather than constructing editor state.

`/admin/cases` uses a 60-row server-backed list model with SQL title/Tag filtering, aggregate total count, deterministic ordering, and relationship enrichment only for visible Case IDs.

Case detail uses an exact active production Case-by-ID read rather than loading the full library and finding one in JavaScript.

## 2. Case editor

Routine order remains:

```text
Topics → Case → Images → Case questions → Preview
```

Current Case authoring supports:

- internal title and learner vignette;
- one primary/default Topic and Additional Study Topics;
- inline Topic creation/attachment from the upper Topics section;
- `automatic`, `all`, and `fixed` question selection;
- fixed images and Alternative Sets;
- Case-specific captions;
- whole-Case, set-wide, and exact-image contextual questions;
- Reusable Image Questions with explicit exact-stimulus opt-in;
- question scope change between whole-Case and exact image/stimulus;
- stimulus-specific coverage;
- option ordering/state, same-Case set Move, and distinct Remove from Case;
- learner preview where permitted.

### Current implementation boundary

PR #78 decomposed the prior ~70 KB route into focused Svelte components without changing form actions, routes, DB behavior, learner behavior, or Preview ownership semantics.

`src/routes/admin/cases/[caseId]/+page.svelte` remains the cross-section/server-data coordinator. Focused components under `src/lib/components/case-editor/` own:

```text
CaseEditorHeader.svelte
CaseEditorNavigation.svelte
CaseTopicsSection.svelte
CaseDetailsSection.svelte
CaseImagesSection.svelte
CaseQuestionsSection.svelte
CaseImagePickerDialog.svelte
CasePreviewSection.svelte
```

Future narrow Case-authoring changes should normally start in the owning component plus directly related server/helpers/tests rather than rereading the entire editor.

Preview Admin continues to reuse the production route/component surface; no duplicate Preview editor exists.

## 3. Classic and Compact authoring

The Case editor stores a browser-local Classic/Compact layout preference and safely defaults to Compact when local storage is unavailable.

Compact mode is designed for fast full-Case review and includes:

- structural completeness summary;
- accessible `ⓘ` explanations instead of permanent low-value prose;
- horizontal strips for multiple fixed images and Alternative Sets;
- visible Prompt/Answer pairs for current Case-specific image questions, explicitly used Reusable Image Questions, and set-wide questions;
- an **All questions in this Case** audit using the bounded selected-Case read model;
- exact-image/set source indicators with hover/focus/tap previews and existing image-viewer access;
- deterministic structural ordering.

Classic mode preserves the earlier authoring presentation. Compact mode does not alter learner resolution or persist a global question order.

`Review focus` remains optional future work rather than an implemented toggle.

## 4. Question scope and reuse

Author-facing scope is:

```text
Applies to this whole Case
Applies to a specific image / stimulus
```

Whole-Case questions remain in the Case Questions section and may use safe Topic reuse where valid.

Exact-image assignment uses the existing Stimulus Option model. If the target is currently fixed, the server may atomically convert it to a one-option active Stimulus Group while preserving Asset identity/caption/effective learner behavior.

Image cards keep these concepts distinct:

```text
Case-specific Image Questions
Reusable Image Questions
```

A Reusable Image Question belongs to one exact global Asset; each exact stimulus usage explicitly opts in. Merely reusing the Asset does not reuse its questions.

## 5. Questions Library

`/admin/questions` uses a bounded 60-row read model.

Current list behavior preserves search/filter semantics across Topic, Case, Stimulus Group, Stimulus Option, Shared Question, and Reusable Image Question usages. Explicit searches preserve the previous Unicode-aware JavaScript substring semantics over bounded SQL-prefiltered candidate batches.

Question detail/history remains the inspection surface for inactive/historical relationships.

Global Prompt wording edits remain protected by current active usage/blast-radius and stale-usage checks, including Shared Question and Reusable Image Question usage where relevant.

## 6. Shared Questions

Production routes:

```text
/admin/shared-questions
/admin/shared-questions/[sharedQuestionId]
```

Administrators can create/edit/archive/reactivate Shared Questions, choose exactly one active **Reuse Scope Tag**, and assign independent descriptive Tags.

```text
Reuse Scope Tag
= which explicitly tagged Cases make the Shared Question eligible

Descriptive Tags
= what the reusable Question teaches/tests
```

Shared Questions are global production-curated objects and are not Preview-owned.

## 7. Images / Asset Library

Routes:

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

The Image Library supports:

- protected image preview/enlargement;
- search by filename/alt/source metadata;
- Active/Inactive status filtering;
- derived **Current / Historical only / Unused** usage filtering;
- source/Topic/Collection filtering;
- deterministic server-backed 60-item pages and exact total counts;
- deterministic sorts with Asset-ID tie-breakers;
- cross-page explicit selection within one canonical query context;
- exact Select All when `<=300` match, refusal above 300;
- server-enforced `<=30` unique Assets per mutation request with sequential client chunks;
- metadata editing and Case/history context inspection;
- protected upload through central R2 guardrails;
- Image Collections;
- narrow same-image higher-resolution replacement.

### Lifecycle classification

Asset Active/Inactive status is independent from usage state.

- **Current** — active Asset currently participates in an active production Case.
- **Historical only** — no current use, but retained Case/option relationship, Review snapshot, Reusable Image Question, or supersession lineage still needs provenance.
- **Unused** — neither current use nor retained historical/provenance dependency.

Preview relationships do not affect production classification. These views assist cleanup; they do not physically delete Asset rows or R2 objects.

### Collections

An Asset belongs to zero or one Collection; null is **Unsorted**. Collection operations do not change learner routing, relationships, questions, Tags, Reviews, or R2 identity.

## 8. Alternative option lifecycle

Same-Case option **Move** re-parents the existing option while preserving option ID, Asset identity, caption, active state, Case-specific exact-image questions, and reusable opt-ins subject to current invariants.

**Deactivate** and **Remove from Case** are distinct:

```text
Deactivate
→ keep relationship in ordinary authoring/history but exclude it from current learner selection.

Remove from Case
→ archive relationship via removed_from_case so it disappears from current authoring/selection,
  while preserving Asset, R2 object, option identity, exact-option questions, reusable relationships, and historical Review provenance.
```

Re-adding the same Asset to the original set may restore the archived option when validation passes.

## 9. Higher-resolution Asset replacement

Production Image detail provides a narrow quality-upgrade action for the **same underlying image**.

Successful replacement creates a new immutable R2 object/new Asset, transfers current production fixed/option relationships, preserves Stimulus Option IDs and Case captions/order, clones Asset Questions/remaps current opt-ins, marks the source Asset inactive/superseded, and retains old R2 bytes/old Asset Questions for historical Reviews.

A different image showing the same diagnosis is a separate Asset, not a replacement.

A live Preview reference blocks replacement rather than being silently rewritten.

## 10. Topics

Topics remain learner-routing hierarchy. The Case editor's upper Topics section is authoritative for primary/additional relationships and inline creation/attachment; global Topic naming/editing remains on Topic routes.

Inactive historical relationships remain inspectable; inactive Topics cannot be newly selected for active routing.

## 11. Tags

Tagging supports canonical flat Tag lifecycle, Case Tag assignment, contextual Case Question Tags, filtering/inspection, Shared Question Reuse Scope usage, and Shared Question descriptive usage.

Tags do not replace Topic hierarchy and do not automatically propagate from Case to Questions.

## 12. Reviewed imports

`/admin/import` accepts strict Flash-Cards Import Package v1 ZIPs, not arbitrary source decks.

The workflow includes hardened validation, exact reviewed-ZIP confirmation/hash binding, deterministic create/use/skip semantics, dependency/conflict checking, authoritative resumable D1 job state, bounded requests, private R2 staging, and safe retry/cancel/finalize behavior.

The local slide-review/finalizer is a separate developer tool upstream of this production importer. It does not make PPTX/PDF semantic reconstruction a production Admin capability.

## 13. Preview relationship to production Admin

Preview is not a second content database. It shares production D1/R2 and relies on explicit Preview ownership, hard route/data boundaries, and clone-then-mutate behavior.

The shared Case editor must remain contract-tested whenever actions/data requirements change. A new production action must receive either a safe Preview implementation or an explicit blocked path.

Global Shared Questions and Reusable Image Questions remain production-only mutation domains. Production higher-resolution replacement remains unavailable in Preview.

## 14. Current next Admin work

### Learner-account administration

Implement the smallest safe administrator workflow for learner accounts while preserving production/Preview role boundaries.

### Basic learner-progress administration

Initial useful scope:

- learner list;
- recent Reviews;
- simple filters;
- Again/Good summaries;
- repeated-Again flags/signals.

### Measured/focused follow-up

Continue Case-editor server read/lazy-loading work or further modularity only where measured performance or maintainability evidence justifies it. PR #78 already solved the immediate UI ownership problem; avoid decomposition for symmetry alone.

## 15. Deferred Admin expansion

Do not implement merely for completeness:

- compound/multiple Shared Question reuse scopes;
- Tag hierarchy/aliases or Study-by-Tag;
- Asset Tags;
- complex Topic tree editor;
- permanent destructive Asset/R2 deletion without a conservative safety design;
- generic Asset-family/version UI;
- advanced analytics;
- rich WYSIWYG page builder;
- broad non-image upload types;
- AI-generated/inferred clinical metadata without explicit review.

## 16. Validation authority

Repository validation guidance lives in root `AGENTS.md` and `AGENT_TASK_MAP.md`. Use `agent:checks` to classify changed subsystems, `validate:full` as the ordinary local pre-handoff contract when command execution is available, and specialized runtime/slide-review checks when required. Do not maintain a divergent static command list here.
