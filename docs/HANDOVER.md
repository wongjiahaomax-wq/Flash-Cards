# Flash-Cards agent handover

_Refreshed: 15 August 2026_

## Current outcome

The project has a working end-to-end V1 learner vertical slice and the planned Admin content-management redesign is now complete for the current phase.

Recent merged milestones:

```text
PR #7  — D1-backed learner Reviews
PR #8  — protected R2 teaching-image pipeline
PR #9  — browser-based admin Case/Asset/question management
PR #10 — Admin shell + Case management redesign
PR #11 — Questions Library
PR #12 — Image/Asset Library
PR #13 — Topics dashboard
```

Key merge commits:

```text
PR #10 21f349b4869f59a8bccbf440437ce67088776b58
PR #11 b78e7c9c0af4b4024adb3e5d373aef8631482914
PR #12 e1af88633f67b9a4bca1778684664b863fe62adb
PR #13 02853083518d0228e8aaffa9c7566822e6c8d7c5
```

PR #13 CI was green before merge, including database checks, 62 tests, Svelte checks, build, and local D1/Better Auth smoke validation in GitHub Actions.

The production Worker remains:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

Do not assume every newest `main` commit is deployed to production unless deployment is explicitly verified.

---

## Current next phase

**Stop adding Admin architecture for now. Use the completed Admin CMS to enter representative real pilot content and discover workflow/model friction.**

Pilot content should span:

- ECG/Cardiology;
- ENT;
- Eye;
- Dermatology.

Deliberately exercise:

- stem + image + multiple questions;
- image-only recognition;
- multi-image Cases;
- alternative Cases for the same condition;
- the same Asset reused across multiple Cases;
- the same Question Prompt with different Case-specific answers;
- Concept-level reusable questions;
- inherited questions;
- Cases that may eventually justify secondary Concepts.

After pilot entry:

1. fix concrete Admin friction exposed by real use;
2. implement the smallest learner-account administration workflow;
3. verify learner role boundaries;
4. implement basic learner-progress administration;
5. only later reassess FSRS, Anki import, richer analytics, structured marks, broader stimulus types, or advanced hierarchy tools.

---

## Admin product state

Primary navigation is live:

```text
Dashboard · Cases · Questions · Images · Topics
```

### Dashboard / Cases

Implemented:

- `/admin` overview/dashboard;
- `/admin/cases` searchable Case library;
- `/admin/cases/new` dedicated Case creation;
- `/admin/cases/[caseId]` focused Case editor;
- internal Case title editing;
- primary Topic editing;
- vignette/stem editing;
- Case question add/edit/remove/reorder;
- optional save-as-reusable Topic question;
- image upload through the protected R2 pipeline;
- clipboard paste, drag/drop, and file picker;
- attach existing Assets without re-upload;
- Asset reorder/detach;
- Case-specific captions;
- learner Study preview.

### Questions Library

Implemented:

```text
/admin/questions
/admin/questions/[promptId]
```

Capabilities include:

- search Question Prompt and current active Case/Concept answer text;
- Topic/scope filtering;
- current active usage counts;
- Case and Concept usage inspection;
- context-specific answers;
- inherited Concept-question state;
- Case editor links;
- blast-radius display and explicit confirmation before editing a reused shared prompt;
- stale-usage protection using a consistent definition of active usage.

Current active Case usage requires all of these to be active:

- `question_prompts.is_active`;
- `case_questions.is_active`;
- `cases.is_active`.

Current active Concept usage requires all of these to be active:

- `question_prompts.is_active`;
- `concept_questions.is_active`;
- `concepts.is_active`.

Inactive/historical usages may still appear on detail pages for inspection but do not inflate current active counts.

### Image / Asset Library

Implemented:

```text
/admin/images
/admin/images/new
/admin/images/[assetId]
```

Capabilities include:

- visual thumbnail library;
- search by editable image name, alt text, source label, and source URL;
- used/unused, active/inactive, and source-known/source-unknown filters;
- protected preview;
- Asset metadata editing;
- usage count and Case links;
- dedicated upload surface using the existing protected R2 pipeline.

The existing field:

```text
assets.original_filename
```

is intentionally the administrator-editable image name.

Renaming changes D1 metadata only and must never rename, move, copy, replace, or delete the R2 object/key.

These remain stable:

- `assets.id`;
- `assets.storage_key`;
- R2 object/key;
- Case Asset relationships;
- Review relationships/snapshots.

Case-specific captions remain in the Case editor because they belong to the `Case + Asset` relationship.

### Topics dashboard

Implemented:

```text
/admin/topics
/admin/topics/[conceptId]
```

Capabilities include:

- Topic name search;
- active primary-Case counts;
- active reusable Concept-question counts;
- Topic detail with primary Cases;
- Topic-specific reusable answers and prompt links;
- `inherit_to_descendants` visibility;
- parent Topic and direct-child navigation;
- inactive/historical relationship visibility for orientation.

Topic metadata editing and sophisticated hierarchy management are deliberately deferred.

---

## Learner flow

`/study` is D1-backed.

Current learner behaviour:

- learner selects a Concept/topic;
- system selects an eligible active Case;
- persisted Review history is used for immediate-repeat avoidance where possible;
- Case vignette is snapshotted;
- ordered Case Assets are snapshotted;
- questions resolve with precedence:
  `Case-specific > primary Concept > nearest inheritable ancestor > more distant ancestor`;
- randomized question set targets three and caps at four;
- all selected questions remain visible together;
- learner reveals answers;
- learner rates the whole Case `Again` or `Good`;
- Review timestamps/snapshots persist in D1.

Internal diagnosis-bearing Case titles are masked from learners.

---

## Educational/content model decisions

The main learner-facing unit is a **Case**, not a fixed front/back card.

Important rules:

- Case stem/vignette is Case-level context.
- Assets are reusable stimuli; store image bytes once in R2 and attach to multiple Cases when needed.
- Multiple images that must be interpreted together belong to one Case.
- Alternative examples of the same condition remain separate Cases.
- Case-specific question/answer takes precedence over reusable Concept-level question for the same prompt.
- reusable Question Prompt is separate from its context-specific answer.
- later exam question parts may hint at earlier parts; no gating is required.

See `docs/CONTENT_MODEL_EXAMPLES.md` and `docs/V1_DATA_MODEL.md`.

---

## Authentication status

Better Auth 1.6.25 is configured with direct Cloudflare D1 persistence and the Admin plugin.

Completed:

- public sign-up disabled;
- `/study` requires authentication;
- `/admin` requires administrator role;
- local auth smoke test exists;
- production auth schema deployed;
- first production administrator bootstrapped;
- administrator sign-in and Admin access verified.

Next later work after pilot content:

- smallest administrator learner-account creation/management workflow;
- create a test learner;
- verify normal learner access to `/study` and denial from `/admin`.

Never store administrator credentials or `BETTER_AUTH_SECRET` in the repository or documentation.

---

## D1 / Drizzle state

The V1 learning-domain schema includes:

- Concepts and hierarchy;
- Cases with `vignette_md`;
- Case/Concept links;
- Assets and Case Assets;
- reusable Question Prompts;
- Concept Questions;
- Case Questions;
- Reviews;
- Review Questions;
- Review Assets.

Drizzle is used for the learning-domain schema. Better Auth tables remain separate direct-D1 auth tables by design.

PRs #10–#13 required no schema migration.

`scripts/seed-content.mjs` remains useful for local/tests but must not be run blindly in production because placeholder seed Asset keys do not have corresponding production R2 objects.

---

## R2 state and provenance

Private R2 is the canonical teaching-image store.

Implemented:

- `MEDIA` R2 binding;
- maximum 5 MiB per image;
- 5 GiB application-managed ceiling;
- immutable storage keys;
- upload through `putTeachingImage()`;
- orphan cleanup attempt if D1 Asset insert fails;
- authenticated `/api/assets/{assetId}/image` serving;
- MIME/ETag/private-cache handling;
- optional `source_label`, `source_url`, and `licence` metadata.

External source URLs are attribution/reference metadata only, never runtime image sources.

Unknown source is valid; never fabricate attribution.

See `docs/IMAGE_PROVENANCE.md` and `docs/R2_COST_GUARDRAILS.md`.

---

## Cloudflare resources

| Purpose | Binding | Production resource |
|---|---|---|
| Relational database | `DB` | D1 `flash-cards-db` (`ea6f3ec4-eb09-4fb1-8314-cd027436a2f8`) |
| Teaching images | `MEDIA` | R2 `flash-cards-media` |
| Static files | `ASSETS` | Workers static assets |

Worker name: `flash-cards`

Workers subdomain: `mmed-fm-flashcardstest.workers.dev`

---

## Known technical debt

- `package.json` still pins Wrangler 4.115.0 while compatibility/release work has used 4.123.0; update deliberately in a focused change.
- do not run `npm audit fix --force` casually.
- Review Asset historical serving currently depends on live Asset resolution; deactivation semantics may need later refinement.
- attribution metadata is live rather than snapshotted.
- if marks become structured, do not encode them in strings and parse them later.

---

## Validation

Before an implementation PR is considered complete:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

GitHub CI must be green before merge.
