# Learner FSRS Runtime Cutover Status

Status: **Implementation authority for the learner Review runtime cutover in PR #137**

Date: 3 September 2026

This document records the repository architecture established by the FSRS learner runtime cutover. It is an implementation-status companion to:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — locked product authority;
- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md` — technical design;
- `LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md` — pre-implementation readiness contract.

The readiness contract's Section 1 sentence that described then-current `main` as still owning learner Review runtime through `reviews`, `review_questions`, and `review_assets` was a **pre-cutover repository observation**. Once PR #137 is merged, this document supersedes that current-state observation. The readiness contract's behavioral and safety requirements remain authoritative.

This document does **not** claim that the cutover has been deployed to Production. Repository merge state, D1 migration state, Worker deployment, feature enablement, and explicit Production verification remain separate facts.

## Post-cutover repository ownership

After this cutover, normal learner Study is owned by the active FSRS/Free runtime:

- `/study` plans Scheduled or Free System-scoped runs through the FSRS run-planning services;
- unfinished learner work is represented by `active_reviews`, `active_review_questions`, and `active_review_assets`;
- reveal/resume reads the active Review snapshot;
- Scheduled completion is owned by the Scheduled FSRS completion service;
- Free completion is owned by the Free Study completion service;
- learner run continuation is browser-local convenience state backed by server-validated run/proof boundaries;
- authenticated learner Review media is served from active Review asset ownership, not legacy `review_assets`;
- Asset/R2 lifecycle checks treat active unfinished Reviews as the temporary learner-media owner.

The old persisted learner Review model is not a supported runtime mode.

## Legacy Review table status

The physical tables `reviews`, `review_questions`, and `review_assets` remain only because historical migrations are immutable repository history and because the deployment preflight uses their row counts as cutover sentinels.

Current application Drizzle schema does not export those tables. Current learner routes do not create/read/complete them. Legacy Review media readers and the optional-route legacy Review insert/read compatibility module are retired.

The Production cutover gate is fail-closed:

1. read the legacy Review-table counts using the dedicated preflight tooling;
2. require zero unexpected learner rows;
3. abort deployment if the zero-data assumption is false;
4. do not delete Production learner data as part of the gate.

Local destructive replica refresh tooling may clear stale legacy rows because local replica reset is explicitly destructive and is not Production retention behavior.

## Admin Study Preview boundary

Admin Study Preview remains outside learner persistence. It resolves current learner content using the active snapshot/content resolver but does not create learner preferences, FSRS state, active Reviews, completion receipts, or legacy Review rows.

Preview workspace cleanup protects against unexpected `active_reviews` / `active_review_assets` ownership. It no longer uses legacy Review tables as a current ownership source.

## Durable System provenance

System deletion/reclassification safety is owned centrally. Durable FSRS System attribution currently includes Scheduled Review events and learner System aggregates, with application guards plus defensive database triggers. New durable System-attribution tables must be registered with the same provenance authority rather than inventing independent deletion rules.

## Migration/parser compatibility

The cutover branch incorporates the current-main D1 trigger-parser fixes for migrations `0020`, `0021`, and `0022`. Trigger bodies use the repository's parser-safe parenthesized `SELECT (CASE ...)` form where required by the remote D1 statement splitter contract.

## Validation required before Ready for Review

PR #137 remains Draft until all of the following are true on one exact head based on current `main`:

- repository fast validation is green while Draft;
- specialized FSRS D1/runtime/benchmark workflows are green;
- obsolete legacy Review source/test contracts are retired or converted to active-snapshot tests;
- the final `main...HEAD` diff is reviewed again;
- the PR is then marked Ready for Review so the repository's full validation contract runs on that same head.

Production deployment and Production D1 mutation are outside this PR-review step unless separately requested and explicitly executed.
