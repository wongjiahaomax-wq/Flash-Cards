# Multi-System Learner Study Plan

_Status: proposed future-intent design. Not implemented on current `main`._

_Last reviewed against `main` at `ca56f915` on 4 September 2026._

## 1. Goal

Allow a learner to build one Scheduled Study or Free Study run from more than one System while preserving the existing FSRS, active-Review, run-proof, idempotency, D1 scope-guard, continuous-navigation, and per-System analytics invariants.

Intended learner flow:

```text
Choose one or more Systems
→ optionally narrow each System by Topic / curated Tag
→ choose Scheduled Study or Free Study
→ choose 5 / 10 / 20 / All available unique Cases
→ complete one continuous mixed run
```

This enables integrated revision across a sufficiently large content library instead of forcing every learner run to remain inside one System.

## 2. Current constraint and affected boundaries

Current `/study` is deliberately single-System:

- the chooser holds one selected System;
- the form submits one `systemId`;
- `resolveSystemStudySelection(...)` validates one System plus Topic/Tag routes;
- Scheduled and Free planners receive one `systemId`;
- browser run descriptors currently require `version === 1` and persist `selectedScope: { systemId, routes }`;
- Scheduled descriptors carry v1 captured-membership proof metadata;
- the cryptographic proof layer has its own independent `STUDY_RUN_PROOF_VERSION = 1` boundary;
- Scheduled scope fingerprints and membership proofs authenticate the normalized single-System scope;
- `active_reviews.system_id` stores one System attribution;
- `active_reviews_scope_system_check` requires `scope_json.systemId = system_id`;
- the D1 `active_reviews_content_scope_guard` independently iterates top-level `scope_json.routes` and requires a qualifying Topic/Tag route proving that the inserted Case is reachable through `NEW.system_id`;
- matching browser descriptors are intentionally routed to the receipt-owning Scheduled/Free completion service before Active Review lookup so a lost HTTP response can be retried after the first transaction has already consumed the Active Review.

Active Reviews are durable for up to seven days. A deployment therefore cannot assume that all old-version runs or Reviews disappear at cutover.

Multi-System study is consequently not a presentation-only change. Scope normalization, descriptor validation/storage, proof verification, Active Review creation, D1 eligibility, completion/replay ordering, run navigation, and learner UX all need coordinated treatment.

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

A System may be represented in the authenticated run scope as either:

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

This compact run scope is distinct from the per-Review D1 compatibility projection described in section 7.

### 3.3 Run size

`5`, `10`, `20`, and `All` apply to the **combined unique Case pool**.

A 20-Case run across three Systems means up to 20 distinct Cases total, not 20 per System.

Required FSRS short-term repeats continue not to consume additional distinct-Case slots.

### 3.4 Scheduled ordering

Scheduled Study continues to apply the existing learner scheduling policy across the combined pool.

Do not manufacture an equal quota per System in the first implementation. If the highest-priority due work is concentrated in one System, the mixed run may legitimately contain more Cases from that System.

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
6. retain all contributing Systems/routes needed for stable System attribution and D1 eligibility proof;
7. for `mode: 'all'`, retain or derive a concrete qualifying contribution route for each selected Case rather than treating `all` itself as sufficient D1 proof;
8. return a deterministic normalized run scope and deduplicated candidate set.

No client-provided candidate list, attribution System, or compatibility route is authoritative.

## 5. Case deduplication and System attribution

A Case reachable through more than one selected scope appears only once in one run.

The union step must retain the contributing Systems/routes for that Case so attribution does not depend on checkbox order or incidental iteration order.

### 5.1 Attribution invariant

A mixed run does **not** create a synthetic `Mixed` System.

Every individual active Review and completion still has one concrete `system_id` for historical attribution, matching the existing analytics model.

The implementation must define and test a deterministic attribution rule for multiply-contributed Cases. Recommended precedence:

1. prefer a native Topic contribution from the Case's primary-topic System when that contribution is part of the selected scope;
2. otherwise choose a stable normalized contributing System using an identifier-based deterministic order;
3. freeze that chosen attribution when the Review is created.

