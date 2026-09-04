# Documentation maintenance contract

_Status: living repository documentation-lifecycle guidance._

_Last reconciled: 4 September 2026._

## Goal

Keep current documentation accurate without turning every historical plan/evidence file into another living source of truth.

The repository deliberately contains both:

- **living authorities** that must describe current repository behavior/status; and
- **historical records** that preserve the intent/evidence of an earlier PR or design stage.

Confusing those two classes creates contradictory agent context and unnecessary token use.

## Living authorities

At minimum, keep these reconciled when their subject changes materially:

```text
README.md
docs/DOCUMENTATION_INDEX.md
docs/CURRENT_PRODUCT_ROADMAP.md
docs/HANDOVER.md
docs/CURRENT_DESIGN.md
docs/V1_SPEC.md
docs/V1_DATA_MODEL.md
relevant current subsystem authority
```

Not every PR needs to edit every file above. Update only the living documents whose statements become materially false or incomplete.

`DOCUMENTATION_INDEX.md` owns document role/authority classification.

## Historical records

Examples:

- PR implementation prompts;
- old `*_PLAN.md` files for completed work;
- PR-specific evidence files;
- staged checkpoint/audit records;
- files under `docs/agent-tasks/`;
- superseded proposals.

Historical records should normally preserve what was true when they were written. Do not continuously rewrite their body to look as though it was authored after later PRs.

If old status language is likely to mislead:

1. ensure `DOCUMENTATION_INDEX.md` clearly marks the file historical and records current merge/status where relevant;
2. optionally add a small explicit historical banner in that file if the ambiguity is operationally dangerous;
3. do not rewrite historical evidence/acceptance claims merely to modernize terminology.

## Merge-time reconciliation rule

A PR that changes any of the following should include a documentation-impact check:

- migration boundary/schema ownership;
- current runtime owner;
- Production/Preview ownership;
- public/private repository/application status;
- learner behavior/rating/run modes;
- Admin navigation/capabilities;
- deployment/validation workflow;
- subsystem authority chain;
- status of a plan that is routinely used as current context.

The check is:

> Which living authority would become materially inaccurate if this PR merged?

Update those files in the PR or explicitly record why no living-doc update is needed.

## Status wording

Prefer precise state labels:

```text
implemented on branch
merged on main
migration committed
migration applied to Production D1
Worker deployed
feature enabled
Production behavior verified
historical record
future/pending design
```

Do not use `implemented`, `current`, or `deployed` when the intended state is ambiguous.

Never infer Production state from merge state.

## Migration boundaries

Avoid copying a complete migration ledger into many living documents.

- `V1_DATA_MODEL.md` owns the full migration ledger.
- Other living docs should state only the current terminal boundary when necessary.
- Historical files may preserve their historical ledger.

This reduces stale `0015`-style snapshots after later migrations are added.

## Runtime ownership

When a subsystem is replaced/cut over, update the living authorities to name the new owner and explicitly demote the old owner to historical/compatibility status.

Example after learner FSRS cutover:

```text
current unfinished learner Review
→ active_reviews / active_review_questions / active_review_assets

legacy persisted reviews/review_questions/review_assets
→ migration history / zero-data cutover sentinels only
```

Do not preserve two competing `current` descriptions for compatibility.

## Public-repository wording

Keep these concepts separate:

```text
GitHub repository visibility
application access model
private Production data/media
```

The repository is public; the application may still be private/closed enrollment. Runbooks should not say “before making the repository public” unless they are explicitly historical.

## Coding-agent context discipline

Living documents should be concise and layered:

```text
DOCUMENTATION_INDEX
→ tells the agent which authority to read

CURRENT_PRODUCT_ROADMAP / HANDOVER
→ status only

V1_DATA_MODEL + subsystem authority
→ exact behavior/ownership

historical plan/evidence
→ load only when decision history is needed
```

Do not duplicate large architecture explanations across every document. Prefer links/authority references to repeated prose.

This is compatible with root `AGENTS.md` and `AGENT_TASK_MAP.md`: retrieve the minimum evidence necessary to make the next correct decision.

## Review checklist for documentation-only reconciliation PRs

Confirm:

- current `main`/PR merge facts are checked against GitHub/current code rather than inferred from old docs;
- migration boundary agrees with the committed migration tree;
- current runtime owners agree with current schema/routes/services;
- open PR features are not described as merged;
- merged repository features are not described as Production-deployed without evidence;
- historical files remain historical rather than silently rewritten as living authority;
- public-repository safety wording is accurate;
- links/path names exist;
- no credentials/private Production data were added;
- the final intended-base → head diff is reviewed in full.

## Future automation

A separate focused PR may add low-noise documentation drift checks for objective invariants such as:

- living docs referring to a terminal migration older than the actual repository boundary;
- living learner docs presenting Again/Good-only ratings after FSRS cutover;
- living docs naming legacy Review tables as the current runtime owner;
- living docs claiming the repository is private while repository visibility is public.

Such checks should be narrow and deterministic. Do not build a second general documentation DSL or make historical files fail CI for preserving historical facts.
