# Multi-System Runtime v2 Implementation

_Status: repository implementation evidence for the Multi-System Runtime tranche. This document does not claim Production migration or deployment._

_Date: 5 September 2026._

This document records the implementation of the first tranche assigned by `MULTI_SYSTEM_STUDY_PLAN.md`: the scope/runtime foundation only. The learner multi-select chooser and learner-facing per-System configuration remain a later Multi-System UX tranche.

## Runtime contract

The learner runtime now uses descriptor/scope version **2** for both Scheduled and Free Study. Scheduled run-boundary, captured-membership, and repeat-origin proofs use proof version **2**.

The canonical authenticated run scope is:

```js
{
  systems: [
    { systemId: 'system-a', mode: 'all' },
    {
      systemId: 'system-b',
      mode: 'routes',
      routes: [
        { routeType: 'topic', routeId: 'topic-b' },
        { routeType: 'tag', routeId: 'curated-tag-b' }
      ]
    }
  ]
}
```

Normalization is deterministic. System entries and route entries are sorted canonically. Duplicate Systems, duplicate routes, malformed IDs, ambiguous entries, unsupported route types, empty explicit-route scopes, and contradictory `all` shapes fail closed.

Raw request limits are:

```text
selected Systems: 64 maximum
explicit Topic/Tag routes: 512 maximum across the run
System/Topic/Tag IDs: 128 characters maximum
Scheduled unique Cases: existing 20,000-Case supported envelope
```

Whole-System `all` selection does not materialize every Topic/Tag route into the descriptor.

Candidate resolution unions all selected System sub-scopes and deduplicates by Case ID. A Case can contribute through multiple selected Systems but appears only once in the run.

Concrete historical System attribution remains scalar. For a multiply-contributed Case, attribution is deterministic:

1. prefer a selected native contribution from the System containing the Case's active Primary Topic;
2. otherwise choose the stable normalized contributing System by System ID.

The chosen System is frozen when the Active Review is created. No synthetic `Mixed` System exists.

Current single-System `/study` is preserved as a special case: the existing chooser still submits one System/route selection, and that request is normalized into the same v2 runtime owner.

## Active Review v2 persistence and D1 guard

Migration:

```text
0026_multi_system_active_review_scope_v2.sql
```

replaces the old `active_reviews_content_scope_guard` with the strict v2 guard.

Persisted `active_reviews.scope_json` is deliberately not just the run scope. It is the Active Review attribution envelope:

```js
{
  version: 2,
  systemId: 'system-b',
  runScope: {
    systems: [
      { systemId: 'system-a', mode: 'all' },
      {
        systemId: 'system-b',
        mode: 'routes',
        routes: [{ routeType: 'tag', routeId: 'curated-tag-b' }]
      }
    ]
  }
}
```

`systemId` must equal the row's scalar `active_reviews.system_id`. D1 then proves that this attribution System is present in `runScope` and that the Case is genuinely reachable through that exact selected System sub-scope.

The migration also rejects:

- unknown or contradictory v2 JSON keys/shapes;
- duplicate System entries;
- duplicate Topic/Tag routes;
- noncanonical System ordering;
- malformed or overlong IDs;
- an attribution System not selected in `runScope`;
- wrong or unselected Topic routes;
- Tags not curated to the selected System;
- Tags not actually attached to the Case;
- inactive or missing Primary Topic eligibility;
- inactive/Preview-owned Cases;
- inactive/non-System attribution concepts.

The existing learner-content baseline remains unchanged: every presentable learner Case must have an active Primary Topic. Curated Tags are alternate routing, not a replacement for canonical Primary Topic ownership.

## Existing learner behavior preserved

The v2 runtime keeps the existing global behavior rather than introducing per-System scheduler state or quotas:

- run sizes `5 / 10 / 20 / All available` apply to combined unique Cases;
- default run size remains `10`;
- the 50-consecutive-New guard remains global to one Scheduled run;
- Due-first/New-first remains a global Scheduled ordering preference;
- matured FSRS in-run repeats retain priority and do not consume another distinct-Case slot;
- Free Study shuffles one combined deduplicated bag and writes no Scheduled FSRS state;
- continuous plan-to-first-open and completion-to-next-open navigation remains in place;
- Reset Progress / Fresh FSRS Start remain server-authoritative boundary invalidations;
- exactly-once Scheduled and Free completion remains receipt/event-first on retry.

There is still one learner × Case FSRS state and one learner parameter set. Multi-System selection changes eligibility/routing only.

## Browser v1 retirement

Learner run storage now writes:

```text
flash-cards:learner-study-run:v2
```

and local FSRS preview storage writes:

```text
flash-cards:fsrs-preview-run:v2
```

