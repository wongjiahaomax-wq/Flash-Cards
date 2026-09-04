# Multi-System Learner Study Plan

_Status: proposed future-intent design. Not implemented on current `main`._

_Last reviewed against `main` at `ca56f915` on 4 September 2026._

## 1. Goal

Allow a learner to build one Scheduled Study or Free Study run from more than one System while preserving the existing FSRS, Active Review, run-proof, idempotency, D1 eligibility, continuous-navigation, and per-System analytics invariants.

Intended learner flow:

```text
Choose one or more Systems
→ optionally narrow each System by Topic / curated Tag
→ choose Scheduled Study or Free Study
→ choose 5 / 10 / 20 / All available unique Cases
→ complete one continuous mixed run
```

This enables integrated revision across a sufficiently large content library instead of forcing every learner run to remain inside one System.

## 2. Current baseline and clean-cutover assumption

Current `/study` is deliberately single-System:

- the chooser holds one selected System;
- the form submits one `systemId`;
- `resolveSystemStudySelection(...)` validates one System plus Topic/Tag routes;
- Scheduled and Free planners receive one `systemId`;
- browser run descriptors currently require `version === 1` and persist `selectedScope: { systemId, routes }`;
- Scheduled descriptors carry v1 captured-membership proof metadata;
- the cryptographic proof layer has its own independent `STUDY_RUN_PROOF_VERSION = 1` boundary;
- `active_reviews.system_id` stores one System attribution;
- `active_reviews_scope_system_check` currently uses `json_extract(scope_json, '$.systemId') = system_id`;
- the current D1 `active_reviews_content_scope_guard` understands top-level `scope_json.routes` and requires the Case to retain an active primary Topic before either Topic-route or Tag-route eligibility can succeed.

This plan is intentionally based on the current project state that there is **no learner runtime data or in-flight learner work that must be preserved**.

That assumption changes the rollout design materially. Multi-System Runtime should use a **clean v2 cutover**, not a long-lived dual v1/v2 compatibility regime.

The repository already uses fail-closed zero-data cutover gates for major learner-runtime transitions. Multi-System Runtime should follow the same philosophy.

If the zero-data assumption is no longer true at implementation/deployment time, stop the clean cutover. Do not silently deploy the v2-only contract over live v1 learner state.

## 3. Product behavior

### 3.1 System selection

The learner may select one or more Systems.

Selecting a System initially means **all currently eligible study areas in that System**.

Each selected System may optionally be expanded and narrowed using the existing Topic hierarchy and curated Tags.

Example:

```text
What do you want to study?

[x] Cardiovascular                 184 Cases
    Configure Topics / Tags

[x] Endocrine                       97 Cases
    Configure Topics / Tags

[ ] Dermatology                     82 Cases

[x] Renal                          106 Cases
    Configure Topics / Tags

3 Systems selected
327 unique eligible Cases

Run size: 5 / 10 / 20 / All
Default: 10 Cases
```

The displayed eligible count must use the same union/deduplication semantics as the server planner. It must not simply add per-System counts when selections overlap.

### 3.2 Per-System narrowing

A System may be represented in the authenticated v2 run scope as either:

```text
all
```

or:

```text
explicit Topic / curated Tag routes
```

Selecting the whole System should not require materializing every Topic/Tag route into browser run state. This avoids consuming the Scheduled route envelope merely because the learner selected several complete Systems.

Conceptual v2 run-scope shape:

```js
{
  systems: [
    { systemId: 'cardiovascular', mode: 'all' },
    {
      systemId: 'endocrine',
      mode: 'routes',
      routes: [
        { routeType: 'topic', routeId: 'diabetes' },
        { routeType: 'tag', routeId: 'adrenal' }
      ]
    },
    { systemId: 'renal', mode: 'all' }
  ]
}
```

The exact serialized contract may differ during implementation, but it must be normalized, deterministic, bounded, and server-validated.

### 3.3 Run size

`5`, `10`, `20`, and `All` apply to the **combined unique Case pool**.

The default remains **10 Cases**, matching the locked run-size amendment.

A 20-Case run across three Systems means up to 20 distinct Cases total, not 20 per System.

Required FSRS short-term repeats continue not to consume additional distinct-Case slots.

### 3.4 Scheduled ordering

Scheduled Study continues to apply the existing learner scheduling policy across the combined pool.

Do not manufacture an equal quota per System in the first implementation. If the highest-priority Due work is concentrated in one System, the mixed run may legitimately contain more Cases from that System.

A future explicit balanced/interleaved sampling mode is a separate product decision.

### 3.5 Free Study ordering

Free Study shuffles the combined deduplicated candidate bag using the existing Free Study semantics.

