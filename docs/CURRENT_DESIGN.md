# Flash-Cards — Current Design Summary

_Last updated: 15 August 2026_

## Purpose

This is the living design summary for the Flash-Cards project. It records the educational model, implemented product behaviour, technical direction, and the main questions that should be tested with real teaching content.

The project is now beyond the infrastructure/prototype phase: the Case-based learner flow, private R2 image pipeline, D1 Review persistence, and a browser-based content-administration workflow are implemented.

---

## 1. Product goal

Build a private medical learning application where:

- learners log in and review medical Cases;
- a Case may contain a stem/vignette and one or more images/stimuli;
- several related question parts can be presented together;
- administrators can create topics, Cases, stems, images, and questions in the browser;
- Assets and questions can be reused when educationally appropriate;
- Case-specific answers remain possible when the exact stimulus/context matters;
- learner Reviews and ratings are recorded durably;
- the system can later support better scheduling and richer analytics without redesigning the core content model.

Initial material includes ECG, ENT, Eye, and Dermatology, but the model should also accommodate radiographs, diagrams, audiograms, laboratory material, and other future stimuli.

---

## 2. The Case is the study unit

The application does **not** treat a flashcard as a permanently fixed front/back pair.

The main learner-facing unit is a **Case**.

```text
Concept / topic
      ↓
Choose eligible Case
      ↓
Show Case stem + ordered Assets
      ↓
Select compatible questions
      ↓
Learner reviews all parts
      ↓
Reveal answers
      ↓
Again / Good
```

A Case may contain:

- no stem, for neutral image recognition;
- a clinical stem/vignette;
- one image;
- several images that must be interpreted together.

The Case stem belongs to the Case itself. It is separate from image Assets and separate from Question Prompts.

---

## 3. Concepts and hierarchy

A **Concept** is a generic medical/educational topic rather than necessarily a disease.

Examples:

- Hypocalcaemia;
- prolonged QT interval;
- STEMI;
- Anterior STEMI;
- a sign;
- a procedure/device;
- an investigation pattern;
- a learning objective.

Concepts may have parent/child relationships.

Example:

```text
STEMI
└── Anterior STEMI
```

Broader reusable questions may be inherited by descendants only when explicitly marked compatible.

The current question-resolution precedence is:

```text
Case-specific
> primary Concept
> nearest inheritable ancestor
> more distant inheritable ancestor
```

The current browser admin UI creates/selects a primary Concept for a Case. Secondary Concept editing is a future refinement to evaluate using pilot content.

---

## 4. Assets are reusable stimuli

An **Asset** is an individual reusable piece of teaching material.

Initially this is usually an image:

- ECG;
- fundoscopy image;
- dermatology photograph;
- otoscopy image;
- audiogram;
- diagram.

Important rule:

> An Asset does not inherently belong to one diagnosis or one Case.

The same uploaded Asset may be attached to multiple Cases without re-uploading or copying the R2 object.

Example: one ECG demonstrating prolonged QTc can be used in both:

- a neutral prolonged-QTc recognition Case; and
- a post-operative hypocalcaemia Case with a clinical stem and broader hypocalcaemia questions.

The clinical context and educational intent live at Case/question level; the ECG remains one reusable Asset.

See `CONTENT_MODEL_EXAMPLES.md`.

---

## 5. Multiple images: together versus alternatives

### Images that must be interpreted together

Put them in **one Case** and order them.

Examples:

```text
Pityriasis rosea Case
├── Herald patch
└── Later truncal eruption
```

```text
Lichen planus Case
├── Wrist lesions
└── Oral mucosal lesions
```

### Alternative examples of one condition

Keep them as **separate Cases**.

Example:

```text
Anterior STEMI
├── Case A → ECG A
├── Case B → ECG B
└── Case C → ECG C
```

This allows repeated exposure to different examples while reusing compatible Concept-level questions.

Simple rule:

> **Stimuli that belong to one clinical presentation → one Case.**
>
> **Different examples/patients → separate Cases.**

---

## 6. Reusable Question Prompts and scoped answers

Question wording is represented separately from the context in which it is answered.

The same prompt can be reused:

```text
Describe this ECG.
```

while different Cases hold different correct answers.

Example:

```text
Case A → ST elevation in V1–V4 with reciprocal inferior ST depression.
Case B → Hyperacute anterior T waves with subtle anterior ST elevation.
Case C → Extensive anterior ST elevation with associated right bundle branch block.
```

This supports two important question scopes.

### Case-specific question/answer

Use when the answer depends on the exact Case, image, vignette, or multi-image combination.

Examples:

- What ECG abnormality is present?
- What additional conduction abnormality is present on this ECG?

### Concept-level reusable question/answer

Use when the question and answer remain valid across compatible Cases of a Concept.

Examples for Hypocalcaemia:

- Name two physical examination findings associated with this condition.
- Name three other causes of this condition.

For content-entry convenience, it is acceptable to start with Case-specific questions and promote genuinely reusable material to the Concept level later.

---

## 7. Question presentation and exam behaviour

The target examination allows learners to move backwards and forwards between question parts.

Therefore V1 deliberately does **not** gate questions into pre-diagnosis and post-diagnosis stages.

Current learner behaviour:

- all selected question parts remain visible together;
- later questions may provide clues to earlier ones;
- answers are revealed together;
- the learner rates the whole Case rather than each question independently.

This matches the examination format and avoids unnecessary branching logic.

The selection engine currently targets about three questions and caps a Review at four.

---

## 8. Learner Review snapshots

A Review records what the learner actually saw rather than relying only on live content later.

