# Multi-System Learner Study Plan

_Status: proposed future-intent design. Not implemented on current `main`._

_Last reviewed against `main` at `ca56f915` on 4 September 2026._

## 1. Goal

Allow a learner to build one Scheduled Study or Free Study run from more than one System while preserving the existing FSRS, active-Review, run-proof, idempotency, D1 eligibility, continuous-navigation, and per-System analytics invariants.

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
- `active_reviews_scope_system_check` requires `scope_json.systemId = system_id`;
- the current D1 `active_reviews_content_scope_guard` only understands top-level `scope_json.routes`.

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

The v2 resolver and D1 guard must preserve those semantics for `mode: 'all'`.

## 5. Case deduplication and System attribution

A Case reachable through more than one selected scope appears only once in one run.

The union step must retain the contributing Systems/routes for that Case so attribution does not depend on checkbox order or incidental iteration order.

### 5.1 Attribution invariant

A mixed run does **not** create a synthetic `Mixed` System.

Every individual active Review and completion still has one concrete `system_id` for historical attribution, matching the existing analytics model.

The implementation must define and test a deterministic attribution rule for multiply-contributed Cases. Recommended precedence:

1. prefer a native Topic contribution from the Case's primary-topic System when that contribution is part of the selected run scope;
2. otherwise choose a stable normalized contributing System using an identifier-based deterministic order;
3. freeze that chosen attribution when the Review is created.

A Case reached only through a curated Tag preserves the existing curated-System study semantics rather than silently rewriting attribution to another System.

The chosen attribution System must itself be selected in the authenticated `runScope`, and the Case must actually be reachable through that selected System scope.

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

