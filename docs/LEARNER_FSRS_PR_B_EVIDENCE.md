# Learner FSRS PR B — systems-first run-planning evidence

Status: **Implementation evidence for PR B only. No learner Review runtime cutover.**

Date: 2 September 2026

PR B starts from `main` after merged PR #130 / Part A:

```text
5a8d66d7c4b7c370002db74c97ae7df7dc2f3e9a
```

It implements the bounded **systems-first UX transplant + run planning** tranche from the learner FSRS design merged through PR #101.

## 1. Scope retained from PR #119

PR #119 remains a reference branch, not a merge dependency.

PR B selectively reuses its systems-first System → exact Topic / curated Tag chooser semantics, all-contributing-routes-selected default, OR/union Case selection, Case deduplication, exact Topic semantics, canonical Topic-over-Tag provenance, curated-Tag precedence, structural parent controls, exact/subtree counts, and route normalization/validation.

PR B deliberately does **not** port permanent selection tables, `study_selection_id`, persistent selection-route provenance, PR #119's migration, per-run Original / Expanded Learning selection, or Review creation/continuation behavior.

The reusable chooser accepts an explicit `scheduled` or `free` mode and has no question-set selector. Expanded Learning remains the persistent learner preference established by Part A.

## 2. Run descriptor ownership and resume cursors

For Scheduled Study, at one server-generated `runStartedAt`, the planner normalizes/resolves the selected scope, bootstraps the learner preference/profile boundary, reads learner FSRS and compact encounter state without an N+1 query, partitions selected Cases into Due/New/not-due, orders Due by lowest FSRS retrievability, orders New as shuffled unseen then shuffled previously-encountered groups, creates one authenticated run boundary, attaches authenticated Due/New membership evidence, and initializes repeat/completed/current-Review/consecutive-New browser state.

Currently not-due Cases are absent from the captured workload. Due/New preference and Expanded Learning values in the descriptor are convenience snapshots; D1 preferences remain the cross-device owner.

The Scheduled descriptor has explicit `duePosition = 0` and `newPosition = 0` cursors. `capturedDue` and `capturedNew` are immutable captured-order arrays. Later browser runtime work advances the relevant cursor as it scans work; skipping a stale/revalidated-away entry can therefore advance a cursor without falsely adding that Case to `completedCaseIds`. Serialize → browser storage → read → parse preserves both positions and the captured arrays.

The Free descriptor contains the same normalized scope plus one deduplicated shuffled Case bag, position, current Review reference, and Expanded Learning preference snapshot. It does not initialize/read FSRS profile/state and contains no scheduler proof.

## 3. Authenticated Scheduled boundary and membership

Browser `localStorage` is not scheduling authority.

PR B uses versioned HMAC-SHA-256 proofs with domain-separated key derivation from a server proof secret. No D1 run/session row is introduced.

The run-boundary proof binds learner, run id, server start time, normalized scope fingerprint, FSRS generation, review-sequence epoch, parameter revision, scheduler revision/library version, and proof version.

Captured workload uses authenticated **64-entry membership chunks** rather than one capability per Case. Each chunk binds learner/run/scope/queue class and a digest of the authenticated run boundary. Due entries additionally authenticate Case id, captured `state_revision`, and captured Due timestamp; New entries authenticate captured Case membership.

Verification rejects wrong learner, bad signature, cross-run/boundary/scope replay, Due/New queue replay, and Case substitution outside the authenticated chunk. The later Scheduled-open PR still owns current profile/content/scope/state revalidation before work is opened.

## 4. 50-New guardrail

The descriptor initializes `consecutiveNewCompleted = 0`. This is browser UX state only. PR B adds no server counter, replay ledger, run/session row, or authorization dependence for the 50-New rule.

## 5. Browser/proof benchmark and complete supported Scheduled envelope

PR B retains the Node companion command:

```bash
npm run fsrs:run-benchmark
```

It builds the production Scheduled descriptor shape through `buildScheduledStudyRunDescriptor(...)`, uses the actual proof implementation and systems-first selection resolver, and compares the chosen 64-entry chunk representation with per-entry capabilities. It is a representation/serialization companion, not the browser acceptance gate.

PR B also adds a dedicated GitHub Actions workflow, **Learner FSRS browser benchmark**, which installs a pinned ephemeral Playwright runner and real Chromium without adding Playwright to the application dependency or lockfile surface. The benchmark writes the actual serialized Scheduled descriptor to `localStorage`, reads it back, parses it, verifies the Due/New cursors, captured membership counts, and selected-scope route count, and probes the same origin until Chromium returns `QuotaExceededError`.

### Supported Scheduled maximum and fail-closed boundaries

PR B now defines the complete browser-local Scheduled descriptor support envelope as:

- **20,000 unique selected Cases maximum**; and
- **512 normalized selected Topic/Tag routes maximum**.

These limits are independent. Overlapping valid routes may deduplicate to the same Case workload, so bounding only unique Case count would not bound serialized `selectedScope.routes` metadata.

The server-side systems-first planning boundary applies the route guard to `selection.routes.length` **after authoritative normalization/deduplication** and before lazy FSRS profile/preferences bootstrap or learner FSRS/encounter reads. The Case-count guard is applied at the same pre-bootstrap boundary. Therefore:

- 20,001 selected Cases fails with `selection-too-large` before learner progress can begin;
- 513 normalized Topic/Tag routes fails with `selection-too-large` before learner progress can begin.

The 512-route ceiling is an explicit implementation support bound, not a claim about current Production taxonomy size. It is deliberately much larger than an ordinary learner selection while making the complete serialized scope envelope finite and testable.

### Exact Chromium evidence for the combined envelope

At exact correction head:

```text
52f406a8081142cb776cb20f8f228e90aa3bf9b4
```

**Learner FSRS browser benchmark #7** passed on Chromium `140.0.7339.16`.

The representative fixture remains 1,000 Due + 4,000 New with three routes:

```text
Representative: 1,000 Due + 4,000 New + 3 routes
  response/descriptor UTF-8 bytes: 396,648
  serialized characters:           396,648
  median localStorage write:        0.9 ms
  median localStorage read:         0.0 ms at browser timer resolution
  median JSON parse:                0.9 ms
```

The worst-supported fixture combines **both support maxima simultaneously** and uses UUID-length Case and route identifiers so short synthetic IDs do not understate the descriptor:

```text
Worst-supported: 20,000 Due + 0 New + 512 normalized routes
  response/descriptor UTF-8 bytes: 3,798,357
  serialized characters:           3,798,357
  median localStorage write:        11.0 ms
  median localStorage read:         0.0 ms at browser timer resolution
  median JSON parse:                7.1 ms

Quota probe on the same Chromium origin
  characters stored before QuotaExceededError: 5,111,808
  approximate UTF-16 payload bytes:             10,223,616
```

The all-Due fixture is deliberately storage-heavy because each captured Due entry carries state-revision/due metadata as well as proof membership indexing. Chromium successfully persisted and restored the descriptor containing the maximum Case workload and maximum normalized selected scope before the quota probe was run.

The quota number is evidence for this GitHub runner/browser combination only. It is **not** a universal Chrome, Safari, Firefox, mobile, OS, or private-mode quota promise. The application safety boundary is the explicit server-side Case + normalized-route envelope and fail-closed handling before learner progress starts.

## 6. D1-compatible planning-read benchmark

PR B adds:

```bash
npm run fsrs:run-d1-benchmark
```

It uses migration `0019_learner_fsrs_foundation.sql` and measures the exact user-bounded reads used by PR B:

```text
learner_case_fsrs WHERE user_id = ?
learner_case_encounters WHERE user_id = ?
```

It records representative occupancy, returned rows, timings, SQLite query plans, and foreign-key violations. This avoids candidate-sized SQL parameter lists and per-Case N+1 reads. It is D1-compatible SQLite evidence, not Cloudflare rows-read billing/network-latency evidence.

## 7. Rollout boundary

PR B deliberately does **not** connect the new planner/chooser to the current learner `/study` Review runtime. The legacy Review start path remains until active-Review ownership/frozen-payload and Scheduled completion/cutover work exist.

Therefore PR B adds no learner runtime cutover, migration, Production mutation, deployment, active Review lifecycle, FSRS completion transaction, Free completion receipt, or Reset/Fresh behavior.

## 8. Focused correction coverage

Repository tests now prove:

- 20,000 Scheduled Cases are accepted by the Case support-boundary guard;
- 20,001 Cases are rejected with `selection-too-large`;
- 512 normalized Scheduled routes are accepted;
- 513 normalized Scheduled routes are rejected with `selection-too-large`;
- the route guard operates on authoritative `selection.routes.length` and is ordered before learner profile bootstrap;
- Scheduled descriptors initialize `duePosition` and `newPosition` at zero;
- serialize/parse preserves those cursors and immutable captured order;
- advancing a cursor does not imply completion;
- the browser benchmark verifies the selected-scope route count in the restored descriptor.

Remote GitHub CI remains authoritative for repository-wide validation.

## 9. GitHub validation history

The original completed implementation head was:

```text
9bcfa8182fbaef4900d8bff0e16913fccd617bd2
```

At that exact head:

```text
CI #1576                         SUCCESS
Wrangler runtime smoke #261     SUCCESS
Learner FSRS workerd smoke #11  SUCCESS
```

The first independent-review correction for browser-storage evidence and Scheduled resume cursors was validated at `06c788ea2930a2e6cd8b183946ef5f9c5c9093de`.

The final route-envelope correction head is:

```text
52f406a8081142cb776cb20f8f228e90aa3bf9b4
```

At that exact head:

```text
CI #1586                              SUCCESS
Wrangler runtime smoke #271          SUCCESS
Learner FSRS workerd smoke #21       SUCCESS
Learner FSRS browser benchmark #7    SUCCESS
```

Browser benchmark #7 supplies the combined 20,000-Case + 512-route measurements recorded in Section 5.

No migration, deployment, Production D1/R2 mutation, learner Review runtime cutover, merge, or Ready-for-Review transition was performed as part of these corrections.

This evidence update is documentation-only and therefore creates a later PR head. The independent reviewer should review the actual current head, use `0f9e5bfb68d1e88326fc011e0405247e26c27743 → 52f406a8081142cb776cb20f8f228e90aa3bf9b4` as the latest bounded implementation-correction delta, and verify the workflows attached to the final evidence head as the last executable gate.
