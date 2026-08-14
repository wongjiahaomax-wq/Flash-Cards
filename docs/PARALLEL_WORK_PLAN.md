# Flash-Cards — Parallel Work Plan

_Last updated: 15 August 2026_

This plan defines the next implementation phase after PR #6 merged the approved learner study prototype.

The objective is to let two Codex/Luna agents work concurrently with minimal merge conflicts.

## Shared starting point

Both agents must:

1. fetch current `main`;
2. create a new branch from that exact `main`;
3. work only on the assigned track;
4. run the full project validation before opening/updating a PR;
5. open a separate draft PR targeting `main`;
6. never merge their own PR;
7. clearly report any need to touch files owned by the other track before doing so.

Do not modify the approved learner UX unless needed to replace temporary data with real data.

## Track A — D1 learner + Review persistence

Suggested branch:

```text
agent/d1-learner-vertical-slice
```

Primary objective: replace the temporary learner demo data with real D1-backed content and durable Review records while preserving the approved learner interaction flow.

### Track A owns

- representative seed tooling/data;
- learning-domain D1 read/write queries;
- Review creation and snapshots;
- Review reveal/completion writes;
- `/study` data loading and learner-flow integration;
- tests for learner selection/persistence behaviour.

### Expected Track A files/areas

Likely ownership includes:

```text
src/lib/server/db/**
src/lib/server/learning/**
src/routes/study/**
scripts/*seed*
tests related to learning/reviews
```

Track A may read Asset metadata from D1 but should not implement R2 upload or admin Asset management.

### Track A required behaviour

1. Seed a representative V1 dataset including:
   - STEMI parent Concept;
   - Anterior STEMI child Concept;
   - multiple alternative Anterior STEMI Cases;
   - shared `Describe this ECG` prompt with Case-specific answers;
   - inherited STEMI question;
   - child-specific question;
   - Case-only question;
   - at least one multi-image Dermatology Case.
2. `/study` should select from D1 rather than `demo-content.js`.
3. Case selection should use existing immediate-repeat avoidance.
4. Question resolution should use existing precedence/deduplication rules.
5. Starting a review must snapshot:
   - Review row;
   - selected Review Questions;
   - ordered Review Assets metadata.
6. Reveal should persist `revealed_at` if practical within the current route structure.
7. `Again`/`Good` must complete the Review and persist the rating.
8. Next Case should start a new Review rather than cycling through static demo IDs.
9. Preserve the approved learner layout and mobile behaviour from PR #6.

### Track A non-goals

Do not implement:

- R2 upload UI;
- direct `MEDIA.put()` calls;
- full admin CRUD;
- bulk Anki import;
- FSRS/scheduling;
- per-question ratings.

## Track B — R2 Asset + minimal admin image pipeline

Suggested branch:

```text
agent/r2-asset-pipeline
```

Primary objective: establish a real teaching-image pipeline from protected admin upload to R2 storage, Asset metadata persistence, and secure browser delivery.

### Track B owns

- admin Asset upload/edit slice;
- R2 teaching-image writes;
- upload validation;
- Asset metadata persistence;
- optional source attribution fields;
- secure R2-backed image serving;
- tests for image pipeline behaviour.

### Expected Track B files/areas

Likely ownership includes:

```text
src/lib/server/storage/**
src/routes/admin/** asset/image-specific routes
src/routes/** image-serving endpoint if required
tests related to R2/assets
```

Avoid broad changes to `src/routes/study/**`. If Track B needs learner rendering integration, expose a stable image URL/helper and document how Track A can consume it.

### Track B required behaviour

1. Admin-only image upload path.
2. Accept at least JPEG and PNG.
3. Enforce current 5 MiB per-image limit.
4. Enforce current managed 5 GiB storage ceiling.
5. All teaching-image writes go through `putTeachingImage()`.
6. Generate/use immutable storage keys.
7. Persist Asset metadata in D1:
   - storage key;
   - MIME type;
   - original filename when available;
   - alt text;
   - optional `source_label`;
   - optional `source_url`;
   - optional `licence`.
8. Unknown source is valid: source fields may remain blank and no fake attribution should be generated.
9. Own/original images may use an explicit source label such as `Original teaching image`.
10. Securely serve the stored R2 image to authenticated app users without exposing R2 as an uncontrolled public origin.
11. Provide a stable interface/URL shape that Track A can consume for learner rendering.

### Track B non-goals

Do not implement:

- learner Review persistence;
- question selection changes;
- Concept/Case CRUD beyond the minimum needed to associate/test an Asset;
- full admin dashboard;
- external hotlinking as the learner image source.

## Shared boundaries

### Files both agents should avoid editing unless necessary

```text
package.json
package-lock.json
wrangler.jsonc
src/app.css
docs/HANDOVER.md
docs/IMPLEMENTATION_PLAN.md
```

If a shared dependency/config change is truly required, keep it minimal and call it out prominently in the PR description.

### Schema rule

The existing V1 schema is authoritative. Prefer using existing fields/tables before adding migrations.

If a migration is genuinely required, the agent must explain why existing fields cannot support the behaviour and keep the migration narrowly scoped.

### Image rule

R2 stores the canonical image bytes. `source_url` is attribution/reference metadata only, never the learner runtime image source.

### UI rule

PR #6 established the approved learner layout. Track A should preserve it. Track B should keep admin image management functional and minimal rather than spending time on visual polish.

## Validation required for both PRs

Before reporting completion, run:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
```

If a new route requires additional focused tests, add them.

Do not claim success if any required CI/check remains failing.

## PR expectations

Each PR description should include:

- scope completed;
- files/areas intentionally not touched;
- migrations added, if any;
- new routes/endpoints;
- test coverage;
- any interface the other track needs to consume;
- residual integration work.

Use a draft PR initially.

## Integration strategy

When both PRs are green:

1. compare overlap;
2. merge the lower-conflict PR first;
3. update/rebase the remaining branch against current `main`;
4. resolve conflicts conservatively, preserving both tested behaviours;
5. run full CI again;
6. add only the thin glue needed so D1-backed Review Assets render through the R2-serving interface;
7. run the V1 acceptance slice before expanding scope.

## V1 acceptance slice after integration

The integrated result should demonstrate at minimum:

- learner signs in;
- learner chooses a Concept/topic;
- system selects a compatible Case;
- ordered R2-backed image(s) display together;
- optional image source attribution displays only when present;
- 1–4 compatible questions display together;
- answers reveal;
- learner rates the Case `Again` or `Good`;
- Review history persists;
- next Case starts without an immediate repeat when alternatives exist.
