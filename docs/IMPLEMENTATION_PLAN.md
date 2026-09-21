# Flash-Cards — V1 Implementation Plan

_Status: current repository implementation summary; detailed status lives in `CURRENT_PRODUCT_ROADMAP.md`._

_Last reconciled: 21 September 2026 (repository-state checkpoint)._

This file is intentionally concise. It no longer tries to duplicate every subsystem implementation detail or historical milestone. Use current code/migrations plus `V1_DATA_MODEL.md` and the relevant subsystem authority for exact behavior.

## Implemented repository baseline

Current `main` includes:

- SvelteKit + Cloudflare Workers application;
- Better Auth closed-enrollment authentication/role boundaries;
- D1/Drizzle content and learner-state models;
- private R2 teaching-media serving;
- Production Admin CMS for Cases, Questions, Shared Questions, Images, Systems/Topics, Tags, reviewed imports, Accounts, Feedback, learner retention, and learner analytics;
- exactly one behaviorally active Primary Topic per current Case plus zero or more Case Tags;
- contextual System → Topic / exposed Tag / All reachability and one combined multi-System Scheduled/Free Study run with deduplicated Case eligibility;
- fixed Assets and Alternative Sets with explicit Original semantics;
- Case/stimulus/Topic/Tag/exact-Asset question sources;
- reviewed/resumable Import Package v1;
- local slide-review/finalizer tooling;
- Production-backed Preview Admin retained as an optional/safety-sensitive subsystem;
- local production-like content replica;
- learner FSRS/Free runtime with active Reviews, Scheduled/Free completion, 5/10/20/All run sizes, Again/Hard/Good/Easy ratings, Reset/Fresh, self-service study-data deletion, retention, learner Progress, Admin monthly analytics/cohorts, and retry-safe mature-account deletion;
- repository migrations through `0031_learner_feedback.sql` (the ledger is in `V1_DATA_MODEL.md`);
- repository-owned validation/CI plus dependency reuse via `npm run deps:ensure`.

## Migration ledger authority

Do not maintain another partial migration list here. `V1_DATA_MODEL.md` owns the complete repository migration ledger.

Current boundary:

```text
0031_learner_feedback.sql
```

A committed migration is not proof of Production application.

## Current implementation priorities

See `CURRENT_PRODUCT_ROADMAP.md`. At this reconciliation the main priorities are:

1. controlled Production FSRS rollout/verification when separately authorized;
2. treat merged PRs #180/#181/#182 (password recovery, Production Admin account management, beta credentials) as the current repository foundation; verify any remaining account-security/self-service and operational rollout work separately;
3. real-corpus taxonomy/content curation;
4. measurement-driven performance work only for remaining evidenced issues; #192 dead-code cleanup and #193 Study navigation optimization are merged and must not be reopened as new pre-beta work;
5. keep living documentation/agent context concise and current.

## Historical milestones

Older implementation plans, PR prompts, and evidence files remain useful decision history but are not current status authorities. A file written while a PR was draft may correctly preserve that old state even after the PR later merged.

Use `DOCUMENTATION_INDEX.md` to determine current authority before acting on an old milestone statement.

## Production boundary

This document authorizes no Production migration, deployment, data mutation, feature enablement, or learner rollout. Repository state and Production state remain separate facts.