A Case reached only through a curated Tag preserves the existing curated-System study semantics rather than silently rewriting attribution to another System.

The chosen attribution System must always have at least one **server-derived concrete contributing Topic/Tag route** that the current D1 content-scope guard can validate, unless implementation deliberately migrates that guard to understand the v2 mixed-scope shape.

## 6. Descriptor, proof, and rollout compatibility contract

Multi-System study changes both the browser descriptor shape and the meaning of the authenticated scope. The rollout must therefore define two distinct version boundaries explicitly:

```text
browser/run descriptor version
cryptographic study-run proof version
```

They are related but not the same contract.

### 6.1 New-run versioning

Do not reinterpret descriptor version 1.

New mixed runs should use:

- **descriptor/scope version 2** for the multi-System browser run contract;
- **study-run proof version 2** for newly issued Scheduled run-boundary, captured-membership, and repeat-origin proofs.

The v2 proof implementation should continue to authenticate the same boundary concepts, but against the complete canonical v2 mixed run scope.

Equivalent v2 selections must produce equivalent normalized scope bytes regardless of learner checkbox order.

The complete normalized `runScope` is the material whose fingerprint is authenticated. A browser-edited System, route, Case, attribution System, or compatibility route must never become valid merely because the browser supplied it.

### 6.2 v1 compatibility is not disposable at deployment

A v2 deployment must **not** immediately make v1 run descriptors or v1 proofs unverifiable.

Existing v1 runs may have:

- a still-live v1 Active Review;
- an already-consumed Active Review whose completion response was lost;
- a Scheduled durable completion receipt/event that must support idempotent replay;
- a still-valid short-lived Free completion receipt;
- browser state that must be advanced after a successful v1 completion so the old run can either continue safely or reach a deliberate terminal/recovery state.

Therefore the v2 server must keep a version-dispatched compatibility path for v1 while issuing only v2 for newly planned runs.

At minimum:

- descriptor validation/ownership matching must recognize both supported v1 and v2 shapes;
- open/revalidation must dispatch by descriptor version so a legitimate in-flight v1 run is not silently converted into v2 scope semantics;
- Scheduled proof verification must continue to verify v1 tokens with the v1 proof contract/key derivation while separately issuing/verifying v2 tokens for v2 runs;
- Free completion must continue to recognize matching v1 descriptors for receipt-first replay behavior;
- storage transition must read existing learner v1 browser state deliberately rather than clearing it merely because v2 is now preferred;
- no new v1 run should be planned after cutover.

### 6.3 Receipt-first idempotency must survive the version transition

The existing completion ordering is a locked safety contract:

```text
matching learner-owned browser descriptor
→ receipt-owning Scheduled/Free completion service first
→ only then Active Review fallback when the descriptor does not match
```

The v2 rewrite must preserve that behavior for **both supported descriptor versions**.

It is not acceptable for a v2-only descriptor validator to reject a legitimate v1 descriptor, fall back to Active Review lookup, allow the first completion to commit, and then lose the receipt-first retry path after the Active Review has been consumed.

A valid implementation may either:

1. keep dual v1/v2 descriptor/proof verification in the receipt-first completion path; or
2. refactor completion orchestration so the receipt-first idempotency path no longer depends on the browser descriptor validator while preserving the same ownership and proof safety.

The first approach is the preferred rollout direction because it preserves the current architecture with the smallest semantic change.

### 6.4 v1 retirement is a later cleanup, not part of the feature cutover

Do not remove v1 verification merely because new planning uses v2.

Any future retirement of v1 descriptor/proof support must be separately reviewed and must account for:

- the maximum lifetime of v1 Active Reviews;
- still-replayable Scheduled completion receipts/events;
- unexpired Free completion receipts;
- browser-local v1 state that may still legitimately correspond to those persisted owners.

Until that cleanup is proven safe, v1 remains a supported compatibility format for in-flight/replay paths only.

## 7. Active Review and D1 scope-guard contract

A run may span several Systems, but one presented Case still creates one active Review with one concrete System attribution.

Avoid introducing a many-to-many active-Review/System model unless implementation evidence proves it necessary.

