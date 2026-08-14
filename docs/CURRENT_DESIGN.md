# Flash-Cards — Current Design Summary

_Last updated: 14 August 2026_

## Purpose of this document

This is the living design summary for the Flash-Cards project. It records the current educational model, technical direction, assumptions, and open questions before we lock down a formal Version 1 specification.

The aim is to keep the demo simple and inexpensive while preserving a data model that can later support richer case-based medical learning.

---

## 1. Product goal

Build a private medical learning web application where:

- learners log in and review medical cases;
- each case may contain one or more images/stimuli shown together;
- each case may present several related question parts;
- administrators can add/edit concepts, cases, images, questions, and answers;
- questions can be reused across compatible cases rather than permanently tied to one image;
- some questions and answers can still be specific to one case;
- learner review history and progress are recorded;
- the system can later support smarter scheduling, richer analytics, and more sophisticated question selection.

The initial material includes ECG, ENT, Eye, and Dermatology teaching content, but the design should remain generic enough for radiographs, clinical photographs, diagrams, laboratory results, and other medical stimuli.

---

## 2. Core educational model: the Case is the study unit

The application should **not treat a flashcard as a permanently fixed front + back**.

Instead, the main learner-facing unit is a **Case**.

Conceptually:

```text
Concept / topic
      ↓
Choose a Case
      ↓
Show all assets belonging to that Case
      ↓
Select several compatible questions
      ↓
Learner reviews the case and questions
      ↓
Show answers
      ↓
Again / Good
```

A case may contain:

- a clinical vignette;
- one image;
- several images that must be interpreted together;
- other contextual information later, such as laboratory results.

The database still stores individual assets and questions separately so they can be reused where appropriate.

---

## 3. Concept hierarchy

The underlying taxonomy should use a generic **Concept** rather than forcing everything to be a disease.

Concepts may include:

- diseases/diagnoses;
- syndromes;
- signs;
- investigation patterns;
- procedures/devices;
- physiological abnormalities;
- learning objectives.

Concepts can have parent/child relationships.

Example:

```text
Acute coronary syndrome
└── STEMI
    ├── Anterior STEMI
    ├── Inferior STEMI
    └── Lateral STEMI
```

This allows broader question banks to be reused by more specific cases, subject to explicit compatibility rules.

Parent-question inheritance should **not be blindly automatic**. A broad question may be made available to descendants only when appropriate.

---

## 4. Cases versus alternative examples

This distinction is fundamental.

### Multiple assets that belong together

If several images are required to understand one clinical case, they belong to **one Case** and should be presented together to the learner.

Examples:

```text
Pityriasis rosea case
├── Herald patch image
└── Later truncal eruption image
```

```text
Lichen planus case
├── Wrist lesions
└── Oral mucosal lesions
```

To the learner, these should appear as one visual stimulus, for example side-by-side or in a simple gallery.

### Alternative examples of the same condition

If several images are different patients/examples of the same concept, they should remain **separate Cases**.

Example:

```text
Anterior STEMI
├── Case A → ECG A
├── Case B → ECG B
└── Case C → ECG C
```

This is what allows the learner to see a different anterior STEMI ECG on a later attempt while still drawing from similar question banks.

### Simple rule

> **Images that must be interpreted together → one Case.**
>
> **Images that are alternative examples of the same concept → separate Cases.**

---

## 5. Assets

An **Asset** is an individual reusable piece of case material.

Initially this will usually be an image, but the term is intentionally generic.

Examples:

- ECG;
- fundoscopy image;
- dermatology photograph;
- otoscopy image;
- audiogram;
- diagram;
- later: laboratory table or another structured stimulus.

A Case may contain one or several Assets.

The learner interface should group all assets in a case into one coherent presentation.

---

## 6. Reusable question banks

Questions should be stored separately from Cases wherever possible.

A selected Case may draw questions from several sources.

For an anterior STEMI case:

