# Flash-Cards — Version 1 Specification

_Last updated: 14 August 2026_

## 1. Purpose

Version 1 is a private medical-learning web application that proves the core case-based learning model described in `CURRENT_DESIGN.md`.

V1 deliberately prioritises a small, coherent system over sophisticated scheduling, automated marking, AI generation, or polished content management.

## 2. V1 success criteria

V1 is successful when an administrator can create structured teaching content and a learner can repeatedly study it end-to-end.

A learner must be able to:

1. sign in;
2. choose a topic/concept;
3. receive a compatible clinical Case;
4. see all images/assets belonging to that Case together;
5. see 2–4 compatible question parts;
6. reveal the answers;
7. rate the whole Case as **Again** or **Good**;
8. continue to another Case;
9. have each completed review recorded.

An administrator must be able to:

1. manage learner accounts;
2. create/edit/deactivate Concepts;
3. create/edit/deactivate Cases;
4. associate one primary Concept and optional secondary Concepts with a Case;
5. upload and order one or more images for a Case;
6. create reusable Question Prompts;
7. attach a Question Prompt to a Concept with a Concept-specific answer;
8. optionally allow a Concept question to be inherited by descendant Concepts;
9. attach a Question Prompt directly to a Case with a Case-specific answer;
10. inspect basic learner review history.

## 3. Stack decision

V1 will use one full-stack SvelteKit application deployed to Cloudflare Workers.

```text
GitHub
└── SvelteKit application
    ├── Learner UI
    ├── Admin UI
    ├── Server-side learning logic
    ├── Better Auth
    ├── Drizzle ORM
    │   └── Cloudflare D1
    └── Asset service
        └── Cloudflare R2
```

### Chosen components

- **SvelteKit** — full-stack web framework and routing/UI layer.
- **Cloudflare Workers** — deployment/runtime.
- **Cloudflare D1** — relational database for V1.
- **Drizzle ORM + migrations** — schema/query layer, while keeping a later PostgreSQL migration practical.
- **Better Auth** — email/password authentication and admin/user roles.
- **Cloudflare R2** — image/object storage.

TypeScript may be used where the selected libraries and generated Cloudflare bindings benefit from it. The application should avoid unnecessary framework layers or a separate API service.

## 4. Authentication and roles

V1 has two roles:

- `admin`
- `user` (learner)

The application is private.

For V1:

- public self-registration is disabled;
- an initial administrator is bootstrapped during setup;
- administrators create learner accounts;
- learners sign in with email and password;
- learner routes require a valid session;
- admin routes require the admin role.

Password-reset email delivery is not required for the first local/demo milestone. It can be added before wider learner rollout.

## 5. Core learning objects

### Concept

A generic medical topic, diagnosis, sign, investigation pattern, procedure, or learning objective.

Concepts may have one parent Concept.

### Case

The learner-facing study unit.

A Case contains the clinical context presented together in one review attempt.

A Case has:

- a title/internal label;
- optional vignette/context;
- one primary Concept;
- optional secondary Concept links;
- zero or more ordered Assets.

The **primary Concept** drives reusable question selection in V1. Secondary Concept links are available for taxonomy/search/analytics but do not automatically contribute questions.

This rule keeps comparison and multi-diagnosis Cases representable without accidentally mixing incompatible question banks.

### Asset

A reusable piece of stimulus material.

V1 learner rendering supports image Assets. The schema should retain a generic `type` field so later versions can support other stimulus types without redesigning the Case relationship.

A Case can contain multiple Assets. All active Assets linked to the Case are shown together in configured order.

### Question Prompt

Reusable question wording, for example:

- `Describe this ECG.`
- `What is the diagnosis?`
- `What is the immediate management?`

The prompt is deliberately separated from the answer.

### Concept Question

Links a Question Prompt to a Concept and stores the answer that is correct for that Concept.

It can optionally be marked as inheritable by descendant Concepts.

Example:

```text
Prompt: What is the preferred reperfusion strategy?
Concept: STEMI
Answer: ...
Inherit to descendants: yes
```

### Case Question

Links a Question Prompt directly to a Case and stores the answer for that exact Case.

This supports:

- Case-only questions;
- reusable prompts whose answer changes with the image or vignette;
- explicit overrides of a broader Concept question.

Example:

```text
Prompt: Describe this ECG.
Case A answer: ...
Case B answer: ...
Case C answer: ...
```

## 6. Question eligibility and answer precedence

For a selected Case, V1 builds an eligible question pool from:

1. active Case Questions attached directly to that Case;
2. active Concept Questions attached to the Case's primary Concept;
3. active Concept Questions attached to ancestor Concepts only when the relationship explicitly permits inheritance to descendants.

