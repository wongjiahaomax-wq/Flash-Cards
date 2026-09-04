# Flash-Cards — Current Design Summary

_Last reconciled: 4 September 2026._

This is the concise product/design mental model for current repository behavior. Use `CURRENT_PRODUCT_ROADMAP.md` for status and `V1_DATA_MODEL.md` plus current subsystem authorities for exact implementation semantics.

## 1. Product shape

Flash-Cards is a closed-enrollment case-based medical learning application. The GitHub repository is public; application access and private teaching media remain controlled.

The learner-facing unit is a **Case**, not a permanently fixed front/back card and not a persisted legacy `reviews` record.

## 2. Organising concepts

### System

Top-level learner navigation grouping. Systems contain/organise Topic hierarchy and may explicitly expose selected Tags as contextual routes.

### Topic

Canonical educational home and direct reusable Topic-question context for a Case.

### Tag

Flat cross-cutting classification/discovery metadata. Tags do not belong to Systems; System↔Tag exposure determines where an explicitly tagged Case can be found contextually.

### Case

One coherent clinical presentation/study unit.

Current Case classification is:

```text
Case
├── exactly one behaviorally active Primary Topic
└── zero or more Case Tags
```

Historical secondary Topic relationships may remain physically stored but are not current classification.

### Asset / Collection

An Asset is one exact teaching-media identity. A Collection is Admin Image Library organisation only.

## 3. Learner Study flow

Current repository learner flow is:

```text
Choose System
→ choose Scheduled Study or Free Study
→ choose 5 / 10 / 20 / All available Cases (default 10)
→ choose/use current content mode
→ server validates run/scope/work proof
→ create active Review snapshot
→ show Case + frozen media/questions
→ reveal answers
→ Scheduled: Again / Hard / Good / Easy
   Free: complete exposure without scheduling
→ persist completion through the owning service
→ advance to next eligible Case when available
```

Scheduled repeats required by FSRS do not consume another distinct-Case run slot.

Browser-local run state is a convenience layer. Scheduler authority lives server-side.

## 4. Active Review snapshots

Before learner progress begins, the app freezes the presented state into:

```text
active_reviews
active_review_questions
active_review_assets
```

The snapshot preserves the Case/question/media content and run/scheduler provenance needed to resume the unfinished attempt correctly.

Current learner media ownership during an unfinished Review is `active_review_assets`; historical `review_assets` is not a current lifecycle owner.

The physical legacy tables `reviews`, `review_questions`, and `review_assets` are migration-history/cutover sentinels only.

## 5. Scheduled Study / FSRS

Scheduling is Case-level and uses the pinned FSRS adapter with default desired retention 90%.

Scheduled completion:

- rates the whole Case Again / Hard / Good / Easy;
- advances current learner×Case FSRS state;
- writes durable compact completion/history/analytics data;
- maintains historical System attribution captured at study time;
- consumes the active Review exactly once.

The scheduler is not inferred from human-readable retained history alone. Expiry of detailed events must not destroy the compact state/analytics still required by the product.

## 6. Free Study

Free Study exposes eligible Cases without advancing Scheduled FSRS state. It has its own completion receipt/aggregate ownership so retries remain exactly-once without fabricating Scheduled ratings/events.

## 7. Reset Progress / Fresh FSRS Start

Reset Progress clears current Case scheduling state while preserving retained history/aggregates and advances the review-sequence boundary for initialized learners.

Fresh FSRS Start clears current Case scheduling state, restores canonical default parameters at 90% desired retention, advances generation/review-sequence/parameter boundaries, and clears/prunes optimizer metadata as defined by the FSRS authority chain.

Both invalidate/consume any active Review atomically enough that no committed operation leaves an active Review on an old scheduler boundary. Browser state is cleared for normal UX, while server-side boundary checks remain authoritative.

## 8. Progress / retention / Admin analytics

Detailed Scheduled-event retention supports:

```text
24 months (default)
36 months
60 months
indefinite
```

Learner Progress is implemented using current FSRS state plus compact aggregates/retained recent history.

Admin long-range analytics use durable monthly buckets:

```text
learner_system_monthly_buckets
key = (user_id, system_id, month_start)
```

These buckets survive detailed-history expiry and preserve the historical System captured at completion. Long-range trends are not reconstructed from lifetime aggregates or optimizer evidence.

Stable V1 cohort membership is the learner Better Auth account-created UTC month.

## 9. Mature account deletion

Mature learner deletion is staged and retry-safe rather than relying on an unbounded one-shot cascade.

A durable deletion marker immediately denies access, then bounded phases drain Better Auth/application-owned rows. Final identity deletion fails closed if residual owned data remains.

This lifecycle is separate from routine Account Management v1 work in open PRs #96/#97.

## 10. Stimuli

`case_assets` are fixed images and appear whenever the Case is presented.

Alternative Sets use `stimulus_groups` and options. A curated family has an explicit Original pointer; Original must not be inferred from insertion order, display order, filename, caption, or historical learner snapshots.

Core/Original learning uses the Original where a curated family has one. Expanded learning may substitute an eligible non-Original Alternative according to the current resolver contract.

Keep these lifecycle concepts distinct:

```text
option active/inactive
option removed from Case
Asset active/inactive
Asset current/historical/unused usage classification
same-image higher-resolution replacement
permanent Asset/R2 deletion
```

## 11. Questions and reuse

`question_prompts` stores wording only. Answers live at the scope that makes them correct.

Current source families include:

- whole-Case Questions;
- Topic/ancestor Questions;
- Stimulus Group Questions;
- Case-specific exact Stimulus Option Questions;
- tag-scoped Shared Questions;
- exact-Asset Reusable Image Questions with explicit per-stimulus opt-in.

Eligibility is selected before duplicate-Prompt precedence/deduplication. Case question-count selection is a separate later step.

## 12. Admin design

Production Admin supports content management plus current learner administration surfaces for retention and analytics.

The Systems & Topics workspace stages hierarchy, Primary Topic, and Case Tag changes in one review/apply flow while preserving the established domain-write boundaries.

Admin Study Preview resolves current learner content but remains outside learner persistence.

## 13. Imports

Source reconstruction is deliberately outside the Production importer. Human-reviewed content is finalized deterministically into Import Package v1, then the existing importer performs validated Production writes.

Executable validators/schemas outrank old extraction prompt examples.

## 14. Production versus repository

This document describes **repository behavior**, not proof of Production rollout. Any claim that FSRS, migrations `0019`-`0025`, learner Progress, retention, or Admin analytics are live in Production requires separate release/verification evidence.
