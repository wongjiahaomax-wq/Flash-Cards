# Multi-System Learner Study Plan

_Status: proposed future-intent design. Not implemented on current `main`._

_Last reviewed against `main` at `ca56f915` on 4 September 2026._

## 1. Goal

Allow a learner to build one Scheduled Study or Free Study run from more than one System while preserving the existing FSRS, active-Review, provenance, run-proof, and per-System analytics invariants.

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
- `active_reviews.system_id` stores one System attribution and `scope_json` currently requires a top-level matching `systemId`.

Therefore multi-System study is not a presentation-only change. The selection, descriptor, proof, active-Review creation, browser validation, and learner UX contracts all need coordinated changes.

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

A System may be represented as either:

```text
all
```

or:

```text
explicit Topic / curated Tag routes
```

Selecting the whole System should not require materializing every Topic/Tag route into browser state. This avoids consuming the Scheduled route envelope merely because the learner selected several complete Systems.

Conceptual scope shape:

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
6. retain enough contribution metadata to determine stable System attribution;
7. return a deterministic normalized scope and deduplicated candidate set.

No client-provided candidate list is authoritative.

## 5. Case deduplication and System attribution

A Case that is reachable through more than one selected scope must appear only once in one run.

The union step should retain the contributing Systems/routes for that Case so attribution does not depend on checkbox order or incidental iteration order.

### 5.1 Attribution invariant

A mixed run does **not** create a synthetic `Mixed` System.

Every individual active Review and completion still has one concrete `system_id` for historical attribution, matching the existing analytics model.

The implementation must define and test a deterministic attribution rule for multiply-contributed Cases. Recommended precedence:

1. prefer a native Topic contribution from the Case's primary-topic System when that contribution is part of the selected scope;
2. otherwise choose a stable normalized contributing System using an identifier-based deterministic order;
3. freeze that chosen attribution when the Review is created.

A Case reached only through a curated Tag should preserve the existing curated-System study semantics rather than silently rewriting attribution to another System.

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

A browser-edited scope must never allow an unsigned System, Topic, Tag, or Case to enter Scheduled work.

## 7. Active Review contract

A run may span several Systems, but one presented Case still creates one active Review with one concrete System attribution.

Avoid introducing a many-to-many active-Review/System model unless implementation evidence proves it necessary.

Current `active_reviews` stores:

- scalar `system_id`;
- `scope_fingerprint`;
- `scope_json`;
- a database check requiring `scope_json.systemId = system_id`.

Preferred implementation direction is to preserve the scalar Review attribution and place the complete run scope inside the JSON while retaining a top-level Review-attribution `systemId`, for example:

```js
{
  systemId: 'renal',
  runScope: {
    systems: [/* normalized mixed scope */]
  }
}
```

The authenticated fingerprint must represent the authoritative normalized run scope, not merely the Review-attribution System.

This approach is expected to avoid a D1 schema migration, but that is an implementation hypothesis rather than a locked requirement. If the final safe implementation requires a migration, the migration must be reviewed explicitly.

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
- Free Study bag size for the largest supported mixed selection.

Whole-System `mode: all` exists partly to prevent route-count growth from scaling with every Topic/Tag under every selected System.

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

### Active Review / analytics

- every Review has one concrete System attribution;
- Scheduled completion writes the intended System attribution;
- monthly/per-System analytics remain correct after mixed runs;
- curated-Tag-only attribution preserves current semantics;
- repeated access to the same mixed run cannot change attribution nondeterministically.

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
- new run-descriptor/scope version;
- Scheduled fingerprint/proof changes;
- Scheduled and Free planner support;
- active-Review creation/revalidation support;
- browser descriptor validation/storage transition;
- regression and maximum-envelope benchmarks.

This PR should keep existing learner behavior available until its runtime invariants are proven.

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
- changes to Scheduled/Free completion semantics unrelated to scope;
- Production mutation/deployment as part of the planning documentation PR.

## 15. Acceptance criteria

Multi-System learner study is ready for learner cutover when all of the following are true:

1. a learner can select more than one System in one study run;
2. each System can independently mean all or an explicit Topic/Tag subset;
3. the server, not browser state, owns normalization and eligibility;
4. overlapping scope contributes each Case at most once;
5. System attribution for every presented Case is deterministic and persisted on its active Review;
6. Scheduled run proofs authenticate the complete normalized mixed scope;
7. FSRS state remains Case-level and unchanged in ownership;
8. per-System analytics/provenance remain correct;
9. 5/10/20/All apply to the combined unique candidate pool;
10. browser/Worker/D1 performance stays inside measured supported envelopes;
11. current single-System study remains a valid special case of the new contract;
12. living learner-study documentation is updated only when the implementation actually ships.