The previous `:v1` keys are deliberately deleted when read/cleared. They are not reinterpreted as v2. Scheduled and Free browser navigation reject descriptor version 1.

This is valid only under the fenced exact-zero cutover assumption below. If live v1 learner work exists, the clean-cutover design is invalid and deployment must stop for a separately reviewed compatibility design.

## Exact-zero cutover gate

Repository command:

```sh
npm run multi-system:cutover-gate -- --remote
```

is a read-only fail-closed Production gate. It requires exactly zero rows in:

```text
active_reviews
active_review_questions
active_review_assets
scheduled_review_events
free_review_completion_receipts
learner_case_fsrs
learner_case_encounters
learner_optimizer_evidence
learner_aggregates
learner_system_aggregates
learner_system_monthly_buckets
learner_fsrs_profiles
reviews
review_questions
review_assets
```

`learner_fsrs_profiles = 0` is mandatory. There is no pristine/default-profile exception because Scheduled planning can create a legitimate profile before an Active Review or completion exists.

`learner_preferences` are intentionally not a zero-data sentinel because normal Study page use may create preferences without starting a run.

Any malformed count or any nonzero required sentinel fails the gate.

## Mechanically enforced Production cutover

The Production workflow may retain its normal `apply_migrations` control for ordinary **post-cutover** releases, but there is no effective `apply_migrations=false` bypass for the first or an incomplete Runtime v2 cutover.

A strict-v2 D1 trigger by itself is **not** considered evidence that the clean cutover completed. Before any Production fence is installed, `.github/workflows/deploy-production.yml` independently inspects:

1. the D1 Active Review guard; and
2. the currently deployed runtime status endpoint.

A previous v2 cutover is treated as complete only when both signals are valid:

```text
D1 active_reviews_content_scope_guard = verified v2
AND
/api/runtime-cutover-status = HTTP 200 with:
  learnerRuntimeCutoverVersion = 2
  learnerRuntimeScopeVersion = 2
  learnerRuntimeWriteFence = false
  learnerRuntimeBuildSha = valid immutable 40-hex commit SHA
```

An absent, legacy, malformed, or still-fenced runtime therefore does **not** become “complete” merely because migration `0026` exists. That state re-enters the fenced exact-zero sequence. A D1 inspection/authentication failure or runtime-status transport failure stops before the workflow mutates or fences Production.

For a first or incomplete cutover, the workflow mechanically performs:

```text
repository validation
→ migrated-D1 v2 scope-guard acceptance
→ migrated-D1 Scheduled/Free lifecycle acceptance
→ supported JS/browser-envelope benchmark
→ supported-envelope D1 trigger benchmark
→ inspect D1 guard + deployed v2 runtime completion state
→ require D1 write credential before fencing
→ deploy temporary learner-runtime fence Worker
→ verify fence is live
→ run exact-zero Production gate
→ apply all pending D1 migrations regardless of ordinary migration input
→ verify v2 Active Review guard
→ deploy expected v2 Worker with LEARNER_RUNTIME_WRITE_FENCE=true and APP_BUILD_SHA=GITHUB_SHA
→ verify exact expected build SHA + fence=true + v2 runtime/guard/zero-data state
→ redeploy the same expected build without the fence
→ verify exact expected build SHA + fence=false
```

The shared learner Study access owner rejects `/study` planning/open/resume/reveal/completion while `LEARNER_RUNTIME_WRITE_FENCE` is active. The temporary Worker provides an additional outage-level fence before migration.

The runtime status endpoint exposes `learnerRuntimeBuildSha` from `APP_BUILD_SHA`. Fenced and reopened verification compare it to the exact workflow `GITHUB_SHA`; merely reaching some v2 Worker is not enough.

Subsequent ordinary deployments may skip the historical exact-zero/fence sequence only when both the v2 D1 guard and an already-open identified v2 runtime prove the previous cutover completed. They then return to the normal repository migration policy: code-only deployment is allowed with `apply_migrations=false`, while `apply_migrations=true` applies pending migrations before Worker deployment.

Production verification during the cutover fence is non-mutating. It checks runtime build/status, guard presence, and zero-data sentinels; it does not bypass the fence to manufacture synthetic learner history.

## Validation owners

Repository-owned focused commands are:

```sh
npm run multi-system:d1-acceptance
npm run multi-system:d1-lifecycle-acceptance
npm run multi-system:benchmark
npm run multi-system:d1-trigger-benchmark
npm run multi-system:cutover-gate
npm run multi-system:guard-verify
```

`.github/workflows/multi-system-runtime-v2.yml` uses the current pull-request concurrency convention (`cancel-in-progress: true` for the same PR), runs focused v2 source/runtime contracts, applies all repository migrations to isolated local D1, runs both D1 acceptance owners, and executes both supported-envelope benchmarks.

