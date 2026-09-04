# Multi-System Learner Study Plan

_Status: proposed future-intent design. Not implemented on current `main`._

_Last reviewed against `main` at `ca56f915` on 4 September 2026._

## 1. Goal

Allow a learner to build one Scheduled Study or Free Study run from more than one System while preserving the existing FSRS, active-Review, provenance, run-proof, D1 scope-guard, and per-System analytics invariants.

The intended learner flow is:

```text
Choose one or more Systems
→ optionally narrow each System by Topic / curated Tag
→ choose Scheduled Study or Free Study
→ choose 5 / 10 / 20 / All available unique Cases
→ complete one continuous mixed run
```

This is needed for integrated revision across a sufficiently large content library rather than forcing every run to remain inside one System.

## 2. Current constraint

Current `/study` is deliberately single-System:

- the chooser holds one selected System;
- the form submits one `systemId`;
- `resolveSystemStudySelection(...)` validates one System plus Topic/Tag routes;
- Scheduled and Free planners receive one `systemId`;
- run descriptors currently persist `selectedScope: { systemId, routes }`;
- Scheduled scope fingerprints and membership proofs authenticate that singular normalized scope;
- `active_reviews.system_id` stores one System attribution;
- the `active_reviews_scope_system_check` database check requires `scope_json.systemId = system_id`;
- the D1 `active_reviews_content_scope_guard` trigger independently iterates `json_each(NEW.scope_json, '$.routes')` and requires at least one top-level Topic/Tag route that proves the inserted Case is reachable through `NEW.system_id`.

The trigger is a material security/integrity boundary, including for curated-Tag cross-System study. A mixed-scope shape that only stores `{ systemId, runScope }`, or that represents a whole System only as `mode: 'all'`, is **not compatible with the current trigger as written** because it provides no qualifying top-level `$.routes` entry.

Therefore multi-System study is not a presentation-only change. The selection, descriptor, proof, active-Review creation, D1 eligibility guard, browser validation, and learner UX contracts all need coordinated changes.

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

Conceptual authenticated run-scope shape:

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

This compact run-scope representation is distinct from any per-Review compatibility projection required by the current D1 Active Review guard; see section 7.

### 3.3 Run size

`5`, `10`, `20`, and `All` apply to the **combined unique Case pool**.

A 20-Case run across three Systems means up to 20 distinct Cases total, not 20 per System.

Required FSRS short-term repeats continue not to consume additional distinct-Case slots.

### 3.4 Scheduled ordering

Scheduled Study continues to apply the existing learner scheduling policy across the combined pool.

Do not manufacture an equal quota per System in the first implementation. If the highest-priority due work is concentrated in one System, the mixed run may legitimately contain more Cases from that System.

A future explicit balanced/interleaved sampling mode would be a separate product decision.

### 3.5 Free Study ordering

Free Study should shuffle the combined deduplicated candidate bag using the existing Free Study semantics.

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

A Case that is reachable through more than one selected scope must appear only once in one run.

The union step must retain the contributing Systems/routes for that Case so attribution does not depend on checkbox order or incidental iteration order.

### 5.1 Attribution invariant

A mixed run does **not** create a synthetic `Mixed` System.

Every individual active Review and completion still has one concrete `system_id` for historical attribution, matching the existing analytics model.

The implementation must define and test a deterministic attribution rule for multiply-contributed Cases. Recommended precedence:

1. prefer a native Topic contribution from the Case's primary-topic System when that contribution is part of the selected scope;
2. otherwise choose a stable normalized contributing System using an identifier-based deterministic order;
3. freeze that chosen attribution when the Review is created.

A Case reached only through a curated Tag should preserve the existing curated-System study semantics rather than silently rewriting attribution to another System.

The chosen attribution System must always have at least one **server-derived concrete contributing Topic/Tag route** that the current D1 content-scope guard can validate, unless the implementation deliberately migrates that guard to understand the v2 mixed-scope shape.

This rule must be locked by regression tests before learner cutover.

## 6. Run descriptor and proof contract

Current Scheduled descriptors authenticate a normalized single-System scope. Multi-System study changes the scope shape and therefore changes proof material.

Do not silently reinterpret descriptor version 1.

Recommended approach:

- introduce a new descriptor/scope version;
- canonicalize System ordering and route ordering before hashing;
- fingerprint the complete normalized multi-System run scope;
- issue Scheduled run-boundary and captured-membership proofs against that fingerprint;
- continue treating browser/localStorage state as disposable convenience state only;
- continue server revalidation before opening queued work.

Equivalent selections must produce equivalent normalized scope bytes regardless of learner checkbox order.

A browser-edited scope must never allow an unsigned System, Topic, Tag, Case, attribution System, or compatibility route to enter Scheduled work.

