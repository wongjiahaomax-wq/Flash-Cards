# Flash-Cards agent handover

_Refreshed: 15 August 2026_

## Current outcome

The project has a working end-to-end V1 learner vertical slice, a first-pass Admin CMS, the optional alternative-stimulus content model, and the merged multi-Topic learner-routing milestone from PR #18.

Recent merged milestones:

```text
PR #7  — D1-backed learner Reviews
PR #8  — protected R2 teaching-image pipeline
PR #9  — browser-based admin Case/Asset/question management
PR #10 — Admin shell + Case management redesign
PR #11 — Questions Library
PR #12 — Image/Asset Library
PR #13 — Topics dashboard
PR #14 — optional alternative stimulus groups
PR #17 — multi-Topic Case study-route architecture documentation
```

Recent multi-Topic learner-routing milestone:

```text
PR #18 — Add multi-Topic learner study routing — merged and deployed
```

The next milestone is Admin authoring for the existing multi-Topic Case relationship model, plus a separate manual production taxonomy operator.

Important later `main` work includes deployment of reviewed D1 migrations and CI configuration that runs on pull requests.

The production Worker is:

<https://flash-cards.mmed-fm-flashcardstest.workers.dev/>

Do not assume every newest `main` commit or draft-PR change is deployed unless deployment is explicitly verified.

---

## Current authoring model

Read first:

```text
docs/AUTHORING_MODEL.md
docs/MULTI_TOPIC_STUDY_ROUTES.md
docs/STIMULUS_GROUPS_DESIGN.md
docs/CONTENT_MODEL_EXAMPLES.md
docs/V1_DATA_MODEL.md
docs/AGREED_PRODUCTION_TAXONOMY_OPERATOR.md
```

The product-facing hierarchy is:

```text
Topic
└── Case
    └── Stimulus / alternative stimulus
```

A **Topic** is the administrator-facing name for the existing Concept model. Do not add a parallel `topics` table for this hierarchy.

A **Case** is one coherent clinical presentation. Different stems, causes, findings, or educational intent should normally be separate Cases even when they belong to the same Topic.

A Case may have multiple attached Topics through the existing `case_concepts` relationship. One Topic remains `primary` as the canonical/default administrative classification; attached `secondary` Topics are additional learner routes. The Admin Case editor now exposes these relationships and supports add, remove, primary change, and secondary promotion while preserving valid routes.

A **stimulus** is what the learner sees within that Case. Fixed images appear in every Review of the Case. Alternative image sets are used when the Case remains the same but an example image may vary between attempts.

Question-placement rule:

> Attach a question at the highest level where its answer remains correct.

The contextual layers are:

```text
Topic question
    ↓
Case question
    ↓
Alternative-set question (advanced)
    ↓
Exact-image question
```

Example:

```text
Topic: Hypocalcaemia

├── shared Topic questions
│
├── Case: Post-thyroidectomy hypocalcaemia
│   ├── distinct stem
│   ├── Case questions
│   └── alternative ECG images
│       ├── ECG A + exact-image questions
│       └── ECG B + exact-image questions
│
└── Case: Vitamin-D-deficiency hypocalcaemia
    ├── different stem
    ├── different contextual questions
    └── its own stimuli
```

The existing Case/Topic relationship already supports this hierarchy and multi-Topic Case membership. The only new schema required for PR #18 is additive Review provenance (`reviews.study_concept_id`).

---

## Current branch / PR

PR #18 implements the first learner-facing multi-Topic Case milestone documented in `MULTI_TOPIC_STUDY_ROUTES.md`. The current follow-up branch adds the missing Admin authoring workflow.

It does:

- allow any attached primary or secondary Case Topic to make a Case learner-eligible;
- deduplicate Case candidates before random selection so multiple matching relationships do not add weight;
- resolve one deterministic Study Concept for each selected Case;
- use the Study Concept, not automatically the Case default Topic, for reusable Topic questions and ancestor inheritance;
- preserve both canonical/default and Study Topic provenance on each Review;
- preserve existing stimulus selection, question coverage, snapshots, and repeat avoidance;
- make the smallest Admin default-topic safety fix needed to preserve attached Topic routes.

It does **not** implement any Asset/Stimulus→Topic relationship.

---

## Admin product state

Primary navigation:

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
- primary/default Topic editing;
- vignette/stem editing;
- Case question add/edit/remove/reorder;
- optional save-as-reusable Topic question;
- image upload through the protected R2 pipeline;
- clipboard paste, drag/drop, and file picker where supported by the existing upload surfaces;
- attach existing Assets without re-upload;
- Asset reorder/detach;
- Case-specific captions;
- learner Study preview;
- optional alternative image sets;
- start a new alternative set directly from a fixed Case image in one action;
- convert another fixed Case image into an existing alternative set;
- add/deactivate/reorder alternative options;
- exact-image contextual questions;
- alternative-set contextual questions;
- per-set stimulus-specific question coverage;
- configurable Case question selection: Automatic / all eligible / Choose N.

