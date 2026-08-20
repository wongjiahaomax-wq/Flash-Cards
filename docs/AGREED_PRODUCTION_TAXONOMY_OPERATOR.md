# Agreed production taxonomy operator

_Status: completed fixed-purpose production operation. Retained as an audit/recovery runbook; not a generic ongoing taxonomy mutation mechanism._

_Last updated: 20 August 2026._

This runbook records the one reviewed production taxonomy change that established:

```text
Electrolyte Disorders
├── Hypercalcemia
└── Hypocalcemia

Cardiology
└── ECG Findings
    ├── Short QTc
    └── Prolonged QTc
```

with the two agreed calcium Cases routed through the intended primary/default and Additional Study Topic relationships.

The implementation's exact stable production IDs and reserved fallback IDs remain fixed in the repository script. Do not copy those values into unrelated workflows or use this operator as a generic record-selection mechanism.

## 1. Safety boundary

Use only the existing fixed-purpose pair when auditing/recovering this exact operation:

```text
.github/workflows/apply-agreed-production-taxonomy.yml
scripts/apply-agreed-taxonomy.mjs
```

The workflow is `workflow_dispatch` only. The script accepts only its fixed dry-run/apply modes; it does not accept free-form SQL, table names or arbitrary record IDs.

Its mutation scope is repository-defined and machine-checked.

Do not broaden this operator to perform later unrelated taxonomy/content changes.

## 2. Historical operation versus current Admin authoring

This operator existed to make one reviewed production correction safely before/alongside the current richer Admin authoring workflow.

Normal ongoing Topic/Case authoring should use the application Admin surfaces where those operations are supported.

A future direct production repair that cannot safely be performed through Admin should receive its own narrowly scoped, reviewed operator with explicit pre-flight/post-flight checks. Do not turn this historical workflow into a free-form production console.

## 3. Transaction and validation model

The script sends its fixed mutation to D1 using the existing batched execution model. Do not add ad-hoc transaction wrappers around the workflow merely to replay it.

Before apply, the machine preconditions validate a **defined critical subset** of state:

- the known Cardiology Topic still identifies active Cardiology;
- both target Cases still exist and are active;
- each target Case has exactly one primary route;
- that primary route is either the original Cardiology route or the intended new primary Topic;
- reserved fallback Topic IDs are not occupied by unrelated slugs.

These checks do **not** prove that no additional secondary Topic relationships exist. The human-readable pre-flight lists the target Case relationships and must still be inspected for unexpected additional routes. An unexplained extra secondary relationship is a stop condition even if the machine preconditions pass.

After apply, machine post-flight verification checks the intended Topic hierarchy, exactly one intended primary route per target Case, the required Short/Prolonged QTc secondary route, and removal of the direct Cardiology routes. It likewise does not assert that no other secondary relationships exist, so the human-readable post-flight must also be reviewed.

A failed machine check or unexpected human pre-/post-flight result is a stop condition. Do not follow it with manual free-form SQL.

## 4. Credential separation

The operator uses a separate least-privilege D1 write credential.

The read-only production snapshot uses the dedicated D1-read credential and must remain read-only.

Do not grant write permission to the read token, and do not expose credential values in source, documentation, logs, screenshots or chat.

## 5. Recorded safe procedure

The historical safe procedure was:

1. merge the reviewed implementation only after green CI;
2. run the operator in dry-run/pre-flight mode;
3. compare the pre-flight against a fresh `Production content snapshot` and inspect **all** displayed Topic relationships for the two target Cases;
4. run apply only when both the machine-checked invariants and the human relationship review match the expected state;
5. inspect machine post-flight verification and again review the complete displayed route sets for unexpected additional relationships;
6. run the read-only snapshot again and retain the workflow runs as the audit trail.

Important release-state distinction:

```text
operator merged ≠ operator applied
operator applied ≠ Worker deployed
Worker deployed ≠ operator applied
```

This workflow mutates production content; it does not deploy application code and does not apply schema migrations.

## 6. Idempotency boundary

The operator was intentionally written to tolerate a rerun of the recorded target state while rejecting drift in the **machine-checked invariants listed above**.

It does not prove that there are no unrelated or additional secondary Topic relationships. Human inspection of the pre-flight/post-flight relationship output remains part of the safety contract.

That does not make it a general-purpose reusable migration framework.

Only rerun it when investigating/recovering this exact historical taxonomy operation and after reviewing current production state.

## 7. Recovery

If pre-flight is unexpected, do not apply.

If the fixed D1 mutation fails, retain the workflow evidence and inspect the read-only production snapshot before any further write.

If post-flight verification or the complete route read-back is unexpected, stop further mutation and prepare a separately reviewed recovery change based on the recorded prior/target state. Do not paste free-form SQL into GitHub Actions and do not broaden the write credential.

## 8. Current maintenance rule

Keep this document/workflow/script as an audit and recovery record for the agreed taxonomy change.

For new production data operations:

```text
prefer normal Admin authoring
→ otherwise use a new narrowly scoped reviewed operator
→ pre-flight read
→ fixed mutation
→ post-flight verification
→ read-only audit
```

See `PRODUCTION_CONTENT_SNAPSHOT.md` for the read-only inspection boundary and `CLOUDFLARE.md` for the separate migration/deployment release-state model.