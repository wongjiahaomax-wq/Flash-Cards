# Learner Original Questions and Expanded Learning

_Status: pending design / agreed product direction. No implementation is included in this document._

_Last reviewed: 24 August 2026._

## Purpose

Flash-Cards currently resolves a Case together with all eligible contextual and reusable questions, then applies the Case's existing `automatic`, `all`, or `fixed` question-selection rules.

The product direction is to let the learner deliberately choose between:

- the curated questions that belong specifically to the Case; and
- a broader learning pass that also includes eligible reusable questions.

This preserves the educational value of the handcrafted Case while keeping reusable Topic, Shared, and Image Questions available for reinforcement.

The feature must **not** change how reviewed slide imports reconstruct Cases, and it must **not** require authors to mark questions as "original" manually.

## Agreed learner-facing modes

Use two learner-facing choices:

```text
Original questions
Expanded Learning
```

Internally, prefer a stable domain concept such as:

```ts
type QuestionPoolMode = 'core' | 'expanded';
```

`core` is preferable to storing `original` as the domain value because the feature is about current Case-specific ownership, not a frozen historical copy of the import.

### Original questions

Meaning:

> Use the current curated questions that belong specifically to this Case and its Case-specific stimulus context.

### Expanded Learning

Meaning:

> Use the Case-specific questions plus all other currently eligible reusable questions for this Case and Study Topic, subject to the existing resolver, deduplication, Case question-count mode, and stimulus-coverage rules.

## Learner choice is explicit on every Review start

There is **no automatic transition based on whether the learner has studied the Case before**.

Do not implement logic such as:

```text
first completion      -> Original
later completions     -> Expanded
```

Completion history must not silently change the learner's question pool.

Instead, the learner chooses which mode they want when starting a Review:

```text
Choose Topic
    ↓
Choose question set
    ├── Original questions
    └── Expanded Learning
    ↓
Resolve Case + questions in that mode
```

Expanded Learning should be an **explicit opt-in**, not an automatic consequence of having completed the Case previously.

A future UI may present Original questions as the initially selected/conservative choice and require an explicit action to select Expanded Learning, but the important product invariant is that the learner can intentionally choose either mode whenever they study.

There is therefore no need for a learner preference such as:

```text
Study new Cases with their original questions
```

and no need for a persistent `learner_study_preferences` table for this feature.

## Question ownership defines the pools

The feature should use the existing question ownership model rather than adding an `original` flag.

### Core / Original pool

The current source types that belong specifically to the selected Case are:

| Current source type | Original questions? | Meaning |
| --- | --- | --- |
| `case` | Yes | Whole-Case authored question |
| `stimulus_group` | Yes | Question authored specifically for this Case's stimulus group |
| `stimulus_option` | Yes | Exact image/stimulus question authored specifically for this Case context |

These are all part of the handcrafted/current curated Case experience.

### Expanded-only reusable sources

The current reusable sources are:

| Current source type | Original questions? | Meaning |
| --- | --- | --- |
| `concept` | No | Exact Study Topic reusable question |
| `ancestor_concept` | No | Eligible inherited Topic question |
| `tag_shared` | No | Reusable Shared Question made eligible by Case Tags |
| `asset` | No | Reusable Image Question explicitly opted into the exact stimulus usage |

Expanded Learning includes both the Core sources and these reusable sources.

## Important image-question distinction

The existing authoring model deliberately distinguishes:

```text
Case-specific Image Question
= teaching tied to this exact image/stimulus in this Case context

Reusable Image Question
= canonical teaching tied to the exact global Asset
```

Therefore:

```text
Case-specific Image Question
-> Original questions

Reusable Image Question
-> Expanded Learning only
```

Do not exclude all image-specific questions from Original mode merely because an image is involved.

## Import Package v1 remains unchanged

Reviewed imports already reconstruct source-derived teaching questions as ordinary Case Questions.

That is the correct ownership boundary for this feature:

```text
reviewed source question
-> Case Question
-> Original questions
```

Later editorial enrichment can add reusable Topic, Shared, or Reusable Image Questions without changing the imported Case's Core ownership.

Do not add:

- an `original_question` flag;
- import-batch provenance solely for this feature;
- frozen historical Case-question snapshots;
- a new imported-question table/type;
- Import Package v2 fields;
- automatic promotion/demotion of question ownership.

"Original questions" means the **current curated Case-specific set**, not "the exact database rows that existed on the day the Case was imported".

If an Admin later intentionally edits or adds a Case-specific question, that question belongs to the current Original set.

