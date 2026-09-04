# Flash-Cards — Version 1 Specification

_Last reconciled: 4 September 2026._

## 1. Purpose and status

This document specifies concise **current repository V1 behavior**. It is not a Production deployment ledger. Use `CURRENT_PRODUCT_ROADMAP.md` for status and `V1_DATA_MODEL.md` plus the relevant subsystem authority for exact schema/implementation semantics.

The GitHub repository is public. The application is closed-enrollment/private and public self-registration remains disabled on current `main`.

## 2. Learner behavior

A learner can, where the relevant feature is enabled/deployed:

1. sign in;
2. choose a System;
3. choose Scheduled Study or Free Study;
4. choose a run size of 5 / 10 / 20 / All available Cases, default 10;
5. use the current learner content-mode preference/choice for Original/Core versus Expanded Learning;
6. receive a server-validated run of eligible Cases through native Topic and/or explicitly exposed Tag reachability;
7. open an active Review that freezes the selected Case/questions/media plus scheduler/run/scope provenance;
8. reveal answers;
9. for Scheduled Study, rate the whole Case Again / Hard / Good / Easy;
10. for Free Study, complete a non-scheduling exposure without a Scheduled rating;
11. continue automatically to the next eligible Case when one can open immediately;
12. view learner Progress derived from current FSRS state, compact aggregates, and retained detailed history;
13. use Reset Progress or Fresh FSRS Start according to their distinct data-retention/scheduler-boundary semantics.

Required FSRS short-term repeats do not consume an additional distinct-Case run slot.

Browser run/localStorage state is convenience state only. Server-authenticated run/scope/work proofs and current learner profile boundaries are authoritative.

## 3. Current learner persistence

Unfinished learner attempts are owned by:

```text
active_reviews
active_review_questions
active_review_assets
```

Current learner routes do not use the historical persisted `reviews`, `review_questions`, or `review_assets` model as a supported runtime. Those physical tables remain only because historical migrations are immutable and the Production cutover preflight uses them as zero-data sentinels.

Authenticated Review media is resolved from the requested learner-owned unexpired active Review asset snapshot.

## 4. Scheduled Study / FSRS

Scheduling is Case-level and uses the pinned FSRS adapter with default desired retention 90%.

Scheduled completion:

- consumes the active Review exactly once;
- validates current scheduler/run/work boundaries;
- applies Again / Hard / Good / Easy;
- advances learner×Case FSRS state;
- writes a durable Scheduled Review event;
- maintains optimizer evidence/encounter/lifetime/System aggregates as defined by the current data model;
- transactionally maintains durable learner×historical-System monthly analytics buckets;
- preserves the historical System captured at study time.

Detailed human-readable event retention does not define whether current scheduling/analytics state exists.

## 5. Free Study

Free Study:

- uses the current content resolver and active Review snapshot model;
- records non-scheduling encounter/aggregate activity;
- uses short-lived retry receipts for exactly-once completion behavior;
- does not write a Scheduled Review event or Scheduled rating;
- does not advance Scheduled FSRS state.

## 6. Reset Progress

Reset Progress:

- invalidates/deletes any active learner Review;
- clears current learner×Case FSRS scheduling rows so Cases become New to scheduling again;
- preserves the current FSRS generation and canonical parameters;
- preserves retained Scheduled history, encounters, lifetime aggregates, System aggregates, and durable monthly analytics;
- advances the review-sequence boundary for an initialized learner;
- invalidates stale browser proofs through the changed server-side boundary.

## 7. Fresh FSRS Start

Fresh FSRS Start:

- invalidates/deletes any active learner Review;
- clears current learner×Case scheduling rows;
- restores canonical default FSRS parameters at 90% desired retention;
- advances generation, review-sequence, and parameter-revision boundaries for an initialized learner;
- clears/prunes optimizer metadata/evidence according to the current FSRS authority chain;
- preserves retained human-readable Scheduled history, encounters, lifetime/System aggregates, and durable monthly analytics;
- invalidates stale browser proofs through current profile checks.

Reset/Fresh and active-Review creation are serialized so no committed Reset/Fresh leaves an active Review on an old scheduler boundary.

## 8. Retention and Progress

Detailed Scheduled-history retention policies are:

```text
24 months (default)
36 months
60 months
indefinite
```

Production Admin can set a per-learner retention override at `/admin/learner-retention` on current repository code.