### Direct migration / scope-guard acceptance

`multi-system:d1-acceptance` remains the focused migration-`0026` guard test. It uses direct `active_reviews` INSERT fixtures after all repository migrations and explicitly covers:

- whole-System `all` native Topic reachability;
- whole-System curated-Tag reachability;
- explicit curated Tag routes;
- forged/unselected attribution;
- selected System with the wrong route;
- duplicate System entries;
- contradictory `all` plus routes shape;
- inactive Primary Topic;
- missing Primary Topic;
- attribution System not selected.

This command is deliberately retained as a trigger-focused acceptance; it is not presented as the complete runtime lifecycle acceptance.

### Real migrated-D1 lifecycle acceptance

`multi-system:d1-lifecycle-acceptance` bundles the real runtime service code into workerd, applies **all repository migrations** to isolated local D1, and exercises a genuine two-System scope where a Case contributes by a curated Tag under System A and by its native active Primary Topic under System B.

The Scheduled path proves:

```text
multi-System Scheduled planning
→ owner/proof validation
→ authenticated Active Review open/revalidation
→ deterministic concrete attribution to native System B
→ persisted v2 attribution envelope with both selected Systems
→ reveal
→ Good completion
→ same-request lost-response replay
→ one scheduled_review_event
→ one learner×System aggregate update for System B
→ one UTC-month learner_system_monthly_buckets update for System B
→ learner aggregate + optimizer evidence + learner×Case FSRS state
→ Active Review consumed exactly once
```

The Free path proves:

```text
multi-System Free planning
→ authenticated Active Review open
→ deterministic concrete attribution to System B
→ reveal
→ completion
→ same-request lost-response replay
→ exactly one Free receipt/encounter/learner aggregate update
→ no Scheduled event, System aggregate, monthly bucket, or FSRS profile
→ Active Review consumed exactly once
```

The same acceptance also proves an invalid cross-System Topic scope cannot open an Active Review.

### Supported JS/browser-envelope benchmark evidence

The focused v2 workflow was measured against the supported maximum envelope of **64 Systems, 512 normalized explicit routes, and 20,000 unique Cases** after eliminating repeated native-System scans for multi-Topic selections.

Latest green GitHub Actions result on the code-validation head:

```text
scope normalization:                  68.35 ms
union / dedupe / System attribution: 1312.74 ms
Scheduled descriptor + proofs:        93.41 ms
Free Study bag:                       25.86 ms

Scheduled descriptor:             1,387,180 bytes
Free descriptor:                    307,680 bytes
Scheduled membership proofs:             313
proof bytes total:                  524,844 bytes
largest proof:                        1,679 bytes
```

The enforced JS/browser limits remain:

```text
scope resolution:             < 5,000 ms
Scheduled planning:           < 5,000 ms
Free planning:                < 5,000 ms
browser descriptor size:      < 4,500,000 bytes
```

### Supported-envelope D1 trigger benchmark evidence

`multi-system:d1-trigger-benchmark` uses workerd plus D1 after all repository migrations and writes valid Active Reviews through migration `0026` itself. It measures both:

- canonical **64-System / 512 explicit Topic-route** persisted v2 scope; and
- representative **64-System `all`** persisted v2 scope.

After two warmups, twelve measured INSERTs per shape produced:

```text
64 Systems / 512 routes:
  median: 16.84 ms
  p95:    20.40 ms
  max:    20.40 ms

64 Systems / all:
  median: 13.77 ms
  p95:    17.04 ms
  max:    17.04 ms
```

Executable D1-trigger limits are:

```text
p95 valid Active Review insert: < 750 ms
single valid Active Review insert: < 1,500 ms
```

The measured strict-v2 trigger therefore has substantial headroom at the supported scope envelope.

Existing specialized FSRS workflows continue to cover Active Review lifecycle, Scheduled completion including Due/Repeat, Free completion, Reset/Fresh races, workerd compatibility, browser descriptor storage, and analytics/deletion regressions.

## Deferred to Multi-System UX

This tranche intentionally does **not** implement:

- learner multi-select System chooser;
- learner-facing per-System Topic/Tag configuration UI;
- balanced/equal System sampling;
- per-System FSRS state or parameters;
- synthetic `Mixed` System;
- FSRS algorithm or optimizer changes.

The current single-System chooser remains the learner-facing entry point until the UX tranche connects multi-System selection to the already-v2-capable runtime.

## Release status

This repository implementation and its migration are not evidence of Production application.

At implementation handoff:

```text
Production D1 mutation: not performed
Production Worker deployment: not performed
Production cutover workflow dispatch: not performed
PR merge: not performed
```

Production migration/deployment/verification remain separately authorized operational actions after review and merge.
