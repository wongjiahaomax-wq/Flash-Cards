# Flash-Cards — Admin Content Management Implementation Plan

_Last updated: 15 August 2026_

## Current status

The Admin content-management redesign is the current product priority.

PR #10 — **Admin shell + Case management redesign** — merged into `main` on 15 August 2026 at commit:

```text
21f349b4869f59a8bccbf440437ce67088776b58
```

PR #10 established:

- persistent Admin navigation;
- `/admin` as an overview/dashboard rather than the monolithic editor;
- `/admin/cases` searchable Case library;
- `/admin/cases/new` dedicated Case creation;
- `/admin/cases/[caseId]` focused Case editing;
- preservation of Case questions, reusable Topic questions, Asset attachment, captions, ordering, upload, and learner preview;
- Case title/topic/vignette updates;
- no schema migration.

The next two milestones should now proceed **in parallel** from current `main`:

```text
PR #11 — Questions Library
PR #12 — Image Library + rename/edit metadata
```

After both merge, proceed to PR #13 — Topics dashboard.

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

Primary Admin navigation:

```text
Dashboard · Cases · Questions · Images · Topics
```

Later milestones may add:

```text
Learners · Progress
```

---

## Design principles

1. **Navigate by content object.** Use dedicated routes instead of adding unrelated forms back to `/admin`.
2. **Reuse the existing domain model.** Prefer D1 queries and UI changes over schema changes.
3. **Preserve shared-object semantics.** Question Prompt and answer/context are separate; Asset and Case-specific caption are separate.
4. **Prefer archive/deactivate over destructive deletion.** Avoid broad permanent-delete controls during this phase.
5. **Search is required.** D1 search is sufficient; do not add external search infrastructure.
6. **Do not redesign the learner Study flow.** Admin work must preserve established learner behaviour and Review/R2 contracts.

---

# PR #10 — Admin shell + Cases

Status: **merged**.

No further feature work belongs in PR #10. Any small regression found while PR #11/#12 are being built should be fixed in the PR that exposes it only when necessary; otherwise use a separate focused follow-up.

---

# PR #11 — Questions Library

## Objective

Provide a global view of the question bank so an administrator can find, inspect, reuse, and safely edit questions without first locating a Case that contains them.

## Routes

```text
/admin/questions
/admin/questions/[promptId]
```

## `/admin/questions`

Provide a searchable list/table with enough context to distinguish shared prompts from Case-specific usage.

Suggested columns:

| Prompt | Scope | Topic | Usage |
|---|---|---|---:|
| Describe this ECG | Shared | Cardiology | 18 |
| What is the diagnosis? | Shared | Dermatology | 24 |
| What electrolyte disturbance… | Case-specific | — | 1 |

### Search

Search at minimum:

- Question Prompt text;
- Case Question answer text;
- Concept Question answer text.

### Filters

Useful V1 filters:

- Topic;
- reusable/shared vs Case-specific;
- active/inactive if straightforward.

## Critical content-model rule

Do not treat every row as an independent flashcard.

The relationship is:

```text
Question Prompt
      ↓
Case or Concept usage
      ↓
context-specific answer
```

For example, the prompt `Describe this ECG` can be reused across many Cases with different answers.

## `/admin/questions/[promptId]`

Show:

- prompt text;
- total usage count;
- Cases using the prompt and their Case-specific answers;
- Concepts using the prompt and their reusable answers;
- inheritance state for Concept Questions where relevant;
- links to relevant Case editors.

## Shared-prompt edit safety

Before saving an edit to a reused `question_prompts.prompt_md`, show the blast radius clearly, for example:

> This question prompt is currently used in 18 places.

The administrator must be able to inspect those usages before making a global prompt edit.

Do not silently duplicate a shared prompt merely to avoid this warning.

## Expected ownership

Primarily:

```text
src/routes/admin/questions/**
question-library query/helper modules
focused tests for question search, usage aggregation, and edit safety
```

Avoid broad edits to Images routes or R2/storage code.

## Definition of done

The administrator can answer **“Do I already have a question like this?”** without manually opening Cases one by one, and can understand the effect of editing a shared prompt.

---

# PR #12 — Image Library + rename/edit metadata

## Objective

Turn uploaded Assets into a searchable visual library and allow administrators to rename images and maintain metadata after upload.

## Routes

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