The per-Review D1 compatibility projection described below is **not** a substitute for the authenticated run scope. The complete normalized run scope remains the material hashed/signed by the run-proof contract.

## 7. Active Review and D1 scope-guard contract

A run may span several Systems, but one presented Case still creates one active Review with one concrete System attribution.

Avoid introducing a many-to-many active-Review/System model unless implementation evidence proves it necessary.

Current `active_reviews` has two separate D1 scope invariants that must both be respected:

1. `active_reviews_scope_system_check` requires top-level `scope_json.systemId = system_id`;
2. `active_reviews_content_scope_guard` iterates top-level `scope_json.routes` and requires at least one route proving that `case_id` is eligible through `system_id`.

The second invariant means this shape is **insufficient** and must not be used as the implementation contract:

```js
{
  systemId: 'renal',
  runScope: {
    systems: [/* normalized mixed scope */]
  }
}
```

It has no top-level `routes`, and a compact `mode: 'all'` entry inside `runScope` is not directly understood by the existing trigger.

### 7.1 Preferred no-migration approach: compatibility projection

If implementation keeps the current D1 trigger unchanged, each Active Review should retain a small **server-derived compatibility projection** at the top level while storing the complete authenticated mixed scope separately:

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

For a curated-Tag contribution, the compatibility route may instead be:

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
- `routes` contains at least one **concrete server-derived contributing route** that proves this exact Case/System attribution under the current trigger;
- `routes` must not be copied from untrusted browser input without server re-resolution;
- `runScope` contains the complete canonical multi-System selection;
- `scope_fingerprint` and Scheduled proofs authenticate the complete canonical `runScope`, not merely the top-level compatibility projection;
- for an authenticated `mode: 'all'` System, the server must derive a qualifying concrete native Topic or curated-Tag route for the particular Case before Active Review insertion;
- if a Case has several qualifying routes, selection of the compatibility route must be deterministic or otherwise semantically irrelevant and covered by regression tests.

This is the preferred initial direction because it preserves the existing independent D1 content-scope guard without requiring the compact run descriptor itself to enumerate every route in every selected whole System.

### 7.2 Alternative migration approach

If the compatibility projection proves unsafe, misleading, or materially awkward during implementation, deliberately migrate the D1 guard instead of bypassing it.

That approach must:

- add a new immutable migration;
- explicitly replace/update `active_reviews_content_scope_guard` so it understands the v2 mixed-scope representation, including `mode: 'all'`;
- preserve independent database verification that `case_id` is genuinely reachable through `system_id`;
- preserve curated-Tag cross-System behavior;
- reject forged/non-contributing System attribution;
- add D1 regression coverage for the new trigger semantics;
- update schema/source contracts and migration documentation.

Do not drop or weaken the guard merely because application code already validated the scope.

A migration is therefore **not expected by default**, but neither is "no migration" a locked assumption. PR A must choose and prove one of these two approaches before learner UX cutover.

## 8. FSRS and analytics invariants

Multi-System study changes selection only. It must not change the core scheduler ownership model.

Keep:

```text
one learner FSRS state per learner × Case
```

Do not introduce:

- one FSRS profile per System;
- one scheduler generation per System;
- a synthetic Mixed System;
- duplicated Case scheduler state because a Case is reachable through several Systems.

Scheduled completion must continue to write historical System attribution from the active Review. Existing per-System detailed history, durable monthly analytics buckets, aggregates, provenance rules, and deletion protections must continue to work.

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

## 10. Performance and supported envelopes

Retain the current bounded-planning philosophy.

Implementation must explicitly verify:

- normalized mixed-scope size;
- Scheduled candidate envelope;
- captured-membership proof size;
- Worker request/response size;
- browser serialization/localStorage size;
- planning latency for the largest supported mixed selection;
- Free Study bag size for the largest supported mixed selection;
- any additional per-Review compatibility-projection cost.

Whole-System `mode: all` exists partly to prevent run-scope route-count growth from scaling with every Topic/Tag under every selected System. A one-Review compatibility route does not defeat that goal because it exists only for the presented Case's D1 eligibility guard.

Do not increase existing safety limits merely to make the feature pass without measured evidence.

## 11. Required regression coverage

At minimum prove:

### Selection / normalization

- two whole Systems produce one combined scope;
- whole-System plus partial-System selection works;
- several partial Systems work;
- duplicated submitted Systems/routes normalize deterministically;
- a Topic/Tag submitted under the wrong System is rejected;
- empty mixed scope is rejected;
- inactive/missing Systems are rejected.

### Candidate union

- overlapping Topic/Tag selections return one Case once;
- the same Case contributed by several Systems appears once;
- multiply-contributed System attribution is deterministic;
- the chosen attribution has a concrete server-derived contributing route;
- `mode: 'all'` can derive a concrete qualifying route for each selected Case;
- unique eligible counts match planner union semantics.