```text
Case-specific questions
        +
Anterior STEMI questions
        +
Compatible general STEMI questions
        =
Eligible question pool
```

Example general STEMI questions:

- What is the immediate management?
- What reperfusion strategy is preferred?
- What important complications should be considered?

Example anterior-STEMI questions:

- Which coronary artery is most likely involved?
- Which territory is affected?
- Which ECG leads are typically involved?

Example Case-specific question:

- What additional conduction abnormality is present on this particular ECG?

---

## 7. Question scopes

The current model recognises three main scopes.

### A. General concept question

Applies to a broad concept.

Example:

> What is the preferred reperfusion strategy for STEMI?

It may be used across compatible anterior, inferior, and other STEMI cases.

### B. Subtype-specific question

Applies only to a narrower concept.

Example:

> Which coronary artery is most commonly involved in anterior STEMI?

### C. Case-specific question

Applies only to one particular case/context.

Example:

> What additional conduction abnormality is present on this ECG?

If only Case C demonstrates that abnormality, the question must not appear with Cases A or B.

---

## 8. Reusable prompts with Case-specific answers

The **same prompt may have a different correct answer for each Case**.

Example:

> Describe this ECG.

The wording can be reused, but the answer depends on the selected ECG.

```text
Case A / ECG A
→ ST elevation in V1–V4 with reciprocal inferior ST depression.

Case B / ECG B
→ Hyperacute anterior T waves with subtle anterior ST elevation.

Case C / ECG C
→ Extensive anterior ST elevation with associated right bundle branch block.
```

Therefore the system should distinguish between:

1. the reusable **Question Prompt**; and
2. the **Case–Question relationship**, which may contain a Case-specific answer override.

This model is more general than an image-specific answer because the correct answer may depend on the whole vignette or multi-image case, not just one image.

---

## 9. Several questions may be shown for one Case

The intended learner experience is now **case-based rather than one-question-per-image**.

A Case may present several question parts together.

Example:

```text
CASE: Anterior STEMI

[ ECG ]

1. Describe the ECG findings.
2. What is the diagnosis?
3. What is the likely culprit artery?
4. How would you manage this patient?

[ Show answers ]
```

The system may choose a different compatible set of questions the next time the same Case appears.

For example:

```text
Case A / ECG A

Attempt 1
- Describe the ECG.
- Which artery is involved?
- What is the immediate management?

Attempt 2
- What reciprocal changes are present?
- What complications would you monitor for?
- What reperfusion strategy is preferred?
```

The exact number of questions per case will be set in the V1 specification; approximately 2–4 is a reasonable current design assumption.

---

## 10. Question order and exam behaviour

The target examination allows learners to move back and forth between different parts of a question.

Therefore the platform **does not need pre-diagnosis/post-diagnosis gating**.

It is acceptable if a later question gives a clue to an earlier diagnosis question, because this reflects the target examination format.

For the initial version:

- all selected questions for a case can be visible together;
- the learner can review them in any order;
- we do not need branching logic or enforced sequential answering.

This deliberately simplifies the system.

---

## 11. Example: Anterior STEMI model

```text
Concept: STEMI
└── Concept: Anterior STEMI
    ├── Case A
    │   └── ECG A
    ├── Case B
    │   └── ECG B
    └── Case C
        └── ECG C
```

Potential question pools:

```text
General STEMI
- What is the immediate management?
- What reperfusion strategy is preferred?
- What complications should be considered?

Anterior STEMI
- Which artery is most likely involved?
- Which territory is affected?
- Which leads are involved?

Case A only
- What reciprocal changes are visible?
```

The Case–Question link allows the prompt `Describe this ECG` to be used with Cases A, B, and C while storing a different answer for each.

---

## 12. Learner progress

The initial rating system should remain simple:

- **Again** — learner did not know the case/questions sufficiently;
- **Good** — learner felt they knew them.

For the demo, the learner may rate the **whole Case** rather than every individual question.

However, every review record should retain enough context to support finer-grained analysis later.