Current `active_reviews` has two separate D1 scope invariants:

1. `active_reviews_scope_system_check` requires top-level `scope_json.systemId = system_id`;
2. `active_reviews_content_scope_guard` iterates top-level `scope_json.routes` and requires at least one route proving that `case_id` is eligible through `system_id`.

This shape is therefore **insufficient**:

```js
{
  systemId: 'renal',
  runScope: {
    systems: [/* normalized mixed scope */]
  }
}
```

It has no top-level `routes`, and `mode: 'all'` inside `runScope` is not directly understood by the current trigger.

### 7.1 Preferred no-migration approach: compatibility projection

If implementation keeps the current D1 trigger unchanged, each Active Review retains a small **server-derived compatibility projection** at the top level while storing the complete authenticated mixed scope separately:

```js
{
  systemId: 'renal',
  routes: [
    { routeType: 'topic', routeId: 'renal-electrolytes' }
  ],
  runScope: {
    systems: [/* complete normalized mixed run scope */]
  }
}
```

For a curated-Tag contribution:

```js
{
  systemId: 'emergency-medicine',
  routes: [
    { routeType: 'tag', routeId: 'hyperkalaemia' }
  ],
  runScope: {
    systems: [/* complete normalized mixed run scope */]
  }
}
```

Requirements:

- `systemId` equals the frozen attribution `system_id` for this Review;
- `routes` contains at least one concrete server-derived contributing route proving this exact Case/System attribution under the current trigger;
- `routes` is re-derived server-side and is not trusted from browser input;
- `runScope` contains the complete canonical multi-System selection;
- `scope_fingerprint` and Scheduled proofs authenticate the complete canonical `runScope`, not merely the top-level compatibility projection;
- for authenticated `mode: 'all'`, the server derives a qualifying native Topic or curated-Tag route for the particular Case before Active Review insertion;
- if several routes qualify, compatibility-route selection is deterministic or otherwise semantically irrelevant and regression-tested.

This is the preferred initial direction because it preserves the existing independent D1 content-scope guard without forcing the browser run descriptor to enumerate every route under every whole System.

### 7.2 Alternative migration approach

If the compatibility projection proves unsafe, misleading, or materially awkward, deliberately migrate the D1 guard instead of bypassing it.

That approach must:

- add a new immutable migration;
- explicitly replace/update `active_reviews_content_scope_guard` so it understands the v2 mixed-scope representation, including `mode: 'all'`;
- preserve independent database verification that `case_id` is genuinely reachable through `system_id`;
- preserve curated-Tag cross-System behavior;
- reject forged/non-contributing System attribution;
- add D1 regression coverage for the new trigger semantics;
- update schema/source contracts and migration documentation.

Do not drop or weaken the guard merely because application code already validated the scope.

A migration is **not expected by default**, but neither is "no migration" a locked assumption. Multi-System Runtime must choose and prove one approach before learner UX cutover.

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

Scheduled completion continues to write historical System attribution from the active Review. Existing per-System detailed history, durable monthly analytics buckets, aggregates, provenance rules, and deletion protections remain authoritative.

## 9. Learner UX

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

## 10. Existing run-level safety and continuous-navigation behavior

Multi-System study must preserve the locked run-size/continuous-run amendment. These are not new product decisions.

### 10.1 50-consecutive-New guard remains global and unchanged

Scheduled Study retains the existing 50-consecutive-New guardrail.

For a mixed run:

- `consecutiveNewCompleted` remains one counter for the **entire combined run**;
- crossing from one System to another must not reset the counter;
- a Due completion continues to reset the counter according to the current run semantics;
- matured required repeats retain their existing priority/behavior;
- in `All available`, reaching the 50-New guard may stop further New introductions while Due work and required repeats remain eligible exactly as today;
- run size and the 50-New guard remain independent constraints.

Do not create one 50-New counter per System.

### 10.2 Continuous navigation remains continuous across Systems

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

The client may automate navigation, but server-side open/revalidation, active-Review creation, scheduler authority, and completion owners remain authoritative.

## 11. Performance and supported envelopes

Retain the current bounded-planning philosophy.

Implementation must explicitly verify:

