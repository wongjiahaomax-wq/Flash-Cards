# Learner FSRS Implementation Readiness Contract

Status: **Final implementation-readiness addendum — planning only, not implementation authorization**

Date: 2 September 2026

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

## 2. Expired active Review replacement is synchronous and write-boundary guarded

`active_reviews` enforces one active Review per learner at the database level. Expiry is seven days, but an expired row remains a row until it is consumed/deleted.

A learner must **not** depend on Cron or background cleanup before starting another Review.

When active-Review creation encounters an existing row, creation must distinguish:

- unexpired existing Review → do not create another; return Resume / Discard state;
- expired existing Review → atomically consume the expired row at the write boundary and establish the new Review under the same uniqueness/concurrency protection.

A pre-read of expiry is advisory only. The operation that consumes an expired active Review must prove inside the same atomic write boundary that the existing row is actually expired at a transactionally authoritative database time. Conceptually:

```text
active_review.expires_at <= database_write_time
```

where `database_write_time` comes from D1/SQLite current database time or another transactionally authoritative equivalent evaluated at the write boundary. Browser time and an earlier request timestamp do not authorize expiry consumption.

### Concurrency invariant

If two devices simultaneously attempt to replace the same expired Review:

- at most one replacement active Review is created;
- the loser discovers/returns the newly established active Review rather than creating a second row;
- completion of the expired Review cannot succeed because completion requires the active Review to still exist and to satisfy the write-boundary expiry guard.

The inverse serialized outcome is also valid: if completion's guarded transaction commits before expiry, it may succeed and consume the active Review; later cleanup/replacement then finds no active row to consume.

Required tests include this exact two-device expired-row replacement race and the completion-versus-expiry serialization behavior.

Background expiry cleanup remains a maintenance backstop, not a prerequisite for learner progress.

---

## 3. Authenticated Scheduled run boundary and two server-time roles

Scheduler and lifecycle timing is server-authoritative.

The browser may store/display timestamps and the browser-local run descriptor, but it does not choose scheduler-authoritative time, scope, or profile boundaries.

### Authenticated run boundary

`runStartedAt` is generated by the server when planning a Scheduled run. Because ordinary runs intentionally have no persistent D1 run/session row, the server must also issue an **opaque authenticated run-boundary token** or equivalent server-verifiable mechanism that cryptographically binds the immutable run boundary returned to the browser.

The token must bind at least:

- authenticated learner/user identity;
- run ID;
- server-generated `runStartedAt`;
- scheduler revision/version;
- FSRS generation;
- review-sequence epoch;
- parameter revision;
- normalized effective selected-scope identity or deterministic scope fingerprint;
- token/schema version.

The exact signing/MAC primitive, secret/key rotation mechanism, encoding, and optional expiry field are implementation details. The invariant is that the browser cannot mint or alter a valid run boundary.

Before opening any Scheduled work, the server must:

1. verify token integrity/version;
2. verify token ownership by the authenticated learner;
3. verify the request's normalized effective scope matches the token-bound scope/fingerprint;
4. compare the token's scheduler/generation/epoch/parameter boundary with the current learner profile;
5. then perform the ordinary current content, scope, and scheduler-state revalidation for the requested queue entry.

Malformed, expired where expiry is used, unsupported-version, wrong-owner, or integrity-invalid tokens fail closed. A valid token is **not** authorization to bypass current content eligibility, active-Review ownership, or Case-state revalidation.

Reset/Fresh/parameter/scheduler changes continue to invalidate an otherwise authentic old run through current-profile comparison; token authenticity does not freeze the learner profile forever.

No D1 persistent run/session row is required solely to authenticate this boundary.

### Scope integrity

Selected System/Topic/Tag scope is also browser-local convenience state, not authority. The run token must bind the normalized effective scope or a deterministic fingerprint of that scope after server-side validation/normalization.

Canonicalization must be deterministic enough that semantically identical scope normalizes identically and a materially different scope does not. A client must not be able to reuse a valid run token while substituting a different learner Study selection.

The server still revalidates that the requested route/content remains currently eligible when opening work.

### Request/scheduler time

For each relevant server request, capture one authoritative server `requestNow` / equivalent request-time value and use that single value consistently for request/scheduler semantics such as:

- Scheduled run planning;
- current-Due checks;
- repeat maturity;
- scheduler computation inputs where required by the adapter;
- proposed logical `completedAt` where appropriate;
- other scheduler comparisons that are intentionally request-time decisions.

