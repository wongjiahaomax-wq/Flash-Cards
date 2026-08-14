# Flash-Cards — Current Design Summary

_Last updated: 14 August 2026_

## Purpose of this document

This is a living design summary for the Flash-Cards project. It records the current educational model, technical direction, assumptions, and open questions before we lock down a formal Version 1 specification.

The aim is to keep the project simple enough to build as a low-cost demo while preserving a data model that can later support more sophisticated medical case-based learning.

---

## 1. Product goal

Build a private medical learning web application where:

- learners log in and review image-based medical questions;
- an administrator can add and edit conditions, images, questions, and answers;
- learner progress is recorded;
- images and questions can be reused and dynamically combined rather than permanently fixed into traditional front/back flashcards;
- the system can later support smarter scheduling, richer analytics, and more sophisticated question selection.

The initial use case is ECG teaching, but the design should not be ECG-specific. The same model should later work for radiographs, dermatology images, clinical photographs, diagrams, laboratory results, and other medical stimuli.

---

## 2. Core educational idea

The application should **not treat a flashcard as a permanently fixed image + question + answer**.

Instead, the system stores reusable educational objects separately and assembles a study item dynamically.

Conceptually:

```text
Condition / topic
      +
Image or stimulus
      +
Eligible question
      +
Correct answer for that context
      =
Study item shown to learner
```

This allows the same concept to be tested using different examples and reduces memorisation of a particular fixed card.

---

## 3. Condition hierarchy

Conditions should support parent/child relationships.

Example:

```text
Acute coronary syndrome
└── STEMI
    ├── Anterior STEMI
    ├── Inferior STEMI
    └── Lateral STEMI
```

This hierarchy allows a more specific condition to inherit appropriate questions from a broader condition.

For example, an **Anterior STEMI** case may be eligible for:

- general STEMI questions;
- anterior-STEMI-specific questions;
- questions specific to the exact ECG being displayed.

---

## 4. Reusable image pools

A condition can have multiple images.

Example:

```text
Anterior STEMI
├── ECG 001
├── ECG 002
└── ECG 003
```

The learner should not always see the same ECG for a given learning objective.

For example, the learner may be asked "What is the diagnosis?" with ECG 001 today and ECG 003 during a later review.

This is intended to test recognition of the underlying condition rather than memorisation of one image.

---

## 5. Reusable question pools

Questions are stored separately from images wherever possible.

Example general STEMI questions:

- What is the immediate management?
- What reperfusion strategy is preferred?
- What important complications should be considered?

Example anterior-STEMI-specific questions:

- Which coronary artery is most likely involved?
- Which territory is affected?
- What ECG leads are typically involved?

These questions can potentially be paired with multiple compatible images.

---

## 6. Three question scopes

The current model recognises at least three important scopes of question.

### A. General condition questions

Apply to a broad condition.

Example:

> What is the preferred reperfusion strategy for STEMI?

This can be asked in the context of anterior, inferior, or other STEMI images.

### B. Subtype-specific questions

Apply only to a more specific condition.

Example:

> Which coronary artery is most commonly involved in anterior STEMI?

This belongs to the anterior STEMI question pool rather than every STEMI case.

### C. Image-specific questions

Apply only to one particular image or stimulus.

Example:

> What additional conduction abnormality is present on this ECG?

If only one ECG demonstrates that abnormality, the question must never be presented with another ECG.

---

## 7. Image-dependent answers

A major requirement is that the **same question wording may have a different correct answer depending on the image**.

For example, the prompt:

> Describe this ECG.

may be reused across many ECGs, but the answer is necessarily image-specific.

Example:

```text
Prompt: Describe this ECG.

ECG A
→ ST elevation in V1–V4 with reciprocal inferior ST depression.

ECG B
→ Hyperacute anterior T waves with subtle anterior ST elevation.

ECG C
→ Extensive anterior ST elevation with associated right bundle branch block.
```

Therefore the data model must distinguish between:

1. the reusable **question prompt**; and
2. the **question–image pairing**, which can contain an image-specific answer.

This avoids duplicating the same prompt dozens of times while still allowing the correct answer to depend on the image.

---

## 8. Proposed compatibility model

For a particular image, the system can build an eligible question pool from several sources.

Example for an anterior STEMI ECG:

```text
Questions explicitly linked to this ECG
              +
Questions linked to Anterior STEMI
              +
Questions inherited from STEMI
              =
Eligible question pool
```

The question-selection engine can then choose from that pool according to the study mode and learner history.

For the initial demo this selection can be simple and random. More sophisticated weighting can come later.

---

## 9. Example generated learning session

Suppose Anterior STEMI has three ECG images, five anterior-STEMI-specific questions, and several inherited general STEMI questions.

