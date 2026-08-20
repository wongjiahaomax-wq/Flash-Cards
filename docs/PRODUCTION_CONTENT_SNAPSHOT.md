# Production content snapshot

_Status: current read-only production content inspection workflow._

_Last updated: 20 August 2026._

This repository includes a manually triggered GitHub Actions workflow for inspecting a deliberately limited snapshot of learning content from the production Cloudflare D1 database.

Workflow:

```text
.github/workflows/production-content-snapshot.yml
```

The purpose is to make production taxonomy/content review possible without exposing Cloudflare credentials and without exporting authentication or learner-progress data.

## 1. What this workflow proves — and what it does not

A completed snapshot is evidence about the production **rows queried by that workflow at that time**.

It can support statements such as:

```text
these Topics/Cases/relationships currently exist in production D1
```

It is not authoritative evidence for:

```text
which Git commit is deployed to the production Worker
whether a particular migration file was applied
whether a deployment workflow succeeded
whether unqueried tables/features are present or active
```

Keep production data state, migration state and Worker deployment state as separate facts.

For code/migration/deployment status use the release workflow/run evidence described in `CLOUDFLARE.md`.

## 2. Safety model

The workflow is intentionally constrained:

- it runs only through `workflow_dispatch`;
- all SQL is hard-coded in the repository;
- all database operations are `SELECT` queries;
- there is no free-form SQL workflow input;
- it queries only the explicitly approved learning-content tables;
- it does not query Better Auth tables, users, sessions, learner Reviews, or learner progress;
- Cloudflare credentials remain GitHub repository secrets and are never printed deliberately.

Because the repository is private, snapshot output is visible only to people with access to its Actions logs. Treat the output as private teaching-content metadata nevertheless.

## 3. Credentials

The workflow prefers the dedicated repository secret:

```text
CLOUDFLARE_D1_READ_TOKEN
```

Use a least-privilege Cloudflare token with D1 read permission for the relevant account.

A deployment-token fallback may exist for compatibility, but the dedicated read-only token is preferred because it narrows blast radius and keeps production inspection independent from deployment-token scope.

Never commit a token, API key, password, Better Auth secret, account credential or other secret to repository source or workflow YAML.

Keep read and write credentials separate. Do not grant write permission merely to make the snapshot work.

## 4. Default snapshot scope

The default run queries:

```text
concepts
cases
case_concepts
```

It emits:

- Topic identity/name/slug/description/parent/active state;
- Case identity/internal title, bounded vignette preview and active state;
- Case↔Topic relationships;
- relationship role (`primary` or `secondary`);
- Topic active state for each route.

This is sufficient for most Topic taxonomy, relabelling, hierarchy and multi-Topic routing reviews.

## 5. Optional reusable Topic questions

The manual workflow has an `include_topic_questions` input, disabled by default.

When enabled it additionally reads:

```text
concept_questions
question_prompts
```

and emits reusable Topic prompts, a bounded answer preview, inheritance state and active state.

Use this only when question context is useful for understanding Topic meaning.

The current snapshot workflow is not a general query surface for newer tables such as Reusable Image Questions. Add any future scope only through a reviewed, purpose-specific change with the privacy/safety boundary updated at the same time.

## 6. Explicitly excluded data

Do not expand the snapshot casually to include:

- Better Auth tables;
- user identities/email addresses;
- sessions/authentication tokens;
- learner Reviews;
- learner ratings/progress;
- administrator credentials;
- unrestricted database dumps;
- arbitrary free-form SQL input.

If a future task genuinely requires sensitive/learner data, design a separate purpose-specific export with the minimum required fields and document its privacy boundary before implementation.

## 7. Running the snapshot

1. Open **GitHub → Actions**.
2. Select **Production content snapshot**.
3. Choose **Run workflow**.
4. Leave `include_topic_questions` off for normal taxonomy review, or enable it when Topic-question context is needed.
5. Open the completed run and `snapshot` job.
6. Inspect the grouped output.

Record the workflow run when using the output as evidence for a production-content decision.

## 8. Fixed-purpose production taxonomy operator

The snapshot workflow is read-only and must remain read-only.

The historical agreed taxonomy change has a separate fixed-purpose operator:

```text
.github/workflows/apply-agreed-production-taxonomy.yml
scripts/apply-agreed-taxonomy.mjs
```

That operator is deliberately not a generic production mutation API. It has fixed targets, fixed SQL/logic, pre-flight checks, post-flight verification and a separate least-privilege D1 write credential.

See `AGREED_PRODUCTION_TAXONOMY_OPERATOR.md` for the audit/recovery contract.

For future unrelated production data changes, do not reuse or broaden that workflow. Create a separately reviewed, narrowly scoped operator when direct production mutation is genuinely necessary.

## 9. Snapshot → operator audit pattern

For any approved fixed-purpose production content mutation, the preferred operational pattern remains:

```text
read-only snapshot / pre-flight
→ reviewed fixed-purpose mutation
→ machine post-flight verification
→ read-only snapshot again
```

Retain the relevant workflow runs as the audit trail.

Do not treat a successful mutation operator as Worker deployment evidence; data mutation and code deployment are separate operations.

## 10. Troubleshooting authorization

If Cloudflare reports that the account/token is not authorized, assume the query did not run successfully until proven otherwise.

Check:

1. the configured account context is the one that owns the intended D1 database;
2. the selected token has the required read permission for that account.

Prefer correcting/creating the dedicated read-only credential rather than broadening a deployment or write credential.

## 11. Intended assistant workflow

A GitHub-capable assistant may inspect the completed snapshot workflow output without receiving the underlying Cloudflare secret.

Use the snapshot as source of truth for the production learning-content rows it actually queried, rather than inferring those rows from seed fixtures or repository examples.

Do not infer unqueried feature/deployment/migration state from snapshot output.

## 12. Maintenance rule

Any future change to queried tables/fields, credential selection, logging, or the safety/privacy boundary must update this document in the same reviewed change.