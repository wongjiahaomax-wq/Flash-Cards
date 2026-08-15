# Flash-Cards agent handover

_Refreshed: 15 August 2026_

## Current outcome

The project has a working end-to-end V1 learner vertical slice and a complete first-pass Admin CMS.

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

A later Image Library refinement on `main` added Topic filtering, deterministic sorting, added-date display, and compact Topic context.

The production Worker is:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

Do not assume every newest `main` commit is deployed unless deployment is explicitly verified.

---

## Current next phase

Pilot-content modelling has identified a concrete content-model requirement that should now be implemented before larger content entry:

**optional alternative stimulus groups with stimulus-specific contextual questions/answers.**

Read:

```text
docs/STIMULUS_GROUPS_DESIGN.md
docs/CONTENT_MODEL_EXAMPLES.md
docs/V1_DATA_MODEL.md
docs/IMPLEMENTATION_PLAN.md
```

The key principle is:

> Stimulus grouping is an optional, emergent enrichment of ordinary Case content. It must not become a prerequisite for Anki import or routine Case entry.

A Case can remain simple:

```text
Case + fixed Assets + Case/Concept questions
```

When real content shows that several stimuli are interchangeable, an administrator can group them later.

Concrete motivating examples:

- Hypercalcaemia Case with several shortened-QTc ECGs, where some tracings have additional findings such as Osborn waves;
- Multiple myeloma with hypercalcaemia, where a Review may select one ECG from an ECG group plus one X-ray from an independent X-ray group.

After this focused model extension:

1. continue representative pilot content entry;
2. fix concrete Admin friction exposed by real use;
3. implement the smallest learner-account administration workflow;
4. verify learner role boundaries;
5. implement basic learner-progress administration;
6. only later reassess FSRS, bulk Anki import automation, richer analytics, structured marks, or advanced hierarchy tools.

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

The next stimulus-group milestone should extend the existing Case editor rather than creating a parallel content-management surface.

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

Current active Case usage requires:

- `question_prompts.is_active`;
- `case_questions.is_active`;
- `cases.is_active`.

Current active Concept usage requires:

- `question_prompts.is_active`;
- `concept_questions.is_active`;
- `concepts.is_active`.

Inactive/historical usages may still appear on detail pages for inspection but do not inflate current active counts.

Stimulus-specific questions should extend the existing reusable-prompt/context-specific-answer principle rather than introduce a separate prompt system.

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
- Topic filtering derived from Case primary Topics;
- used/unused, active/inactive, and source-known/source-unknown filters;
- deterministic sorting including newest/oldest/name/usage;
- added-date display;
- compact multi-Topic context;
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

Case-specific captions remain contextual rather than global Asset metadata.

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
- all active ordered Case Assets are currently snapshotted;
- questions resolve with precedence:
  `Case-specific > primary Concept > nearest inheritable ancestor > more distant ancestor`;
- randomized question set currently targets three and caps at four;
- all selected questions remain visible together;
- learner reveals answers;
- learner rates the whole Case `Again` or `Good`;
- Review timestamps/snapshots persist in D1.

Internal diagnosis-bearing Case titles are masked from learners.

Planned stimulus-aware Review order:

```text
select Case
-> select one option from each active stimulus group
-> resolve contextual questions using selected options
-> satisfy configured stimulus-specific coverage
-> fill the configured question count
-> snapshot everything atomically
```

Refreshing a Review must never re-randomize its selected stimuli.

---

## Educational/content model decisions

The main learner-facing unit is a **Case**, not a fixed front/back card.

Important rules:

- Case stem/vignette is Case-level context.
- Assets are reusable stimuli; store image bytes once in R2 and attach/reuse metadata rather than duplicating media.
- Multiple fixed images that must be interpreted together belong to one Case.
- Create separate Cases when clinical context or educational intent differs.
- When the Case is genuinely the same but an example stimulus can vary, use an optional alternative stimulus group.
- A Case may eventually have several independent stimulus groups, such as one ECG group plus one X-ray group.
- Existing/imported Cases do not need stimulus-group metadata; grouping should emerge later when useful.
- reusable Question Prompt wording is separate from contextual answers.
- planned contextual precedence is:
  `selected stimulus option > stimulus group > Case > primary Concept > nearest inheritable ancestor > more distant ancestor`.
- questions do not belong globally to an Asset; stimulus-specific question relationships belong to the Case/group/option context.
- later exam question parts may hint at earlier parts; no gating is required.
- Case question count should become configurable rather than permanently capped at four.
- per-group stimulus-specific question coverage should be configurable rather than permanently hard-coded.

See `docs/STIMULUS_GROUPS_DESIGN.md`, `docs/CONTENT_MODEL_EXAMPLES.md`, and `docs/V1_DATA_MODEL.md`.

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

Next later work after the current content-model milestone:

- smallest administrator learner-account creation/management workflow;
- create a test learner;
- verify normal learner access to `/study` and denial from `/admin`.

Never store administrator credentials or `BETTER_AUTH_SECRET` in the repository or documentation.

---

## D1 / Drizzle state

The current learning-domain schema includes:

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

The stimulus-group milestone will require an **additive reviewed migration**. Existing Cases without grouping must remain valid and unchanged in behaviour.

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

Stimulus grouping must not change R2 keys or copy/move stored objects.

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
