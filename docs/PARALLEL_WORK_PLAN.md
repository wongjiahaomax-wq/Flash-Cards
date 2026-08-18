# Flash-Cards — Parallel Work Plan

_Status: **historical implementation record**. The parallel Admin-library phase documented here is complete and does not define current product priorities._

_Last updated: 18 August 2026_

## Completed phase

This record describes the completed parallel work that produced:

```text
Track A → PR #11 Questions Library — merged
Track B → PR #12 Image Library — merged
Follow-up → PR #13 Topics dashboard — merged
```

Relevant historical merge commits:

```text
PR #11 b78e7c9c0af4b4024adb3e5d373aef8631482914
PR #12 e1af88633f67b9a4bca1778684664b863fe62adb
PR #13 02853083518d0228e8aaffa9c7566822e6c8d7c5
```

There is no active PR #11/#12/#13 parallel implementation track.

For current priorities use `CURRENT_PRODUCT_ROADMAP.md` and `HANDOVER.md`.

## What this historical phase established

The split worked because ownership was separated by content object:

```text
Questions agent → src/routes/admin/questions/**
Images agent    → src/routes/admin/images/**
```

Shared-shell overlap was intentionally small, principally navigation integration.

The successful pattern was:

1. start both tracks from the same verified `main`;
2. give each agent a clear route/domain boundary;
3. expose progress in draft PRs;
4. merge one track first;
5. update/rebase the remaining track onto current `main`;
6. resolve the small shared edits conservatively;
7. rerun full CI before the next merge.

This remains useful guidance for future intentional parallel work.

## Reusable rules for future parallel agents

If future work is explicitly parallelized:

1. start all branches from the same verified `main`;
2. define file/domain ownership before coding;
3. minimize edits to shared shell/config files;
4. open draft PRs early so overlap is visible;
5. do not let implementation agents merge their own work without review;
6. inspect overlap before the first merge;
7. after one PR merges, update the remaining branch onto current `main`;
8. resolve shared changes conservatively;
9. rerun the complete validation set;
10. browser-test integrated behavior where practical.

High-conflict shared files should be treated carefully, including:

```text
src/routes/admin/+layout.svelte
package.json
package-lock.json
wrangler.jsonc
src/app.css
```

If several tracks discover the same missing abstraction, prefer a narrow explicit helper/contract rather than simultaneous broad refactors.

## Current product state has moved far beyond this phase

Since PR #13, the project has added major capabilities including:

- multi-Topic Case routing/Admin authoring;
- reviewed/resumable imports;
- Tagging Stage A;
- production-backed Preview Admin;
- PR #29 image-authoring workflow;
- Image Management V2 and Image Collections;
- wide responsive Admin workspace;
- Tagging Stage B Shared Questions;
- a production-verified 66/66 initial ECG source migration.

Do not interpret the old “pilot content next” language from this phase as the current project plan.

## Current next sequence

Current priorities are:

```text
curate real ECG Case Tags
→ promote genuinely reusable knowledge into Shared Questions
→ add useful Study Topics/stimulus alternatives
→ observe real Admin/learner friction
→ implement learner-account administration
→ implement basic learner-progress administration
```

Parallel work should be introduced only when two current tasks have genuinely separable ownership and low-risk integration boundaries.

## Validation standard

Future implementation tracks should run:

```sh
npm run db:check
npm test
npm run check
npm run build
node scripts/local-auth-smoke.mjs
git diff --check
```

GitHub CI should be green before merge.