The clean cutover is permitted only when a fail-closed pre-deployment gate proves there is no learner runtime state that requires v1 compatibility.

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
```

The implementation must also explicitly evaluate `learner_fsrs_profiles`. If current bootstrap behavior can create an untouched default profile without actual learner study, the gate may distinguish pristine bootstrap-only rows from meaningful learner runtime state rather than failing on raw profile count. That rule must be explicit and tested.

Legacy `reviews`, `review_questions`, and `review_assets` remain relevant zero-data sentinels under the existing runtime-cutover philosophy and should remain fail-closed where the current Production preflight already treats them that way.

The gate must fail if any relevant non-pristine learner runtime/history row exists.

### 6.2 Browser-local v1 state

A server-side D1 gate cannot inspect every browser's localStorage.

The clean-cutover assumption therefore also requires an explicit operational statement that no learner v1 browser run needs preservation. Under that verified condition, the v2 client may intentionally reject/clear the old learner v1 run descriptor and write only v2 state.

Local-only preview state may be reset as disposable test state, but `/fsrs-preview` must remain a thin regression/reference surface around the authoritative services.

If learner rollout occurs before this cutover and a v1 browser run may correspond to real persisted learner work, the clean-cutover assumption is invalid and deployment must stop for a compatibility design.

### 6.3 No default dual-version machinery

Under a successful zero-data gate, Multi-System Runtime should **not** add dual v1/v2 production compatibility merely as precautionary complexity.

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

Therefore the normal implementation path is a **new immutable D1 migration that replaces/updates the Active Review content-scope guard for v2**.

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

The existing scalar check `scope_json.systemId = system_id` may remain if it continues to fit the migrated v2 shape.

The old top-level `routes` compatibility projection is no longer the preferred contract.

### 7.3 Required v2 D1 proof

The migrated D1 guard must independently prove all three relationships:

```text
1. attribution System is selected in runScope
2. Case is eligible under that selected System sub-scope
3. persisted system_id equals that validated attribution System
```

Conceptually, before inserting an Active Review, the database must find the `runScope.systems[]` entry whose `systemId` equals `NEW.system_id` and validate the Case against that entry.

For `mode: 'routes'`:

- a Topic route qualifies only when the Case's active primary Topic matches that selected Topic and belongs to the declared System;
- a Tag route qualifies only when the Case has that active Tag and the Tag is curated to the declared System.

For `mode: 'all'`:

- a native Case qualifies when its active primary Topic belongs under the selected System; or
- a curated-Tag Case qualifies when it has an active Tag curated to the selected System.

The guard must continue to require an active, non-preview Case and an active System, matching the existing integrity intent.

Application code should perform the same validation for useful errors, but application validation does not replace the D1 guard.

### 7.4 Required forged-attribution rejection

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
- D1 trigger cost for the v2 scope check.

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

### 12.1 Zero-data clean cutover

- the committed cutover gate passes on the verified empty learner-runtime state;
- any Active Review causes the gate to fail;
- any Scheduled completion event/receipt causes the gate to fail;
- any Free completion receipt causes the gate to fail;
- any Case FSRS state, learner encounter, optimizer evidence, lifetime aggregate, per-System aggregate, or monthly bucket causes the gate to fail;
- legacy Review sentinel rows continue to fail closed where required by the existing Production preflight;
- `learner_fsrs_profiles` are handled by an explicit tested rule distinguishing pristine bootstrap-only state from meaningful learner state if necessary;
- failed gate means no v2 Production cutover;
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
- whole-System `all` preserves native + curated-Tag reachability semantics.

### 12.4 Descriptor / proof v2

- new learner descriptors require v2;
- v2 Scheduled runs issue v2 run-boundary proofs;
- captured-membership proofs authenticate the complete canonical mixed scope;
- repeat-origin proof behavior remains valid under v2;
- modifying selected System/route scope invalidates authentication;
- malformed/forged v2 descriptor or proof material is rejected;
- old learner v1 browser state is intentionally cleared/rejected under the verified clean-cutover assumption rather than silently reinterpreted as v2.

### 12.5 Scheduled Study

- Due/New ordering works across Systems;
- 5/10/20 counts distinct Cases globally;
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
- Free completion still does not mutate Scheduled FSRS state;
- v2 Free completion remains exactly-once and a lost HTTP response can still be safely retried through the Free receipt path.

### 12.8 Continuous navigation

For both Scheduled and Free mixed runs:

- successful planning immediately opens/navigates to the first eligible Review;
- no second `Continue run` click is required for a new run;
- successful completion immediately opens/navigates to the next eligible Review when available;
- changing Systems between adjacent Cases does not return the learner to System selection;
- waiting/complete/guard/recovery states still return to the appropriate run surface rather than manufacturing another Review.

### 12.9 Active Review / v2 D1 guard / analytics

Using real migrated D1/SQLite trigger behavior, prove at minimum:

- a native-Topic Active Review from a selected System passes;
- a curated-Tag cross-System Active Review from a selected System passes;
- a whole-System `mode: 'all'` native Case passes;
- a whole-System `mode: 'all'` curated-Tag Case passes;
- a Case genuinely reachable through System B is rejected when System B is not selected in `runScope`;
- a selected System B is rejected when its explicit selected routes do not reach the Case;
- forged/non-contributing `system_id` attribution fails at the D1 guard;
- top-level `scope_json.systemId` still matches persisted `system_id`;
- inactive/non-production Case or inactive System still fails;
- every Review has one concrete System attribution;
- Scheduled completion writes the intended validated System attribution;
- monthly/per-System analytics remain correct after mixed runs;
- curated-Tag-only attribution preserves current semantics;
- repeated access to the same mixed run cannot change attribution nondeterministically.

### 12.10 Browser / envelope

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

Document the actual migration number, zero-data preflight command, and v2 descriptor/proof contract after implementation chooses their concrete names.

Do not rewrite historical PR evidence as if multi-System study already existed at the time it was authored.

## 14. Proposed implementation split

Use names that cannot be confused with the existing FSRS programme's historical PR A / PR B terminology.

### Multi-System Runtime — scope/runtime foundation

Own:

- executable fail-closed zero-data cutover gate;
- multi-System scope types and normalization;
- raw-input envelope limits;
- candidate union/deduplication;
- deterministic Case System attribution;
- descriptor/scope v2;
- study-run proof v2;
- clean v1 learner-browser-state retirement under the verified zero-data assumption;
- Scheduled and Free planner/open support;
- Active Review creation/revalidation support;
- immutable migration replacing/updating `active_reviews_content_scope_guard` for v2 `runScope` semantics;
- D1 proof that attribution System is selected and the Case is reachable under that exact selected sub-scope;
- native-Topic, curated-Tag cross-System, whole-System `all`, unselected-System, wrong-route, and forged-attribution D1 regressions;
- global 50-New regressions;
- exactly-once/lost-response v2 completion regressions;
- plan→first and completion→next continuous-navigation runtime support;
- browser descriptor validation/storage cutover;
- maximum-envelope benchmarks.

This tranche keeps current learner behavior available until runtime, D1, cutover, and performance invariants are proven.

Production deployment is a separate explicit step. Immediately before that deployment, rerun the zero-data gate against Production and fail closed if the assumption changed.

### Multi-System UX — learner cutover

Own:

- multi-select System chooser;
- expandable per-System Topic/Tag configuration;
- whole-System `all` representation;
- unique combined candidate count;
- `/study` form/action wiring;
- 5/10/20/All mixed-run start behavior;
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
- long-lived v1/v2 compatibility when the mandatory zero-data cutover gate passes;
- weakening the zero-data gate to avoid compatibility work if learner data appears;
- retaining the old top-level-route D1 guard merely to avoid a migration;
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
6. a mandatory executable Production zero-data gate proves the clean v2 cutover is safe immediately before deployment;
7. if the zero-data gate fails, deployment stops rather than silently requiring live v1 compatibility;
8. new learner runs use descriptor/scope v2 and Scheduled proof v2;
9. the migrated D1 guard proves the attribution System is selected in `runScope` and the Case is reachable through that exact selected System sub-scope;
10. a Case/System relationship that is taxonomically valid but not selected in `runScope` is rejected at the D1 boundary;
11. FSRS state remains Case-level and unchanged in ownership;
12. per-System analytics/provenance remain correct;
13. 5/10/20/All apply to the combined unique candidate pool;
14. the 50-consecutive-New guard remains global and unchanged across System boundaries;
15. v2 Scheduled and Free completion preserve exactly-once/lost-response retry semantics;
16. plan→first-open and completion→next-open remain continuous without returning to System selection between Cases;
17. raw input and normalized scope are both bounded before expensive work;
18. browser/Worker/D1 performance stays inside measured supported envelopes;
19. current single-System study remains a valid special case of the new v2 contract;
20. living learner-study documentation is updated only when the implementation actually ships.