At minimum:

```text
Learner
Case
Questions shown
Result/rating
Date/time
```

Later we may derive:

- mastery of a reusable question/concept;
- difficulty with a specific Case;
- performance across different examples of one condition;
- performance by question type.

We do not need to finalise sophisticated Anki/FSRS scheduling for V1.

---

## 13. Current likely data objects

The exact database schema is not yet final, but the current conceptual model is:

### User / Learner

Identity, role, and learner profile.

### Concept

Medical concepts/topics and optional parent-child relationships.

### Case

The coherent clinical study unit presented to the learner.

May contain a vignette/context and links to one or several Assets.

### Asset

An individual image or other reusable stimulus.

### Case–Asset relationship

Links one or several Assets into a Case and can later store display order/caption information.

### Question Prompt

Reusable wording such as:

> Describe this ECG.

### Concept–Question relationship

Defines reusable questions valid for a concept/subtype and whether broader questions may be reused in descendants.

### Case–Question relationship

Defines that a question is valid for a particular Case and may contain:

- a Case-specific answer override;
- future metadata such as selection weighting if required.

### Review / Attempt

Records the Case, questions shown, rating, and timestamp.

### Learner Progress

Derived scheduling/mastery information.

---

## 14. Administration requirements

The administrator should eventually be able to:

- create/edit/deactivate Concepts;
- create Concept hierarchies;
- create Cases;
- upload one or multiple Assets into a Case;
- order/group the Assets so they appear as one coherent stimulus;
- create reusable Question Prompts;
- attach questions to Concepts;
- attach questions specifically to Cases;
- enter Case-specific answer overrides;
- review learner progress.

For the demo, the admin interface can be simple. A polished custom content-management system is not required initially.

Content should preferably be deactivated rather than permanently deleted so historical review data remains meaningful.

---

## 15. Findings from existing Anki material

The existing ECG, ENT, Eye, and Dermatology decks have been used to stress-test the model.

Important patterns identified include:

- a clinical vignette plus one image;
- several images forming one coherent clinical case;
- different images representing alternative examples of the same condition;
- reusable management/causes/investigation questions;
- prompts such as `Describe this ECG` whose answers differ by Case;
- Case-specific questions that must not be mixed with other examples;
- comparison cases containing more than one diagnosis;
- investigation images such as audiograms rather than only disease photographs;
- contextual questions dependent on the vignette as well as the image;
- source images that may reveal answers through labels/text.

The Anki decks should be treated as seed content and as real-world test material, not imported blindly as fixed front/back cards.

A future importer may extract the notes, images, tags, stems, and answers, followed by administrator cleanup into the structured Case/Concept/Question model.

Original Anki tags should be preserved for traceability but should not automatically become the final medical taxonomy.

---

## 16. Current demo / V1 philosophy

The demo should prove the core educational model using the fewest moving parts possible.

Likely learner workflow:

```text
Login
  ↓
Choose topic/concept
  ↓
System chooses a Case
  ↓
Show all Assets belonging to that Case as one stimulus
  ↓
Select 2–4 compatible questions
  ↓
Learner reviews all parts
  ↓
Show answers
  ↓
Again / Good
  ↓
Next Case
```

The initial demo does **not** need:

- sophisticated FSRS scheduling;
- AI-generated questions;
- branching/sequential question logic;
- pre/post-diagnosis gating;
- automated free-text marking;
- gamification;
- leaderboards;
- payments/subscriptions;
- mobile apps;
- offline mode;
- institutional multi-tenancy;
- sophisticated cohort analytics;
- notifications;
- complex question weighting;
- a highly polished administrator interface.

These can be considered after the core model is validated.

---

## 17. Current technical direction

### Demo / budget phase

Use a low-cost Cloudflare-based stack:

```text
GitHub
│
└── Application
    ├── Web interface
    ├── Case/question-selection logic
    ├── Database abstraction
    │   └── Cloudflare D1
    ├── Authentication
    │   └── Better Auth
    └── Storage abstraction
        └── Cloudflare R2
```

