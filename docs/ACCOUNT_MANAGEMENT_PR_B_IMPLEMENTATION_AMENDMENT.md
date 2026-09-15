# Account Management PR B — Security Contract Amendment

_Status: normative implementation amendment for Draft PR #181. The required implementation is present; final handoff and rollout verification remain pending._

_Last reviewed: 14 September 2026._

This amendment is part of the PR-B implementation contract together with `ACCOUNT_MANAGEMENT_PR_B_IMPLEMENTATION_PROMPT.md`.

Where this amendment tightens or conflicts with the base prompt, **this amendment controls**.

It addresses two security gaps found during planning review. Do not broaden the implementation beyond these requirements.

---

# 1. Close direct Better Auth Admin HTTP bypasses

## Problem

PR B intends account mutations to flow through protected `/admin/accounts` server actions so the application can enforce:

- Production-Admin-only authority;
- self-disable/self-demote protection;
- last-active-production-Admin protection;
- protected `preview_admin` role handling;
- no direct Admin-known password workflow;
- staged Learner deletion rather than direct identity removal;
- typed-email confirmation before the first permanent deletion request;
- deletion-in-progress mutation fencing.

Current `src/hooks.server.js` blocks `/api/auth/admin/*` only on the remote Preview Worker. On Production, Better Auth's Admin plugin is still mounted below that public HTTP subtree.

A caller with a valid Production Admin session could therefore attempt direct Better Auth Admin HTTP mutations and bypass PR-B application policy.

This is not acceptable.

## Required boundary

Use the narrow existing request boundary.

PR B must make the Better Auth Admin HTTP subtree unavailable as an alternate Production mutation surface.

Preferred rule:

```text
external HTTP request to /api/auth/admin or /api/auth/admin/*
→ fail closed before Better Auth handles it
```

Apply this on **Production as well as Preview** unless implementation proves that one specific direct endpoint is genuinely required by existing product behavior.

The current repository has the Better Auth `adminClient()` plugin configured in `src/lib/auth-client.js`, but planning review found no current `authClient.admin.*` product usage. Do not preserve an unused public Admin mutation surface merely because the client plugin exists.

### Important distinction

Blocking public HTTP routing must **not** block trusted server-side calls such as:

```text
const auth = createAuth(env);
await auth.api.createUser(...)
await auth.api.setRole(...)
await auth.api.banUser(...)
await auth.api.unbanUser(...)
await auth.api.revokeUserSessions(...)
await auth.api.removeUser(...)
```

Direct `auth.api.*` server calls do not traverse the public `/api/auth/admin/*` hook path. PR-B account actions should continue to use those server APIs after enforcing the application's own Production Admin and target-specific policy.

Do not replace Better Auth mutations with raw SQL merely to avoid the HTTP block.

## If an HTTP Admin endpoint is unexpectedly required

Do not silently leave the whole subtree reachable.

If current-head implementation evidence proves that a particular Better Auth Admin HTTP endpoint is genuinely required:

1. document the exact endpoint and caller;
2. keep every unused Admin mutation endpoint blocked;
3. enforce the same PR-B self/last-Admin, Preview-role, deletion-state, confirmation and credential rules before the required endpoint can mutate state;
4. add endpoint-specific runtime proof.

Do not build a generic proxy/policy framework. The default remains: **no externally reachable Better Auth Admin mutation control plane**.

## Required implementation placement

Prefer a small path predicate/guard at the existing `src/hooks.server.js` boundary, adjacent to the current Preview `/api/auth/admin` protection, before `svelteKitHandler(...)` can dispatch the request to Better Auth.

Avoid scattering equivalent endpoint blocks across Accounts pages.

The application-level `/admin/accounts` mutations still require their own server-side authorization and target guards; the hook closes the alternate HTTP control plane and does not replace route authorization.

## Focused executable proof

Add focused runtime coverage proving all of the following:

1. On Production, direct HTTP requests under `/api/auth/admin/*` cannot perform account mutations.
2. The request is rejected **before** Better Auth mutates the target.
3. Exercise representative high-risk mutations from the pinned Admin plugin, including at minimum:
   - account creation;
   - role mutation;
   - permanent remove-user/identity deletion.
4. Where practical, include Disable/ban or session-revocation as another representative mutation; do not add exhaustive test duplication if the whole subtree is structurally blocked by one predicate.
5. Verify the target/user table remains unchanged after the rejected HTTP attempts.
6. Ordinary auth paths required by the application, including sign-in, sign-out and get-session, remain available.
7. Preview retains its current fail-closed Admin boundary.
8. Trusted PR-B server-side `auth.api.*` calls still work through the protected Accounts actions under their normal policy tests.

The proof should exercise the real request/hook/Better Auth boundary available in the repository's existing local Worker/auth smoke infrastructure where practical, not only regex/source assertions.

A small source-contract assertion that the entire `/api/auth/admin` subtree is blocked before `svelteKitHandler` may complement runtime coverage, but is not a substitute for runtime proof.

---

# 2. `Continue deletion` must never auto-start deletion

## Problem

The existing deletion primitive intentionally makes:

```text
advanceLearnerAccountDeletion(...)
```