A learner could receive:

```text
ECG 002

Question:
Which coronary artery is most likely involved?
```

Later:

```text
ECG 001

Question:
What is the preferred reperfusion strategy?
```

And later:

```text
ECG 003

Question:
Describe the ECG.
```

The last question may use an answer stored specifically for the ECG 003 + "Describe this ECG" pairing.

A future version may keep one image on screen and ask a small group of questions, for example:

- one image-specific question;
- one subtype-specific question;
- one general condition question.

This is not required for the first demo, but the data model should not prevent it.

---

## 10. Learner progress

The initial learner rating system should remain simple.

Proposed first version:

- **Again** — learner did not know the answer;
- **Good** — learner knew the answer.

A more complex Anki/FSRS-style scheduler can be added later.

Progress may need to be tracked differently depending on the type of question.

### Concept-level question

Example:

> What is the preferred reperfusion strategy for STEMI?

Performance may primarily represent mastery of the question/concept itself, regardless of which compatible STEMI image was displayed.

### Image-dependent question

Example:

> Describe this ECG.

Performance should include the image context because successfully describing ECG A does not prove the learner can describe ECG B.

Therefore review records should be capable of storing at least:

```text
Learner
Question
Image/stimulus used
Result
Date/time
```

The scheduling/mastery model can be refined after testing real examples.

---

## 11. Current likely data objects

The exact database schema is not yet final, but the current conceptual objects are:

### User / Learner

Stores learner identity and role.

### Condition

Stores conditions/topics and optional parent-child hierarchy.

### Image / Stimulus

Stores the medical image and its associated condition(s) or classification.

Although ECG is the initial example, this should remain a generic `stimulus` concept where practical so future cases can include other media or clinical data.

### Question Prompt

Stores reusable question wording such as:

> Describe this ECG.

### Condition–Question relationship

Defines questions that are valid for a condition or subtype.

### Image–Question relationship

Defines questions valid for a specific image and can hold the correct answer for that exact image/question combination.

### Review / Attempt

Records what the learner was shown and how they rated/performed on it.

### Learner Progress

Stores scheduling/mastery information derived from review history.

---

## 12. Administration requirements

Eventually the administrator should be able to manage content without editing code.

Likely functions include:

- create/edit/deactivate conditions;
- create condition hierarchies;
- upload images;
- assign images to conditions;
- create reusable question prompts;
- attach questions to conditions;
- attach questions to individual images;
- enter image-specific answers where required;
- review learner progress.

For the demo, the administrator interface can be simple. A polished custom admin portal is not required initially.

Questions/content should preferably be deactivated rather than permanently deleted so historical learner review records remain meaningful.

---

## 13. Existing Anki material

Existing Anki material should be treated as seed content and as a source of real-world examples against which to test this model.

The ECG deck examined so far contains many case-style cards combining:

- a clinical vignette;
- an ECG image;
- multiple related questions;
- combined answers;
- diagnostic/topic tags.

Common question types observed include:

- ECG description;
- diagnosis;
- causes/risk factors;
- differential diagnosis;
- investigations;
- management;
- pathophysiology;
- complications/clinical consequences.

The intention is **not** simply to recreate these Anki cards one-for-one. We should use the existing material to identify the underlying reusable images, concepts, prompts, answers, and relationships.

A future importer may help migrate existing `.apkg` content into the new system, followed by administrator cleanup where a multi-question Anki card needs to be split into structured questions.

---

## 14. Version 1 / demo philosophy

The demo should prove the core educational idea with the fewest moving parts possible.

A likely first learner workflow is:

```text
Login
  ↓
Choose topic/condition
  ↓
System chooses a compatible image
  ↓
System chooses one eligible question
  ↓
Learner thinks of answer
  ↓
Show answer
  ↓
Again / Good
  ↓
Next item
```

The demo does **not** initially need:

- sophisticated FSRS scheduling;
- AI-generated questions;
- gamification;
- leaderboards;
- payments/subscriptions;
- mobile apps;
- offline mode;
- institutional multi-tenancy;
- sophisticated cohort analytics;
- custom notifications;
- complicated question weighting;
- a highly polished administrator interface.

These can be considered after the core model is validated.

---

## 15. Current technical direction

### Demo / budget phase

Use a low-cost Cloudflare-based stack:

```text
GitHub
│
└── Application
    ├── Web interface
    ├── Learning/question-selection logic
    ├── Database abstraction
    │   └── Cloudflare D1
    ├── Authentication
    │   └── Better Auth
    └── Storage abstraction
        └── Cloudflare R2
```

The intention is to keep the demo close to zero infrastructure cost where possible.

### Future production option