True archival reproduction of a historical source version, if ever required, is a separate future feature.

## Resolver boundary

QuestionPoolMode answers:

> Which question sources are eligible for this Review?

The existing Case selection mode answers:

> How many of those eligible questions should be selected?

Keep these concerns separate.

The existing Case settings remain authoritative:

```text
automatic
all
fixed
```

### Original mode

Resolve/deduplicate only Case-owned inputs:

```text
case
stimulus_group
stimulus_option
```

### Expanded mode

Resolve/deduplicate the complete currently eligible set using existing precedence:

```text
stimulus_option
> asset
> stimulus_group
> case
> concept
> tag_shared
> ancestor_concept
```

Expanded mode should preserve current learner resolver behavior except for the new explicit mode selection and Review provenance.

## Filtering must happen before precedence/deduplication

Do **not** resolve the full Expanded pool and then remove reusable `sourceType`s afterward.

A duplicate reusable question can currently override a lower-precedence source with the same `question_prompt_id`. Filtering after resolution could therefore accidentally remove a valid Core question.

Correct conceptual sequence:

```text
QuestionPoolMode
    ↓
select eligible source inputs
    ↓
resolve precedence + deduplicate
    ↓
apply Case automatic/all/fixed selection
```

This is a core acceptance invariant for implementation.

## Existing question-count behavior remains intact

Core/Expanded mode must not replace or reinterpret the existing Case-level question-selection configuration.

For example, reviewed slide imports commonly use:

```text
questionSelectionMode = all
```

For an Original review this naturally means:

```text
Core pool
= all current Case-specific questions

Case selection mode = all
-> show the complete handcrafted question set
```

For Expanded Learning the same Case configuration applies to the larger eligible pool according to existing semantics.

## Stimulus-specific coverage

Existing Stimulus Groups can require:

```text
none
minimum N
all
```

stimulus-specific questions.

Original mode must not silently pull in a Reusable Image Question merely to satisfy coverage.

For Original mode, stimulus-specific coverage can only be satisfied by Case-owned stimulus sources:

```text
stimulus_group
stimulus_option
```

The reusable `asset` source remains Expanded-only.

If an authored coverage rule cannot be satisfied from the Original pool, implementation should surface a clear domain/preflight failure rather than violating the selected mode.

This edge case requires explicit tests.

## Cases with no Original questions

A Case can theoretically have no active Case-specific questions but have reusable questions.

Do not create a zero-question Review.

Recommended behavior:

- make Original mode unavailable for that Review/Case when no eligible Core questions exist; or
- reject that start attempt with a clear learner-safe message and allow the learner to choose Expanded Learning.

Do **not** silently switch an explicitly selected Original Review to Expanded Learning, because that would violate the learner's mode choice.

The eventual implementation prompt should choose the simplest UX consistent with this invariant.

## Review snapshot and provenance

The Review should snapshot the chosen mode, conceptually:

```text
reviews.question_pool_mode
= core | expanded
```

This records why a Review contains the question set it does and supports correct learner-facing labels and history later.

Existing historical Reviews should remain readable. If a migration adds a non-null mode, existing Reviews should be treated/backfilled as `expanded`, because current production behavior resolves the full eligible reusable pool.

The existing immutable Review snapshot contract remains unchanged:

- exact Prompt wording shown;
- exact answer shown;
- question source provenance;
- display order;
- selected Assets/stimulus context;
- historical media storage information.

Later authoring changes must never rewrite an existing Review.

## Learner Review UI

A Review should make the selected question mode visible without exposing unnecessary authoring internals.

Suggested labels:

```text
Original questions
Questions curated specifically for this Case.
```

or:

```text
Expanded Learning
Includes reusable questions relevant to this Case.
```

The existing post-reveal source/scope labels may continue to distinguish Case-specific, Topic, reusable image, inherited Topic, and other source types.

Do not label every unanswered question as "original" or "reusable" unless future learner testing shows that this improves learning.

## Optional same-Case continuation

After completing an Original Review, it is useful to offer a voluntary shortcut:

```text
Continue with Expanded Learning
```

This must remain an **opt-in action**, not an automatic transition.

A completed Original Review could therefore offer:

```text
Continue with Expanded Learning
Next case
```

The Expanded action should create a new Review for the **same Case** and same Study Topic context, explicitly in `expanded` mode.

This is a convenience flow only. It does not imply that future Reviews of the Case should automatically use Expanded mode.

## Alternative-stimulus behavior