retry-friendly by calling `beginLearnerAccountDeletion(...)` when no `learner_account_deletions` row exists.

That behavior is correct for the existing primitive, but it means an Accounts route must **not** treat `advanceLearnerAccountDeletion()` itself as proof that a deletion was previously confirmed.

Otherwise a direct POST to the future `Continue deletion` action could start deletion without the required typed-email confirmation.

## Required start/continue split

PR B must preserve two distinct server-side operations.

### Start permanent deletion

The first destructive request must:

1. require Production Admin / non-Preview authority;
2. re-read current target eligibility;
3. require exact target-email confirmation according to the base contract;
4. only after successful confirmation call `beginLearnerAccountDeletion(...)`;
5. then perform the allowed bounded advance steps.

### Continue permanent deletion

`Continue deletion` must:

1. require Production Admin / non-Preview authority;
2. re-read the target/deletion state;
3. require an **already-existing durable `learner_account_deletions` marker** for that user;
4. only then call the existing bounded continuation/orchestration that may invoke `advanceLearnerAccountDeletion(...)`.

If the marker does not already exist, Continue must fail closed.

Required no-marker behavior:

```text
no learner_account_deletions row
+ direct Continue deletion POST
→ reject
→ do not call beginLearnerAccountDeletion
→ do not call advanceLearnerAccountDeletion
→ do not ban/disable the user
→ do not create learner_account_deletions
→ do not create/reset learner_study_data_deletions
→ do not delete auth or learner rows
```

Use a controlled 400/409-style action failure consistent with current route conventions; the exact status is less important than the fail-closed state behavior.

## Smallest implementation shape

Do **not** change `advanceLearnerAccountDeletion()` merely to satisfy the Accounts route. Its existing auto-start semantics are relied on by current deletion code/tests and are part of its retry behavior.

Prefer one of these small solutions:

- route/shared orchestration checks `getLearnerAccountDeletionStatus(...).inProgress` before Continue; or
- a tiny purpose-specific `continue...` wrapper requires the durable marker before delegating to the existing advance primitive.

Do not add a second deletion state machine, nonce, confirmation table, queue, background worker, or transaction architecture.

The typed email is required only to **start** deletion. Once the durable marker exists, repeated Continue requests may proceed without retyping the email because the marker is the authoritative evidence that destructive deletion was already started through the confirmed path.

## Shared learner-analytics orchestration

If PR B extracts the existing bounded orchestration from Learner Analytics, do not create one helper that ambiguously both starts and continues based only on `advanceLearnerAccountDeletion()` auto-start behavior.

Expose or preserve an explicit semantic distinction such as:

```text
start confirmed deletion
continue existing deletion
```

Both may share the same bounded advance loop after their different preconditions are satisfied.

Do not broaden the Learner Analytics refactor beyond what is needed to prevent divergent deletion behavior.

## Focused route-level proof

Add route/action-level executable coverage for both cases.

### Case A — direct Continue with no marker

Seed a normal active Learner with auth/learner data but **no** `learner_account_deletions` marker.

Submit the `Continue deletion` action directly, bypassing the UI.

Prove:

- action fails;
- `learner_account_deletions` still has no row for the target;
- target `user.banned`/Disabled state is unchanged;
- no study-deletion marker is newly created/reset;
- target sessions/accounts and representative learner data remain present;
- identity remains present and sign-in/access state is not changed by that rejected Continue request.

### Case B — confirmed Start then Continue

Seed a normal Learner.

1. submit the first Delete action with the correct typed target email;
2. prove a durable `learner_account_deletions` marker now exists and access is revoked;
3. if the bounded first request does not finish deletion, submit `Continue deletion`;
4. prove Continue advances the **existing** durable deletion phase/batch state rather than creating a new start;
5. repeat only as needed to prove eventual ready-for-identity-delete/final removal through the existing contract.

Keep this focused. Existing staged-deletion tests already own the detailed phase/state-machine behavior; PR B only needs to prove the Accounts route cannot bypass confirmation and can resume a legitimately started deletion.

---

# Acceptance additions

PR B is not implementation-complete unless all of these are true in addition to the base prompt:

- the public Better Auth Admin HTTP subtree cannot bypass PR-B account policy on Production;
- server-side `auth.api.*` remains usable by protected Accounts actions;
- ordinary sign-in/sign-out/get-session remain unaffected;
- direct HTTP Admin account creation cannot bypass the no-direct-password workflow;
- direct HTTP role/lifecycle mutations cannot bypass self/last-Admin or Preview-role protections;
- direct HTTP remove-user cannot bypass staged Learner deletion and typed confirmation;
- `Continue deletion` without a pre-existing learner-account deletion marker is non-destructive and fails closed;
- a confirmed deletion start creates the durable marker before Continue is accepted;
- Continue resumes only that existing deletion operation.

No additional auth architecture, deletion architecture, durable queue, distributed lock, or background system is requested by this amendment. The narrow integrity migrations required by the reviewed race fix (`0029_account_admin_safety.sql` and `0030_learner_account_deletion_integrity.sql`) are in scope; no other schema migration is requested.
