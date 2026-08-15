# Flash-Cards — Admin Content Management Implementation Plan

_Last updated: 15 August 2026_

## Status and priority

This document records the next product implementation phase agreed after PR #9 merged the first browser-based admin Case/Asset/question workflow.

**This admin content-management redesign now takes priority over the previously recommended learner-account administration milestone.** Learner accounts and learner progress remain planned, but should follow this phase and a short pilot-content exercise.

The current `/admin` page successfully proves the end-to-end workflow, but it now combines too many jobs in one long page: image upload, topic creation, Case creation, Case selection, vignette editing, Case questions, attached images, available images, and the global image list.

The next phase should turn `/admin` into a small content-management system rather than continue expanding the monolithic page.

---

## Product goal

An administrator should be able to quickly:

- find any Case;
- find any question across the entire question bank;
- find any uploaded image;
- rename an uploaded image after upload;
- edit image metadata;
- see where questions and images are used;
- create and edit Cases without scrolling through one large page;
- manage Topics;
- preview learner-facing content;
- avoid accidentally duplicating reusable questions or Assets.

Proposed primary admin navigation:

```text
Dashboard · Cases · Questions · Images · Topics
```

Later milestones may add:

```text
Learners · Progress
```

---

## Design principles

### 1. Navigate by content object

Do not keep adding unrelated forms to `/admin`.

Use dedicated routes for Cases, Questions, Images, and Topics.

### 2. Reuse the current domain model

The existing D1/Drizzle model already supports almost all of this phase:

- `cases`;
- `concepts` / `case_concepts`;
- `question_prompts`;
- `case_questions`;
- `concept_questions`;
- `assets`;
- `case_assets`.

Prefer queries and UI changes over schema changes.

### 3. Preserve shared-object semantics

A Question Prompt is reusable, while the answer may belong to a Case or Concept.

An Asset is reusable, while its caption may belong to a specific Case attachment.

The admin UI must make these distinctions visible rather than presenting every usage as an independent flashcard/image copy.

### 4. Prefer archive/deactivate over destructive deletion

Avoid adding broad permanent-delete controls in this phase. Existing and historical Review relationships should not be endangered by routine content administration.

### 5. Search is a V1 requirement for the new admin UI

As the content library grows, search is needed to prevent duplicate questions and Assets.

Normal D1 queries are sufficient; do not add external search infrastructure.

---

# PR #10 — Admin shell + Case management redesign

## Objective

Replace the current monolithic `/admin` editing experience with a persistent admin shell and a dedicated Case library/editor while preserving existing PR #9 functionality.

## Proposed routes

```text
/admin
/admin/cases
/admin/cases/new
/admin/cases/[caseId]
```

## `/admin` — overview

The root admin page becomes an orientation/dashboard page rather than the main editor.

Initial content may include:

- total Cases;
- total Questions;
- total Images;
- total Topics;
- recently created/edited Cases;
- Cases without questions;
- Cases without images;
- shortcuts to New Case, Upload Image, Questions, and Images.

Do not add sophisticated analytics here.

## `/admin/cases`

Replace the current single Case `<select>` with a searchable list/table.

Suggested columns:

| Case | Topic | Images | Questions | Status |
|---|---|---:|---:|---|
| Anterior STEMI 01 | Cardiology | 1 | 4 | Active |

Required behaviour:

- search by Case title;
- filter by Topic;
- filter active/inactive if straightforward;
- open an existing Case;
- create a new Case.

## `/admin/cases/[caseId]`

Provide one Case editor with clear sections or tabs:

```text
Case · Questions · Images · Preview
```

### Case

Manage:

- internal Case title;
- primary Topic;
- Case stem/vignette;
- active/archive state if it can be added cleanly.

### Questions

Preserve current capabilities:

- add Case question;
- edit prompt;
- edit answer;
- remove/deactivate;
- reorder;
- mark/save as reusable for the primary Topic.

### Images

Preserve current capabilities:

- attach an existing Asset;
- detach an Asset;
- reorder Case Assets;
- edit Case-specific caption;
- show thumbnails.

### Preview

Provide a clear learner-preview path using the existing Study flow.

## Implementation constraint

This PR should primarily be a route/UI refactor.

Reuse existing Case, question, Asset, R2, and Study logic where possible.

Avoid a schema migration unless a concrete blocker is found.

## Definition of done

