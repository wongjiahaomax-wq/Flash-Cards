# Learner FSRS Implementation Readiness Contract

Status: **Final implementation-readiness addendum — planning only, not implementation authorization**

Date: 1 September 2026

This document is a required technical addendum to:

- `LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md` — locked product authority;
- `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md` — primary technical-design companion.

It records the final boundary contracts identified during independent readiness review. It does not reopen the settled product model. Where this document adds technical specificity to an otherwise-open implementation boundary, implementation must satisfy this narrower invariant. If it ever conflicts with the locked product plan on product behavior, the product plan wins.

The intent after this addendum is to stop expanding the architecture unless PR A or a later focused implementation PR discovers concrete library, D1, Workers, browser, or repository evidence that invalidates an assumption.

---

## 1. Explicit learner Review runtime cutover owner

FSRS launch is a clean persistence cutover, but the cutover is not merely a schema migration. Current `main` still has runtime, media, Asset-lifecycle, test, local-tooling, and documentation behavior built around the legacy `reviews`, `review_questions`, and `review_assets` model.

Therefore the implementation programme must include an explicit **learner Review runtime cutover / legacy-removal checkpoint** after Scheduled Study and Free Study are functionally complete and before the new learner Study surface is treated as the normal production path.

Before this checkpoint:

- incomplete FSRS persistence must not become the normal learner Review runtime;
- legacy and new Review persistence must not be treated as two supported long-term modes;
- the zero-data assumption does not authorize piecemeal deletion of old runtime owners.

The cutover checkpoint owns, at minimum:

1. run the mandatory Production zero-data safety gate for legacy learner Review/history rows;
2. stop immediately if unexpected learner rows exist;
3. switch learner Review creation, reveal/resume, completion, navigation, and authenticated Review-media serving to the new active-Review/FSRS model;
4. remove or make unreachable legacy learner Review writers/readers that would otherwise create new `reviews` / `review_questions` / `review_assets` rows;
5. update authenticated media serving so active unfinished Reviews use `active_review_assets` rather than `review_assets.storage_key_snapshot`;
6. update Asset/R2 lifecycle and purge/reference checks to protect current authored references plus active unfinished Review references, without preserving nonexistent legacy learner Review snapshots;
7. update local replica/reset/fixture/tooling that explicitly knows the legacy Review tables;
8. remove obsolete schema exports, source contracts, tests, and documentation whose only owner is the retired learner Review persistence model;
9. keep Admin Study Preview outside learner SRS persistence;
10. prove the new runtime does not accidentally write the retired model.

This is a removal/cutover checkpoint, not a legacy compatibility layer.

### Recommended programme placement

Keep the existing focused PR decomposition, but add an explicit cutover checkpoint after the Scheduled + Free/Expanded behavior is complete. Progress/Admin work may be developed separately where dependency boundaries allow, but production learner rollout must not occur until this cutover checkpoint passes.

---

## 2. Expired active Review replacement is synchronous

`active_reviews` enforces one active Review per learner at the database level. Expiry is seven days, but an expired row remains a row until it is consumed/deleted.

A learner must **not** depend on Cron or background cleanup before starting another Review.

When active-Review creation encounters an existing row, creation must distinguish:

- unexpired existing Review → do not create another; return Resume / Discard state;
- expired existing Review → atomically consume the expired row at the write boundary and establish the new Review under the same uniqueness/concurrency protection.

Expiry is evaluated using authoritative server/database time, not a browser timestamp.

### Concurrency invariant

If two devices simultaneously attempt to replace the same expired Review:

- at most one replacement active Review is created;
- the loser discovers/returns the newly established active Review rather than creating a second row;
- completion of the expired Review cannot succeed because completion requires the active Review to still exist and be unexpired at the write-time guard.

Required tests include this exact two-device expired-row replacement race.

Background expiry cleanup remains a maintenance backstop, not a prerequisite for learner progress.

