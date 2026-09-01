# Learner FSRS Study and Retention Plan

Status: **Locked product/planning baseline — not yet implemented**

This document records the agreed learner Study, FSRS, history, retention, reset, and analytics decisions as of 1 September 2026.

This is the product authority for future learner scheduling work. Older simple-scheduler / Again-Good-only planning is superseded and must not be used as implementation authority.

Implementation must still inspect actual current `main`, open learner-study/account/architecture PRs, schema/migrations, then-current Cloudflare limits, and repository guidance before coding.

---

## 1. Scheduling model

- The **Case** is the SRS scheduling unit.
- There is one active scheduler state per **learner × Case**.
- A Case has the same SRS state regardless of which System, Topic, or Tag route exposed it.
- Study selection determines **which Cases are eligible**.
- FSRS determines **when an eligible scheduled Case should be studied**.
- Use modern **FSRS-controlled short-term and long-term scheduling** rather than hard-coded learning/relearning steps.
- Initial desired retention: **90%**.
- V1 uses standard/default FSRS parameters.
- Later, FSRS parameters may be optimized automatically and invisibly **per learner** from that learner's eligible scheduled-review history.
- Historical data needed for later optimization must be preserved from V1.
- Free Study never initializes or changes FSRS and never contributes optimizer input.

## 2. Scheduled Study vs Free Study

The learner Study area exposes two explicit modes.

### Scheduled Study

- Controlled by FSRS.
- Updates learner × Case scheduler state.
- Uses one overall Case-level rating after the complete Case.
- Ratings are:
  - Again
  - Hard
  - Good
  - Easy
- Ratings follow normal FSRS semantics.
- `Hard` means successful recall with substantial difficulty, not forgotten content.
- Raw FSRS values such as stability and difficulty are not shown to learners.

### Free Study

- Explicitly outside the SRS schedule.
- Learner enters the full Systems → Topics/Tags selection experience.
- **All eligible Cases** in the selected scope can be studied, whether New, Due, or not due.
- Does not update FSRS state.
- Does not contribute to later FSRS parameter optimization.
- Does not show Again / Hard / Good / Easy.
- Updates only compact Free Study encounter state described below.

`Study More` when Scheduled Study has no work is a shortcut into **Free Study**, not a third study mode.

## 3. Expanded Learning

Expanded Learning is a persistent global learner preference.

- Default: **OFF**.
- OFF → use Original questions.
- ON → use Expanded Learning where the Case supports it.
- If Expanded Learning is unavailable for a Case, fall back to Original.
- Scheduled Original and Expanded Reviews update the **same Case-level SRS state**.
- A completed Expanded scheduled Review fully satisfies that Case's scheduled repetition.
- Free Study respects the same Expanded Learning preference but never changes SRS state.

Expanded Learning is not a per-run choice on the systems-first Study form.

## 4. Scheduled Study ordering preference

Learners have a persistent global preference:

- **Due first**
- **New first**

The default for a new learner is **Due first**.

No mixed mode is required.

Changing the preference during a run affects which already-captured queue is consumed next. It does not reset the current run, its queues, or its New-Case counter.

If the preferred queue is exhausted, Scheduled Study continues into the other available queue. Therefore the default behavior is: **consume Due first; if no Due work exists, continue into New**.

## 5. New-to-SRS Cases and prior encounter state

A Case with no current scheduled FSRS state is New to the scheduler.

For New-queue ordering, distinguish:

1. **Completely unseen** — no prior Free Study encounter and no prior Scheduled Study completion recorded by the learner's compact encounter/history state.
2. **Previously encountered** — previously encountered through Free Study or previously completed in Scheduled Study before a Reset Progress / Fresh FSRS Start.

Both appear to learners simply as **New** whenever they have no current FSRS state.

When consuming New Cases:

1. completely unseen Cases are served first;
2. previously encountered Cases are served afterward.

Each subgroup is randomized as a shuffle bag.

Free Study therefore affects New-Case ordering but never initializes FSRS. Reset operations may make previously scheduled Cases New again without pretending the learner has never encountered them.

