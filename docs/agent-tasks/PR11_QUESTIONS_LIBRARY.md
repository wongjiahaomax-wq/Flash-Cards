# PR #11 Agent Brief — Questions Library

You are implementing **PR #11 — Questions Library** for `wongjiahaomax-wq/Flash-Cards`.

## Start here

Read these files before changing code:

```text
docs/HANDOVER.md
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/PARALLEL_WORK_PLAN.md
docs/V1_DATA_MODEL.md
docs/CONTENT_MODEL_EXAMPLES.md
```

Work only on branch:

```text
agent/admin-questions-library
```

Push all progress to the existing draft PR for this branch. Do not open a second PR and do not merge your own PR.

## Goal

Build a global Questions Library so an administrator can search, inspect, and safely edit Question Prompts while understanding every Case/Concept usage and context-specific answer.

Create:

```text
/admin/questions
/admin/questions/[promptId]
```

## Required functionality

### `/admin/questions`

Implement a searchable global question library.

Search at minimum:

- `question_prompts.prompt_md`;
- `case_questions.answer_md`;
- `concept_questions.answer_md`.

Show enough information to understand:

- prompt text;
- whether it is shared/reusable or Case-specific in current usage;
- relevant Topic/Concept context;
- usage count.

Add useful V1 filters for Topic and shared/reusable vs Case-specific. Active/inactive filtering may be included if straightforward.

### `/admin/questions/[promptId]`

Show:

- Question Prompt text;
- total usage count;
- every Case usage and Case-specific answer;
- every Concept usage and reusable answer;
- `inherit_to_descendants` state where relevant;
- direct links to `/admin/cases/[caseId]`.

### Shared-prompt safety

Respect the existing content model:

```text
Question Prompt
      ↓
Case or Concept usage
      ↓
context-specific answer
```

The same prompt can have different answers in different Cases.

Before saving an edit to a reused `question_prompts.prompt_md`, clearly show its blast radius: how many places use it and which usages will be affected. The administrator should be able to inspect those usages before saving.

Do not silently clone a shared prompt merely to avoid global-edit semantics.

## Ownership / boundaries

Own primarily:

```text
src/routes/admin/questions/**
question-library query/helper modules
focused Questions Library tests
```

You may make a minimal change to `src/routes/admin/+layout.svelte` to activate the Questions navigation link.

Avoid broad edits to:

```text
src/routes/admin/+layout.svelte
src/routes/admin/+page.svelte
src/routes/admin/+page.server.js
src/routes/admin/images/**
package.json
package-lock.json
wrangler.jsonc
src/app.css
docs/HANDOVER.md
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/PARALLEL_WORK_PLAN.md
```

Do not redesign learner Study behaviour, authentication, Reviews, R2 storage, or unrelated infrastructure.

No schema migration is expected. If you believe one is unavoidable, explain the concrete blocker in the draft PR before adding it.

## Tests and validation

Add focused tests for search, usage aggregation, and shared-prompt update safety.

Before reporting completion run:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

If the sandbox cannot download Wrangler for the local auth smoke script, state that clearly; GitHub CI must still pass before merge.

## Completion report

Update the existing draft PR description with:

- routes implemented;
- search/filter behaviour;
- editing behaviour and shared-prompt safety;
- helper/query modules added;
- tests added;
- migrations (expected none);
- shared files touched;
- validation results;
- any residual limitations.

Do not expand scope into Images, Topics, learner accounts, progress analytics, FSRS, or Anki import.