---

## 3. Server-clock authority

Scheduler and lifecycle timing is server-authoritative.

The browser may store/display timestamps, but it does not choose scheduler-authoritative time.

### Run start

- `runStartedAt` is generated by the server when planning the Scheduled run.
- The client may persist the returned value in localStorage but cannot supply an arbitrary value that becomes scheduling authority.
- Captured Due classification uses the server-generated `runStartedAt`.

### Request-time decisions

For each relevant server request, capture one authoritative `requestNow` / equivalent server time and use that single value consistently for that request's:

- Due validation;
- repeat maturity;
- active Review expiry;
- completion timestamp where applicable;
- other scheduler time comparisons.

Do not mix browser clock values into these decisions.

### Due opening

A captured Due entry must satisfy both:

1. the expected Case state/state revision is still the outstanding state captured for that work; and
2. the Case is **currently Due at server time** when a new active Review is opened.

A state-revision match alone must not allow a malformed/tampered captured descriptor to open a future-not-yet-Due Case as Scheduled work.

### Repeat opening

An in-run repeat must still match its expected state revision and `due_at <= requestNow` at the server before a repeat Review is created.

---

## 4. Idempotent first-ever learner bootstrap

There are currently no learner FSRS profile/preference rows to preseed. Initialization should be lazy and idempotent rather than coupled to Better Auth account creation.

### Learner preferences

On the first preference/read path that requires persistent learner preferences, ensure exactly one row with locked defaults:

- `scheduled_order = due_first`;
- `expanded_learning = false`.

Concurrent first requests must converge through `INSERT ... ON CONFLICT` / equivalent and re-read the winning row rather than producing divergent defaults.

### FSRS profile

On the first Scheduled operation that needs an FSRS profile, atomically ensure one deterministic initial profile. Conceptually initialize:

- first FSRS generation;
- first review-sequence epoch;
- first parameter revision;
- first scheduler revision/version;
- exact default parameter JSON produced/normalized by the pinned repository adapter with desired retention `0.90`;
- default detailed-history retention policy.

Do not independently recreate default parameter JSON in multiple call sites. The pinned adapter owns canonical default generation/normalization.

Concurrent first Scheduled requests must converge on the same persisted profile and then proceed through the ordinary one-active-Review/write-time guards.

### Operations before initialization

- **Reset Progress** on a never-initialized learner is an idempotent no-op for FSRS state; it need not create a profile merely to reset nothing.
- **Fresh FSRS Start** on a never-initialized learner establishes the normal initial default profile; it must not manufacture an extra generation/epoch solely because no prior FSRS generation existed.
- an explicit Admin retention override may ensure/create the profile if persistence is required to store that override;
- Free Study alone does not need to initialize FSRS parameters/state.

Required tests cover concurrent lazy bootstrap and these uninitialized-operation semantics.

---

## 5. Scheduler revision / library upgrade boundary

`generation`, `review_sequence_epoch`, `parameter_revision`, and Case `state_revision` do not by themselves identify the scheduler implementation that serialized/interpreted state.

V1 must therefore persist an explicit **scheduler revision/version boundary** sufficient to identify the adapter/algorithm state format and transition semantics that own learner FSRS state.

At minimum bind scheduler revision/version to:

- learner FSRS profile;
- learner × Case FSRS state;
- Scheduled active Review;
- Scheduled run descriptor;
- completed Scheduled event/optimizer evidence where needed for debugging/reconstruction.

### V1 policy

V1 launches on one explicitly pinned, reviewed scheduler revision. There is no scheduler upgrade/reserialization work hidden inside PR A beyond providing this boundary and compatibility fixtures for the pinned revision.

### Future scheduler/library upgrade policy

A future scheduler upgrade is a deliberate migration/review event. It must not silently deserialize old state or complete a seven-day-old active Review under materially different transition semantics.