The Case editor now labels the canonical/default Topic separately from Additional Study Topics. It can add active secondary Topics, remove secondary relationships, promote a secondary to primary, and change the primary while preserving the old primary as secondary. Existing inactive relationships remain visible with inactive status.

The underlying implementation continues to use `concepts` and stimulus-group tables, but ordinary Admin language should prefer Topic, Case, fixed image, alternative image, and image-specific question.

### Questions Library

Implemented:

```text
/admin/questions
/admin/questions/[promptId]
```

Capabilities include:

- search Question Prompt and current active contextual answer text;
- Topic/scope filtering;
- current active usage counts;
- Case and Concept/Topic usage inspection;
- context-specific answers;
- inherited Topic-question state;
- Case editor links;
- blast-radius display and explicit confirmation before editing a reused shared prompt;
- stale-usage protection using a consistent definition of active usage.

Stimulus-specific questions extend the same reusable-prompt/context-specific-answer principle rather than introducing another prompt system.

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
- deterministic sorting;
- added-date display;
- compact multi-Topic context;
- protected preview;
- Asset metadata editing;
- usage count and Case links;
- dedicated upload surface using the protected R2 pipeline.

`assets.original_filename` is intentionally the administrator-editable image name.

Renaming changes D1 metadata only and must never rename, move, copy, replace, or delete the R2 object/key.

Case-specific captions and stimulus-option captions remain contextual rather than global Asset metadata.

### Topics dashboard

Implemented:

```text
/admin/topics
/admin/topics/[conceptId]
```

Capabilities include:

- Topic name search;
- active primary-Case counts;
- active reusable Topic-question counts;
- Topic detail with primary Cases;
- Topic-specific reusable answers and prompt links;
- `inherit_to_descendants` visibility;
- parent Topic and direct-child navigation;
- inactive/historical relationship visibility for orientation.

The Admin Topics dashboard remains a taxonomy browsing surface; multi-Topic Case relationship authoring lives on the Case editor.

Sophisticated hierarchy management remains deferred.

---

## Learner flow

`/study` is D1-backed.

Current learner behaviour in PR #18:

1. learner selects a Topic/Concept;
2. system includes that active Topic and its active descendants;
3. active Cases may qualify through any matching `case_concepts` relationship, primary or secondary;
4. matching relationships are deduplicated by Case ID and one deterministic Study Concept is resolved per candidate;
5. persisted Review history is used for immediate-repeat avoidance where possible;
6. fixed Case Assets are loaded;
7. one active option is selected from each active stimulus group;
8. reusable Topic questions resolve from the Study Concept and its inheritable ancestors;
9. Case/group/exact-option questions resolve with contextual precedence;
10. stimulus-specific coverage guarantees and Case question-selection mode are applied;
11. Case, Topics, stimuli, prompts, contextual answers, ordering, and provenance are snapshotted;
12. learner reveals answers and rates the whole Case `Again` or `Good`.

Internal diagnosis-bearing Case titles are masked from learners.

Refreshing or revisiting an existing Review must never re-randomize the selected stimuli.

Current precedence:

```text
selected stimulus option
> stimulus group
> Case
> Study Topic/Concept
> nearest inheritable ancestor of Study Topic/Concept
> more distant eligible ancestor
```

`primary_concept_id` is the canonical/default Topic of the selected Case at Review creation. `study_concept_id` is the attached Topic lens that generated reusable Topic questions for that Review.

---

## Educational/content model decisions

Important rules:

- Case stem/vignette is Case-level context.
- Topic questions are reusable knowledge shared across compatible Cases.
- A Case may have multiple learner Topics only when every valid stimulus configuration remains a legitimate example of every attached Topic.
- One attached Topic remains canonical/default; all valid attached Topics may be learner routes.
- Do not automatically mix reusable questions from every Topic attached to a Case; only the Study Topic and its inheritable ancestors contribute that reusable layer.
- Create separate Cases when the clinical context or educational intent differs.
- Use optional alternative stimuli when the Case is genuinely the same but an example stimulus can vary.
- Assets are reusable global media; store image bytes once in R2.
- Multiple fixed images that must be interpreted together may remain fixed on one Case.
- A Case may have several independent alternative groups, such as one ECG group plus one X-ray group.
- Existing/imported Cases do not need stimulus-group or secondary-Topic metadata; enrichment should emerge later when useful.
- Questions do not belong globally to an Asset; exact-image relationships belong to the Case/group/option context.
- Later exam question parts may hint at earlier parts; no gating is required.
- Case question count and per-group stimulus-specific coverage are configurable.
- More-specific contextual answers override less-specific ones for the same reusable Question Prompt.

