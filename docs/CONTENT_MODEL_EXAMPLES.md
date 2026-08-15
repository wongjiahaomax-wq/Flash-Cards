# Flash-Cards — Content Model Examples

_Last updated: 15 August 2026_

This document records concrete examples for how real teaching material should be represented using the current Case / Asset / Concept / Question model.

It is intentionally practical. When content entry feels ambiguous, prefer these precedents over falling back to fixed Anki-style front/back cards.

---

## 1. Case stem belongs to the Case

A clinical stem/vignette is **Case-level context**.

It is separate from:

- the uploaded image Asset;
- the question prompt;
- the answer.

Example:

```text
Case
Internal title: Post-operative hypocalcaemia ECG
Primary Concept: Hypocalcaemia

Stem:
A 50-year-old female underwent elective head and neck surgery one day ago.
Post-procedure, a laboratory test was abnormal.

Asset:
ECG image

Questions:
1. What ECG abnormality is present?
2. Name two physical examination findings associated with this condition.
3. Name three other causes of this condition.
```

The stem should be snapshotted into the learner Review so the historical Review reflects the context actually shown.

A Case may also have a blank stem when the intended task is image recognition without additional clinical context.

---

## 2. One Asset can be reused across multiple Cases

An Asset is a reusable stimulus, not the owner of a diagnosis or topic.

If the same ECG is useful in more than one teaching context, store the image once in R2 and attach the same Asset record to multiple Cases.

### Example: prolonged QTc ECG

One ECG demonstrates a prolonged QTc.

It can support at least two distinct Cases.

### Case A — neutral ECG recognition

```text
Internal title: Prolonged QTc recognition
Primary Concept: Prolonged QT interval
Stem: optional / neutral
Asset: ECG asset A

Questions:
- What ECG abnormality is present?
- How is QT corrected for heart rate?
- What important ventricular arrhythmia is associated with marked QT prolongation?
```

### Case B — post-operative hypocalcaemia

```text
Internal title: Post-operative hypocalcaemia ECG
Primary Concept: Hypocalcaemia
Stem: post-head/neck surgery clinical vignette
Asset: ECG asset A  ← same Asset as Case A

Questions:
- What ECG abnormality is present?
- Name two physical examination findings associated with this condition.
- Name three other causes of this condition.
```

The R2 image is not copied or re-uploaded.

The Cases remain separate because their clinical context and educational intent are different.

This also avoids forcing the Asset itself to be classified as either “hypocalcaemia” or “prolonged QTc”.

---

## 3. Primary versus secondary Concepts

The current browser admin flow creates one primary Concept for a Case.

Some real Cases may legitimately relate to more than one Concept.

For the post-operative hypocalcaemia ECG example:

```text
Primary Concept: Hypocalcaemia
Potential secondary Concept: Prolonged QT interval
```

Primary Concept should describe the main educational context for that Case.

Secondary Concept links are useful future metadata for:

- search;
- cross-topic discovery;
- analytics;
- alternate study routes.

They should not automatically change the question pool unless explicitly designed to do so.

Admin support for editing secondary Concept links is currently deferred and should be added only when pilot content shows it is genuinely useful.

---

## 4. Case-specific versus reusable questions

Use a **Case-specific question** when the answer depends on the exact Case, image, vignette, or combination of Assets.

Examples:

```text
What ECG abnormality is present?
→ Prolonged QTc
```

```text
What additional conduction abnormality is present on this ECG?
→ Right bundle branch block
```

Use a **Concept-level reusable question** when the question and answer remain valid across compatible Cases of that Concept.

For Hypocalcaemia:

```text
Name two physical examination findings associated with hypocalcaemia.
→ Positive Chvostek and Trousseau signs.
```

```text
Name three other causes of hypocalcaemia.
→ Hypoparathyroidism, vitamin D deficiency, hypomagnesaemia, etc.
```

For initial content entry, it is acceptable to create all questions as Case-specific first and promote genuinely reusable questions to the Concept level later.

---

## 5. Reusable prompt, different Case-specific answers

The same prompt wording can be reused even when the correct answer changes with the selected Case.

Example prompt:

```text
Describe this ECG.
```

Possible Case-specific answers:

```text
Case A
→ ST elevation in V1–V4 with reciprocal inferior ST depression.

Case B
→ Hyperacute anterior T waves with subtle anterior ST elevation.

Case C
→ Extensive anterior ST elevation with associated right bundle branch block.
```

The data model therefore separates reusable Question Prompt wording from Case-specific answer relationships.

---

## 6. Multiple images that belong together

If several Assets are required to understand one clinical presentation, place them in one Case and order them.

Example:

```text
Case: Pityriasis rosea

Asset 1: Herald patch
Asset 2: Later truncal eruption
```

The learner should see both together in configured order.

Use Case-specific captions only when they add useful context without giving away the answer unnecessarily.

---

## 7. Alternative examples remain separate Cases

If images are different examples/patients rather than parts of one presentation, keep them as separate Cases.

Example:

```text
Concept: Anterior STEMI

Case A → ECG A
Case B → ECG B
Case C → ECG C
```

They may draw from the same Concept-level question pool while retaining Case-specific ECG descriptions and findings.

---

## 8. Internal Case titles should not leak diagnoses

The administrator needs useful internal titles for content management.

Those titles may contain the diagnosis, for example:

```text
Post-operative hypocalcaemia ECG
Anterior STEMI ECG A
Pityriasis rosea image pair
```

Learner pages should not expose these diagnosis-bearing internal titles when doing so would reveal the answer.

The current learner flow masks the internal title as a generic Case review heading.

---

## 9. Question order and exam behaviour

The target examination allows movement between question parts.

Therefore:

- all selected question parts may remain visible together;
- later questions may reveal clues to earlier ones;
- there is no need for pre-diagnosis/post-diagnosis gating in V1.

This is deliberate exam fidelity rather than an implementation shortcut.

---

## 10. Marks should not be embedded permanently in prompt text

Source Anki material may contain prompts such as:

```text
ECG finding (2)
Name 2 physical examination findings with this condition (4)
```

For current V1, omit the marks unless they are educationally necessary.

If marks become important later, store them as structured metadata rather than baking `(2)` or `(4)` into the prompt string. This keeps question wording reusable and avoids future parsing problems.

---

## 11. Practical content-entry rule of thumb

When adding new material, ask these questions in order:

1. **What is the Case context?**
   - Create/edit the Case and optional stem.
2. **Which stimuli belong together?**
   - Attach the ordered Assets required for that Case.
3. **Can any Asset be reused elsewhere?**
   - Reattach the existing Asset instead of uploading another copy.
4. **Which questions depend on this exact Case?**
   - Store as Case-specific.
5. **Which questions remain valid across the topic?**
   - Store/promote as reusable Concept questions.
6. **Does the Case belong meaningfully to another Concept as well?**
   - Record this as a future secondary-Concept need rather than duplicating the Case solely for tagging.

The core rule is:

> **Reuse Assets when the stimulus is the same; create separate Cases when the clinical context or educational intent is different.**