For an Original -> Expanded same-Case continuation, the first implementation does not need to add a new mechanism to replay the exact same randomly selected option from a multi-option Stimulus Group.

Preserve the current stimulus-selection behavior unless later learner testing demonstrates that same-stimulus continuity is important.

One-option groups and ordinary fixed images naturally remain stable.

## Admin behavior

No new Admin authoring control is required.

Do not add:

- "mark as Original" checkboxes;
- Core/Expanded toggles to Case authoring;
- import-origin controls;
- automatic source promotion/demotion.

Existing ownership already expresses the distinction:

```text
Case Question
Case-specific Image Question
Stimulus Group Question
-> Original

Topic Question
Shared Question
Reusable Image Question
-> reusable enrichment / Expanded Learning
```

## Expected implementation boundary

This document does not implement the feature. A later coding PR should remain focused on learner question-pool selection and Review provenance.

Likely areas of work include:

- learner Study start UI/action contract;
- a focused `core | expanded` question-pool domain contract;
- Review-start workflow orchestration;
- eligibility before resolver precedence/deduplication;
- Review mode snapshot persistence;
- learner Review mode display;
- optional same-Case Expanded continuation;
- characterization/regression tests.

Follow repository architecture guidance: keep routes thin, put the business rule in a canonical learner/question-selection domain owner, prefer TypeScript for a new/extracted application module where proportionate, and do not broaden the PR into unrelated learner refactoring.

## Expected migration scope

If implementation persists the mode on Reviews, the likely schema change is limited to something conceptually equivalent to:

```text
reviews.question_pool_mode
```

No learner-preference table is required under the agreed explicit-choice model.

No schema change should be required for:

```text
cases
case_questions
concept_questions
shared_questions
asset_questions
stimulus_group_questions
stimulus_option_questions
```

The eventual implementation must inspect current `main` before choosing the migration number and exact schema mechanics.

## Characterization and acceptance coverage

A future coding PR should include focused coverage for at least:

1. explicit Original start -> Core mode;
2. explicit Expanded start -> Expanded mode;
3. Case completion history does not silently choose or change the mode;
4. Original includes ordinary Case Questions;
5. Original includes Case-specific `stimulus_group` questions;
6. Original includes Case-specific `stimulus_option` questions;
7. Original excludes exact Topic questions;
8. Original excludes inherited Topic questions;
9. Original excludes tag-shared questions;
10. Original excludes Reusable Image/Asset questions;
11. Expanded preserves current full resolver semantics;
12. filtering occurs before precedence/deduplication so a duplicate reusable Prompt cannot erase a valid Original Prompt;
13. imported-style `questionSelectionMode = all` returns the complete Core set;
14. existing `automatic` and `fixed` behavior remains valid in both modes;
15. stimulus coverage cannot smuggle a reusable Asset question into Original mode;
16. an explicit Original request never silently becomes Expanded because the Core pool is empty;
17. Reviews snapshot the chosen `core | expanded` mode;
18. existing historical Reviews remain readable after any migration;
19. Review question/media snapshots remain immutable;
20. optional Continue with Expanded Learning starts the same Case and Study Topic in Expanded mode;
21. continuation respects learner ownership/authorization;
22. existing Next case behavior remains unchanged;
23. existing Preview-only learner-access restrictions remain unchanged.

## Explicit non-goals

Keep the following out of this feature unless separately requested:

- automatic first-time/later-time mode switching;
- mastery-based automatic mode selection;
- a learner preference that changes modes based on Case history;
- historical source-version reproduction;
- per-question scheduling changes;
- changes to Again/Good rating semantics;
- learner progress dashboards;
- learner-selectable individual Case browsing;
- Import Package changes;
- changes to reusable-question authoring/eligibility semantics;
- Admin Core/Expanded controls;
- broad learner Study performance/refactoring work;
- generic question-source frameworks.

## Product contract summary

The agreed behavior is:

```text
Learner chooses a Topic
        ↓
Learner explicitly chooses question set
        ├── Original questions
        │     = current Case-owned questions only
        │
        └── Expanded Learning
              = Case-owned + eligible reusable questions
        ↓
Existing precedence/deduplication
        ↓
Existing automatic/all/fixed rules
        ↓
Immutable Review snapshot records chosen mode
```

The central invariant is:

> **Original questions are defined by current Case-specific ownership, not by historical import provenance. Expanded Learning is reusable enrichment and is always learner-chosen, never automatically selected because the Case has been completed before.**
