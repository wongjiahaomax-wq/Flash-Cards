# Beta Test Credentials — Implementation Amendment

_Status: reviewed amendment for Draft PR #182. PR #181 has merged and PR #182 owns both planning and implementation. The corrections below have now been incorporated into `BETA_TEST_CREDENTIALS_IMPLEMENTATION_PLAN.md`; retain this file as the review record if historical context is needed._

_Last reviewed: 15 September 2026._

## Lifecycle

PR #182 remains the single PR for this work. Do not create a follow-up implementation PR.

PR #181 has merged. Before product implementation:

1. inspect exact current `main`;
2. rebase the existing #182 branch onto that exact `main` result;
3. confirm #182 remains targeted to `main`;
4. keep #182 Draft;
5. implement the reviewed beta-credentials plan in #182;
6. run focused validation, repository-required final validation, and the planned real Better Auth + local D1 smoke before handoff.

Do not restart from a new PR.

---

## Amendment 1 — reserve `@beta.invalid` from public password recovery

`@beta.invalid` is a reserved synthetic identity namespace. Public password recovery must never create a reset token or attempt email delivery for a beta identity.

This applies to every currently reachable public reset-request surface, including at minimum:

```text
/forgot-password
/api/auth/request-password-reset
```

Required behavior:

- a request for an address ending exactly in `@beta.invalid` must not reach beta reset-token creation or reset-email processing;
- `/forgot-password` must preserve the existing generic/non-enumerating public result for the beta address;
- direct `POST /api/auth/request-password-reset` must likewise preserve generic/non-enumerating public behavior rather than exposing that the address is reserved or whether the identity exists;
- normal real-email password recovery must continue to use the existing Better Auth/Resend path unchanged;
- existing Preview password-recovery blocking and reset-request rate limiting from PR #180 remain intact.

Do not solve this with a new recovery architecture, a second endpoint family, or beta self-service recovery.

### Required executable proof

At the actual behavioral surfaces, prove all of the following:

```text
/forgot-password + beta address
→ generic public response
→ no Better Auth reset token created
→ no reset email/provider call attempted

/api/auth/request-password-reset + beta address
→ generic/non-enumerating public response
→ no Better Auth reset token created
→ no reset email/provider call attempted

real email through the existing recovery path
→ existing normal recovery behavior still works
```

Helper-only tests are supplemental; they do not replace route/HTTP proof for these two reachable surfaces.

---

## Amendment 2 — reserve `@beta.invalid` from standard Admin account creation

The existing standard **Add account** path must not be able to create a synthetic beta identity. The dedicated **Add beta learner** path exclusively owns the `@beta.invalid` namespace.

Required invariant:

```text
standard Add account + *@beta.invalid
→ reject before identity creation
```

This rejection is required for both standard account roles:

```text
Learner
Administrator
```

The restriction must be enforced server-side at the normal account-creation boundary. UI validation may assist but is not authoritative.

Normal real-email Learner and Administrator creation from merged PR #181 must remain unchanged.

This closes the full invariant:

```text
Beta identity → dedicated beta creation path → Learner only
```

A beta identity therefore cannot become an Administrator either by promotion or by bypassing beta creation through the standard Add-account form.

### Required executable proof

Exercise the actual standard account-creation action/boundary twice:

```text
name + learner@beta.invalid + Learner
→ rejected
→ no Better Auth user/identity created

name + admin@beta.invalid + Administrator
→ rejected
→ no Better Auth user/identity created
```

Also retain proof that ordinary real-email Learner and Administrator creation still works as before.

---

## Amendment 3 — enforce the stated beta username length

The beta username rule is exactly:

```text
3–24 characters
lowercase ASCII letters a-z
numbers 0-9
hyphens allowed internally
must start and end with a letter or number
```

The previous recommended expression:

```text
^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])?$
```

is not acceptable because its optional group permits a one-character username.

Use validation semantics that actually require 3–24 characters. A suitable expression is:

```text
^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$
```

The server remains authoritative.

### Required executable proof

Focused helper/server tests must explicitly prove:

```text
1-character username → rejected
2-character username → rejected
3-character valid username → accepted
24-character valid username → accepted
25-character username → rejected
```

Retain the existing invalid-character/start/end-hyphen coverage proportionately; do not expand this into a generalized username subsystem.

---

## Implementation boundaries retained

All prior reviewed scope boundaries remain in force unless explicitly amended above:

- Better Auth email/password remains the only auth architecture;
- no Better Auth username plugin;
- no username schema column or other schema migration;
- no new rate-limit architecture;
- no session/password transaction machinery;
- no new email provider or beta email delivery;
- no beta self-service password recovery;
- no unrelated account-security work;
- preserve merged PR #181 Production Admin, Preview/Production, deletion, session, and last-Admin boundaries;
- preserve normal real-email account creation, sign-in, and password recovery behavior.

The implementation should use the narrowest existing boundaries that satisfy these invariants.

---

## Updated implementation acceptance

In addition to the current implementation plan, implementation is not complete until:

- [ ] both `/forgot-password` and direct `/api/auth/request-password-reset` suppress beta reset-token/email processing while remaining generic/non-enumerating;
- [ ] real-email password recovery still follows the existing path;
- [ ] standard Add account rejects `@beta.invalid` for both Learner and Administrator, with no identity created;
- [ ] dedicated beta creation remains Learner-only;
- [ ] beta promotion to Administrator remains blocked;
- [ ] beta username validation actually enforces 3–24 characters, including explicit 1- and 2-character rejection tests;
- [ ] focused tests pass;
- [ ] repository-required final validation passes;
- [ ] the planned real Better Auth + local D1 smoke passes, including beta create → sign in → Admin password replacement → old password fails → new password succeeds and direct `/api/auth/admin/set-user-password` rejection with credential state unchanged.

No Production D1 mutation, deployment, secret change, or real Resend send belongs in PR #182 validation.