Before changing scheduler revision, the later upgrade PR must choose and prove one of these paths:

- **compatible path** — explicit fixtures prove old persisted state can be interpreted with equivalent intended semantics by the new adapter/revision; or
- **migration/invalidation path** — migrate state deliberately and invalidate affected active Reviews/local runs as part of the revision transition.

If compatibility is not proven, fail closed rather than guessing.

A run whose captured scheduler revision no longer matches the learner profile is stale and must restart. A Scheduled active Review whose scheduler revision is no longer valid under the chosen upgrade policy must not complete under an unproven revision.

---

## 6. Parameter optimization rescheduling is explicitly deferred

V1 does **not** perform automatic parameter replacement or optimizer-driven rescheduling.

PR A should provide only the portable history/parameter/revision foundations already required for later optimization. It must not invent a rescheduling algorithm merely because `parameter_revision` exists.

The later optimizer PR must, before rollout:

1. select and verify the optimizer implementation/execution environment;
2. verify the chosen scheduler library's behavior for applying optimized parameters to existing card states;
3. choose explicitly whether/how existing `learner_case_fsrs` states are rescheduled/recomputed after parameter replacement;
4. define transactional/revision behavior for that choice;
5. benchmark it;
6. add compatibility/invariant tests.

Until that later decision, no implementation agent should interpret the technical plan as requiring optimizer-driven state rescheduling in V1.

---

## 7. Historical System identity cannot be reclassified away

Completed Scheduled history and learner/System aggregates promise stable historical System attribution.

Current taxonomy administration allows a System to be reclassified into a Topic once its exposed System Tags are removed; current code does not use learner history as a reclassification guard.

Once a System has learner Scheduled history or retained learner/System aggregates/time-bucket contributions, that concept's historical identity must remain a **System**.

Therefore:

- rename remains allowed;
- deactivation remains allowed subject to ordinary current-content rules;
- reclassification from System → Topic is blocked once learner Scheduled history/aggregate ownership exists;
- the implementation should enforce this in the normal taxonomy write path and, where practical, with a defensive database invariant/guard appropriate to the final schema.

This preserves stable System attribution without adding a separate System-title snapshot to every Scheduled event.

Account-history cleanup does not automatically make a historically used System safe to reclassify unless the final implementation can prove no retained learner history/aggregate/time-bucket ownership remains. Do not make reclassification depend on fragile UI-only checks.

---

## 8. Scheduled completion conflict reconciliation

The Scheduled event/active Review ID is the durable idempotency key, but a pre-check alone is insufficient.

Two identical completion requests may both observe no event before either writes. If request A commits first, request B may then fail on the unique event/receipt insert.

### Required duplicate-success path

On a duplicate Scheduled event/receipt conflict:

1. re-read the `scheduled_review_events` receipt by the same Review/event ID;
2. require that it belongs to the same authenticated learner and represents the expected completed Review;
3. if it exists, return/replay the committed success using the stored resulting state revision / next-due information;
4. do **not** reapply state, encounter, aggregate, or optimizer-evidence writes;
5. do **not** surface a generic 500 for a request whose original copy actually committed successfully.

If no matching same-learner receipt exists, or a different database guard fails, treat that as a real failure rather than converting all constraint errors into success.

Free Study keeps the analogous short-lived receipt behavior already specified.

Required tests include two completion requests that both pass the initial no-receipt read before one wins the commit.

---

## 9. Browser workload / localStorage benchmark and failure contract

The D1 benchmark is not enough. Captured Scheduled workload can be a substantial response/localStorage object for large Systems.

Before the run-planner/browser-storage implementation is accepted, benchmark representative and worst-supported descriptors including:

- serialized JSON bytes for captured New IDs;
- serialized Due entries including Case ID + expected state revision / required metadata;
- selected scope metadata;
- run boundary values;
- repeat-lane metadata;
- browser/localStorage write time;
- read + JSON parse time;
- response payload size;
- behavior around realistic browser storage quotas.