For Anki/manual migration, prefer progressive enrichment:

```text
import/create normal Topic + Case
-> preserve existing questions
-> attach images normally
-> add secondary Case Topics later when cross-topic reuse becomes clear
-> group images later when interchangeability becomes clear
-> add only genuinely image-specific questions
```

---

## D1 / Drizzle state

Learning-domain schema includes:

- Concepts/Topics and hierarchy;
- Cases with `vignette_md`, question-selection mode, and optional question count;
- Case/Concept links with `primary`/`secondary` roles;
- Assets and fixed Case Assets;
- reusable Question Prompts;
- Concept/Topic Questions;
- Case Questions;
- stimulus groups and options;
- group-level and option-level contextual questions;
- Reviews with canonical/default and Study Concept provenance;
- Review Questions with contextual source provenance;
- Review Assets with selected stimulus provenance.

Drizzle is used for the learning-domain schema. Better Auth tables remain separate direct-D1 auth tables by design.

Migration `0002_optional_stimulus_groups.sql` implements stimulus groups. PR #18 adds `0003_multi_topic_study_routing.sql`, which conservatively rebuilds `reviews`, adds non-null `study_concept_id`, and backfills historical Reviews with `study_concept_id = primary_concept_id` while preserving Review snapshots.

Do not modify production D1 directly from PR #18.

Do not add a new Topic schema, `asset_concepts`, or `stimulus_option_concepts` solely to implement multi-Topic Case study routes.

`scripts/seed-content.mjs` remains useful for local/tests but must not be run blindly in production because placeholder seed Asset keys do not have corresponding production R2 objects.

### Admin multi-Topic authoring and agreed production taxonomy

The current Admin Case editor maintains these invariants for active Cases:

- exactly one primary/default Topic;
- every primary Topic is an active `case_concepts` relationship;
- no duplicate Case↔Topic relationship;
- secondary Topics are additional learner Study routes, not generic tags;
- primary changes and secondary promotion preserve the old relationship as secondary;
- secondary removal never removes the primary relationship;
- inactive historical Topic relationships remain visible but inactive Topics are not offered for new attachments.

The agreed production example is:

```text
Electrolyte Disorders
├── Hypercalcemia
└── Hypocalcemia

Cardiology
└── ECG Findings
    ├── Short QTc
    └── Prolonged QTc

Hypercalcemia Case: primary Hypercalcemia, secondary Short QTc
Hypocalcemia Case: primary Hypocalcemia, secondary Prolonged QTc
```

Apply this production change only through the manually triggered `.github/workflows/apply-agreed-production-taxonomy.yml` workflow. It invokes `scripts/apply-agreed-taxonomy.mjs`, which performs a fixed pre-flight read, an idempotent transactional update when explicitly approved, and a post-flight read-back. It requires the separate least-privilege `CLOUDFLARE_D1_WRITE_TOKEN`; never broaden `CLOUDFLARE_D1_READ_TOKEN`. For recovery, stop after a failed pre-flight or verification, inspect the read-back, and restore the prior two Case relationships and Topic parents through a reviewed operator change—never by adding free-form SQL to Actions.

---

## Authentication status

Better Auth is configured with direct Cloudflare D1 persistence and the Admin plugin.

Completed:

- public sign-up disabled;
- `/study` requires authentication;
- `/admin` requires administrator role;
- local auth smoke test exists;
- production auth schema deployed;
- first production administrator bootstrapped;
- administrator sign-in and Admin access verified.

Later work:

- smallest administrator learner-account creation/management workflow;
- create a test learner;
- verify learner access to `/study` and denial from `/admin`;
- basic learner-progress administration.

Never store administrator credentials or `BETTER_AUTH_SECRET` in the repository or documentation.

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

Stimulus grouping and multi-Topic routing must not change R2 keys or copy/move stored objects.

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

## Known technical debt / deferred work

- Asset/Stimulus→Topic routing remains deliberately deferred unless real content proves it necessary;
- Review Asset historical serving currently depends on live Asset resolution; deactivation semantics may need later refinement;
- attribution metadata is live rather than snapshotted;
- if marks become structured, do not encode them in strings and parse them later;
- curriculum collections, manual Case ordering inside a Topic, or Topic-specific learner settings could justify future schema additions; multi-Topic Case routing itself does not.

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