The first completed Scheduled Review in the current scheduler state initializes/reinitializes that Case's FSRS state.

## 6. Scheduled Study run

A Scheduled Study run begins when the learner makes a System/Topic/Tag selection and starts studying.

A run ends when the learner leaves/ends the run or deliberately starts a new run.

A new Scheduled Study run always begins from the full Systems menu. Previous System/Topic/Tag selections do **not** need to be preselected.

### Systems-first selection UX

The final learner entry experience should retain the useful systems-first interaction developed in Draft PR #119:

- choose a System first;
- then configure exact Topics and curated Tags;
- all eligible contributing areas begin selected;
- hierarchy controls remain usable for structural parent Topics;
- selected Topic/Tag routes use OR/union semantics;
- Cases reachable through multiple routes are deduplicated;
- zero-selection and stale/invalid route submissions fail safely.

PR #119 itself is **not** to be merged. Its useful UX/selection work should be selectively reused by the FSRS implementation without importing its obsolete persistent study-selection architecture.

### Start-of-run queues

When a run begins:

- resolve the selected System/Topic/Tag scope;
- deduplicate Cases eligible through multiple selected routes;
- create the run's Due and New queues.

The queues are a **start-of-run snapshot**. Cases becoming Due after the run starts wait until the next run.

The browser-local queue is not authorization or eligibility authority. Before actually opening a queued Case, the server must revalidate that it remains a valid learner Case. If an Admin has deactivated or otherwise invalidated a queued Case, **skip it and continue to the next valid Case**.

### Due queue

- Contains Cases Due when the run begins.
- Prioritize Cases **most at risk / lowest retrievability**.

### New queue

Use random shuffle bags rather than authored/content order.

- Completely unseen Cases form the first randomized group.
- Previously encountered but currently New Cases form the second randomized group.
- Each Case occurs once before that group's bag is exhausted.

A Case eligible through multiple Topics/Tags appears **once** in the run.

## 7. Consecutive New-Case guardrail

Default guardrail:

**50 consecutive completed New Cases per Scheduled Study run.**

- Count a New Case only when its scheduled Review is successfully completed.
- Merely opening a Case does not increment the count.
- Free Study never contributes to the count.
- This is a per-run guardrail, not a daily quota.

After 50 consecutive New Cases:

- do not automatically introduce additional New Cases in that run;
- continue into Due Cases if available;
- if no Due Cases remain, tell the learner the run's New-Case limit has been reached;
- the learner may deliberately start a **new Scheduled Study session** from the Systems menu.

Eventually the learner may be allowed to configure or explicitly override this upper limit.

## 8. Free Study sequencing

Free Study uses a **shuffle bag**.

For the selected scope:

- include all currently eligible Cases;
- deduplicate Cases reachable through multiple selected routes;
- randomize them;
- present each Case once before repeating any;
- after the bag is exhausted, reshuffle for another cycle.

The learner cannot learn a deterministic content sequence from Free Study.

The active Free Study run can be remembered locally. If the learner explicitly chooses **Start new Free Study session**, discard the existing local bag and reshuffle.

As with Scheduled Study, the server revalidates a queued Case before opening it. A Case that has become invalid/deactivated is skipped rather than trusted because its ID remains in localStorage.

## 9. Study-run persistence

Ephemeral run/navigation state should live primarily in browser `localStorage`, not D1.

Examples include:

### Scheduled

- selected scope;
- current run identity;
- Due/New queue ordering;
- 50-New counter;
- current Review reference.

### Free Study

- selected scope;
- shuffled Case IDs;
- current bag position;
- current Review reference.

This avoids persistent database study-session rows merely for navigation/resume convenience.

Run state is device/browser specific. Losing localStorage may lose resumable run convenience state, but must never lose completed learner progress.

## 10. Active unfinished Review

The actual active Case Review remains server-backed.

While a Review is active, the server may temporarily retain the **exact frozen vignette/question/answer/asset selection needed to resume the Case consistently**, even if Admin-authored content changes meanwhile.

This protects:

- exact resume behavior;
- frozen Case/question selection while a learner is working;
- consistency if Admin content changes during the Review.

The learner can:

- **Resume**
- **Discard and start new**

Discarding an unfinished Review:

- does not create a completed scheduled-history event;
- does not update FSRS.

Unfinished Reviews expire after **7 days**.

Temporary frozen detail should be removed after successful completion, deliberate discard, or expiry/cleanup. Completed history does not retain that detailed snapshot.

If browser-local run data is lost but an unfinished database-backed Review still exists, the application may detect it and offer Resume / Discard.

Reset/Fresh Start, Discard, expiry cleanup, and successful completion must be mutually safe under concurrency; an old active Review must never be able to commit progress after it has been invalidated by one of those operations.

## 11. Case-level Review flow

Preserve the current Case-level interaction model.

- Learner works through the whole Case.
- Answers/reveal follow the existing Case flow.
- At the end, give **one overall Case rating**:
  - Again
  - Hard
  - Good
  - Easy
- That one rating drives the FSRS transition.

Do not create separate per-question SRS schedules.

Short learner-facing rating guidance should make the FSRS meaning of the four buttons clear, particularly that Hard is still successful recall.

## 12. Completed Scheduled Study history — compact event contract

The product does **not** promise immutable reproduction of historical question/answer wording.

Every successfully completed Scheduled Review retains an individual compact event because FSRS history, learner history, debugging, and future parameter optimization need the rating sequence.

A scheduled event should establish at least:

- learner;
- Case / historical Case identifier;
- **small Case-title snapshot** for durable human-readable history;
- completion timestamp;
- Again/Hard/Good/Easy rating;
- Original vs Expanded question-pool mode;
- relevant historical System attribution needed for history and analytics;
- FSRS generation;
- scheduler/algorithm version where useful.

The Case-title snapshot is deliberately narrow. It exists so history remains understandable if a Case is later renamed or deleted.

Do **not** retain long-term duplicated copies of:

- Case vignette;
- question prompt text;
- answer text;
- image bytes;
- image captions/alt merely for completed history;
- Topic/Tag selection-route snapshots;
- other large authored-content snapshots.

Historical System attribution for a completed Scheduled Review should remain the **System used at the time of study**. Later Admin taxonomy changes must not silently rewrite where that historical activity is counted.

## 13. Free Study encounter state — accumulated learner × Case record

Free Study does **not** create one permanent event row per encounter.

Maintain one compact accumulated record per **learner × Case**, conceptually containing:

- `free_first_seen_at`;
- `free_last_seen_at`;
- `free_times_studied`;
- a compact marker such as `first_scheduled_completed_at` sufficient to preserve previously-encountered status after Reset/Fresh Start and after detailed Scheduled events expire.

A Free Study completion updates only the Free-related portion of that record.

This record is sufficient to answer whether the learner has previously encountered the Case and to support lightweight Free Study usage information without retaining an encounter-by-encounter timeline.

No SRS rating. No FSRS transition. No optimizer input.

Do not add per-encounter Topic/Tag/System provenance merely for Free Study analytics at V1. If later Admin analytics demonstrate a real need for more granular Free Study attribution, design that separately rather than pre-emptively expanding every Free Study write.

## 14. Learner × Case scheduler state

Keep one compact current row per learner × Case containing the state required by FSRS, conceptually including:

- current FSRS state;
- difficulty;
- stability;
- next due time;
- last scheduled Review time;
- repetition/lapse counters as required;
- FSRS generation/version metadata.

The exact schema should follow the selected maintained FSRS library's requirements rather than inventing unnecessary fields.

## 15. Learner preferences

Persist global learner preferences in D1 because they should follow the learner across devices.

Initially:

- Due first / New first, default **Due first**;
- Expanded Learning OFF / ON, default **OFF**.

The storage/read cost of these compact preference fields should be negligible relative to scheduled Review history.

## 16. Progress reset operations

There are three distinct operations.

### A. Reset Progress

- Invalidate/discard any active learner Review safely.
- Clear current learner × Case FSRS state.
- Every Case becomes New to scheduling again.
- Preserve historical Scheduled Review events.
- Preserve Free Study accumulated encounter state.
- Preserve personalized FSRS parameters and current generation.
- Historical scheduled data can continue contributing to future parameter optimization.
- Previously Scheduled/Free-Studied Cases remain **previously encountered** for New-queue ordering rather than becoming indistinguishable from genuinely unseen Cases.

