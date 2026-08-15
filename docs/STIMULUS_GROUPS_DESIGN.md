# Flash-Cards — Optional Stimulus Groups Design

_Last updated: 15 August 2026_

This document defines the implemented additive extension for **alternative stimulus groups** and **stimulus-specific questions**.

Migration `drizzle/0002_optional_stimulus_groups.sql` is the first implementation of this design. It preserves ordinary fixed Case Assets and existing Review rows.

The central design principle is:

> **Stimulus grouping is an optional behavioural layer that emerges from ordinary Case content. It must not become a prerequisite for importing, creating, or studying a Case.**

The existing Case / Asset / Question model remains fundamental.

---

## 1. Why this feature exists

Some teaching Cases have one stable clinical context but several interchangeable examples of the same type of stimulus.

Example:

```text
Case: Hypercalcaemia

Possible ECGs:
- ECG A — shortened QTc
- ECG B — shortened QTc + Osborn waves
- ECG C — shortened QTc with another incidental feature
```

These ECGs can support the **same clinical Case**, but the learner should normally see one selected ECG for a given attempt rather than every ECG together.

Likewise, a single Case may legitimately have several independent stimulus families:

```text
Case: Multiple myeloma with hypercalcaemia

ECG group
- ECG A
- ECG B
- ECG C

X-ray group
- skull X-ray
- pelvis X-ray
- humerus X-ray
```

One Review can therefore select one ECG **and** one X-ray while retaining one coherent Case.

---

## 2. Backward compatibility is mandatory

Existing Cases must continue to work without any stimulus-group metadata.

A normal imported or manually created Case may remain:

```text
Case
├── stem
├── one or more ordinary Case Assets
└── Case / Concept questions
```

Ungrouped Case Assets behave exactly as they do today: they are fixed stimuli and are all shown in configured order.

An administrator should be able to add stimulus-group behaviour later without rewriting the Case or reclassifying every question.

This is especially important for Anki import. Source material does not need to be authored using stimulus groups before import.

Recommended workflow:

1. import or enter the Case normally;
2. preserve existing images as Case Assets and questions as Case/Concept questions;
3. when several Assets are discovered to be interchangeable, group them as alternatives;
4. add group-specific or option-specific questions only when real educational differences require them.

---

## 3. Stimulus groups annotate Case Assets; they do not replace Assets

An Asset remains reusable global media.

The same Asset may appear:

- as a fixed stimulus in one Case;
- as an option in an alternative group in another Case;
- in several unrelated Cases.

The Asset itself must not own the diagnosis, Topic, question set, or stimulus-group meaning.

Conceptually:

```text
Case
├── fixed Case Asset: laboratory chart
│
├── stimulus group: ECG
│   ├── option: ECG A -> Asset A
│   ├── option: ECG B -> Asset B
│   └── option: ECG C -> Asset C
│
└── stimulus group: X-ray
    ├── option: skull X-ray -> Asset D
    └── option: pelvis X-ray -> Asset E
```

For the first implementation, a stimulus group should select **exactly one option** for each Review.

The schema should retain an extension point such as `selection_count`, but values greater than one are deferred until a real use case requires them.

---

## 4. Multiple independent groups are supported

A Case may contain zero, one, or several independent stimulus groups.

Example:

```text
Multiple myeloma Case

Fixed stimulus:
- optional blood-results table

Group 1: ECG
Choose 1 of 3

Group 2: X-ray
Choose 1 of 4
```

At Review creation:

```text
ECG group   -> randomly select ECG B
X-ray group -> randomly select skull X-ray
```

Both selections are then frozen into that Review.

Refreshing or revisiting the same Review must never select different alternatives.

---

## 5. Question context remains layered

The current model already separates reusable Question Prompt wording from contextual answers.

Stimulus groups extend that same principle rather than introducing a second question system.

Question scopes become:

```text
Concept question
       ↓
Case question
       ↓
Stimulus-group question
       ↓
Stimulus-option question
```

A more specific context can override the answer for the same `question_prompt_id`.

Planned precedence for a selected Review is:

```text
selected stimulus option
  > stimulus group
  > Case
  > primary Concept
  > nearest eligible ancestor Concept
  > more distant eligible ancestor Concept
```