Do not mix browser clock values into these decisions.

### Database/write-boundary time

The hard active-Review lifecycle guard has a different timing role. Completion, expired-row replacement, and expiry cleanup must determine expiry at the database write boundary using D1/SQLite current database time or another transactionally authoritative equivalent inside the same atomic transaction as the protected writes.

A completion may commit only if conceptually:

```text
active_review.expires_at > database_write_time
```

inside the same atomic transaction as event/state/optimizer/encounter/aggregate writes and active-Review consumption.

An earlier `requestNow < expires_at` pre-read does not authorize a later write after expiry. Likewise, expired-row replacement/cleanup may consume only a row proven expired at its write boundary.

### Captured Due opening

For unchanged captured Due state, opening work must prove all of:

1. valid authenticated run-boundary token;
2. current profile boundary still matches the token;
3. expected Case `state_revision` still matches;
4. the outstanding Case state was Due at the authenticated original run start;
5. the outstanding Case state is also currently Due at authoritative server request time;
6. current content/scope eligibility remains valid.

Therefore, for the same unchanged outstanding state, require conceptually:

```text
due_at <= authenticatedRunStartedAt
```

and:

```text
due_at <= requestNow
```

A client-modified timestamp must never make a later-Due Case appear to have belonged to the original captured queue.

### Captured New and repeat opening

Captured New still requires no current FSRS state plus valid token/profile/scope/content boundaries. An in-run repeat must still match its expected state revision, token/profile/scope boundaries, and `due_at <= requestNow` before a repeat Review is created.

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
- authenticated Scheduled run boundary/token and browser descriptor;
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

## 8. Scheduled completion conflict reconciliation and rating mismatch

The Scheduled event/active Review ID is the durable idempotency key, but a pre-check alone is insufficient.

Two completion requests may both observe no event before either writes. If request A commits first, request B may then fail on the unique event/receipt insert.

The **first successful committed event is authoritative**, including its stored rating and resulting state.

### Same Review/event ID + same requested rating

On an existing receipt or duplicate Scheduled event/receipt conflict:

1. re-read the `scheduled_review_events` receipt by the same Review/event ID;
2. require that it belongs to the same authenticated learner and represents the expected completed Review;
3. require that its stored rating matches the retried requested rating;
4. if so, return/replay the committed success using the stored rating, resulting state revision, next-due information, and other minimal committed result fields;
5. do **not** reapply state, encounter, aggregate, optimizer-evidence, or active-Review writes;
6. do **not** surface a generic 500 for a request whose original copy actually committed successfully.

### Same Review/event ID + different requested rating

If the same authenticated learner retries/races the same Review/event ID with a rating different from the already-committed rating:

- do not mutate anything;
- do not create another event or another FSRS transition;
- return the already-committed outcome/result;
- surface an explicit idempotency/payload-mismatch result such as **already completed as Good** rather than claiming the later Again/Hard/Good/Easy request was applied.

The stored event rating is sufficient evidence; this does not require another persistence subsystem.

If no matching same-learner receipt exists, or the receipt belongs to another learner, or a different database guard fails, treat that as a real failure. A duplicate conflict for another learner must never become success.

Free Study keeps the analogous short-lived receipt behavior already specified; there is no rating comparison for Free completion.

Required tests include two completion requests that both pass the initial no-receipt read before one wins the commit, both for identical ratings and for conflicting ratings.

---

## 9. Browser workload / localStorage benchmark and failure contract

The D1 benchmark is not enough. Captured Scheduled workload can be a substantial response/localStorage object for large Systems.

Before the run-planner/browser-storage implementation is accepted, benchmark representative and worst-supported descriptors including:

- serialized JSON bytes for captured New IDs;
- serialized Due entries including Case ID + expected state revision / required metadata;
- selected scope metadata;
- authenticated opaque run-boundary token / run boundary values;
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

Do not silently fall back to persistent D1 run/session rows merely because one browser descriptor is large or because the run boundary needs authentication.

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

## 12. Active frozen Review payload-size gate

An active Review may freeze the exact resume content for a Case, including vignette, selected questions, answers, metadata, and related snapshot information. Implementation must not assume an arbitrarily large versioned JSON payload is safe in one D1/SQLite row.