Secondary Concepts do not automatically add questions in V1.

If the same Question Prompt appears through more than one route, use this precedence:

```text
Case-specific answer
    > nearest Concept answer
    > inherited ancestor Concept answer
```

Only one instance of a Question Prompt may appear in a review.

## 7. Question selection

The system chooses a target of **3 questions per Case** by default.

Rules:

- minimum shown: 1 if only one eligible question exists;
- normal target: 3;
- maximum shown: 4;
- questions are selected randomly from the eligible pool;
- question display order is randomised;
- all selected questions are visible together;
- no pre-diagnosis/post-diagnosis gating is used.

The exact prompt and resolved answer shown in an attempt are snapshotted into the review history so later content edits do not rewrite historical learner records.

V1 does not implement question weighting, difficulty, automated free-text grading, or mastery at individual question level.

## 8. Case selection

When the learner selects a Concept/topic:

1. identify active Cases whose primary Concept is that Concept or a descendant Concept;
2. choose one Case at random;
3. avoid immediately repeating the same Case when another eligible Case exists;
4. construct the eligible question pool;
5. create the review attempt and its question snapshots.

V1 does not implement FSRS or spaced-repetition intervals.

The review history is deliberately structured so a scheduling algorithm can be added later without changing the content model.

## 9. Learner workflow

```text
/sign-in
   ↓
/study
   ↓
Choose Concept/topic
   ↓
/study/[review-id]
   ├── vignette
   ├── all Case images
   ├── selected questions
   └── Reveal answers
          ↓
       Again / Good
          ↓
       Next Case
```

### Study screen behaviour

Before reveal:

- show vignette/context;
- show all Case Assets in order;
- show all selected questions;
- do not show answers.

After reveal:

- keep the Case and questions visible;
- display the resolved answer beneath each question;
- enable `Again` and `Good`.

A completed rating finalises the review.

## 10. Admin workflow

V1 admin routes can be visually simple and form-based.

### Concepts

- list/search Concepts;
- create/edit Concept;
- choose optional parent;
- activate/deactivate.

### Cases

- list/search Cases;
- create/edit title and vignette;
- choose primary Concept;
- attach optional secondary Concepts;
- activate/deactivate;
- upload images;
- order images;
- add optional image caption/alt text.

### Questions

- create/edit reusable Question Prompt;
- attach to Concept with answer;
- toggle descendant inheritance;
- attach directly to Case with Case-specific answer;
- activate/deactivate relationships.

### Users/progress

- create learner accounts;
- list learners;
- inspect recent reviews;
- show counts of `Again` and `Good` by learner and Concept.

No sophisticated dashboard is required.

## 11. Content editing rules

Historical data must remain interpretable.

Therefore:

- content records should normally be deactivated instead of hard-deleted;
- completed reviews store prompt and answer snapshots;
- R2 object keys are stored in the database rather than embedding provider URLs into learning records;
- Asset metadata should leave room for source/licensing information.

Markdown/plain text is sufficient for vignette, prompt, answer, and captions in V1.

## 12. Out of scope for V1

The following are explicitly deferred:

- FSRS or Anki-equivalent scheduling;
- AI-generated questions or answers;
- automated marking of free text;
- per-question learner rating;
- branching question flows;
- diagnosis gating;
- gamification;
- leaderboards;
- notifications;
- payments/subscriptions;
- mobile applications;
- offline mode;
- institutional multi-tenancy;
- complex cohort analytics;
- sophisticated question weighting;
- bulk Anki import;
- automatic medical taxonomy generation;
- image cropping/masking editor;
- WYSIWYG rich-text editor.

## 13. V1 acceptance test

A minimal end-to-end acceptance test should use at least:

- one parent Concept, e.g. `STEMI`;
- one child Concept, e.g. `Anterior STEMI`;
- at least two alternative Cases under the child Concept;
- one Case with multiple Assets displayed together;
- one inherited general Concept question;
- one child-specific Concept question;
- one reusable prompt with different Case-specific answers;
- one Case-only question;
- two learner accounts and one admin account.

The application passes V1 acceptance when both learners can complete multiple reviews, receive valid randomised question combinations, rate each Case, and the administrator can inspect the resulting review history.

## 14. Implementation order

Implementation should proceed in this order:

1. application scaffold and local development;
2. D1/Drizzle schema and migrations;
3. Better Auth and route protection;
4. seed/demo content;
5. learner study flow;
6. review recording;
7. minimal admin content management;
8. R2 upload/display;
9. basic progress view;
10. Cloudflare deployment and acceptance test.

See `V1_DATA_MODEL.md` and `IMPLEMENTATION_PLAN.md` for implementation detail.