The reusable `question_prompts` row continues to store wording only.

---

## 6. Group-level questions

Use a group-level question when the prompt and answer are valid for every option in that group.

Example:

```text
Group: Hypercalcaemia ECG alternatives

Prompt:
What QT interval abnormality is present?

Answer:
Shortened QTc.
```

If any ECG option in this group is selected, that question is eligible.

This avoids copying the same relationship onto every ECG option.

---

## 7. Option-specific questions and answer overrides

Use an option-specific relationship when the exact selected stimulus changes either:

- whether the question is relevant; or
- what the correct answer is.

Example:

```text
Shared prompt:
Describe this ECG.

ECG A answer:
Sinus rhythm with a shortened QTc.

ECG B answer:
Sinus rhythm with a shortened QTc and Osborn waves.
```

Both options may reuse the same Question Prompt while supplying different contextual answers.

ECG B may additionally have a question that ECG A does not:

```text
What additional waveform abnormality is present?
-> Osborn (J) waves.
```

This question becomes eligible only when ECG B is the selected stimulus option.

---

## 8. Questions must not belong globally to the Asset

Do not model the relationship as:

```text
Asset -> questions
```

An Asset may be reused in several Cases with different educational intent.

Instead, the relevant unit is approximately:

```text
Case + stimulus group + selected option + Asset
```

Stimulus-option questions therefore describe the Asset **in that particular Case/group context**.

This preserves global Asset reuse and avoids leaking questions between unrelated Cases.

---

## 9. Question-count configuration should become flexible

The existing learner flow targets three questions and caps at four. That is too rigid for richer Cases.

The planned Case-level setting should eventually support at least:

```text
Questions per Review
- Automatic
- Ask all eligible questions
- Choose N questions
```

`Automatic` preserves a sensible default.

`Ask all eligible questions` supports easy or short Cases where there is no reason to discard questions.

`Choose N` allows an administrator to request a larger or smaller Review set when appropriate.

The question-source categories describe context and precedence; they must not force artificial pedagogical diversity.

A Review may legitimately contain mostly stimulus-specific questions, mostly Case questions, or mostly reusable Concept questions.

---

## 10. Configurable stimulus-specific question coverage

Each stimulus group should eventually expose an Admin setting controlling how strongly its specific questions are represented.

The desired UI can support options such as:

```text
Specific-question coverage
- No guarantee
- At least 1
- At least 2
- At least 3
- Ask all available specific questions
```

The storage model may use a small structured configuration such as a minimum count plus an `all` mode.

For the first implementation, it is acceptable to support a focused subset, but the schema/API must not hard-code a permanent rule such as “always exactly one stimulus-specific question”.

When several independent groups are selected, guarantees apply independently.

Example:

```text
ECG group minimum: 1
X-ray group minimum: 1
Case question count: 6
```

The selector should first satisfy both group guarantees, then fill the remaining slots from the wider eligible pool.

If configured guarantees cannot fit within the Case question limit, the Admin UI/server validation should report the conflict rather than silently violating one of the settings.

---

## 11. Review creation order

The existing learner flow resolves questions and snapshots all active Case Assets.

Stimulus-aware Review creation should instead proceed in this order:

```text
1. Select Case
2. Load fixed stimuli and active stimulus groups
3. Select one option from each active stimulus group
4. Build the question pool using only the selected options
5. Resolve duplicate prompts by contextual precedence
6. Satisfy configured stimulus-specific question guarantees
7. Fill remaining question slots according to the Case question-count mode
8. Snapshot the Case, selected stimuli, prompts, contextual answers, and ordering
9. Commit the Review atomically
```

The learner page then renders only persisted Review snapshots.

No random stimulus selection should occur during ordinary Review page loads.

---

## 12. Proposed schema direction

The exact migration should be reviewed during implementation, but the preferred shape is an additive extension rather than a replacement of `case_assets`.

One viable direction is:

```text
stimulus_groups
- id
- case_id
- name
- display_order
- selection_count           # first implementation constrained to 1
- specific_question_mode    # e.g. none/minimum/all
- minimum_specific_questions
- is_active
- created_at
- updated_at

stimulus_group_options
- id
- stimulus_group_id
- asset_id
- display_order
- caption_md
- is_active
- created_at

stimulus_group_questions
- id
- stimulus_group_id
- question_prompt_id
- answer_md
- is_active
- created_at
- updated_at

stimulus_option_questions
- id
- stimulus_group_option_id
- question_prompt_id
- answer_md
- is_active
- created_at
- updated_at
```

The implementation must decide whether grouped Assets remain represented in `case_assets` with grouping annotations, or whether group-option rows become the Case attachment for grouped Assets. The decision must preserve:

- existing Cases without migration-time rewriting where practical;
- global Asset reuse;
- Case-specific captions;
- deterministic presentation order;
- protected R2 identity;
- durable Review snapshots.

Do not mutate `assets.storage_key` or R2 object identity to implement grouping.

---

## 13. Review snapshot provenance

Historical Reviews must record enough information to know which alternatives were selected.

At minimum, `review_assets` must continue to snapshot the exact Asset/storage key/caption/alt text shown.

It is also desirable to snapshot or reference the source stimulus group/option so future analytics can answer questions such as:

- which ECG was shown?;
- which stimulus option is repeatedly associated with `Again` ratings?;
- did the Review include one ECG and one X-ray from separate groups?

Historical Review meaning must not change if an administrator later reorders, deactivates, or edits a stimulus group.

---

## 14. Admin workflow: structure should emerge from ordinary content

The Admin Case editor should not present stimulus grouping as mandatory ceremony.

The desired workflow is:

```text
Existing Case Assets
[ECG A] [ECG B] [Skull XR]

Select ECG A + ECG B
-> Group as alternatives
-> name group "ECG"
```

Questions remain ordinary Case questions unless the administrator explicitly moves/adds a more specific relationship.

Inside a group, the administrator can later:

- add/remove/reorder options;
- configure question coverage;
- add group-level questions;
- inspect/edit option-specific questions.

Inside an option, the administrator can add an option-specific prompt/answer or override an existing prompt's contextual answer.

This supports progressive enrichment rather than requiring perfect structure at import time.

---

## 15. Updated content-modelling rule

The old blanket rule “alternative examples remain separate Cases” is too strict.

Use this distinction instead:

> **Create separate Cases when the clinical context or educational intent differs. Use alternative stimulus groups when the Case is genuinely the same but one or more example stimuli can vary between attempts.**

Examples:

Separate Cases:

```text
Anterior STEMI recognition
vs
post-PCI complication
```

Same Case with alternatives:

```text
Hypercalcaemia Case
-> choose one of several shortened-QTc ECGs
```

Same Case with multiple independent groups:

```text
Multiple myeloma with hypercalcaemia
-> choose one ECG
-> choose one X-ray
```

---

## 16. First implementation boundaries

The first implementation should aim for:

- additive/backward-compatible schema migration;
- zero or more stimulus groups per Case;
- exactly one selected option per group per Review;
- fixed ungrouped Case Assets still supported;
- group-level contextual questions;
- option-specific contextual questions/answer overrides;
- persisted/frozen stimulus selection in Review snapshots;
- configurable Case question count, including a path to “all eligible”;
- configurable stimulus-specific question coverage with a design that can expand later;
- Admin creation/editing within the existing Case editor;
- no change to R2 object identity or upload contracts.

Defer unless implementation proves it is trivial and safe:

- selecting more than one option from a single group;
- videos/audio/non-image Asset upload types;
- per-question learner marking;
- sophisticated weighting/difficulty;
- automated AI classification of imported content;
- automatic conversion of every imported Anki card into stimulus-specific structures.

The system should make simple content simple and allow richer structure only where it adds educational value.

## 17. Implemented first-version invariants

- `selection_count` is an extension point, but application behaviour accepts only `1`.
- Active options reference existing active image Assets; Asset IDs and immutable R2 storage keys are reused.
- Admin conversion removes only the fixed Case relationship and preserves the Asset ID and Case caption when creating an option.
- The injected RNG drives both Case selection and option selection; selected group/option IDs are snapshotted in Reviews.
- Same-prompt stimulus relationships are rejected when independently attached to different active groups in one Case, preserving safe Review question identity.
