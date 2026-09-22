# D1 learner Study read-amplification reduction

Status: Draft PR implementation plan. Use current code and Issue #191 measurements as the starting point; this document is not proof of a Production bottleneck or deployment.

## Goal and evidence

Reduce D1 reads in the normal learner journey: open Study → plan → open/complete a series of Reviews. Optimize **rows read / unnecessary collection scans**, not just browser latency or the number of SQL statements.

Issue #191 previously measured local Worker/D1 behavior and deferred D1-1–D1-4 because individual changes did not demonstrate a material learner-visible latency gain. D1-1 nevertheless returned all active Prompt bodies (100 / 1,000 / 5,000 rows at the measured fixture sizes); this PR is specifically motivated by potentially high D1 read consumption, not a newly established latency problem. Reuse that evidence and avoid rerunning the whole Issue #191 audit. Navigation CPU indexing is already implemented in #193; Admin authentication timing belongs to #199.

Current source candidates:
- `src/lib/server/db/learner-case-source.js`: `loadCaseSource()` loads **all** active Production Question Prompts into a map on each new Review snapshot.
- `src/lib/server/db/active-reviews.js`: both Scheduled and Free create paths invoke `resolveMultiSystemStudySelection()` for every new Review, in addition to the selection resolved during planning. `src/lib/server/db/study-navigation.ts` materializes the active eligible Case/Tag/Topic snapshot.
- The Review open route separately fetches an existing active Review and the create service checks again; do not assume a redundant read can safely be deleted across the create/race boundary.

## Scope: two focused tranches in this same Draft PR

### A — Case-specific Prompt retrieval

Make the new-Review Case source retrieve only currently applicable active Production Prompt bodies after finding the relevant Case, inherited Topic, shared/Tag, chosen Original/Alternative stimulus, and reusable Asset question references. Preserve eligibility, answer/source precedence, duplicate handling, ordering, mode-dependent option selection and the exact frozen Review payload. Do not query a Prompt separately per question or materialize another global library; choose the smallest bounded/targeted lookup compatible with the existing code. The current stimulus loader consumes a Prompt map: adjust its narrow read contract only as needed, rather than duplicating the library read.

### B — Review-open eligibility read

On the new-Review open path, investigate a targeted authoritative validation of the requested Case and its selected multi-System scope instead of resolving the full eligible Case population each time. Preserve canonical scope normalization, active/Preview separation, valid Topic ancestry and curated Tag routes, attribution, case eligibility, scheduled run/membership proof, concurrent-open/resume behavior, expiration, deletion fences, and post-insert authoritative readback. Do not trust browser Case IDs/counts or use persisted client data as the authoritative eligibility source. Keep existing full-population resolution for launcher, exact count and planning as needed.

If B cannot be delivered as a small, provably equivalent change, report the measured blocker in this PR and defer B rather than inventing a cache, denormalized index, schema change, or broad runtime rewrite.

## Test and measurement contract

Use the local WSL checkout with the existing local D1/Worker and non-Production test accounts. Reuse the existing repository benchmark/fixtures where practical; do not create an elaborate new harness. Record baseline and post-change operations on the **same fixture** and comparable runs:
- Study launcher → multi-System scope/count → plan → 10 consecutive Review opens and completions (Free and Scheduled where relevant).
- For each candidate, show query shape and per-open global versus targeted rows/returned bytes where observable, SQL statements/batches, and elapsed time as supporting context. Report actual D1 `rows_read` only when the environment exposes it; returned rows and loopback timings are **not** Cloudflare billed rows or Production latency. If available, obtain real aggregate Cloudflare read metrics through a separate read-only, explicitly authorised measurement, not through routine Production test traffic.
- A: compare deterministic baseline and changed full question pools and persisted frozen snapshots (normalizing generated IDs/timestamps only where necessary) for a representative Case with Case, ancestor/Topic, shared, reusable Asset and stimulus-group/option questions in Original and Expanded modes. Test inactive/Preview Prompts cannot leak.
- B: focused actual open-route/service tests for multi-System and overlapping Tag/Topic scope, inactive/unavailable Case, stale scheduled proof, and two concurrent opens. Verify resume behavior and authoritative snapshot/readback after creation. Do not substitute helper-only tests for route/service proof.
- Retain existing repository-required focused and final validation; one manual learner browser smoke of launcher → a short run → image/reveal/complete/resume is sufficient absent an observed regression.

Report each tranche's concrete before/after row/read evidence and test results in the PR. If the representative measurements show no meaningful reduction, do not expand scope in pursuit of an arbitrary percentage.

## Explicit non-goals

No change to FSRS math, scheduling, Review completion/receipt paths, Better Auth/session handling (#199), Admin read models, R2/image permissions, private media caching, SQL schema/indexes, cross-request caching, Production/Preview data, deployment or migration. No merge or Ready-for-Review transition without the user's approval.