- normalized mixed-scope size;
- Scheduled candidate envelope;
- captured-membership proof size for v2;
- Worker request/response size;
- browser serialization/localStorage size;
- planning latency for the largest supported mixed selection;
- Free Study bag size for the largest supported mixed selection;
- dual-version validation/verification cost during rollout;
- any per-Review compatibility-projection cost.

Whole-System `mode: all` prevents run-scope route-count growth from scaling with every Topic/Tag under every selected System. A one-Review compatibility route does not defeat that goal because it exists only for the presented Case's D1 eligibility guard.

Do not increase existing safety limits merely to make the feature pass without measured evidence.

## 12. Required regression coverage

At minimum prove all of the following.

### 12.1 Selection / normalization

- two whole Systems produce one combined scope;
- whole-System plus partial-System selection works;
- several partial Systems work;
- duplicated submitted Systems/routes normalize deterministically;
- a Topic/Tag submitted under the wrong System is rejected;
- empty mixed scope is rejected;
- inactive/missing Systems are rejected.

### 12.2 Candidate union / attribution

- overlapping Topic/Tag selections return one Case once;
- the same Case contributed by several Systems appears once;
- multiply-contributed System attribution is deterministic;
- the chosen attribution has a concrete server-derived contributing route;
- `mode: 'all'` can derive a concrete qualifying route for each selected Case;
- unique eligible counts match planner union semantics.

### 12.3 Scheduled Study

- Due/New ordering works across Systems;
- 5/10/20 counts distinct Cases globally;
- required short-term repeats do not consume extra distinct-Case slots;
- captured-membership proofs cover the complete v2 normalized mixed scope;
- modifying System/route scope invalidates authentication;
- stale generation/review-sequence boundaries still fail;
- Reset Progress / Fresh FSRS Start still invalidate stale browser/run work;
- a Case deactivated after planning is safely skipped/rejected by server revalidation.

### 12.4 50-New guard

- the 50-New counter is global across the combined mixed run;
- moving from one System to another does not reset it;
- the 51st consecutive New introduction is blocked under the existing rule;
- Due work remains available at the guard boundary;
- matured required repeats remain available at the guard boundary;
- a Due completion resets the counter according to current semantics;
- `All available` stops further New introductions at the guard while allowing Due/repeat work as required.

### 12.5 Continuous navigation

For both Scheduled and Free mixed runs:

- successful planning immediately opens/navigates to the first eligible Review;
- no second `Continue run` click is required for a new run;
- successful completion immediately opens/navigates to the next eligible Review when available;
- changing Systems between adjacent Cases does not return the learner to System selection;
- waiting/complete/guard/recovery states still return to the appropriate run surface rather than manufacturing another Review.

### 12.6 Free Study

- mixed candidate bag is deduplicated and shuffled;
- run size applies globally;
- Free completion still does not mutate Scheduled FSRS state.

### 12.7 Active Review / D1 guard / analytics

Using real migrated D1/SQLite trigger behavior, prove at minimum:

- a native-Topic Active Review from a mixed run passes the content-scope guard;
- a curated-Tag cross-System Active Review from a mixed run passes the guard;
- a whole-System `mode: 'all'` run derives a concrete compatibility route and passes the guard;
- forged/non-contributing `system_id` attribution fails at the D1 guard;
- a forged compatibility route fails;
- top-level `scope_json.systemId` still matches persisted `system_id`;
- every Review has one concrete System attribution;
- Scheduled completion writes the intended System attribution;
- monthly/per-System analytics remain correct after mixed runs;
- curated-Tag-only attribution preserves current semantics;
- repeated access to the same mixed run cannot change attribution nondeterministically.

If Multi-System Runtime chooses the migration approach instead, equivalent D1 tests must prove the migrated guard understands native Topic, curated-Tag cross-System, and whole-System `all` while still rejecting forged/non-contributing attribution.

### 12.8 v1 → v2 rollout and idempotency

Required cross-version tests include both Scheduled and Free paths.

At minimum prove:

- a v1 descriptor remains recognizable by a v2-capable server for an in-flight v1 run;
- a v1 Scheduled Active Review can complete after v2 deployment using valid v1 run proof material;
- if that Scheduled completion commits and its HTTP response is lost, an identical retry reaches the existing Scheduled receipt/event path even though the Active Review has already been consumed;
- a v1 Free Active Review can complete after v2 deployment;
- if that Free completion commits and its HTTP response is lost, an identical retry reaches the still-valid Free receipt path after the Active Review has been consumed;
- a v1 run can advance or terminate deliberately after successful completion without being silently reinterpreted as v2 scope;
- new planning after cutover emits v2 descriptors only;
- v2 Scheduled runs issue v2 proof material;
- v1 proof verification remains functional for supported compatibility paths while v2 proof issuance/verification is active;
- malformed or forged v1/v2 descriptors cannot exploit version dispatch to bypass owner/scope/proof checks;
- localStorage transition does not clear a legitimate in-flight v1 run solely because v2 is now preferred.

### 12.9 Browser / envelope

- v2 descriptor validation is strict;
- version dispatch accepts only explicitly supported v1/v2 contracts;
- maximum supported mixed Scheduled descriptor fits the supported Chromium/localStorage envelope;
- maximum supported Free mixed bag is measured and bounded.

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

Do not rewrite historical PR evidence as if multi-System study already existed at the time it was authored.

## 14. Proposed implementation split

Use names that cannot be confused with the existing FSRS programme's historical PR A / PR B terminology.

### Multi-System Runtime — scope/runtime foundation

Own:

- multi-System scope types and normalization;
- candidate union/deduplication;
- deterministic Case System attribution;
- concrete per-Case contribution-route retention/derivation;
- descriptor/scope v2;
- study-run proof v2 for newly issued Scheduled runs;
- dual v1/v2 compatibility verification for in-flight/replay paths;
- receipt-first cross-version completion/idempotency preservation;
- Scheduled and Free planner/open support;
- active-Review creation/revalidation support;
- explicit choice and proof of either the no-migration compatibility projection or a migrated v2 D1 content-scope guard;
- native-Topic, curated-Tag cross-System, whole-System `all`, and forged-attribution D1 regressions;
- 50-New global mixed-run regressions;
- plan→first and completion→next continuous-navigation regression support at the runtime boundary;
- browser descriptor validation/storage transition;
- maximum-envelope benchmarks.

This tranche keeps current learner behavior available until runtime, D1, rollout, and idempotency invariants are proven.

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
- weakening or bypassing existing D1 Active Review eligibility enforcement;
- weakening receipt-first exactly-once completion/replay behavior;
- silently invalidating in-flight v1 runs merely because v2 shipped;
- changes to Scheduled/Free completion semantics unrelated to scope/version compatibility;
- Production mutation/deployment as part of this planning documentation PR.

## 16. Acceptance criteria

Multi-System learner study is ready for learner cutover when all of the following are true:

1. a learner can select more than one System in one study run;
2. each System can independently mean all or an explicit Topic/Tag subset;
3. the server, not browser state, owns normalization, eligibility, attribution, and compatibility-route derivation;
4. overlapping scope contributes each Case at most once;
5. System attribution for every presented Case is deterministic and persisted on its active Review;
6. new Scheduled runs use descriptor/scope v2 and proof v2 to authenticate the complete normalized mixed run scope;
7. legitimate v1 in-flight/replay paths remain supported across v2 deployment without losing receipt-first idempotency;
8. Active Review insertion remains independently protected by D1 eligibility enforcement for native Topic, curated-Tag cross-System, and whole-System `all` study;
9. forged/non-contributing System attribution still fails at the D1 guard boundary;
10. FSRS state remains Case-level and unchanged in ownership;
11. per-System analytics/provenance remain correct;
12. 5/10/20/All apply to the combined unique candidate pool;
13. the 50-consecutive-New guard remains global and unchanged across System boundaries;
14. plan→first-open and completion→next-open remain continuous without returning to System selection between Cases;
15. browser/Worker/D1 performance stays inside measured supported envelopes;
16. current single-System study remains a valid special case of the new contract;
17. living learner-study documentation is updated only when the implementation actually ships.
