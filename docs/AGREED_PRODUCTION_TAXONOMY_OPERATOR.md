# Agreed production taxonomy operator

This is the runbook for the one approved production content change:

```text
Electrolyte Disorders
├── Hypercalcemia
└── Hypocalcemia

Cardiology
└── ECG Findings
    ├── Short QTc
    └── Prolonged QTc
```

The two target Cases are resolved by stable production IDs:

```text
Hypercalcemia Case: b1f4870e-52fe-4d26-bbea-851ec64357a7
Hypocalcemia Case: b11b6a14-c55e-4d70-849c-ce1c8953a38f
Cardiology Topic: 65862404-8493-408c-8de7-ccf385209924
```

After the update:

```text
Hypercalcemia Case: primary Hypercalcemia, secondary Short QTc
Hypocalcemia Case: primary Hypocalcemia, secondary Prolonged QTc
```

No direct Case→Cardiology relationship remains for these two Cases. Cardiology itself remains active, and the Cases remain reachable through the Cardiology subtree via ECG Findings and its descendants.

## Safety boundary

Use only:

```text
.github/workflows/apply-agreed-production-taxonomy.yml
scripts/apply-agreed-taxonomy.mjs
```

The workflow is `workflow_dispatch` only. The script accepts only `--dry-run` and `--apply`; it does not accept SQL, table names, or arbitrary IDs. Its SQL is fixed in the repository, uses Topic slugs to reuse existing rows, and scopes Case changes to the two stable IDs above. The mutation is wrapped in one D1 transaction and is idempotent.

The workflow requires:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_D1_WRITE_TOKEN
```

`CLOUDFLARE_D1_WRITE_TOKEN` must be a separate least-privilege Cloudflare token with D1 write/edit permission for the account owning `flash-cards-db`. Keep `CLOUDFLARE_D1_READ_TOKEN` read-only and use it only with the snapshot workflow. Neither token value is printed.

## Procedure

1. Merge the implementation PR only after review and green CI. Do not deploy or mutate production automatically from the merge.
2. From **Actions → Apply agreed production taxonomy**, run with `apply = false`.
3. Compare the pre-flight output with the latest [Production content snapshot](PRODUCTION_CONTENT_SNAPSHOT.md). Stop if the two target Cases, Cardiology ID, or existing route state is unexpected.
4. Run the workflow again with `apply = true`.
5. Inspect the post-flight output. Confirm all six Topics are active, the parent tree is exact, each target Case has one primary and one secondary route, and the direct Cardiology-route result is empty.
6. Run **Production content snapshot** again and retain the pre-flight, operator, and post-flight run links as the audit trail.

Running the apply workflow again is safe and should produce the same target state without duplicate Topics or relationships. It preserves unrelated Case↔Topic links and does not touch questions, assets, Reviews, users, authentication, or learner progress.

## Recovery

If pre-flight is unexpected, do not apply. If the operator fails before commit, D1 rolls back the transaction. If post-flight verification is unexpected, stop further mutation, retain the logs, and prepare a reviewed follow-up operator change that restores the recorded prior Topic parents and the two recorded direct Cardiology relationships. Do not paste free-form SQL into Actions or broaden the write token. Re-run the read-only snapshot after recovery to confirm the final state.