Learner Progress exposes useful scheduling/activity information such as Due Cases, SRS coverage, not-due scheduled Cases, Scheduled/Free activity, rating distribution, System-level summaries, and retained recent Scheduled history. Raw FSRS internals are not the primary learner-facing model.

## 9. Admin analytics

Current repository Admin analytics at `/admin/learner-analytics` include learner-wide totals, per-System totals, per-System monthly trends, cross-learner System trends, and stable cohort/time-series views.

Long-range time series are sourced from:

```text
learner_system_monthly_buckets
(user_id, system_id, month_start)
```

`month_start` is a UTC calendar-month boundary. Buckets survive detailed-event expiry and retain historical System attribution.

Already-expired historical months are not fabricated from `learner_system_aggregates` or optimizer evidence. Migration `0025` backfills only from detailed Scheduled events still present when the migration is applied.

V1 cohort membership is learner Better Auth account-created UTC month.

## 10. Mature learner account deletion

Current repository deletion design uses a retry-safe staged path:

- create a durable deletion marker and deny access;
- drain Better Auth/application-owned rows in bounded phases;
- make phases idempotent/retry-safe;
- perform a residual rescan;
- fail closed if any learner-owned row survives;
- invoke final Better Auth identity deletion only after the staged data gate is clear.

Direct one-shot cascade is not the supported mature-account path because some learner-owned history/evidence is not universally lifetime-bounded.

## 11. Administrator content behavior

Current Case classification is:

```text
Case
├── exactly one Primary Topic
└── zero or more Case Tags
```

Systems are navigation roots. Cases do not directly attach to Systems. System↔Tag exposure is a separate global learner-navigation relationship.

Production Admin supports:

- create/browse/edit Cases;
- one canonical Primary Topic per current Case;
- Case Tags and System↔Tag exposure;
- visual Systems & Topics taxonomy/classification workspace;
- Case lifecycle deactivate/restore;
- fixed image and Alternative Set authoring;
- explicit Original/Alternative family curation;
- whole-Case/Topic/stimulus/Shared/reusable exact-Asset Questions;
- Images/Collections and narrow same-image higher-resolution replacement;
- strict reviewed Import Package v1 workflows;
- Admin Study Preview;
- learner retention overrides;
- learner analytics.

Additional Study Topics are not current authoring behavior. Historical secondary rows may remain as compatibility data.

## 12. Stimulus behavior

Fixed `case_assets` appear whenever the Case is presented.

Each active Alternative Set selects an eligible option under the current content-mode rules. A curated family has an explicit Original pointer. Insertion/display order, filename, caption, or historical snapshots must not be used as implicit Original semantics.

`Remove from Case`, option deactivation, Asset active/inactive state, derived current/historical/unused classification, same-image higher-resolution replacement, and permanent Asset/R2 deletion are distinct operations.

## 13. Question behavior

`question_prompts` stores wording only. Answers live at the relationship/object where they remain correct.

Current eligible source families include:

- Case Questions;
- Topic/ancestor Questions;
- Stimulus Group Questions;
- Case-specific exact Stimulus Option Questions;
- Tag-scoped Shared Questions;
- exact-Asset Reusable Image Questions with explicit per-usage opt-in.

Source eligibility is selected before duplicate-Prompt precedence/deduplication. Case question-count selection is applied afterward.

## 14. Imports

The Production application accepts strict reviewed Import Package v1, not arbitrary `.apkg`, PowerPoint, or PDF source files.

Semantic source reconstruction and human review happen before final deterministic package creation. Executable package/review-map validators are authoritative over old prompt examples.

For current reviewed Case imports, `secondaryTopicIds` is retained only as an empty compatibility field.

## 15. Authentication and Account Management

Current `main` retains closed enrollment/public-signup disablement and established Production/Preview role boundaries.

Account Management implementation PRs #96 and #97 remain open drafts and are not part of current `main`. Their design/prompts describe intended/branch behavior, not merged V1 behavior.

## 16. Migration boundary

Current repository migrations extend through:

```text
0025_learner_fsrs_admin_analytics_deletion.sql
```

Presence in the repository is not proof of application to Production D1.

## 17. Production boundary

Do not claim a repository feature is live in Production without separate deployment/migration/verification evidence. This applies especially to the FSRS runtime and migrations `0019`-`0025`.