### Scheduled Study

- Due/New ordering works across Systems;
- 5/10/20 counts distinct Cases globally;
- required short-term repeats do not consume extra distinct-Case slots;
- captured-membership proofs cover the mixed normalized scope;
- modifying System/route scope invalidates authentication;
- stale generation/review-sequence boundaries still fail;
- Reset Progress / Fresh FSRS Start still invalidate stale browser/run work;
- a Case deactivated after planning is safely skipped/rejected by server revalidation.

### Free Study

- mixed candidate bag is deduplicated and shuffled;
- run size applies globally;
- Free completion still does not mutate Scheduled FSRS state.

### Active Review / D1 guard / analytics

Using real migrated D1/SQLite trigger behavior, prove at minimum:

- a native-Topic Active Review from a mixed run passes the content-scope guard;
- a curated-Tag cross-System Active Review from a mixed run passes the guard;
- a whole-System `mode: 'all'` run derives a concrete compatibility route and passes the guard;
- forged/non-contributing `system_id` attribution fails with the D1 guard rather than relying only on application rejection;
- a forged compatibility route fails;
- top-level `scope_json.systemId` still matches persisted `system_id`;
- every Review has one concrete System attribution;
- Scheduled completion writes the intended System attribution;
- monthly/per-System analytics remain correct after mixed runs;
- curated-Tag-only attribution preserves current semantics;
- repeated access to the same mixed run cannot change attribution nondeterministically.

If PR A chooses the migration approach instead, equivalent D1 tests must prove the migrated guard itself understands native Topic, curated-Tag cross-System, and whole-System `all` scope while still rejecting forged/non-contributing attribution.

### Browser / envelope

- new descriptor validation is strict;
- old disposable browser descriptors are handled deliberately on version transition;
- maximum supported mixed Scheduled descriptor fits the supported Chromium/localStorage envelope;
- maximum supported Free mixed bag is measured and bounded.

## 12. Documentation cutover

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

## 13. Proposed implementation split

### PR A — multi-System scope/runtime foundation

Own:

- multi-System scope types and normalization;
- multi-System candidate union/deduplication;
- deterministic Case System attribution;
- concrete per-Case contribution-route retention/derivation;
- new run-descriptor/scope version;
- Scheduled fingerprint/proof changes;
- Scheduled and Free planner support;
- active-Review creation/revalidation support;
- explicit choice and proof of either the no-migration compatibility projection or a migrated v2 D1 content-scope guard;
- native-Topic, curated-Tag cross-System, whole-System `all`, and forged-attribution D1 regressions;
- browser descriptor validation/storage transition;
- regression and maximum-envelope benchmarks.

This PR should keep existing learner behavior available until its runtime and D1 invariants are proven.

### PR B — learner UX cutover

Own:

- multi-select System chooser;
- expandable per-System Topic/Tag configuration;
- whole-System `all` representation;
- unique combined candidate count;
- `/study` form/action wiring;
- 5/10/20/All mixed-run start behavior;
- learner-facing regression coverage;
- living documentation cutover.

## 14. Explicit non-goals

Do not include in this feature:

- FSRS algorithm changes;
- optimizer execution changes;
- per-System FSRS parameters/profiles;
- synthetic Mixed taxonomy concepts;
- automatic equal quotas between Systems;
- balanced sampling modes;
- taxonomy restructuring;
- Case authoring changes;
- weakening or bypassing existing D1 Active Review eligibility enforcement;
- changes to Scheduled/Free completion semantics unrelated to scope;
- Production mutation/deployment as part of the planning documentation PR.

## 15. Acceptance criteria

Multi-System learner study is ready for learner cutover when all of the following are true:

1. a learner can select more than one System in one study run;
2. each System can independently mean all or an explicit Topic/Tag subset;
3. the server, not browser state, owns normalization, eligibility, attribution, and compatibility-route derivation;
4. overlapping scope contributes each Case at most once;
5. System attribution for every presented Case is deterministic and persisted on its active Review;
6. Scheduled run proofs authenticate the complete normalized mixed run scope;
7. Active Review insertion remains independently protected by D1 eligibility enforcement for native Topic, curated-Tag cross-System, and whole-System `all` study;
8. forged/non-contributing System attribution still fails at the D1 guard boundary;
9. FSRS state remains Case-level and unchanged in ownership;
10. per-System analytics/provenance remain correct;
11. 5/10/20/All apply to the combined unique candidate pool;
12. browser/Worker/D1 performance stays inside measured supported envelopes;
13. current single-System study remains a valid special case of the new contract;
14. living learner-study documentation is updated only when the implementation actually ships.
