# Current-Schema-Only Compatibility Cleanup Plan

_Status: runtime cleanup implemented; minimum current-runtime fixture reconciliation complete; full repository CI validation is green on the PR branch._

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

At the start of this cleanup, `src/lib/server/db/pre-0015-compat-schema.ts` modeled the `concepts` / `reviews` shape before migration `0015`.

`src/lib/server/db/concept-taxonomy-compat.ts` also contained version-fallback behavior that detected a missing `concepts.kind` column and re-ran reads against the pre-0015 table shape.

Under the current-schema-only policy, a database without migration `0015` applied is not a supported runtime database for current application code. The alternate schema model and missing-column fallback were therefore removed, while useful taxonomy helper APIs were retained against the canonical current schema.

### Pre-0015 Case lifecycle test

`test/case-lifecycle-pre0015.test.js` deliberately constructed a database whose migration chain stopped before `0015` and asserted that current Case recovery/restore behavior still functioned.

That specific compatibility requirement became obsolete under the new policy. Its current-domain lifecycle assertions were checked against current-schema coverage before the historical-schema-only test was removed.

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

For the Concept taxonomy path, the result is one canonical taxonomy query path against the current schema rather than a try-current/catch-missing-column/fallback-old flow.

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

## Implementation findings

Repository validation exposed two additional runtime consumers of the deleted pre-0015 schema model that were not obvious from the initial taxonomy-helper audit:

- `src/lib/server/import/content-package.js`;
- `src/lib/server/import/resumable-content-package.js`.

Both import paths were converted to the canonical `concepts` model. Their Topic validation now explicitly rejects `kind = 'system'` where a Topic is required, deterministic Topic collision checks include the current taxonomy shape, and newly imported Topics are written with `kind = 'topic'`.

Removing the runtime fallbacks also exposed ordinary current-runtime tests whose hand-maintained migration subsets stopped before schema required by the application code they exercised. This PR made only the minimum fixture corrections necessary for the compatibility cleanup: affected runtime fixtures now include the migrations needed for the current schema, while explicit migration-boundary tests remain historical where schema evolution itself is under test.

No shared test-fixture framework or migration-runner redesign was introduced here. Broader standardization of duplicated test migration lists remains separate test-suite work.

## Migration and database handling

No migration file should be created for this cleanup unless the audit unexpectedly proves that the desired behavior requires an actual schema change. No such schema change was required.

Historical migrations remain unchanged. Future genuine schema changes append a new migration after whatever migration is current at that time; this plan intentionally does not predict or reserve the next migration number.

Production D1 remains the same database with the same data and migration ledger.

## Deployment compatibility rule for future migrations

Current-schema-only support does **not** mean future schema deployments can be sequenced carelessly.

For a new migration, the implementation must still use the repository's safe migration/deployment process and avoid an interval in which a deployed application version is known to require schema that has not yet been applied.

The policy removes indefinite application support for historical migration states; it does not remove deployment safety requirements.

## Validation

Full repository validation passed in GitHub Actions on PR head `33895af3ab49feaaf127f8102998ea26cec674b5` in workflow run `33282323084`.

Evidence from that run:

- diff whitespace check passed;
- `npm run db:check` passed;
- Node tests passed: **639 / 639**, with 0 failed;
- `npm run check` completed with **0 errors and 5 warnings**;
- `npm run build` passed;
- the local D1 + Better Auth smoke test passed;
- the smoke setup applied the complete migration chain through `0017_align_reusable_prompt_live_state_guards.sql` successfully;
- repository CI reported `Repository CI validation passed.`

The five Svelte warnings are outside this compatibility cleanup and do not fail repository validation.

For remote-only work, this GitHub Actions evidence is the validation record; no local execution is claimed.

No Production data mutation was part of validation.

## Review checklist

Before this PR is ready for review, confirm:

- [x] root and DB-specific agent guidance clearly define current-schema-only runtime support;
- [x] repository runtime-compatibility findings were classified before deletion;
- [x] confirmed pre-current-schema runtime fallbacks are removed or simplified;
- [x] current-domain compatibility states remain intact;
- [x] migration correctness/upgrade tests remain intact;
- [x] obsolete historical-schema runtime tests in this PR's direct compatibility scope are removed or converted appropriately;
- [x] local/CI/Preview/Production setup paths still have a coherent migration-before-runtime contract;
- [x] no historical migration was rewritten, renumbered, squashed, or deleted;
- [x] no D1/R2 production data or migration ledger was changed;
- [x] no unrelated refactor was bundled into the cleanup;
- [x] minimum ordinary current-runtime fixtures exposed by this cleanup are reconciled to the current schema; broader fixture standardization remains separate;
- [x] full current-schema repository validation is green.

## Definition of done

A future coding agent should be able to reason from this contract:

> `src/lib/server/db/schema.js` plus the complete migration set on current `main` define the supported runtime schema. Historical migrations remain authoritative for evolving databases to that schema, but current application code is not required to run against an intermediate historical schema that is missing migrations already required by `main`.

The resulting application has fewer version-conditional DB paths and fewer tests/fixtures for unsupported partially migrated states, without changing the production database, current content, current schema, or current product behavior.