The goal is to keep the demo near zero infrastructure cost where practical.

### Future production option

Supabase remains a possible later migration target:

```text
Database abstraction
└── Supabase PostgreSQL

Storage abstraction
└── Supabase Storage
```

The project should minimise Cloudflare-specific assumptions in the core learning logic.

---

## 18. Migration-friendly principles

To make a future Cloudflare → Supabase migration practical:

- keep the educational model independent of the infrastructure provider;
- use conventional relational database structures;
- avoid unnecessary vendor-specific database features;
- keep schema changes in version-controlled migration files;
- store asset keys/identifiers rather than hard-coding provider-specific URLs throughout the learning data;
- isolate storage operations behind a small application layer;
- keep authentication identity separate from learner profile/progress records;
- keep Case/question-selection and scheduling logic in application code rather than tying it to a database service.

Drizzle remains a candidate database access layer because it can work with both SQLite/D1 and PostgreSQL, but this choice is not yet permanently locked in.

---

## 19. Current project status

Completed/agreed:

- private GitHub repository created and connected to ChatGPT;
- `.gitignore` added;
- ECG Anki deck reviewed;
- ENT Anki deck reviewed;
- Eye Anki deck reviewed;
- Dermatology Anki deck reviewed;
- Case-based learner model agreed;
- multi-image single Cases agreed;
- alternative examples stored as separate Cases agreed;
- reusable question banks agreed;
- Case-specific questions and Case-specific answer overrides agreed;
- no pre/post-diagnosis gating required for the target examination;
- Cloudflare-first, migration-aware technical direction agreed in principle.

Not yet done:

- formal V1 specification;
- final database schema;
- final frontend framework/library decision;
- Cloudflare project setup;
- authentication setup;
- D1 database creation;
- R2 storage setup;
- learner interface;
- admin interface;
- scheduling engine;
- Anki importer.

---

## 20. Model assumptions to continue challenging

Before locking the V1 schema, continue testing additional Anki material against the model.

Important remaining questions include:

### Comparison Cases

Some cases may deliberately show multiple conditions side-by-side. Confirm whether one Case with multiple Concept links is sufficient.

### Non-image stimuli

Determine how best to represent laboratory results, clinical observations, or text-only cases while keeping the generic Asset model simple.

### Multiple-answer / marking-point questions

Questions such as `Give three causes` may eventually benefit from structured marking points, although V1 can store one answer block.

### Reusable question compatibility

Determine how much explicit inclusion/exclusion control is needed when a broad Concept question is inherited by narrower subtypes.

### Ambiguous or multiple defensible answers

Some clinical images may have more than one reasonable interpretation. The answer model may eventually need teaching notes or acceptable alternatives.

### Question difficulty / curriculum level

Later versions may need difficulty, learner level, curriculum, or learning-objective metadata.

### Asset licensing/source metadata

Before public/commercial deployment, images may need source, attribution, and licensing metadata.

### Answer-revealing image labels

Imported assets may contain captions or labels that reveal the answer. The content workflow should eventually allow these to be flagged, replaced, cropped, or masked.

### Progress granularity

V1 can rate the whole Case, but real learner data should later inform whether scheduling should operate at Case, Question, Case–Question pairing, or combined mastery levels.

---

## 21. Next design step

Continue reviewing additional Anki decks/cards as stress tests.

For each unusual example, ask:

1. What Concept(s) does this Case represent?
2. Which Assets must be shown together?
3. Are alternative images actually separate Cases?
4. Which questions are broadly reusable?
5. Which questions are Case-specific?
6. Does a shared prompt require a Case-specific answer override?
7. Can the current Case + Asset + Concept + Question model represent it cleanly?
8. Does the example reveal a genuinely new object/relationship, or can it be handled with the existing model?

Once this model survives enough real material, the next step is to freeze a deliberately small V1 specification and begin implementation.