### B. Fresh FSRS Start

- Invalidate/discard any active learner Review safely.
- Clear current learner × Case FSRS state.
- Every Case becomes New to scheduling.
- Reset FSRS parameters back to defaults.
- Preserve historical Scheduled Review events and Free Study accumulated encounter state for history/encounter semantics.
- Create a new **FSRS generation**.
- Pre-reset scheduled history must not contribute to optimization of the new generation.
- Previously encountered Cases remain distinguishable from genuinely unseen Cases for New-queue ordering.

### C. Delete Learner Account

Admin-only destructive operation.

Remove **all learner information owned by the application and authentication system**, including:

- Better Auth learner authentication account;
- learner application data;
- active Review state;
- scheduler state;
- FSRS parameters/generations;
- scheduled Review history;
- Free Study encounter state;
- learner-wide/System aggregates;
- learner preferences;
- other learner-owned application data.

Account deletion must coordinate application-data deletion with deletion of the Better Auth identity.

Browser localStorage cannot literally be remotely deleted from every device, so client state must be namespaced/validated so stale state becomes unusable once the account no longer exists.

## 17. Detailed-history retention

Default detailed Scheduled Review history retention:

**24 months**

FSRS optimization should normally use the same active history window.

Admin can override detailed-history retention for an individual learner.

Initial override choices should include:

- 36 months;
- 60 months;
- Indefinite.

Default remains 24 months.

Free Study does not have a detailed per-encounter event timeline under this design; it has the compact accumulated learner × Case record described above. Do not manufacture a separate Free Study event-retention subsystem merely to mirror Scheduled Study.

## 18. Aggregates after detailed Scheduled-event expiry

Before/while detailed Scheduled events expire, preserve compact aggregate information.

Support both:

### Learner-wide aggregates

Examples:

- total scheduled Reviews;
- unique Cases studied;
- Again count;
- Hard count;
- Good count;
- Easy count;
- Free Study activity where it can be derived/maintained cheaply;
- useful SRS/usage measures.

### Learner × System aggregates

Support both:

- usage;
- performance.

Historical Scheduled activity remains attributed to the System recorded at study time rather than being recomputed from the Case's current taxonomy.

These aggregates can survive detailed Scheduled-event cleanup.

Admin can eventually delete retained aggregates as part of full learner-account deletion.

Do not build a learner leaderboard/ranking system.

## 19. Learner Progress UI

Learners get a simpler view than Admin.

Show:

- Due Cases;
- coverage;
- memory status;
- total/recent Scheduled activity;
- Free Study activity;
- Again / Hard / Good / Easy distribution;
- System-level progress.

Do not expose raw FSRS stability/difficulty internals.

### Coverage

Show:

**Cases entered into SRS / total eligible Cases**

### Memory status

Show scheduled Cases divided meaningfully into states such as:

- Due;
- Not due.

Do not collapse coverage and memory state into one ambiguous percentage.

## 20. Admin learner analytics and history

Admin can:

- inspect individual learner history read-only;
- view learner-wide usage/performance;
- view per-System usage/performance;
- view cohort/System trends;
- configure per-learner detailed-history retention overrides;
- perform the deliberately distinct reset/fresh-start/account-deletion operations when appropriate.

No learner ranking or leaderboard is required.

Admin analytics should primarily read compact aggregates rather than repeatedly scanning the full detailed Scheduled-event history.

V1 does not need to preserve the Topic/Tag/System route of every Free Study encounter simply to answer analytics questions.

## 21. FSRS optimization rollout

V1:

- use default FSRS parameters;
- collect correct compact Scheduled Review history;
- preserve FSRS generation boundaries;
- preserve all data needed for later optimization.

Later:

- automatically optimize parameters per learner;
- optimization is invisible to the learner;
- do not optimize on every Review request;
- use only eligible Scheduled Review events from the current FSRS generation/history window;
- exclude Free Study encounter state.

