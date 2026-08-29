# Current-Schema-Only Compatibility Cleanup Plan

_Status: runtime cleanup implemented on the Draft PR branch; final validation remains blocked on separate current-schema test-fixture cleanup._

## Goal

Reduce application and test complexity by ending permanent runtime support for historical or partially migrated D1 schemas.

The application should support one runtime database contract: the current repository schema with all migrations through the current `main` applied.

This is **not** a migration squash and **not** a database reset.

## Decision

Going forward:

> Current application code may assume that every migration already present on `main` has been applied to the database before that application version runs.

Application code should not carry permanent fallbacks for databases that are missing migrations already required by current `main`, unless a future task explicitly establishes a temporary rollout requirement.

Historical migration files remain part of the repository's database evolution contract and continue to be used to construct or upgrade databases.

## Explicit non-goals

This cleanup must not:

- squash, renumber, delete, or rewrite historical migrations;
- reset, replace, or recreate Production D1;
- alter the Production D1 migration ledger;
- delete or rewrite authored Production content;
- change R2 data or Asset lifecycle behavior;
- redesign the current schema;
- introduce a schema migration merely to perform this cleanup;
- remove current-domain compatibility states that are still part of the supported data model;
- broaden into unrelated taxonomy, Case lifecycle, Preview, Stimulus Family, auth, or UX refactors.

Future genuine schema changes continue to receive ordinary new migrations.

## Critical distinction: historical schema compatibility vs current-domain compatibility

The cleanup removes only compatibility whose purpose is to let **current application code run against an obsolete database schema**.

Examples that are candidates for removal:

- probing whether a column/table introduced by an already-required migration exists;
- catching missing-column/table errors and falling back to an older query shape;
- alternate Drizzle table definitions that model a historical migration state solely for runtime fallback;
- tests whose only acceptance criterion is that current application code still works when one or more already-required migrations have not been applied.

The cleanup must preserve legitimate **current-schema data states and domain compatibility**, including where applicable:

- valid nullable/legacy data states still represented by the current schema;
- stable historical Review provenance;
- archived/inactive relationship identity that current behavior intentionally preserves;
- Production/Preview ownership distinctions;
- current Stimulus Family Original/Alternative semantics, including supported `original_option_id = NULL` states where they remain part of the current domain contract;
- any compatibility shape that is still part of the current canonical schema rather than merely a fallback for an unapplied migration.

Do not delete code merely because a name or comment contains `legacy`, `compat`, or an old migration number. First identify the behavior it currently protects.

## Known concrete compatibility burden

### Pre-0015 Concept taxonomy fallback

Current code contains `src/lib/server/db/pre-0015-compat-schema.ts`, whose purpose is to model the `concepts` / `reviews` shape before migration `0015`.

`src/lib/server/db/concept-taxonomy-compat.ts` contains version-fallback behavior that detects a missing `concepts.kind` column and re-runs reads against the pre-0015 table shape.

Under the current-schema-only policy, a database without migration `0015` applied is not a supported runtime database for current application code. Therefore this fallback mechanism is a primary cleanup candidate.

Useful taxonomy/domain helpers should be preserved where callers benefit from them; the goal is to remove schema-version switching, not to delete useful abstractions.

### Pre-0015 Case lifecycle test

`test/case-lifecycle-pre0015.test.js` deliberately constructs a database whose migration chain stops before `0015` and asserts that current Case recovery/restore behavior still functions.

That specific compatibility requirement becomes obsolete under the new policy.

Before deleting the test, confirm whether it contains any behavioral assertion not covered by current-schema Case lifecycle tests. Transfer any unique current-domain assertion into an appropriate current-schema test rather than losing coverage.

## Implementation plan

### 1. Establish the repository policy

Update the repository's coding-agent guidance so future work has one explicit runtime-schema assumption.

At minimum, document the policy in:

- root `AGENTS.md` under database/migration safety;
- `src/lib/server/db/AGENTS.md`.

The guidance should state that current application code:

- assumes migrations already present on `main` are applied;
- should not probe for historical columns/tables;
- should not maintain alternate runtime Drizzle models for obsolete schema versions;
- should not catch missing-column errors to provide permanent historical-schema fallbacks;
- should not add tests solely to support databases missing migrations already required by `main`.

The guidance must also preserve the existing rules that:

- historical migrations are not rewritten;
- real schema changes require a new migration;
- migration/schema checks still run normally;
- Production data is never mutated merely for testing.

### 2. Audit the repository for runtime historical-schema compatibility

Search application code and tests for patterns such as:

- `pre-####` / `pre####` schema modules;
- missing-column or missing-table exception handling;
- comments containing `before migration`, `pre-migration`, or equivalent wording;
- alternate table definitions for the same physical table;
- version-dependent query selection;
- tests that intentionally stop migration application at an intermediate historical version;
- setup paths that deliberately allow the current application to start before the current migration set is applied.

