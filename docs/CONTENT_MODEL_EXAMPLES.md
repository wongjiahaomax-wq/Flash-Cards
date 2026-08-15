# Flash-Cards — Content Model Examples

_Last updated: 15 August 2026_

This document records concrete examples for how real teaching material should be represented using the current Case / Asset / Concept / Question model and its implemented optional stimulus-group extension.

It is intentionally practical. When content entry feels ambiguous, prefer these precedents over falling back to fixed Anki-style front/back cards.

See also `docs/STIMULUS_GROUPS_DESIGN.md` for the alternative-stimulus behaviour and first-version invariants.

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
Primary/default Topic: Hypocalcemia

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
Primary/default Topic: Prolonged QTc
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
Primary/default Topic: Hypocalcemia
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

## 3. Primary versus secondary Topics

The browser Admin Case editor maintains one primary/default Topic and zero or more Additional Study Topics for a Case.

Some real Cases may legitimately relate to more than one Concept.

For the post-operative hypocalcaemia ECG example:

```text
Primary/default Topic: Hypocalcemia
Additional Study Topic: Prolonged QTc
```

Primary Concept should describe the main educational context for that Case.

Additional Study Topic links are learner-routing relationships, not generic tags. They are useful for:

- search;
- cross-topic discovery;
- analytics;
- alternate study routes.

They should not automatically change the question pool unless explicitly designed to do so.

The Admin Case editor supports adding/removing Additional Study Topics and promoting one to primary. Changing the primary demotes the old primary to a secondary relationship so unrelated routes are not silently discarded. An active Case must retain exactly one primary Topic.

### Agreed production taxonomy example

```text
Electrolyte Disorders
├── Hypercalcemia
└── Hypocalcemia

Cardiology
└── ECG Findings
    ├── Short QTc
    └── Prolonged QTc

Hypercalcemia Case: primary Hypercalcemia; additional Study Topic Short QTc
Hypocalcemia Case: primary Hypocalcemia; additional Study Topic Prolonged QTc
```

Because Short QTc and Prolonged QTc descend from Cardiology, both Cases remain discoverable through the Cardiology subtree without a redundant direct Cardiology relationship.

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

## 5. Reusable prompt, different contextual answers

The same prompt wording can be reused even when the correct answer changes with context.

Current example:

```text
Prompt:
Describe this ECG.

Case A answer:
→ ST elevation in V1–V4 with reciprocal inferior ST depression.

Case B answer:
→ Hyperacute anterior T waves with subtle anterior ST elevation.

Case C answer:
→ Extensive anterior ST elevation with associated right bundle branch block.
```

The data model therefore separates reusable Question Prompt wording from context-specific answer relationships.

The planned stimulus-group extension applies the same principle below the Case level: the selected stimulus option may supply an even more specific answer for the same prompt.

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

These are **fixed stimuli**, not alternatives.

Use Case-specific captions only when they add useful context without giving away the answer unnecessarily.

---

## 7. Separate Cases versus alternative stimulus groups

The old blanket rule that every alternative image should become a separate Case is too strict.

Use this distinction:

> **Create separate Cases when the clinical context or educational intent differs. Use an alternative stimulus group when the Case is genuinely the same but the example stimulus can vary between attempts.**

### Separate Cases

Different context or educational intent:

```text
Case A: neutral anterior STEMI recognition
Case B: anterior STEMI with post-PCI complication
```

Even if an ECG could be reused, the Cases remain separate because the teaching task differs.

### Same Case with alternative ECGs

```text
Case: Hypercalcaemia

ECG alternatives — choose one per Review:
- ECG A: shortened QTc
- ECG B: shortened QTc + Osborn waves
- ECG C: shortened QTc with another incidental feature
```

The clinical context and main teaching objective are the same, so duplicating the whole Case would create unnecessary maintenance.

The stimulus-group extension is optional. Until it is implemented, separate Cases remain a valid temporary workaround.

---

## 8. One Case can have several independent stimulus groups

A richer Case may need one choice from several stimulus families.

Example:

```text
Case: Multiple myeloma with hypercalcaemia

ECG group — choose one:
- ECG A
- ECG B
- ECG C

X-ray group — choose one:
- skull X-ray with punched-out lesions
- humerus X-ray with lytic lesions
- pelvis X-ray with lytic lesions
```