Free Study must continue to write no Scheduled FSRS state, Scheduled rating, Scheduled event, optimizer evidence, or Scheduled System aggregate.

## 4. Multi-System scope resolution

Keep the current single-System resolver as a reusable primitive where practical and add a multi-System owner above it.

The multi-System resolver must:

1. validate that every selected System exists and is active;
2. normalize each System scope;
3. validate every Topic/Tag route against its declared System;
4. resolve candidates for every System scope;
5. union candidates by `caseId`;
6. retain all contributing Systems/routes needed for deterministic attribution and database validation;
7. return a deterministic normalized run scope and deduplicated candidate set.

No client-provided candidate list or attribution System is authoritative.

Current whole-System semantics include both:

- native Cases whose primary Topic is under that System; and
- Cases reachable through Tags curated to that System.

The v2 resolver and D1 guard must preserve those semantics for `mode: 'all'` **without weakening the current learner-content baseline that every eligible Case has a valid active primary Topic**.

## 5. Case deduplication and System attribution

A Case reachable through more than one selected scope appears only once in one run.

The union step must retain the contributing Systems/routes for that Case so attribution does not depend on checkbox order or incidental iteration order.

### 5.1 Attribution invariant

A mixed run does **not** create a synthetic `Mixed` System.

Every individual Active Review and completion still has one concrete `system_id` for historical attribution, matching the existing analytics model.

The implementation must define and test a deterministic attribution rule for multiply-contributed Cases. Recommended precedence:

1. prefer a native Topic contribution from the Case's primary-topic System when that contribution is part of the selected run scope;
2. otherwise choose a stable normalized contributing System using an identifier-based deterministic order;
3. freeze that chosen attribution when the Review is created.

A Case reached only through a curated Tag preserves the existing curated-System study semantics rather than silently rewriting attribution to another System.

The chosen attribution System must itself be selected in the authenticated `runScope`, and the Case must actually be reachable through that selected System sub-scope.

## 6. Clean descriptor/proof v2 cutover

Multi-System study changes both the browser descriptor shape and the meaning of the authenticated scope.

Do not reinterpret descriptor version 1.

For the clean cutover, Multi-System Runtime should introduce:

- **descriptor/scope version 2** for learner Scheduled and Free run descriptors;
- **study-run proof version 2** for newly issued Scheduled run-boundary, captured-membership, and repeat-origin proofs.

The v2 proof implementation should authenticate the same boundary concepts as today, but against the complete canonical v2 mixed run scope.

Equivalent v2 selections must produce equivalent normalized scope bytes regardless of learner checkbox order.

The complete normalized `runScope` is the material whose fingerprint is authenticated. A browser-edited System, route, Case, or attribution System must never become valid merely because the browser supplied it.

### 6.1 Mandatory zero-data deployment gate

The clean cutover is permitted only when a fail-closed Production gate proves there is no learner runtime state that requires v1 compatibility.

The gate must be executable and committed as part of Multi-System Runtime. It must not rely on memory or manual inspection alone.

