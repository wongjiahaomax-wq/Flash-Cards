# Stage A Tag Foundation

Status: implemented on `agent/stage-a-tag-foundation` from the agreed model in `TAGGING_MODEL_DECISIONS.md`.

## Purpose

Stage A adds administrator-curated cross-cutting clinical metadata without changing learner study eligibility or Question resolution.

The implementation preserves the existing semantic boundary:

- **Topic / Concept** = learner study route and curriculum organisation.
- **Tag** = flat, cross-cutting clinical metadata for curation, discovery, and filtering.

## Data model

Migration: `drizzle/0005_tag_foundation.sql`

New tables:

- `tags`
  - canonical administrator-curated Tag name
  - normalized unique name used to prevent duplicate spellings/casing
  - active/inactive state
- `case_tags`
  - many-to-many Case ↔ Tag relationship
- `case_question_tags`
  - many-to-many contextual `case_questions` ↔ Tag relationship

The schema is declared separately in `src/lib/server/db/tag-schema.js` and included in `drizzle.config.js`.

### Why Question Tags attach to `case_questions`

`question_prompts` stores reusable wording. Prompt text such as “What is the diagnosis?” has no intrinsic clinical meaning. The clinical meaning comes from the contextual Question relationship and its Case-specific answer.

Stage A therefore starts Question tagging at `case_questions`. Broader shared/concept/stimulus Question tagging remains a later extension when its exact reuse semantics are needed.

## Admin behaviour

A new `/admin/tags` screen supports:

- creating canonical Tags;
- renaming Tags;
- deactivating/reactivating Tags;
- attaching/removing Tags on Cases;
- attaching/removing Tags on Case Questions;
- viewing current active Case and Case Question usage counts.

Tags are deactivated rather than deleted so existing curated relationships are preserved.

The existing Admin libraries now support:

- `/admin/cases` — filter active Cases by Case Tag and display their active Tags;
- `/admin/questions` — filter Question Prompts by Tags present on their active Case Question usages and display those contextual Tags.

The Questions library display is an aggregate convenience only. It does **not** attach the Tag to the reusable `question_prompts` row.

## Safety invariants

Stage A intentionally enforces all of the following:

1. Case Tags do not automatically become Question Tags.
2. Tags are not attached to `question_prompts`.
3. Inactive Tags cannot receive new assignments.
4. Deactivating a Tag preserves existing relationships for later review/reactivation.
5. Current library filters ignore inactive Tags and inactive parent entities.
6. No learner resolver, Review snapshot, Study-by-Tag, or Question-selection behaviour is changed.
7. Import Package v1 remains unchanged; legacy import does not need Tags.
8. No Tag aliases, synonym tables, hierarchy, or ontology are introduced in Stage A.

## Tests

`test/tag-library.test.js` covers:

- canonical-name normalization and duplicate protection;
- Case and Case Question active usage counts;
- explicit non-inheritance from Case Tags to Question Tags;
- preservation of curated relationships across Tag deactivation;
- exclusion of inactive Tags from current filtering/assignment.

Normal validation remains:

```sh
npm run check
npm test
npm run build
```

## Deployment

The new D1 migration must be applied before deploying code that reads or writes Tags:

```sh
npx --yes wrangler@4.115.0 d1 migrations apply DB --remote
npx --yes wrangler@4.115.0 deploy
```

For local development, apply the migration with:

```sh
npm run db:migrate:local
```

## Deferred work

The following remain outside Stage A:

- learner Study-by-Tag routes;
- Tag-aware learner Question eligibility/resolution;
- shared Concept Question Tag semantics;
- Stimulus Group / Stimulus Option Question Tags;
- Review Tag snapshots;
- aliases/synonyms;
- Tag hierarchy or ontology;
- automatic Tag inference from Case Tags.

Those should only be introduced when a concrete learner or authoring workflow requires them.