Include the existing large synthetic candidate scenario (for example ~20,000 eligible Cases) or a justified current-content upper bound.

### Shipping contract

PR B must choose a measured supported strategy before learner rollout:

- compact/chunk browser-local storage; or
- an explicitly bounded maximum captured workload; or
- another browser-local representation that preserves the no-D1-run-state architecture.

Do not silently fall back to persistent D1 run/session rows merely because one browser descriptor is large.

If the browser cannot persist the planned descriptor:

- do not open/create the first active Review as though the run were safely resumable;
- fail cleanly before learner progress begins for that run;
- tell the learner the selection is too large / could not be saved and require a narrower selection or another explicitly designed recovery path;
- never partially persist a descriptor and then trust it as complete.

The exact numeric workload cap, if a cap is chosen, is a benchmark result rather than a product number invented in this planning PR.

---

## 10. Waiting for a future in-run repeat

If captured Due/New work is exhausted but the current run contains an FSRS-generated repeat that is not Due yet, the Scheduled run does not falsely mark that repeat complete and does not busy-loop.

The learner should see a waiting state such as **Next repeat in ...** based on server-derived due information, with clear options to:

- remain on the Scheduled run until it matures;
- end the Scheduled run;
- leave for Free Study / another area, which ends the current Scheduled run rather than keeping a hidden cross-mode run alive.

If the learner ends/leaves before maturity, discard the browser repeat entry with the run. The committed server FSRS state remains authoritative and the Case will be eligible in a later Scheduled run when Due.

The client may display a countdown using local time for presentation, but the server revalidates actual maturity before opening the repeat.

---

## 11. Admin deactivation after active Review freeze

Case/content deactivation prevents **new** learner active Review creation for that Case.

However, once a valid learner active Review has already been created and frozen, later ordinary Admin deactivation does not by itself cancel that Review. The learner may Resume and complete the already-open frozen Review as long as all active-Review scheduler/ownership/expiry guards still pass.

Rationale: active freezing exists specifically to make an in-progress Review stable across ordinary Admin content edits/lifecycle changes.

Explicit active-Review invalidators remain:

- Reset Progress;
- Fresh FSRS Start;
- learner/Admin Discard where authorized;
- expiry;
- scheduler-revision migration/invalidation where explicitly designed;
- account deletion;
- any future deliberately designed emergency invalidation mechanism.

After completion/expiry/discard, deactivated content cannot be used to create another Review unless restored and otherwise eligible.

---

## 12. Time-series analytics and account deletion

The product contract defines cohort/System trends as an actual time series and the current direction is bounded monthly buckets that can survive detailed-event expiry.

PR G owns the final physical bucket schema and stable cohort definition, but account deletion imposes a hard design constraint:

- full learner-account deletion must remove that learner's contribution from retained trend analytics unless the product later explicitly defines a legally/operationally acceptable anonymized aggregate contract;
- do not choose an irreversibly shared aggregate shape that cannot remove one learner's contribution.

A strong default candidate is learner-scoped monthly System buckets with `ON DELETE CASCADE`, aggregated across learners at read time. A shared bucket representation is acceptable only if it has correct compensating-decrement/rebuild semantics and associated concurrency tests.

This is a PR G concern, not a PR A table requirement.

---

## 13. Implementation sequence update

The programme remains focused and staged.

### PR A — FSRS foundation + benchmark harness

Must additionally establish/prove:

- lazy deterministic profile bootstrap;
- scheduler revision/version boundary;
- generation / sequence epoch / parameter revision / state revision fields and semantics;
- portable optimizer evidence only, with optimizer rescheduling explicitly deferred;
- D1 benchmark foundations needed by later PRs.

No learner runtime cutover.

### PR B — systems-first UX transplant + run planning

Must additionally establish/prove:

- server-generated `runStartedAt`;
- run boundary includes scheduler revision + generation + epoch + parameter revision;
- per-entry state/classification metadata;
- browser descriptor size/localStorage benchmark and graceful storage-failure behavior;
- no first active Review is created when descriptor persistence failed.

### PR C — temporary active Review lifecycle

Must additionally establish/prove:

- database-enforced one-active ownership;
- synchronous expired-row replacement;
- multi-device expired replacement race;
- server-clock expiry;
- creation guards against current scheduler/run/classification state;
- frozen Review remains completable after ordinary Admin deactivation;
- scheduler revision captured on active Review.

### PR D — Scheduled Study / FSRS completion

Must additionally establish/prove:

- current-Due validation at open time;
- server-clock repeat maturity;
- post-conflict Scheduled idempotency reconciliation;
- stored result replay after ambiguous response;
- future-repeat waiting state.

### PR E — Free Study + Expanded preference

Must additionally establish/prove:

- short-lived Free completion receipt retry behavior;
- Free Study does not initialize FSRS merely by being used.

### Cutover checkpoint — learner Review runtime cutover / legacy removal

After Scheduled + Free behavior is complete and validated:

- run zero-data Production gate before destructive deployment/migration action;
- switch all learner Review runtime/media paths;
- retire legacy writers/readers/tables as appropriate;
- update Asset/R2 lifecycle references;
- update replica/reset tooling, schema exports, tests, and authoritative docs;
- prove no legacy learner Review rows can be recreated.

No legacy dual-read phase is required.

### PR F — reset/fresh/retention/learner Progress

Continue with the already locked reset/epoch/retention/optimizer-prefix/Progress contracts.

### PR G — Admin analytics/history + account deletion

Continue with the already locked Admin/history/account-delete contracts, plus removable learner contribution for monthly trend aggregation.

### Later optimizer PR

Owns optimizer execution environment, actual parameter replacement, and the explicit state-rescheduling policy. V1 does not implement these behaviors.

---

## 14. Additional required invariant tests

In addition to the tests already required by the technical plan, protect at minimum:

- two devices concurrently lazily initialize the same learner profile and converge on one canonical default profile;
- Reset on an uninitialized learner is safe/idempotent;
- Fresh Start on an uninitialized learner creates the normal first generation rather than skipping a generation;
- `runStartedAt` cannot be client-forged as scheduler authority;
- Due opening rejects a state-revision match when the Case is not currently Due;
- repeat opening uses server time and rejects premature client requests;
- an expired active row never permanently blocks a new Review;
- two devices racing to replace one expired active Review create exactly one replacement;
- ordinary Admin Case deactivation after active Review creation does not invalidate that already-frozen Review;
- deactivated Case cannot create a new Review afterward;
- stale scheduler revision invalidates a run;
- unproven scheduler revision cannot silently complete an old active Review;
- two Scheduled completion requests that race past the pre-read resolve to one commit + one replayed success;
- mismatched/different-learner event conflicts do not become idempotent success;
- oversized/localStorage-failed run descriptor creates no active Review and writes no learner progress;
- zero-data cutover gate fails closed if an unexpected learner legacy Review row exists;
- post-cutover learner flows cannot write legacy Review tables;
- System→Topic reclassification is blocked after Scheduled learner historical attribution exists;
- future monthly trend storage can remove an individual learner's contribution on full account deletion.

---

## 15. Readiness position

After these contracts are incorporated, PR #101 should be treated as **implementation-ready planning**, subject to exact-head review/CI and the normal requirement that each implementation PR re-check then-current repository/library/platform evidence.

Do not continue adding speculative architecture merely for completeness. Reopen the design only when a focused implementation/benchmark discovers concrete evidence that conflicts with one of these assumptions or invariants.

This document does not authorize merge, deployment, Production D1/R2 mutation, migration application, destructive cutover, feature enablement, or learner rollout by itself.