Supabase remains a possible later migration target:

```text
Database abstraction
└── Supabase PostgreSQL

Storage abstraction
└── Supabase Storage
```

The project should therefore minimise Cloudflare-specific assumptions in the core medical-learning logic.

---

## 16. Migration-friendly principles

To make a later Cloudflare → Supabase migration practical:

- keep the learning model independent of the infrastructure provider;
- use conventional relational database structures;
- avoid unnecessary database-vendor-specific features;
- keep database schema changes in version-controlled migration files;
- store image keys/identifiers rather than hard-coding provider-specific URLs throughout the learning data;
- isolate storage operations behind a small application layer;
- keep authentication identity separate from the learner's medical-learning/profile records;
- keep question-selection and scheduling logic in application code rather than tying it to a particular database service.

Drizzle is currently being considered as the database access layer because it can work with both SQLite/D1 and PostgreSQL, although this choice is not yet permanently locked in.

---

## 17. Current project status

Completed:

- GitHub account connected to ChatGPT;
- private repository created: `wongjiahaomax-wq/Flash-Cards`;
- Python/Django-era `.gitignore` was added early in the project and can be revised when the final JavaScript/Cloudflare project structure is created;
- first Anki ECG package reviewed for educational structure;
- core reusable image/question concept identified;
- image-specific questions and answers identified as a required feature;
- Cloudflare-first, migration-aware technical direction agreed in principle.

Not yet done:

- formal V1 specification;
- final database schema;
- final frontend framework/library decision;
- Cloudflare project setup;
- authentication setup;
- D1 database creation;
- R2 image storage setup;
- learner interface;
- admin interface;
- scheduling engine;
- Anki importer.

---

## 18. Model assumptions to challenge with more Anki examples

Before locking the database schema or V1 specification, additional real cards should be reviewed to look for cases that the current model does not represent cleanly.

Specific blind spots to test include:

### Multiple images in one question

Can a question require comparison of two or more images rather than one image?

Examples might include serial ECGs, before/after treatment, or comparison of two diagnostic possibilities.

### One case containing several different stimulus types

A case may eventually contain an ECG plus a chest radiograph, laboratory results, vital signs, or a clinical photograph.

We need to determine whether `Image` should become a more generic `Stimulus` / `Case Asset` concept.

### Clinical vignette dependence

Some questions may depend not only on an image but also on a particular history/examination vignette.

We need to determine whether a vignette belongs to the image, to a case, or to an individual question presentation.

### Shared image but different clinical context

The same image may theoretically be usable in more than one clinical scenario. We should check whether image identity and case identity need to be separate objects.

### Questions requiring several linked answers

Some prompts may need multiple marking points rather than one answer block, for example:

> Give three causes.

This may matter if we later support self-marking by component or automated marking.

### Conditional follow-up questions

A later question may depend on the answer to an earlier question.

Example:

1. What is the diagnosis?
2. Given this diagnosis, what is the next management step?

We should determine whether question sequences/groups are required.

### Mutually incompatible inherited questions

A broad parent condition question may not actually be appropriate for every child subtype. We may need explicit inclusion/exclusion rules rather than assuming all parent questions are inherited automatically.

### Multiple valid diagnoses / ambiguity

Some real-world images may have more than one defensible interpretation. The answer model may need notes, alternative answers, or teaching commentary.

### Question wording dependent on modality

Prompts such as "Describe this ECG" are modality-specific. If the platform expands beyond ECGs, we should decide how reusable prompts are classified.

### Question difficulty and curriculum level

The same condition may need beginner, intermediate, and advanced questions. We may eventually need metadata such as difficulty, learner level, curriculum, or learning objective.

### Negative findings

Some questions may specifically test what is **not** present on an image. This may affect how image-specific answers and marking points are represented.

### Non-image questions

Some useful condition questions may not need an image at all. The architecture should not force every study item to display a medical image.

### Progress granularity

We still need to decide exactly what is being scheduled/mastered:

- the question concept;
- the image;
- the image–question pairing;
- the condition;
- or some combination of these.

Real Anki examples should help determine the most educationally meaningful level.

---

## 19. Next design step

Before writing the formal V1 specification, review additional existing Anki decks/cards and classify each example against the current model.

For each example, ask:

1. What is the underlying condition/topic?
2. What is the stimulus or case context?
3. Is the question general, subtype-specific, case-specific, or image-specific?
4. Can the prompt be reused with another image?
5. Does the answer change with the image/context?
6. Does the question require another question to come first?
7. Should learner mastery be tracked by question, image, pairing, or broader learning objective?
8. Does the example reveal a relationship or object not represented in the current design?

Any new patterns discovered should be added to this document before the database schema is finalised.
