# Learner Original Questions and Expanded Learning

_Status: implemented in draft PR #87. Merge, D1 migration application, production deployment, and production verification remain separate future operational facts._

_Last reviewed: 24 August 2026._

## Purpose

Flash-Cards now lets the learner deliberately choose between:

- the curated questions that belong specifically to the Case; and
- a broader learning pass that also includes eligible reusable questions.

This preserves the educational value of the handcrafted Case while keeping reusable Topic, Shared, and Image Questions available for reinforcement.

The feature does **not** change how reviewed slide imports reconstruct Cases, and it does **not** require authors to mark questions as "original" manually.

## Learner-facing modes

Use two learner-facing choices:

```text
Original questions
Expanded Learning
```

The implementation uses the stable domain concept:

```ts
type QuestionPoolMode = 'core' | 'expanded';
```

`core` is used rather than storing `original` as the domain value because the feature is about current Case-specific ownership, not a frozen historical copy of the import.

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

The implemented Study flow is:

```text
Choose Topic
    ↓
Choose question set
    ├── Original questions
    └── Expanded Learning
    ↓
Resolve Case + questions in that mode
```

Original questions is the initially selected UI choice. Expanded Learning remains an **explicit opt-in**, not an automatic consequence of having completed the Case previously.

There is no learner preference such as:

```text
Study new Cases with their original questions
```

and no persistent `learner_study_preferences` table for this feature.

## Question ownership defines the pools

The feature uses the existing question ownership model rather than adding an `original` flag.

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

Expanded mode preserves current learner resolver behavior except for the new explicit mode selection and Review provenance.

## Filtering happens before precedence/deduplication

Do **not** resolve the full Expanded pool and then remove reusable `sourceType`s afterward.

A duplicate reusable question can currently override a lower-precedence source with the same `question_prompt_id`. Filtering after resolution could therefore accidentally remove a valid Core question.

The implemented sequence is:

```text
QuestionPoolMode
    ↓
select eligible source inputs
    ↓
resolve precedence + deduplicate
    ↓
apply Case automatic/all/fixed selection
```

The canonical source-selection rule lives in:

```text
src/lib/server/learning/question-pool-mode.ts
```

Core passes only Case, stimulus-group, and stimulus-option inputs into the existing resolver. Expanded passes the complete current source input set. This keeps the existing resolver precedence authoritative rather than introducing a parallel resolver.

## Existing question-count behavior remains intact

Core/Expanded mode does not replace or reinterpret the existing Case-level question-selection configuration.

For example, reviewed slide imports commonly use:

```text
questionSelectionMode = all
```

For an Original review this means:

```text
Core pool
= all current Case-specific questions

Case selection mode = all
-> show the complete handcrafted question set
```

For Expanded Learning the same Case configuration applies to the larger eligible pool according to existing semantics.

Existing `automatic` and `fixed` selection continue to run after the mode-specific pool has been resolved.

## Stimulus-specific coverage

Existing Stimulus Groups can require:

```text
none
minimum N
all
```

stimulus-specific questions.

Original mode does not pull in a Reusable Image Question merely to satisfy coverage.

For Original mode, stimulus-specific coverage can only be satisfied by Case-owned stimulus sources:

```text
stimulus_group
stimulus_option
```

The reusable `asset` source remains Expanded-only.

If the existing coverage/selection preflight cannot be satisfied from the Original pool, Review creation fails before any Review row is written. The learner receives a safe message rather than having the selected mode silently widened.

Regression coverage explicitly verifies that a reusable Asset Question cannot satisfy an Original-mode minimum-specific-question requirement.

## Cases with no Original questions

A Case can theoretically have no active Case-specific questions but have reusable questions.

The implementation does not create a zero-question Review and does not silently switch an explicitly selected Original Review to Expanded Learning.

Instead, Original start rejects before persistence with a learner-safe message explaining that the Case has no Original questions available and that Expanded Learning can be chosen explicitly.

Expanded Learning can still be started independently when reusable questions are eligible.

## Review snapshot and provenance

The Review snapshots the chosen mode:

```text
reviews.question_pool_mode
= core | expanded
```

Migration:

```text
0014_review_question_pool_mode.sql
```

The column is non-null with database default:

```text
expanded
```

and a database `CHECK` constrains persisted values to:

```text
core
expanded
```

This preserves historical compatibility because pre-feature Reviews were created using the full reusable resolver behavior. The migration does not rebuild or rewrite existing `review_questions` or `review_assets` rows.

The existing immutable Review snapshot contract remains unchanged:

- exact Prompt wording shown;
- exact answer shown;
- question source provenance;
- display order;
- selected Assets/stimulus context;
- historical media storage information.

Later authoring changes never rewrite an existing Review.

## Learner Review UI

A Review makes the selected question mode visible without exposing unnecessary authoring internals.

Implemented labels:

```text
Original questions
Questions curated specifically for this Case.
```

or:

```text
Expanded Learning
Includes reusable questions relevant to this Case.
```

The existing post-reveal source/scope labels remain available. Individual unanswered questions are not newly labelled as original/reusable.

## Optional same-Case continuation

After completing an Original Review, the learner is offered the voluntary action:

```text
Continue with Expanded Learning
```

alongside the ordinary next-Case controls.

The Expanded action:

- requires ownership of the completed source Review;
- requires that the source Review is completed and has `question_pool_mode = core`;
- creates a **new** Review;
- uses the **same Case**;
- preserves the same **Study Topic** context;
- explicitly uses `expanded` mode.