A Review might therefore snapshot:

```text
ECG B + skull X-ray
```

while a later Review of the same Case might snapshot:

```text
ECG A + pelvis X-ray
```

Selections must be made once when the Review starts and remain frozen for that Review.

---

## 9. Stimulus-specific questions are optional refinements

Do not require every imported or manually entered question to be classified by stimulus.

Existing Case questions remain valid unless a more specific relationship is genuinely useful.

Example:

All ECG alternatives share:

```text
What QT interval abnormality is present?
→ Shortened QTc.
```

This can become a stimulus-group question.

But ECG B alone may support:

```text
What additional waveform abnormality is present?
→ Osborn (J) waves.
```

And the shared prompt:

```text
Describe this ECG.
```

may resolve differently:

```text
ECG A
→ Sinus rhythm with shortened QTc.

ECG B
→ Sinus rhythm with shortened QTc and Osborn waves.
```

This should be modelled as contextual relationships within the Case/group, not as global questions owned by the Asset itself.

An Asset can be reused elsewhere without inheriting unrelated questions.

---

## 10. Imported Anki content should remain simple by default

Stimulus groups must be an **emergent enrichment**, not an import requirement.

A straightforward imported card can become:

```text
Case
├── stem
├── ECG image
└── Case questions
```

Later, an administrator may discover another interchangeable ECG and choose to group the two images as alternatives.

The existing Case questions remain Case questions. Only genuinely image-dependent prompts/answers need to be promoted into group-specific or option-specific context.

This avoids requiring a complete rewrite of source Anki material before it is useful in the application.

---

## 11. Question count should follow educational need

The current learner implementation targets three questions and caps at four, but richer Cases may need a more flexible policy.

The planned Case-level behaviour should support:

```text
Questions per Review
- Automatic
- Ask all eligible questions
- Choose N
```

Do not force one question from every source category merely for variety.

A simple Case may legitimately ask several short stimulus-specific questions. Another Case may rely mostly on reusable Concept questions.

Stimulus-group question coverage should eventually be configurable independently, for example:

```text
No guarantee
At least 1
At least 2
At least 3
Ask all available specific questions
```

See `docs/STIMULUS_GROUPS_DESIGN.md`. In the implemented first version, each active group selects exactly one active image option per Review, and selections are frozen in `review_assets`.

---

## 12. Internal Case titles should not leak diagnoses

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

## 13. Question order and exam behaviour

The target examination allows movement between question parts.

Therefore:

- all selected question parts may remain visible together;
- later questions may reveal clues to earlier ones;
- there is no need for pre-diagnosis/post-diagnosis gating in V1.

This is deliberate exam fidelity rather than an implementation shortcut.

---

## 14. Marks should not be embedded permanently in prompt text

Source Anki material may contain prompts such as:

```text
ECG finding (2)
Name 2 physical examination findings with this condition (4)
```

For current V1, omit the marks unless they are educationally necessary.

If marks become important later, store them as structured metadata rather than baking `(2)` or `(4)` into the prompt string. This keeps question wording reusable and avoids future parsing problems.

---

## 15. Practical content-entry rule of thumb

When adding new material, ask these questions in order:

1. **What is the Case context?**
   - Create/edit the Case and optional stem.
2. **Which stimuli must always be seen together?**
   - Attach them as ordinary ordered Case Assets.
3. **Are any stimuli interchangeable examples of the same task?**
   - When useful, group them as alternatives rather than duplicating the Case.
4. **Can any Asset be reused elsewhere?**
   - Reattach the existing Asset instead of uploading another copy.
5. **Which questions depend on this exact Case?**
   - Store as Case-specific.
6. **Which questions remain valid across the Topic?**
   - Store/promote as reusable Concept questions.
7. **Does a question depend on the selected stimulus group or exact option?**
   - Add stimulus-specific context only when necessary.
8. **Does the Case belong meaningfully to another Concept as well?**
   - Record this as a future secondary-Concept need rather than duplicating the Case solely for tagging.

The core rule is:

> **Reuse Assets when the media are the same; separate Cases when context or educational intent differs; use optional stimulus alternatives when the Case stays the same but the example can vary.**