The current Review flow snapshots:

- Case ID;
- primary Concept;
- internal Case title snapshot;
- Case vignette snapshot;
- selected Question Prompts/answers and order;
- ordered Asset references/storage-key snapshots;
- reveal timestamp;
- completion timestamp;
- whole-Case `Again` or `Good` rating.

Internal diagnosis-bearing Case titles are not exposed to the learner UI.

Historical Asset serving currently still requires the live Asset record to remain active. This is acceptable for V1 but should be revisited if strict historical/audit fidelity becomes important.

---

## 9. Image storage and provenance

The learner-visible image is stored in **private Cloudflare R2**.

External image URLs are attribution/reference metadata only and are never used as the runtime image source.

Per-Asset metadata may include:

- alt text;
- source label;
- source URL;
- licence.

Source information is optional. Unknown source is valid and must not cause invented attribution.

Current storage guardrails:

- JPEG/PNG only in the current UI;
- maximum 5 MiB per image;
- 5 GiB application-managed storage ceiling;
- Standard R2 storage class;
- immutable object keys.

The admin UI supports normal file selection, drag/drop, and clipboard image paste.

---

## 10. Current administrator workflow

The browser `/admin` route now supports the smallest routine V1 content workflow.

Administrator can:

- create a Concept/topic;
- create a Case linked to a primary Concept;
- enter/edit a Case stem/vignette;
- upload a teaching image to private R2;
- attach an existing Asset to a Case;
- reuse the same Asset across different Cases;
- order multiple Case Assets;
- add Case-specific captions;
- add/edit/remove/reorder Case questions;
- optionally save a question as reusable for the primary Concept;
- preview content in Study.

Still intentionally deferred:

- full Concept hierarchy administration;
- secondary Concept editing;
- polished full CRUD/archive workflows;
- bulk import;
- large-library search/filter tools;
- sophisticated analytics.

---

## 11. Current learner workflow

The learner path is D1-backed.

```text
Login
  ↓
Choose topic
  ↓
System chooses eligible Case
  ↓
Show vignette + all ordered Case Assets
  ↓
Select compatible questions
  ↓
Learner reviews all parts
  ↓
Reveal answers
  ↓
Again / Good
  ↓
Next Case
```

Immediate-repeat avoidance uses persisted Review history where possible.

Single-image and multi-image Cases use the same underlying model.

---

## 12. Authentication and roles

Better Auth is embedded in the SvelteKit application and persists to Cloudflare D1.

Current state:

- public sign-up disabled;
- authenticated users may access `/study`;
- administrator role required for `/admin`;
- production administrator login verified.

Next auth milestone:

- administrator-created learner accounts;
- explicit learner/admin role-boundary acceptance test.

---

## 13. Technical direction

Current stack:

```text
GitHub
└── SvelteKit application
    └── Cloudflare Workers
        ├── Better Auth
        ├── Drizzle ORM
        │   └── Cloudflare D1
        └── Cloudflare R2
```

Important architecture boundaries:

- Better Auth tables are direct D1 auth tables rather than part of the Drizzle learning-domain model;
- Drizzle manages learning-domain data access;
- R2 stores image bytes;
- D1 stores Asset metadata and learning data;
- storage operations are isolated behind server helpers;
- selection/scheduling logic stays in application code rather than being tied to a database vendor.

A future migration to PostgreSQL/Supabase remains possible, but there is no current reason to migrate while the Cloudflare stack meets the V1 needs.

---

## 14. Current implementation status

Completed:

- Cloudflare Worker deployment;
- D1 and R2 bindings;
- Better Auth production setup;
- administrator sign-in;
- V1 learning schema;
- D1-backed learner Reviews;
- private R2 image upload/serving;
- R2 cost guardrails;
- Case stem/vignette support;
- reusable Assets attached to Cases;
- browser topic/Case creation;
- browser image upload/attachment/order/caption management;
- browser Case question management;
- reusable Concept questions;
- learner single/multi-image Study UI;
- Again/Good persistence;
- automated CI/smoke tests.

The combined implementation through PR #9 passed post-merge CI run #67.

---

## 15. Next design questions to test with real content

The next work should be driven by pilot content rather than hypothetical architecture.

### Secondary Concepts

A Case such as post-operative hypocalcaemia may primarily belong to `Hypocalcaemia` while also containing a `Prolonged QT interval` finding.

Test whether explicit secondary Concept links improve search/analytics without complicating question selection.

### Structured marks

Source cards often embed marks such as `(2)` or `(4)` in the prompt text.

If marks matter, add structured metadata later rather than permanently encoding them into reusable prompt strings.

### Larger content libraries

As real content grows, determine when the admin UI needs:

- search;
- filters;
- duplicate detection;
- better question reuse/promotion tools.

### Historical image fidelity

Decide whether an Asset that is later deactivated should remain viewable in historical Review snapshots.

### Attribution history

Decide whether source/licence metadata should eventually be snapshotted with the Review.

### Non-image stimuli

Use pilot content to decide whether laboratory results and similar material should remain text in the Case vignette or become additional structured Asset types.

---

## 16. Features deliberately deferred

Do not prioritise these until real pilot content and basic learner progress management are working:

- FSRS/sophisticated scheduling;
- AI-generated questions;
- branching question flows;
- automated free-text marking;
- gamification;
- leaderboards;
- payments;
- native mobile apps;
- offline mode;
- institutional multi-tenancy;
- complex cohort analytics;
- bulk Anki import;
- sophisticated question weighting.

The current priority is to validate the Case/Asset/question model with real teaching material and real learner usage.