The action does not route through ordinary random Case selection and does not alter future defaults/preferences.

## Next case behavior

`Next case` remains a separate ordinary Review-start path. It continues to use normal Case selection/history behavior rather than forcing the same Case.

Starting the next Review requires a new explicit question-set choice. The completion UI offers:

```text
Next case — Original questions
Next case — Expanded Learning
```

Choosing Expanded Learning is therefore an explicit opt-in for that new Review rather than an inherited property of the completed Review.

If the explicitly chosen mode is unavailable for the next selected Case, the start is rejected rather than silently changing modes.

## Alternative-stimulus behavior

For an Original -> Expanded same-Case continuation, this first implementation does not add a mechanism to replay the exact same randomly selected option from a multi-option Stimulus Group.

Current stimulus-selection behavior is preserved:

- fixed images remain fixed;
- one-option groups naturally remain stable;
- a true multi-option Alternative Set may select another currently active option for the new Review.

Exact stimulus replay/versioning remains intentionally deferred.

## Admin behavior

No new Admin authoring control is added.

Do not add:

- "mark as Original" checkboxes;
- Core/Expanded toggles to Case authoring;
- import-origin controls;
- automatic source promotion/demotion.

Existing ownership expresses the distinction:

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

## Implemented architecture boundary

PR #87 keeps the existing learner DB facade while adding one focused typed domain boundary:

```text
Study / Review routes
        ↓
src/lib/server/db/learning.js
        ↓
src/lib/server/learning/question-pool-mode.ts
        ↓
existing question resolver / selection
        ↓
Review snapshot persistence
```

The TypeScript module owns:

- `QuestionPoolMode`;
- learner-facing mode metadata shared by the Review UI;
- runtime mode validation;
- mode-specific resolver input eligibility;
- a learner-safe unavailable-pool domain error.

The existing `learning.js` facade continues to coordinate DB reads, random Case/stimulus selection, existing question-count selection, and immutable persistence. This PR deliberately does not perform a broader learner-subsystem extraction while changing product behavior.

Routes remain orchestration surfaces and retain the existing Preview-only learner-access guard.

## Schema scope

The only new learning-domain column is:

```text
reviews.question_pool_mode
```

No learner-preference table was added.

No schema changes were made to:

```text
cases
case_questions
concept_questions
shared_questions
asset_questions
stimulus_group_questions
stimulus_option_questions
```

Import Package v1 is unchanged.

## Characterization and regression coverage

PR #87 contains focused coverage for the agreed behavior, including:

1. explicit Original start -> Core Review mode;
2. explicit Expanded start -> Expanded Review mode;
3. Case completion history does not silently choose or change mode;
4. Original includes ordinary Case Questions;
5. Original includes Case-specific `stimulus_group` questions;
6. Original includes Case-specific `stimulus_option` questions;
7. Original excludes exact Topic questions;
8. Original excludes inherited Topic questions;
9. Original excludes tag-shared questions;
10. Original excludes Reusable Image/Asset questions;
11. Expanded preserves the current full resolver semantics;
12. eligibility filtering occurs before precedence/deduplication;
13. a duplicate reusable Prompt cannot erase a valid Original question;
14. imported-style `questionSelectionMode = all` returns the complete Core set;
15. existing `automatic` behavior remains valid;
16. existing `fixed` behavior remains valid;
17. stimulus coverage cannot smuggle a reusable Asset Question into Original mode;
18. explicit Original never silently changes to Expanded because no Core questions exist;
19. chosen mode is persisted on the Review;
20. historical Review migration compatibility defaults to Expanded without rewriting child snapshots;
21. invalid persisted question-pool modes are rejected by the database constraint;
22. Review question/media snapshots remain immutable after source edits;
23. Continue with Expanded Learning creates a new same-Case Review;
24. continuation preserves Study Topic context;
25. continuation creates an Expanded Review;
26. continuation enforces learner ownership;
27. ordinary Next-case selection/history behavior remains independent of same-Case continuation and requires a new explicit question-set choice rather than inheriting the prior mode;
28. existing Preview-only Study restrictions remain in the route guards.

Existing resolver precedence, question selection, learner ownership, stimulus coverage, reusable-image, Shared Question, and snapshot tests remain part of the repository suite.

## Explicit non-goals / deferred behavior

The implementation deliberately does **not** add or change:

- automatic first-time/later-time mode switching;
- mode changes based on Case completion history;
- mastery-based automatic mode selection;
- persistent learner study-mode preferences;
- historical source-version reproduction;
- per-question scheduling changes;
- Again/Good semantics;
- learner-progress dashboards;
- learner-selectable individual Case browsing;
- Import Package v1 or Import Package v2 fields;
- reusable-question authoring rules;
- Shared Question eligibility rules;
- Reusable Image Question eligibility rules;
- Admin Core/Expanded controls;
- broad learner Study performance/refactoring work;
- Better Auth/session caching;
- generic question-source frameworks;
- exact stimulus replay across Reviews.

A future feature may revisit exact multi-option stimulus continuity only if learner/content requirements justify the extra snapshot/replay mechanism.

## Product contract summary

The implemented behavior is:

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
Mode selects eligible resolver inputs
        ↓
Existing precedence/deduplication
        ↓
Existing automatic/all/fixed rules
        ↓
Immutable Review snapshot records chosen mode
```

The central invariant remains:

> **Original questions are defined by current Case-specific ownership, not by historical import provenance. Expanded Learning is reusable enrichment and is always learner-chosen, never automatically selected because the Case has been completed before.**