Reuse the existing protected upload/R2 pipeline rather than creating a second upload mechanism.

## `/admin/images`

Default to a thumbnail grid.

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

Source URL may also be searched if useful.

### Filters

Useful V1 filters:

- All / Used / Unused;
- Active / Inactive;
- Source known / Source unknown.

## Image-renaming decision

**Do not add a `display_name` column.**

The existing field:

```text
assets.original_filename
```

is intentionally treated as the administrator-editable image name.

The uploaded filename is the initial value, but the administrator may later rename it, for example:

```text
IMG_4837.png
→ Anterior STEMI ECG 1.png
```

The actual original upload filename does not need separate preservation.

### Critical storage rule

Renaming must update D1 metadata only.

It must **not** rename, copy, move, replace, or delete the R2 object.

The following remain unchanged:

- `assets.id`;
- `assets.storage_key`;
- the R2 object/key;
- Case Asset relationships;
- Review relationships/snapshots.

Therefore no schema migration is required for image renaming.

## `/admin/images/[assetId]`

Show a large image preview and allow editing of Asset-level metadata:

- image name (`original_filename`);
- alt text;
- source label;
- source URL;
- licence/permission;
- active/archive state if implemented cleanly.

Also show:

- usage count;
- Cases using the Asset;
- links to those Case editors.

### Case-specific captions remain in the Case editor

Do not move Case-specific caption editing into the global Asset page. A caption belongs to the `Case + Asset` relationship and may differ between Cases using the same image.

## Expected ownership

Primarily:

```text
src/routes/admin/images/**
Asset-library query/helper modules
Asset metadata update logic
focused tests for rename/search/usages/metadata edits
```

Avoid broad edits to Questions routes/question logic.

## Definition of done

An administrator can find an image visually, rename it, correct its metadata, see where it is used, and navigate directly to those Cases without changing the Asset's immutable R2 storage identity.

---

# PR #13 — Topics dashboard

Status: **defer until PR #11 and PR #12 are merged**.

Routes:

```text
/admin/topics
/admin/topics/[conceptId]
```

Initial scope:

- Topic search;
- Case count;
- reusable Question count;
- Topic detail showing Cases, reusable questions, and child Topics where relevant.

Do not build a sophisticated hierarchy/tree editor until pilot content demonstrates a need.

---

# Parallel implementation rules for PR #11 and PR #12

Both branches must start from the same post-PR-#10 `main` baseline.

Questions agent owns Question-library work; Images agent owns Asset-library work. Both may make a minimal edit to `src/routes/admin/+layout.svelte` to activate their own navigation link, but should avoid reorganising the shared Admin shell.

If both PRs need to edit the same shared file, keep the edit minimal and isolated so the second PR can rebase cleanly after the first merge.

Neither PR should modify:

- learner Study behaviour;
- Review selection/rating semantics;
- authentication model;
- R2 object-key strategy;
- unrelated Cloudflare configuration;
- the other agent's route tree.

No schema migration is expected. If an agent believes one is necessary, the PR must explain the concrete blocker before adding it.

See `docs/PARALLEL_WORK_PLAN.md` for exact branch/agent handoff instructions.

---

# Validation requirements

Every implementation PR must run:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
```

Also run:

```sh
git diff --check
```

Add focused tests for new admin query/write behaviour.

A local network restriction may prevent the smoke script in a sandbox, but GitHub CI must ultimately pass it before merge.

Do not claim completion with failing CI.

---

# Recommended sequence from here

1. PR #11 — Questions Library — **parallel now**.
2. PR #12 — Image Library + rename/edit metadata — **parallel now**.
3. Merge both after review and green CI; rebase the second one if shared Admin layout conflicts.
4. PR #13 — Topics dashboard.
5. Enter representative ECG/Cardiology, ENT, Eye, and Dermatology pilot content.
6. Fix content-entry friction discovered during real use.
7. Implement learner-account administration and role-boundary acceptance.
8. Implement learner progress administration.
9. Reassess FSRS, Anki import, structured marks, richer analytics, and other deferred features.

Pilot content should deliberately exercise:

- multi-image Cases;
- alternative Cases for one condition;
- reused Assets across Cases;
- repeated Question Prompts with different Case answers;
- Concept-level reusable questions;
- inherited questions;
- Cases that may eventually need secondary Concepts.