Before PR C finalizes the physical active-Review schema, it must benchmark and enforce the worst-supported frozen Review size against current Cloudflare D1/SQLite limits and measured behavior.

PR C may choose either of these implementation shapes based on evidence.

### Option A — bounded JSON payload

A single versioned payload is acceptable only if implementation proves and enforces a safe maximum well below the relevant provider/database limits.

The authored-content write path or active-Review creation path must prevent an unsupported oversized Review from being created. Oversized creation must fail cleanly **before learner progress begins** for that Review.

### Option B — normalized active snapshot

Keep `active_reviews` metadata compact and normalize frozen question/answer detail into active child rows analogous in responsibility to the existing Review child tables, while preserving temporary-only lifecycle semantics: all frozen child detail is deleted on completion/discard/expiry.

`active_review_assets` remain normalized as already planned.

### Required benchmark/test evidence

Measure at minimum:

- maximum current Production-like Case frozen payload;
- a deliberately large but supported Case fixture;
- relevant row/string/BLOB sizes;
- total D1 bytes written for one active Review;
- creation and read/resume performance;
- behavior when content exceeds the supported maximum.

Do not silently truncate vignette, question, answer, or metadata content. The exact A/B choice and numeric limit belong to PR C based on measured evidence, not to this planning PR.

---

## 13. Time-series analytics and account-deletion scale gate

The product contract defines cohort/System trends as an actual time series and the current direction is bounded monthly buckets that can survive detailed-event expiry.

PR G owns the final physical bucket schema and stable cohort definition, but account deletion imposes two hard design constraints:

- full learner-account deletion must remove that learner's contribution from retained trend analytics unless the product later explicitly defines a legally/operationally acceptable anonymized aggregate contract;
- the deletion mechanism must remain correct and operationally bounded for the worst-supported mature learner.

A strong default candidate is learner-scoped monthly System buckets with `ON DELETE CASCADE`, aggregated across learners at read time. A shared bucket representation is acceptable only if it has correct compensating-decrement/rebuild semantics and associated concurrency tests.

### PR G deletion scale gate

Before shipping account deletion, PR G must benchmark a worst-supported mature learner across all learner-owned data, including where present:

- Scheduled events;
- optimizer evidence;
- learner × Case FSRS state;
- encounter rows;
- monthly trend buckets;
- Free/Scheduled receipts;
- learner/System aggregates and other learner-owned rows.

PR G must then choose one of these paths.

#### Direct cascade

Keep direct Better Auth-user hard deletion as the identity root only if benchmark evidence proves that the entire application-owned + auth-owned cascade remains safely bounded within actual D1 limits/behavior at supported scale.

#### Staged deletion

If one large cascade is not safely bounded:

1. disable/revoke learner access first;
2. delete large learner-owned child datasets in bounded operations;
3. maintain durable deletion state if multiple operations are required;
4. delete the Better Auth identity only after application-owned rows are safely removed;
5. retain FK cascades as defensive cleanup where useful.

A staged operation must be retry-safe, must not allow the learner to regain normal access halfway through deletion, and must converge safely after interrupted/retried work.

This is a future PR G decision. PR A must not add speculative deletion tables merely to anticipate the staged path.

---

## 14. Implementation sequence update

The programme remains focused and staged.

### PR A — FSRS foundation + benchmark harness

Must additionally establish/prove:

- lazy deterministic profile bootstrap;
- scheduler revision/version boundary;
- generation / sequence epoch / parameter revision / state revision fields and semantics;
- portable optimizer evidence only, with optimizer rescheduling explicitly deferred;
- D1 benchmark foundations needed by later PRs.

No learner runtime cutover and no speculative account-deletion staging tables.

### PR B — systems-first UX transplant + run planning

Must additionally establish/prove:

- server-generated `runStartedAt`;
- authenticated opaque run-boundary token/equivalent binding learner identity, run ID, server `runStartedAt`, scheduler revision, generation, epoch, parameter revision, normalized scope fingerprint, and token/schema version;
- deterministic normalized-scope fingerprinting and wrong-scope rejection;
- per-entry state/classification metadata;
- captured Due proof against both authenticated run start and current server time;
- browser descriptor size/localStorage benchmark and graceful storage-failure behavior;
- no persistent D1 run/session row solely for token protection;
- no first active Review is created when descriptor persistence failed.

### PR C — temporary active Review lifecycle

Must additionally establish/prove:

- database-enforced one-active ownership;
- synchronous expired-row replacement using database write-boundary time;
- multi-device expired replacement race;
- completion/replacement/cleanup expiry serialization;
- creation guards against current authenticated scheduler/run/scope/classification state;
- frozen Review remains completable after ordinary Admin deactivation;
- scheduler revision captured on active Review;
- worst-supported frozen Review payload benchmark;
- measured choice between safely bounded JSON vs normalized active snapshot;
- clean oversized-Review rejection before learner progress begins.

### PR D — Scheduled Study / FSRS completion

Must additionally establish/prove:

- current-Due validation at open time against authenticated run start and request time;
- server-clock repeat maturity;
- database-write-time expiry guard inside the atomic completion transaction;
- expiry-crossing completion rollback behavior;
- post-conflict Scheduled idempotency reconciliation;
- same-rating stored-result replay after ambiguous response;
- different-rating idempotency/payload-mismatch semantics returning the committed outcome without another transition;
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

Continue with the already locked Admin/history/account-delete contracts, plus:

- removable learner contribution for monthly trend aggregation;
- worst-supported learner deletion benchmark against actual D1 behavior;
- evidence-based direct-cascade vs staged-deletion choice;
- retry/access-safety proof for staged deletion if required.

### Later optimizer PR

Owns optimizer execution environment, actual parameter replacement, and the explicit state-rescheduling policy. V1 does not implement these behaviors.

---

## 15. Additional required invariant tests

In addition to the tests already required by the technical plan, protect at minimum:

- two devices concurrently lazily initialize the same learner profile and converge on one canonical default profile;
- Reset on an uninitialized learner is safe/idempotent;
- Fresh Start on an uninitialized learner creates the normal first generation rather than skipping a generation;
- modifying `runStartedAt` or other token-bound run fields invalidates the authenticated run boundary;
- using another learner identity invalidates token use;
- changing normalized selected scope invalidates token use;
- stale scheduler revision/generation/epoch/parameter boundary invalidates an otherwise authentic token/run;
- captured Due whose unchanged state became Due only after the real authenticated run start cannot open as captured Due;
- captured Due still must be currently Due at request time;
- no D1 persistent run/session row is required for authenticated run-boundary protection;
- repeat opening uses server time and rejects premature client requests;
- an expired active row never permanently blocks a new Review;
- two devices racing to replace one expired active Review create exactly one replacement;
- expired-row replacement consumes only a row proven expired at database write time;
- completion pre-read while valid followed by write after `expires_at` rolls back the entire completion transaction, leaving no event/state/optimizer/encounter/aggregate writes;
- if completion writes before expiry it may succeed, consumes the active Review, and later cleanup finds no active Review;
- ordinary Admin Case deactivation after active Review creation does not invalidate that already-frozen Review;
- deactivated Case cannot create a new Review afterward;
- worst-supported active frozen Review size is measured before PR C schema lock-in;
- deliberately oversized active Review creation fails cleanly before learner progress and never truncates frozen content;
- stale scheduler revision invalidates a run;
- unproven scheduler revision cannot silently complete an old active Review;
- two identical Good Scheduled completion requests racing past the pre-read resolve to one commit + one replayed success;
- Good and Again requests racing for the same Review resolve to one committed rating/transition; the loser receives the committed result plus explicit payload-mismatch semantics;
- mismatched/different-learner event conflicts do not become idempotent success;
- oversized/localStorage-failed run descriptor creates no active Review and writes no learner progress;
- zero-data cutover gate fails closed if an unexpected learner legacy Review row exists;
- post-cutover learner flows cannot write legacy Review tables;
- System→Topic reclassification is blocked after Scheduled learner historical attribution exists;
- future monthly trend storage can remove an individual learner's contribution on full account deletion;
- PR G benchmark covers worst-supported mature-learner deletion and proves the chosen direct/staged path is bounded, retry-safe, and access-safe.

---

## 16. Readiness position

After these contracts are incorporated, PR #101 should be treated as **implementation-ready planning**, subject to exact-head review/CI and the normal requirement that each implementation PR re-check then-current repository/library/platform evidence.

Do not continue adding speculative architecture merely for completeness. Reopen the design only when a focused implementation/benchmark discovers concrete evidence that conflicts with one of these assumptions or invariants.

This document does not authorize merge, deployment, Production D1/R2 mutation, migration application, destructive cutover, feature enablement, or learner rollout by itself.
