# Flash-Cards — Parallel Work Plan

_Last updated: 15 August 2026_

This plan defines the parallel implementation phase after PR #10 merged the Admin shell and Case management redesign.

The objective is to let two agents work concurrently with minimal merge conflict:

```text
Track A → PR #11 Questions Library
Track B → PR #12 Image Library
```

Both tracks must start from the same current `main` after the documentation refresh.

---

## Shared starting rules

Both agents must:

1. fetch current `main`;
2. work on the already-created assigned branch;
3. read `docs/HANDOVER.md` and `docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md` before changing code;
4. stay inside the assigned product boundary;
5. run full validation before reporting completion;
6. push progress to the existing draft PR rather than opening a different PR;
7. never merge their own PR;
8. call out any need to modify shared Admin-shell files beyond the minimum required navigation change.

Do not redesign the learner Study flow, authentication model, Review semantics, or Cloudflare infrastructure in either track.

---

# Track A — PR #11 Questions Library

Branch:

```text
agent/admin-questions-library
```

Draft PR target:

```text
main
```

## Primary objective

Build a global Questions Library so an administrator can search, inspect, and safely edit reusable Question Prompts and understand every Case/Concept usage and context-specific answer.

## Routes

```text
/admin/questions
/admin/questions/[promptId]
```

## Track A owns

Primarily:

```text
src/routes/admin/questions/**
question-library query/helper modules
focused Questions Library tests
```

A minimal change to `src/routes/admin/+layout.svelte` is allowed only to activate the Questions navigation link.

## Required behaviour

### Questions list

Provide a searchable library that searches at minimum:

- `question_prompts.prompt_md`;
- `case_questions.answer_md`;
- `concept_questions.answer_md`.

Display enough context to understand:

- prompt text;
- shared/reusable versus Case-specific scope;
- Topic/Concept context where relevant;
- usage count.

Useful filters:

- Topic;
- shared/reusable vs Case-specific;
- active/inactive if straightforward.

### Prompt detail

`/admin/questions/[promptId]` should show:

- prompt text;
- total usage count;
- Case usages and their answers;
- Concept usages and their answers;
- Concept inheritance flag where relevant;
- links back to `/admin/cases/[caseId]`.

### Shared-prompt edit safety

The established data model is:

```text
Question Prompt
      ↓
Case or Concept usage
      ↓
context-specific answer
```

A reused prompt may have different answers in different Cases.

Before editing/saving a shared `question_prompts.prompt_md`, make the blast radius visible. The administrator should see how many places use the prompt and be able to inspect them.

Do not silently clone a reused prompt to avoid global-edit semantics.

## Track A non-goals

Do not implement:

- Image Library routes;
- Asset metadata editing;
- R2 upload/storage changes;
- Topic hierarchy editor;
- learner-account administration;
- progress analytics;
- learner Study redesign;
- FSRS/Anki import.

---

# Track B — PR #12 Image Library

Branch:

```text
agent/admin-images-library
```

Draft PR target:

```text
main
```

## Primary objective

Build a visual Asset library so an administrator can search uploaded images, rename them, edit Asset-level metadata, see where they are used, and continue using the existing protected R2 upload pipeline.

## Routes

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

## Track B owns

Primarily:

```text
src/routes/admin/images/**
Asset-library query/helper modules
Asset metadata update logic
focused Image Library tests
```

A minimal change to `src/routes/admin/+layout.svelte` is allowed only to activate the Images navigation link.

## Required behaviour

### Image list

Default to a visual thumbnail grid.

Each image should show at minimum:

- thumbnail;
- current image name;
- usage count;
- active/inactive state if surfaced.

Search at minimum:

- `assets.original_filename`;
- `assets.alt_text`;
- `assets.source_label`.

Useful filters:

- all / used / unused;
- active / inactive;
- source known / source unknown.

### Image detail

`/admin/images/[assetId]` should show:

- large preview;
- editable image name;
- editable alt text;
- editable source label;
- editable source URL;
- editable licence/permission;
- usage count;
- Cases using the Asset;
- links back to `/admin/cases/[caseId]`.

### Upload

`/admin/images/new` should reuse the existing protected teaching-image upload pipeline and existing size/R2 guardrails. Do not create a second upload path.

### Image-renaming contract

The existing field:

```text
assets.original_filename
```

is the administrator-editable image name.

The actual original upload filename does not need separate preservation.

Renaming must update D1 metadata only.

It must never rename, move, copy, replace, or delete the R2 object/key.

These remain stable:

```text
assets.id
assets.storage_key
R2 object/key
Case Asset relationships
Review relationships/snapshots
```

No schema migration is expected for rename support.

### Captions

Case-specific captions stay in the Case editor. They belong to `case_assets`, not the global Asset.

## Track B non-goals

Do not implement:

- Questions Library routes;
- Question Prompt editing;
- Topic hierarchy editor;
- learner-account administration;
- progress analytics;
- learner Study redesign;
- R2 key-renaming/migration;
- FSRS/Anki import.

---

## Shared-file boundaries

Both agents should avoid broad edits to:

```text
src/routes/admin/+layout.svelte
src/routes/admin/+page.svelte
src/routes/admin/+page.server.js
package.json
package-lock.json
wrangler.jsonc
src/app.css
docs/HANDOVER.md
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/PARALLEL_WORK_PLAN.md
```

The only expected shared code change is a minimal navigation-link activation in `src/routes/admin/+layout.svelte`.

If one track discovers a genuine shared abstraction that both need, prefer a small new helper/module with a narrow contract rather than a broad refactor.

---

## Schema and storage rules

The current V1 schema is authoritative.

Expected migration count for both PRs:

```text
0
```

If a migration appears necessary, explain the concrete blocker in the draft PR before adding it.

R2 is the canonical image-byte store. `source_url` is attribution/reference metadata only and never the runtime learner image source.

Unknown image source is valid; never fabricate attribution.

---

## Validation required for both PRs

Before reporting completion, run:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

Add focused tests for the new query/write behaviour.

A sandbox may fail to download Wrangler for the local smoke script; if so, report that clearly, but GitHub CI must ultimately pass before merge.

Do not claim success with failing CI.

---

## Draft PR expectations

Each existing draft PR should be updated with:

- scope completed;
- new routes;
- query/write helpers added;
- tests added;
- migrations (expected none);
- shared files touched;
- residual work;
- validation results.

Push incremental commits to the assigned branch so progress remains visible.

---

## Integration strategy

When both PRs are implementation-complete and green:

1. inspect overlap;
2. merge the lower-conflict PR first;
3. update/rebase the remaining branch onto current `main`;
4. resolve the likely Admin-layout navigation conflict conservatively;
5. rerun full CI;
6. browser-test both library pages together;
7. merge the second PR;
8. then start PR #13 Topics dashboard.

Do not combine PR #11 and PR #12 into one large PR merely to avoid a small shared-navigation conflict.