All routine PR #9 Case editing remains possible, but an administrator no longer needs the current giant `/admin` page to perform it.

---

# PR #11 — Questions Library

## Objective

Provide a global view of the question bank so an administrator can find, inspect, reuse, and safely edit questions without first locating a Case that contains them.

## Proposed routes

```text
/admin/questions
/admin/questions/[promptId]
```

## `/admin/questions`

Provide a searchable list/table.

Suggested columns:

| Prompt | Scope | Topic | Usage |
|---|---|---|---:|
| Describe this ECG | Shared | Cardiology | 18 |
| What is the diagnosis? | Shared | Dermatology | 24 |
| What electrolyte disturbance… | Case-specific | — | 1 |

### Search

Search at minimum:

- question prompt text;
- answer text.

### Filters

Useful initial filters:

- Topic;
- reusable/shared vs Case-specific;
- active/inactive if useful.

## Critical content-model rule

Do not model the admin list as one independent flashcard per row.

The relationship is:

```text
Question Prompt
      ↓
Case or Concept usage
      ↓
context-specific answer
```

For example, the reusable prompt `Describe this ECG` may have different answers in several Cases.

## `/admin/questions/[promptId]`

Show:

- prompt text;
- whether/how broadly it is reused;
- Cases using the prompt and their Case-specific answers;
- Concepts using the prompt and their reusable answers;
- inheritance state for Concept Questions where relevant;
- direct links back to the relevant Case editor.

## Shared-question safety

Before editing a reused prompt, clearly indicate its usage count, for example:

> This question prompt is currently used in 18 places.

List those usages so the administrator understands the blast radius of a prompt edit.

## Definition of done

The administrator can answer "Do I already have a question like this?" without manually opening Cases one by one.

---

# PR #12 — Image Library + rename/edit metadata

## Objective

Turn uploaded Assets into a searchable visual library and allow administrators to rename images and maintain metadata after upload.

## Proposed routes

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

## `/admin/images`

Default to a thumbnail grid rather than a long text-heavy list.

Each card should show at minimum:

- thumbnail;
- current image name;
- usage count;
- active/inactive state when relevant.

### Search

Search at minimum:

- image name (`assets.original_filename`);
- alt text;
- source label.

Source URL may also be included if useful.

### Filters

Useful initial filters:

- All / Used / Unused;
- Active / Inactive;
- Source known / Source unknown.

## Image-renaming decision

**Do not add a new `display_name` column.**

The existing field:

```text
assets.original_filename
```

will be treated as the administrator-editable image name.

The filename supplied at upload remains the initial value, but the administrator may rename it later, for example:

```text
IMG_4837.png
```

becomes:

```text
Anterior STEMI ECG 1.png
```

The user has explicitly accepted that the actual original upload filename does not need to be preserved separately.

### Critical storage rule

Renaming the image must update D1 metadata only.

It must **not** rename, copy, delete, or move the R2 object.

The following remain unchanged:

- `assets.id`;
- `assets.storage_key`;
- the R2 object/key;
- Case Asset relationships;
- Review relationships/snapshots.

Therefore **no schema migration is required for image renaming**.

## `/admin/images/[assetId]`

Show a large image preview and allow editing of Asset-level metadata:

- image name (`original_filename`);
- alt text;
- source label;
- source URL;
- licence/permission;
- active/archive state if implemented.

Also show:

- usage count;
- Cases using the Asset;
- links to those Case editors.

### Case-specific captions remain in the Case editor

Do not edit Case-specific captions on the global Asset page.

A caption belongs to the `Case + Asset` relationship and may differ between Cases using the same image.

## Definition of done

An administrator can find an image visually, rename it, correct its metadata, see where it is used, and navigate directly to those Cases without changing its immutable R2 storage identity.

---

# PR #13 — Topics dashboard

## Objective

Provide a simple Topic/Concept management and inspection page after the main Cases/Questions/Images workflows are established.

## Proposed routes

```text
/admin/topics
/admin/topics/[conceptId]
```

## `/admin/topics`

Suggested table:

| Topic | Cases | Shared questions |
|---|---:|---:|
| Cardiology | 31 | 12 |
| Dermatology | 24 | 9 |
| Eye | 21 | 8 |
| ENT | 18 | 7 |

Allow search by Topic name.

## `/admin/topics/[conceptId]`

Show at minimum:

- Topic name;
- Cases assigned to the Topic;
- reusable Concept Questions;
- child Topics if hierarchy exists.

Do not build a sophisticated hierarchy/tree editor until pilot content proves it is needed.

---

# Admin navigation architecture

Use a persistent admin layout.

Desktop concept:

```text
┌─────────────────────────────────────────────────┐
│ Flash-Cards Admin              Study   Sign out │
├──────────────┬──────────────────────────────────┤
│ Dashboard    │                                  │
│ Cases        │                                  │
│ Questions    │          Page content            │
│ Images       │                                  │
│ Topics       │                                  │
│              │                                  │
│ Learners*    │                                  │
└──────────────┴──────────────────────────────────┘
```

`Learners` is a later milestone.

On mobile, collapse this navigation appropriately rather than forcing a permanent sidebar.

---

# Search implementation

Search should be included from the start of each relevant library page.

## Cases

Search:

- Case title;
- vignette later only if useful.

## Questions

Search:

- prompt text;
- answer text.

## Images

Search:

- editable `original_filename`;
- alt text;
- source label.

## Topics

Search:

- Topic name.

Use D1 queries. Do not add Elasticsearch, Algolia, external indexing, or similar infrastructure for V1.

---

# Data-model impact

The current schema should support almost all of this phase.

Expected migrations:

```text
None by default.
```

Specifically, **image renaming does not require a migration** because `assets.original_filename` is intentionally being repurposed as the editable admin-facing image name.

If an implementation agent believes a migration is necessary elsewhere, the PR must explain the concrete blocker and why existing fields cannot support the behaviour.

---

# Work deliberately deferred

Do not expand this redesign into:

- bulk Anki import;
- FSRS or scheduling;
- drag-and-drop dashboard building;
- rich WYSIWYG editing;
- sophisticated tagging;
- bulk permanent deletion;
- AI-generated content;
- complex roles/organisations;
- advanced learner analytics;
- structured marks/weighting;
- extensive Concept hierarchy tooling.

Those decisions should follow real pilot-content use.

---

# Recommended implementation order

1. **PR #10 — Admin shell + Cases**
2. **PR #11 — Questions Library**
3. **PR #12 — Image Library + rename/edit metadata**
4. **PR #13 — Topics dashboard**
5. enter representative pilot content;
6. fix content-entry friction discovered during real use;
7. implement learner-account administration;
8. implement learner progress dashboard;
9. reassess FSRS, Anki import, richer analytics, and other deferred features.

The pilot content should deliberately include ECG/Cardiology, ENT, Eye, and Dermatology examples and should exercise:

- multi-image Cases;
- alternative Cases for one condition;
- reused Assets across Cases;
- repeated Question Prompts with different Case answers;
- Concept-level reusable questions;
- inherited questions;
- Cases that may eventually need secondary Concepts.

---

# Parallel-agent strategy

After PR #10 establishes the common admin shell, PR #11 and PR #12 are good candidates for parallel work:

```text
                PR #10
       Admin shell + Cases
                 │
          ┌──────┴──────┐
          │             │
       PR #11         PR #12
      Questions        Images
          │             │
          └──────┬──────┘
                 │
              PR #13
               Topics
```

Suggested ownership:

### Questions agent

Own primarily:

```text
src/routes/admin/questions/**
question-library query/helpers
tests for question search/usages/edit safety
```

### Images agent

Own primarily:

```text
src/routes/admin/images/**
Asset-library query/helpers
Asset metadata update logic
tests for rename/search/usages/metadata edits
```

Both should avoid broad edits to the other's routes and should reuse the admin shell created by PR #10.

---

# Validation requirements

Every implementation PR should run the repository's full validation before being considered complete:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
```

Add focused tests for new admin query/write behaviour.

Do not claim success with failing CI.

---

# Handoff note for the next agent

Start from current `main` and read, at minimum:

- `docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md` — this document and current next-phase priority;
- `docs/HANDOVER.md` — repository/runtime state;
- `docs/V1_DATA_MODEL.md` — authoritative content model;
- `docs/CONTENT_MODEL_EXAMPLES.md` — educational modelling examples;
- `docs/IMAGE_PROVENANCE.md` — Asset/source rules.

Do not redesign the learner study experience as part of this phase. The goal is to make existing content objects substantially easier to administer while preserving the established learner behaviour and R2/D1 contracts.
