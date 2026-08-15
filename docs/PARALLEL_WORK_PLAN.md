# Flash-Cards — Parallel Work Plan

_Last updated: 15 August 2026_

## Status

The parallel Admin-library phase documented here is **complete**.

Completed tracks:

```text
Track A → PR #11 Questions Library — merged
Track B → PR #12 Image Library — merged
```

Follow-up integration milestone:

```text
PR #13 Topics dashboard — merged
```

Relevant merge commits:

```text
PR #11 b78e7c9c0af4b4024adb3e5d373aef8631482914
PR #12 e1af88633f67b9a4bca1778684664b863fe62adb
PR #13 02853083518d0228e8aaffa9c7566822e6c8d7c5
```

There is **no active parallel implementation track at present**.

The next phase is representative pilot content entry and evidence-driven Admin friction fixes. Do not automatically spawn parallel architecture work simply because this file exists.

---

## What the completed parallel phase established

The two-agent split worked because ownership was separated by content object:

```text
Questions agent → src/routes/admin/questions/**
Images agent    → src/routes/admin/images/**
```

The only intended overlap was a minimal navigation edit in:

```text
src/routes/admin/+layout.svelte
```

PR #11 merged first. PR #12 then updated onto the new `main`, preserved the Questions link, activated Images, reran full CI, and merged cleanly. PR #13 subsequently activated Topics.

This is the preferred pattern for future parallel work: separate route trees and domain helpers, keep shared-shell edits minimal, merge one track, update the other onto current `main`, then rerun CI.

---

## Reusable rules for future parallel agents

If future work is intentionally parallelized:

1. start all branches from the same verified `main`;
2. define explicit file/domain ownership before coding;
3. keep shared-file edits minimal and isolated;
4. push progress to visible draft PRs early;
5. do not let agents merge their own PRs;
6. inspect overlap before the first merge;
7. after one PR merges, update/rebase the remaining branch onto current `main`;
8. resolve shared changes conservatively;
9. rerun full CI on the updated branch;
10. browser-test integrated behaviour where practical before the second merge.

Avoid broad simultaneous edits to:

```text
src/routes/admin/+layout.svelte
src/routes/admin/+page.svelte
src/routes/admin/+page.server.js
package.json
package-lock.json
wrangler.jsonc
src/app.css
```

If both tracks discover a genuine shared abstraction, prefer a narrow new helper/module with a clear contract rather than a broad refactor.

---

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

GitHub CI must be green before merge.

---

## Current next work

Do not start another parallel Admin-library phase yet.

Current recommended sequence:

1. enter ECG/Cardiology, ENT, Eye, and Dermatology pilot content;
2. collect concrete Admin/content-model friction;
3. implement focused fixes only where real use demonstrates a problem;
4. then proceed to learner-account administration and role-boundary acceptance;
5. then basic learner-progress administration.

See:

```text
docs/HANDOVER.md
docs/ADMIN_CONTENT_MANAGEMENT_PLAN.md
docs/IMPLEMENTATION_PLAN.md
```

for current project state and priorities.