At minimum it must inspect the learner-owned runtime/history tables that can prove prior or in-flight study, including the current equivalents of:

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
```

For this clean cutover, **`learner_fsrs_profiles` must have exactly zero rows**.

There is no pristine/default-profile exception. Under the current runtime, Scheduled planning can create the default profile before an Active Review or completion exists, so a default-looking profile is a server-side signal that a legitimate v1 browser run may have been planned. Allowing it would undermine the premise that there is no v1 run requiring preservation.

`learner_preferences` do **not** need to be zero. Normal `/study` page loading can create preferences without starting a learner run, so preferences are not a reliable clean-cutover sentinel.

Legacy `reviews`, `review_questions`, and `review_assets` remain relevant zero-data sentinels under the existing runtime-cutover philosophy and should remain fail-closed where the current Production preflight already treats them that way.

Any nonzero count in a required sentinel causes the gate to fail. Do not classify a row as harmless merely to keep the clean cutover available.

If implementation later discovers a profile-producing path that is provably unrelated to learner run planning and needs preservation, that exception requires a separate reviewed contract change. It is not part of this plan.

### 6.2 Mandatory learner-runtime write quiescence and Production cutover sequence

A zero-data check alone is insufficient because the current Production workflow performs preflight before D1 migration and Worker deployment. Without a write fence, the old v1 Worker could create a new v1 run after the gate passed but before the v2 Worker became live.

The clean cutover therefore requires a **mechanically enforced quiescence boundary**.

Full v2 write-path acceptance must be completed **before Production deployment** against a local/ephemeral database with the real migrated D1 schema. That acceptance owns mutation-heavy verification of:

- Scheduled planning;
- Free planning;
- Active Review open/revalidation;
- reveal/completion;
- Scheduled and Free exactly-once replay;
- v2 D1 scope/eligibility enforcement;
- analytics/provenance writes produced by successful Scheduled completion.

The one-time Production cutover order is:

```text
complete local/ephemeral v2 planning/open/completion acceptance on the real migrated D1 schema
→ activate/fence learner study runtime writes in Production
→ run the full Production zero-data gate
→ if any sentinel is nonzero, abort and keep learner runtime closed or restore the old safe state
→ require and apply the v2 Active Review migration
→ verify the required migration/trigger is present
→ deploy the v2 Worker
→ while the fence remains active, perform only non-mutating Production verification
→ reopen learner study runtime
```

From the moment the write fence begins until the v2 Worker is live, non-mutating Production verification has passed, and the runtime is deliberately reopened, the learner runtime must not be able to:

- plan a new Scheduled or Free run;
- open/create/resume an Active Review;
- reveal or complete an Active Review;
- create learner FSRS/runtime/history rows that participate in the clean-cutover invariant.

Production verification while fenced must be **non-mutating**. At minimum it should verify:

- the expected Worker version/deployment is live;
- the required v2 migration and Active Review trigger/guard are present;
- the learner-runtime write fence is still active;
- health/read-only routes required for release verification respond as expected;
- no required zero-data sentinel unexpectedly became nonzero during the fenced cutover.

Do **not** use normal learner planning/open/completion as the default Production smoke while the fence is active. That would either be blocked by the fence or require a privileged bypass that creates synthetic learner history in Production.

A future Production write smoke is a separate operational design. If one is ever adopted, it must explicitly define the bypass mechanism, dedicated synthetic identity, complete cleanup of every learner-owned runtime/history/analytics row it can create, failure-halfway cleanup, and retry semantics. This plan does not require such a smoke.

Multi-System Runtime must update the Production deployment workflow so this ordering is mechanically enforced. Merely documenting the sequence in a runbook is insufficient if the deployed v1 Worker can still accept learner study writes during the migration window.

If the application is operationally guaranteed to have `/study` unavailable to all learners for the entire deployment window, that outage itself may serve as the write fence, but the workflow/runbook must make that guarantee explicit and verifiable. Otherwise implement an actual temporary learner-runtime maintenance/fence mechanism.

The full zero-data gate must run **after** the fence is active and immediately before the v2 migration. If the gate fails, do not apply the migration or deploy the v2-only runtime.

For this one-time v2 cutover, the required Active Review migration is **not optional**. The existing Production workflow's `apply_migrations=false` path must not be allowed to deploy the v2 cutover Worker against the old v1 D1 guard. The cutover workflow must fail closed unless the required migration has been successfully applied and its expected trigger/guard is present before Worker activation. After the v2 cutover is complete, ordinary later deployments may return to the normal repository migration policy.

### 6.3 Browser-local v1 state

A server-side D1 gate cannot inspect every browser's localStorage.

The clean-cutover assumption therefore also requires an explicit operational statement that no learner v1 browser run needs preservation. The strict zero-profile rule closes the main Scheduled server-side blind spot; the write fence closes the post-gate race.

Under that verified condition, the v2 client may intentionally reject/clear the old learner v1 run descriptor and write only v2 state.

Local-only preview state may be reset as disposable test state, but `/fsrs-preview` must remain a thin regression/reference surface around the authoritative services.

If learner rollout occurs before this cutover and a v1 browser run may correspond to real learner work, the clean-cutover assumption is invalid and deployment must stop for a compatibility design.

### 6.4 No default dual-version machinery

Under a successful fenced zero-data cutover, Multi-System Runtime should **not** add dual v1/v2 Production compatibility merely as precautionary complexity.

The default implementation therefore does not require:

- dual v1/v2 descriptor validation;
- dual v1/v2 proof verification;
- v1 Active Review → v2 server completion compatibility;
- v1 lost-response replay compatibility tests;
- v1 repeat-origin continuation;
- later long-lived v1 retirement logic.

Exactly-once completion and receipt-first ordering remain required for v2 runs themselves.

If the zero-data gate fails, stop and redesign the rollout. Do not weaken the gate to keep the implementation simple.

## 7. Active Review and v2 D1 scope guard

A run may span several Systems, but one presented Case still creates one Active Review with one concrete System attribution.

Avoid introducing a many-to-many Active Review/System model unless implementation evidence proves it necessary.

### 7.1 Why the current trigger is insufficient for v2

The current D1 `active_reviews_content_scope_guard` validates a Case/System relationship using top-level `scope_json.routes`.

A compatibility projection such as:

```js
{
  systemId: 'system-b',
  routes: [
    { routeType: 'topic', routeId: 'topic-b' }
  ],
  runScope: {
    systems: [
      { systemId: 'system-a', mode: 'all' },
      { systemId: 'system-c', mode: 'all' }
    ]
  }
}
```

could prove that the Case is genuinely reachable through `system-b`, but the old trigger cannot prove that `system-b` was actually selected in `runScope`.

That is a correctness/integrity gap for future v2 data even when there is no existing learner data to migrate.

Therefore the normal implementation path is a **new immutable D1 migration that replaces/updates the Active Review scope/content guard for v2**.

### 7.2 Preferred v2 Active Review scope shape

Keep one top-level Review attribution System so the existing scalar ownership model remains clear:

```js
{
  version: 2,
  systemId: 'renal',
  runScope: {
    systems: [
      { systemId: 'cardiovascular', mode: 'all' },
      { systemId: 'renal', mode: 'all' },
      {
        systemId: 'endocrine',
        mode: 'routes',
        routes: [
          { routeType: 'topic', routeId: 'diabetes' }
        ]
      }
    ]
  }
}
```

`systemId` remains the frozen historical attribution written to `active_reviews.system_id` and later Scheduled history/analytics.

`runScope` is the complete authenticated v2 selection.

The old top-level `routes` compatibility projection is no longer the preferred contract.

### 7.3 Strict v2 JSON-shape guard

The v2 migration must validate JSON shape as well as semantic eligibility. Do not rely only on the current scalar CHECK:

```sql
json_extract(scope_json, '$.systemId') = system_id
```

because SQLite `CHECK` expressions that evaluate to `NULL` do not fail merely because a required JSON field is missing.

The migrated database boundary must explicitly require at least:

- `scope_json` is valid JSON of the expected object shape;
- `version` exists, is an integer, and equals `2`;
- top-level `systemId` exists, is a non-empty JSON string, and equals `NEW.system_id`;
- `runScope` exists and is an object;
- `runScope.systems` exists, is an array, and contains at least one System entry;
- each System entry is an object with a non-empty string `systemId`;
- each System entry has a string `mode` and only `all` or `routes` is accepted;
- `routes` mode has the expected non-empty route-array shape;
- each route has only a known route type (`topic` or `tag`) and a non-empty string route ID;
- malformed, missing, `null`, or wrong-typed required fields fail closed.

Application normalization should also reject duplicate/ambiguous System entries and malformed routes before insertion. D1 remains the final integrity boundary.

### 7.4 Required v2 D1 semantic proof

After shape validation, the migrated D1 guard must independently prove all three relationships:

```text
1. attribution System is selected in runScope
2. Case is eligible under that selected System sub-scope
3. persisted system_id equals that validated attribution System
```

Conceptually, before inserting an Active Review, the database must find the `runScope.systems[]` entry whose `systemId` equals `NEW.system_id` and validate the Case against that entry.

**Baseline learner-content invariant:** regardless of whether eligibility is proved through `routes/topic`, `routes/tag`, `all/native`, or `all/curated-tag`, the Case must retain a valid **active primary Topic concept** under the same learner-content rules enforced by the current resolver and current Active Review guard. An active Case with a valid curated Tag is still ineligible if its primary Topic is missing or inactive. This baseline is evaluated before the route-specific proof below.

For `mode: 'routes'`:

- a Topic route qualifies only when the Case's active primary Topic matches that selected Topic and belongs to the declared System;
- a Tag route qualifies only when the Case already satisfies the active-primary-Topic baseline, has that active Tag, and the Tag is curated to the declared System.

For `mode: 'all'`:

- a native Case qualifies when its active primary Topic belongs under the selected System; or
- a curated-Tag Case qualifies only when the Case already satisfies the active-primary-Topic baseline and has an active Tag curated to the selected System.

The guard must continue to require an active, non-preview Case and an active System, matching the existing integrity intent.

Application code should perform the same validation for useful errors, but application validation does not replace the D1 guard.

### 7.5 Required forged-attribution rejection

A particularly important regression is:

```text
Case is genuinely reachable through System B
but the authenticated runScope selected only Systems A and C
→ inserting Active Review with system_id = B must fail
```

This proves the D1 boundary protects selected-scope attribution, not merely taxonomy reachability.

Likewise, if System B is selected only through explicit routes that do not include a route reaching the Case, `system_id = B` must fail even though the Case might be reachable through B under some other non-selected route.

## 8. FSRS and analytics invariants

Multi-System study changes selection only. It must not change scheduler ownership.

Keep:

```text
one learner FSRS state per learner × Case
```

Do not introduce:

- one FSRS profile per System;
- one scheduler generation per System;
- a synthetic Mixed System;
- duplicated Case scheduler state because a Case is reachable through several Systems.

Scheduled completion continues to write historical System attribution from the Active Review.

Existing per-System detailed history, durable monthly analytics buckets, aggregates, provenance rules, and deletion protections remain authoritative.

Because those durable records inherit the Active Review System attribution, the v2 D1 selection/attribution guard is part of the historical analytics correctness boundary.

## 9. Existing run-level safety and continuous-navigation behavior

Multi-System study must preserve the locked run-size/continuous-run amendment. These are not new product decisions.

### 9.1 50-consecutive-New guard remains global and unchanged

Scheduled Study retains the existing 50-consecutive-New guardrail.

For a mixed run:

- `consecutiveNewCompleted` remains one counter for the **entire combined run**;
- crossing from one System to another must not reset the counter;
- a Due completion continues to reset the counter according to the current run semantics;
- matured required repeats retain their existing priority/behavior;
- in `All available`, reaching the 50-New guard may stop further New introductions while Due work and required repeats remain eligible exactly as today;
- run size and the 50-New guard remain independent constraints.

Do not create one 50-New counter per System.

### 9.2 Continuous navigation remains continuous across Systems

A newly planned mixed run starts immediately:

```text
plan succeeds
→ persist browser descriptor
→ immediately call the existing server open boundary
→ navigate directly to the first eligible Review
```

The learner must not need a second `Continue run` click merely because the scope spans multiple Systems.

After each successful Scheduled or Free completion:

```text
advance browser descriptor
→ immediately call the server open boundary for next work
→ if another Review opens, navigate directly to it
```

Do not return to System selection merely because the next Case belongs to another System.

Return to the study/run screen only for the existing terminal/recovery reasons: complete, waiting for a required repeat, stopped by the 50-New guard, blocked by resumable/recoverable state, or deliberately left/stopped.

The client may automate navigation, but server-side open/revalidation, Active Review creation, scheduler authority, and completion owners remain authoritative.

### 9.3 Exactly-once completion remains unchanged for v2

The clean v2 cutover removes cross-version replay complexity; it does **not** relax current exactly-once completion semantics.

For v2 runs:

- matching learner-owned run state must still reach the receipt-owning Scheduled/Free completion owner in the ordering required for lost-response retries;
- an identical retry after a committed completion must still replay safely;
- advancing to the next Review occurs only after successful completion response processing;
- failure to open the next Review must not manufacture a second completion.

## 10. Learner UX

Refactor the current Systems-first chooser into a multi-select study-scope builder while reusing its existing Topic/Tag configuration controls.

Recommended interaction:

- checkbox or equivalent selection control on each System;
- `Configure` expansion for Topics / curated Tags;
- selecting a System initially selects `all`;
- changing one Topic/Tag converts that System to an explicit custom scope;
- `Select all Systems` and `Clear all` controls;
- visible selected-System count;
- visible unique eligible-Case count;
- existing 5 / 10 / 20 / All run-size choice;
- **default run size remains 10 Cases**;
- clear Scheduled Study / Free Study start actions.

The learner should not need to enter and leave separate System pages to build one integrated run.

## 11. Performance, raw-input hardening, and supported envelopes

Retain the current bounded-planning philosophy.

Implementation must explicitly verify:

- normalized mixed-scope size;
- Scheduled candidate envelope;
- captured-membership proof size for v2;
- Worker request/response size;
- browser serialization/localStorage size;
- planning latency for the largest supported mixed selection;
- Free Study bag size for the largest supported mixed selection;
- D1 trigger cost for strict v2 shape plus selected-scope eligibility checks.

Whole-System `mode: all` prevents run-scope route-count growth from scaling with every Topic/Tag under every selected System.

### 11.1 Raw input must be bounded before expensive normalization

The learner form/request is untrusted input.

Do not rely only on the final normalized route count. Multi-System Runtime should impose reasonable raw limits before expensive taxonomy traversal, candidate resolution, JSON serialization, or proof construction.

At minimum bound:

- number of submitted System entries;
- total raw route entries;
- identifier/string lengths where appropriate;
- request/form body size through the existing platform/application envelope.

Duplicate inputs may normalize away, but an attacker must not be able to submit an arbitrarily large duplicate payload merely because the final normalized scope is small.

Exact limits should be derived from the real taxonomy and benchmarked supported envelope rather than guessed upward.

Do not increase existing safety limits merely to make the feature pass without measured evidence.

## 12. Required regression coverage

At minimum prove all of the following.

### 12.1 Zero-data clean cutover and deployment fence

- the committed cutover gate passes on the verified empty learner-runtime state;
- any Active Review causes the gate to fail;
- any Scheduled completion event/receipt causes the gate to fail;
- any Free completion receipt causes the gate to fail;
- any Case FSRS state, learner encounter, optimizer evidence, lifetime aggregate, per-System aggregate, or monthly bucket causes the gate to fail;
- **any `learner_fsrs_profiles` row causes the gate to fail, including a default/pristine-looking profile**;
- `learner_preferences` alone do not cause the gate to fail;
- legacy Review sentinel rows continue to fail closed where required by the existing Production preflight;
- failed gate means no v2 Production migration/deploy;
- the learner-runtime write fence is active before the full gate runs;
- v1 planning/open/completion cannot occur between the gate and v2 Worker activation;
- the v2 D1 migration cannot be applied while the old learner runtime remains writable;
- the one-time v2 cutover cannot deploy the v2 Worker through an `apply_migrations=false` path;
- the workflow fails closed unless the required v2 migration has been applied and the expected v2 Active Review guard is present;
- the fence remains active through migration, v2 Worker deployment, and non-mutating Production verification;
- normal Production learner planning/open/completion remains blocked while the fence is active;
- Production verification while fenced creates no learner FSRS/runtime/history/analytics rows;
- learner runtime reopens only after the v2 Worker is live and non-mutating verification has passed;
- successful clean cutover emits/accepts learner v2 descriptors and does not create new learner v1 runs.

### 12.2 Selection / normalization

- two whole Systems produce one combined scope;
- whole-System plus partial-System selection works;
- several partial Systems work;
- duplicated submitted Systems/routes normalize deterministically;
- a Topic/Tag submitted under the wrong System is rejected;
- empty mixed scope is rejected;
- inactive/missing Systems are rejected;
- raw System/route over-limit payloads are rejected before expensive planning.

### 12.3 Candidate union / attribution

- overlapping Topic/Tag selections return one Case once;
- the same Case contributed by several Systems appears once;
- multiply-contributed System attribution is deterministic;
- attributed System is one of the Case's actual selected contributing Systems;
- unique eligible counts match planner union semantics;
- whole-System `all` preserves native + curated-Tag reachability semantics;
- every eligible candidate retains a valid active primary Topic under the existing learner-content baseline.

### 12.4 Descriptor / proof v2

- new learner descriptors require v2;
- v2 Scheduled runs issue v2 run-boundary proofs;
- captured-membership proofs authenticate the complete canonical mixed scope;
- repeat-origin proof behavior remains valid under v2;
- modifying selected System/route scope invalidates authentication;
- malformed/forged v2 descriptor or proof material is rejected;
- old learner v1 browser state is intentionally cleared/rejected under the verified fenced clean-cutover assumption rather than silently reinterpreted as v2.

### 12.5 Scheduled Study

- Due/New ordering works across Systems;
- 5/10/20 counts distinct Cases globally;
- **default run size remains 10 Cases**;
- required short-term repeats do not consume extra distinct-Case slots;
- stale generation/review-sequence boundaries still fail;
- Reset Progress / Fresh FSRS Start still invalidate stale browser/run work;
- a Case deactivated after planning is safely skipped/rejected by server revalidation;
- v2 completion remains exactly-once and a lost HTTP response can still be safely retried through the Scheduled receipt/event path.

### 12.6 50-New guard

- the 50-New counter is global across the combined mixed run;
- moving from one System to another does not reset it;
- the 51st consecutive New introduction is blocked under the existing rule;
- Due work remains available at the guard boundary;
- matured required repeats remain available at the guard boundary;
- a Due completion resets the counter according to current semantics;
- `All available` stops further New introductions at the guard while allowing Due/repeat work as required.

### 12.7 Free Study

- mixed candidate bag is deduplicated and shuffled;
- run size applies globally;
- **default run size remains 10 Cases**;
- Free completion still does not mutate Scheduled FSRS state;
- v2 Free completion remains exactly-once and a lost HTTP response can still be safely retried through the Free receipt path.

### 12.8 Continuous navigation

For both Scheduled and Free mixed runs:

- successful planning immediately opens/navigates to the first eligible Review;
- no second `Continue run` click is required for a new run;
- successful completion immediately opens/navigates to the next eligible Review when available;
- changing Systems between adjacent Cases does not return the learner to System selection;
- waiting/complete/guard/recovery states still return to the appropriate run surface rather than manufacturing another Review.

### 12.9 Active Review / strict v2 D1 guard / analytics

Using real migrated D1/SQLite trigger behavior, prove at minimum:

- a native-Topic Active Review from a selected System passes;
- a curated-Tag cross-System Active Review from a selected System passes when the Case retains a valid active primary Topic;
- a whole-System `mode: 'all'` native Case passes;
- a whole-System `mode: 'all'` curated-Tag Case passes when the Case retains a valid active primary Topic;
- **curated Tag + inactive primary Topic fails**;
- **whole-System `mode: 'all'` curated Tag + inactive primary Topic fails**;
- **curated Tag + missing primary Topic fails**;
- a Case genuinely reachable through System B is rejected when System B is not selected in `runScope`;
- a selected System B is rejected when its explicit selected routes do not reach the Case;
- forged/non-contributing `system_id` attribution fails at the D1 guard;
- top-level `scope_json.systemId` is a required non-empty string and matches persisted `system_id`;
- missing/null/wrong-type `version` fails;
- any version other than `2` fails for the v2 Active Review path;
- missing/null/wrong-type top-level `systemId` fails;
- missing/null/wrong-type `runScope` or `runScope.systems` fails;
- empty `runScope.systems` fails;
- missing/null/wrong-type System entry `systemId` fails;
- missing/null/wrong-type/unknown `mode` fails;
- malformed `routes` mode or malformed route entries fail;
- inactive/non-production Case, inactive System, inactive primary Topic, or missing primary Topic still fails;
- every Review has one concrete System attribution;
- Scheduled completion writes the intended validated System attribution;
- monthly/per-System analytics remain correct after mixed runs;
- curated-Tag-only attribution preserves current semantics;
- repeated access to the same mixed run cannot change attribution nondeterministically.

### 12.10 Production release verification

- full v2 planning/open/completion acceptance runs before Production against local/ephemeral D1 with the real migration applied;
- Production verification while fenced is non-mutating;
- the deployed Worker version is verifiable;
- the required v2 migration/trigger is verifiably present before learner runtime reopen;
- the fence is verifiably active during Production checks;
- health/read-only checks succeed without creating learner runtime/history data;
- required zero-data sentinels remain zero through the fenced verification window;
- the release fails closed if the migration was skipped, is missing, or the expected guard is not present.

### 12.11 Browser / envelope

- v2 descriptor validation is strict;
- maximum supported mixed Scheduled descriptor fits the supported Chromium/localStorage envelope;
- maximum supported Free mixed bag is measured and bounded;
- largest supported raw selection stays inside Worker/request/planning budgets;
- pathological raw duplicate/oversized input is rejected cheaply.

## 13. Documentation cutover

When implementation ships, update living learner-study authorities that currently describe:

```text
Choose System
→ Scheduled Study or Free Study
→ 5 / 10 / 20 / All
```

to describe:

```text
Choose one or more Systems
→ optionally narrow each by Topic / curated Tag
→ Scheduled Study or Free Study
→ 5 / 10 / 20 / All unique Cases
```

Document the actual migration number, zero-data preflight command, write-fence mechanism, Production workflow ordering, non-mutating Production verification, and v2 descriptor/proof contract after implementation chooses their concrete names.

Do not rewrite historical PR evidence as if multi-System study already existed at the time it was authored.

## 14. Proposed implementation split

Use names that cannot be confused with the existing FSRS programme's historical PR A / PR B terminology.

### Multi-System Runtime — scope/runtime foundation

Own:

- executable fail-closed zero-data cutover gate;
- strict `learner_fsrs_profiles = 0` cutover sentinel;
- learner-runtime write-quiescence mechanism and Production workflow enforcement;
- mandatory one-time v2 migration application before v2 Worker activation;
- non-mutating fenced Production release verification;
- multi-System scope types and normalization;
- raw-input envelope limits;
- candidate union/deduplication;
- deterministic Case System attribution;
- descriptor/scope v2;
- study-run proof v2;
- clean v1 learner-browser-state retirement under the verified fenced zero-data assumption;
- Scheduled and Free planner/open support;
- Active Review creation/revalidation support;
- immutable migration replacing/updating `active_reviews_content_scope_guard` for strict v2 JSON shape and `runScope` semantics;
- preservation of the current active-primary-Topic baseline for Topic, Tag, `all/native`, and `all/curated-tag` eligibility;
- D1 proof that attribution System is selected and the Case is reachable under that exact selected sub-scope;
- native-Topic, curated-Tag cross-System, whole-System `all`, inactive/missing-primary-Topic, unselected-System, wrong-route, malformed-scope, and forged-attribution D1 regressions;
- global 50-New regressions;
- exactly-once/lost-response v2 completion regressions;
- plan→first and completion→next continuous-navigation runtime support;
- browser descriptor validation/storage cutover;
- maximum-envelope benchmarks.

This tranche keeps current learner behavior available until runtime, D1, cutover, and performance invariants are proven.

Production deployment is a separate explicit step. Multi-System Runtime must modify the deployment workflow so the learner-runtime fence begins before the full Production zero-data gate and remains in force through mandatory migration application, v2 Worker deployment, and non-mutating Production verification. The v2 cutover Worker must not become live if the required migration was skipped or failed.

### Multi-System UX — learner cutover

Own:

- multi-select System chooser;
- expandable per-System Topic/Tag configuration;
- whole-System `all` representation;
- unique combined candidate count;
- `/study` form/action wiring;
- 5/10/20/All mixed-run start behavior;
- **default run size of 10 Cases**;
- immediate plan→first-open UX;
- completion→next-open navigation across System boundaries;
- learner-facing regression coverage;
- living documentation cutover.

## 15. Explicit non-goals

Do not include in this feature:

- FSRS algorithm changes;
- optimizer execution changes;
- per-System FSRS parameters/profiles;
- synthetic Mixed taxonomy concepts;
- automatic equal quotas between Systems;
- balanced sampling modes;
- per-System 50-New counters;
- taxonomy restructuring;
- Case authoring changes;
- long-lived v1/v2 compatibility when the mandatory fenced zero-data cutover passes;
- weakening the zero-data gate to avoid compatibility work if learner data appears;
- a pristine/default `learner_fsrs_profiles` exception for this cutover;
- running the zero-data gate while the v1 learner runtime remains writable;
- applying the v2 D1 migration before learner study writes are quiesced;
- deploying the one-time v2 cutover Worker through `apply_migrations=false` or any equivalent path that leaves the old v1 guard in place;
- normal learner planning/open/completion writes as the default fenced Production smoke;
- synthetic Production learner history merely to verify the cutover when local/ephemeral migrated-D1 acceptance already proves write behavior;
- weakening the current active-primary-Topic baseline for curated-Tag eligibility;
- retaining the old top-level-route D1 guard merely to avoid a migration;
- relying on nullable `json_extract(...) = system_id` alone as proof of required v2 scope shape;
- weakening or bypassing independent D1 validation of selected-scope attribution;
- changes to Scheduled/Free completion semantics unrelated to the mixed-scope/v2 cutover;
- Production mutation/deployment as part of this planning documentation PR.

## 16. Acceptance criteria

Multi-System learner study is ready for learner cutover when all of the following are true:

1. a learner can select more than one System in one study run;
2. each System can independently mean `all` or an explicit Topic/Tag subset;
3. the server, not browser state, owns normalization, eligibility, and attribution;
4. overlapping scope contributes each Case at most once;
5. System attribution for every presented Case is deterministic and persisted on its Active Review;
6. a mandatory executable Production zero-data gate proves the clean v2 cutover is safe;
7. `learner_fsrs_profiles` is exactly zero at that gate, with no pristine/default exception;
8. learner study writes are mechanically quiesced before the gate and remain quiesced through mandatory v2 migration, Worker deployment, and non-mutating Production verification;
9. if the zero-data gate fails, deployment stops rather than silently requiring live v1 compatibility;
10. the one-time v2 cutover fails closed unless the required v2 Active Review migration is applied and verified before the v2 Worker becomes live;
11. new learner runs use descriptor/scope v2 and Scheduled proof v2;
12. the migrated D1 guard strictly validates v2 JSON shape before semantic eligibility;
13. the migrated D1 guard preserves the existing requirement that every eligible Case has a valid active primary Topic, including curated-Tag and `mode: 'all'` curated-Tag paths;
14. the migrated D1 guard proves the attribution System is selected in `runScope` and the Case is reachable through that exact selected System sub-scope;
15. a Case/System relationship that is taxonomically valid but not selected in `runScope` is rejected at the D1 boundary;
16. full mutation-heavy v2 planning/open/completion acceptance passes against local/ephemeral real migrated D1 before Production, while fenced Production verification remains non-mutating;
17. FSRS state remains Case-level and unchanged in ownership;
18. per-System analytics/provenance remain correct;
19. 5/10/20/All apply to the combined unique candidate pool and **10 Cases remains the default**;
20. the 50-consecutive-New guard remains global and unchanged across System boundaries;
21. v2 Scheduled and Free completion preserve exactly-once/lost-response retry semantics;
22. plan→first-open and completion→next-open remain continuous without returning to System selection between Cases;
23. raw input and normalized scope are both bounded before expensive work;
24. browser/Worker/D1 performance stays inside measured supported envelopes;
25. current single-System study remains a valid special case of the new v2 contract;
26. living learner-study documentation is updated only when the implementation actually ships.