Classify every finding before changing it:

1. obsolete historical-schema runtime compatibility — remove/simplify;
2. current-domain compatibility — preserve;
3. migration correctness/upgrade validation — preserve;
4. deployment sequencing safety — preserve or adjust deliberately;
5. unrelated legacy behavior — out of scope unless required for safe completion.

Do not assume all compatibility-looking code belongs in category 1.

### 3. Remove confirmed obsolete runtime fallbacks

For each confirmed historical-schema fallback:

- simplify the implementation to use the canonical current schema directly;
- remove alternate historical table definitions that no longer have a supported runtime caller;
- remove error-catching/probing branches whose only purpose is handling unapplied historical migrations;
- preserve stable public helper APIs where doing so keeps the change focused and avoids unrelated caller churn.

For the known Concept taxonomy path, the likely target is one canonical taxonomy query path against the current schema rather than a try-current/catch-missing-column/fallback-old flow.

### 4. Remove historical-schema-only tests without losing current behavior coverage

Delete or rewrite tests whose sole acceptance criterion is support for obsolete intermediate database schemas.

Preserve:

- tests that validate the migration chain itself;
- tests that validate data transformation or triggers introduced by historical migrations;
- tests proving fresh databases can reach the current schema;
- current-schema domain behavior tests;
- current deployment/migration safety checks.

If an obsolete compatibility test also contains a unique domain invariant, move that invariant into a current-schema fixture/test first.

### 5. Verify deployment/setup assumptions

Before finalizing the removal of fallbacks, inspect the actual repository-owned paths for:

- local setup/refresh;
- CI database construction;
- Preview setup where relevant;
- Production migration/deployment workflow;
- bootstrap scripts that depend on schema state.

Confirm these paths are intended to apply the required migration set before the corresponding current application version is exercised.

This task removes **permanent support for obsolete schemas**. It does not authorize unsafe deployment sequencing for future migrations.

### 6. Update documentation references affected by the cleanup

If the removed compatibility code/tests are named by current living documentation, update those references.

Do not broadly refresh unrelated historical documents merely because they mention an older migration.

## Migration and database handling

No migration file should be created for this cleanup unless the audit unexpectedly proves that the desired behavior requires an actual schema change. If that happens, stop and reassess scope rather than silently adding one.

Historical migrations remain unchanged. Future genuine schema changes append a new migration after whatever migration is current at that time; this plan intentionally does not predict or reserve the next migration number.

Production D1 remains the same database with the same data and migration ledger.

## Deployment compatibility rule for future migrations

Current-schema-only support does **not** mean future schema deployments can be sequenced carelessly.

For a new migration, the implementation must still use the repository's safe migration/deployment process and avoid an interval in which a deployed application version is known to require schema that has not yet been applied.

The policy removes indefinite application support for historical migration states; it does not remove deployment safety requirements.

## Validation

Implementation should use repository-owned validation guidance and, at minimum where applicable:

- focused tests for changed DB/domain helpers;
- `npm run db:check`;
- `npm test`;
- `npm run check`;
- `npm run build`;
- `npm run agent:checks` and the validation it identifies;
- `npm run validate:full` before final handoff when local execution is available.

For remote-only work, use GitHub CI/check evidence without claiming local execution.

No Production data mutation is part of validation.

## Review checklist

Before this PR is ready for review, confirm:

- [x] root and DB-specific agent guidance clearly define current-schema-only runtime support;
- [x] all repository findings were classified before deletion;
- [x] confirmed pre-current-schema runtime fallbacks are removed or simplified;
- [x] current-domain compatibility states remain intact;
- [x] migration correctness/upgrade tests remain intact;
- [x] obsolete partial-migration application tests are removed or converted appropriately within this PR's compatibility scope;
- [x] local/CI/Preview/Production setup paths still have a coherent migration-before-runtime contract;
- [x] no historical migration was rewritten, renumbered, squashed, or deleted;
- [x] no D1/R2 production data or migration ledger was changed;
- [x] no unrelated refactor was bundled into the cleanup;
- [ ] full current-schema validation is green after the separate ordinary test-fixture cleanup.

## Definition of done

A future coding agent should be able to reason from this contract:

> `src/lib/server/db/schema.js` plus the complete migration set on current `main` define the supported runtime schema. Historical migrations remain authoritative for evolving databases to that schema, but current application code is not required to run against an intermediate historical schema that is missing migrations already required by `main`.

The resulting application should have fewer version-conditional DB paths and fewer tests/fixtures for unsupported partially migrated states, without changing the production database, current content, current schema, or current product behavior.