A Fresh FSRS Start creates a boundary beyond which older scheduled events remain historical but are not optimizer input for the new generation.

## 22. Admin Study Preview boundary

Production Admin learner Study Preview is a content/product verification surface, **not learner activity**.

Admin Study Preview must not:

- create/update learner FSRS state;
- create learner Scheduled Review history;
- update Free Study encounter state;
- increment learner aggregates;
- change learner Due/New or Expanded Learning preferences;
- affect later FSRS optimization.

It may reuse learner-facing rendering/workflow components where safe, but the persistence/analytics boundary remains explicit.

## 23. Storage/Workers efficiency requirements

The architecture should minimize D1 growth and request cost.

Principles:

- no persistent database study-session objects merely for navigation;
- no long-term immutable copies of authored question/answer content;
- detailed frozen content exists only for active unfinished Reviews and is removed after completion/discard/expiry;
- Free Study uses one compact accumulated learner × Case record rather than one history row per encounter;
- Scheduled history uses one compact event per completed scheduled Case;
- FSRS current state is compact learner × Case state;
- localStorage handles ephemeral queue/shuffle/session state;
- server-side reads remain the authority when consuming browser-local queues;
- queries for Due/New selection must be properly indexed;
- avoid N+1 query behavior;
- Admin dashboards should consume aggregates instead of scanning raw history.

## 24. Required storage/performance benchmark

Before finalizing the persistence implementation, benchmark the proposed compact model against a realistic synthetic workload.

Include a meaningful scale such as **10,000 Scheduled Reviews** and realistic Cases/questions/assets plus representative Free Study encounter updates.

Measure at minimum:

- database bytes used;
- bytes per 1,000 Scheduled Reviews;
- accumulated Free Study learner × Case footprint;
- learner × Case FSRS-state footprint;
- active frozen-Review footprint;
- index footprint;
- rows written per Scheduled Review;
- rows written per Free Study completion/update;
- rows read to construct start-of-run Due/New queues;
- rows read/queries used to validate/open the next queued Case;
- rows read to render a Review;
- aggregate update/read cost;
- relevant query plans.

Where useful, compare:

1. the current immutable-snapshot architecture;
2. the proposed compact scheduled-event + temporary-active-snapshot + accumulated-Free-Study architecture.

Use measured results to estimate realistic learner/review capacity against then-current Cloudflare D1/Workers limits before settling long-term scaling assumptions or deciding whether database splitting is warranted.

## 25. Systems menu counts

Before starting Scheduled Study, Systems/Topics should expose useful counts such as:

- **Due**;
- **New**.

Previously encountered but currently New Cases remain included within the displayed **New** count.

Once the learner starts the run, the run uses its captured queues rather than continually adding Cases that become eligible later.

These counts may be layered onto the retained #119-derived systems-first cards/configuration UI once the scheduling queries are stable; they do not require redesigning that UX foundation.

## 26. Core conceptual boundaries

Keep these boundaries explicit throughout implementation:

**Study scope answers:**  
“What material am I choosing to study?”

**FSRS answers:**  
“When should this Case be scheduled?”

**Scheduled Study answers:**  
“What should I study now according to my schedule?”

**Free Study answers:**  
“What do I deliberately want to practise outside my schedule?”

**Scheduled history answers:**  
“What scheduled learning activity and rating occurred?”

**Free Study encounter state answers:**  
“Has this learner encountered this Case outside SRS, when, and roughly how often?”

**Aggregates answer:**  
“What longer-term usage/performance information should survive detailed Scheduled-event cleanup?”

**Local study-run state answers:**  
“Where was I in this particular run?”

**Active frozen Review answers:**  
“What exact Case content must remain stable while this unfinished Review can still be resumed?”

These concerns should not be collapsed into one persistence model.

---

## Locked product baseline / implementation boundary

The product behavior in this document is sufficiently specified for technical design. Further questioning should be driven by a concrete unresolved implementation dependency rather than reopening settled product choices.

Technical implementation direction is documented separately in `LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md`.

This document is a product/design contract, not authorization to implement immediately.