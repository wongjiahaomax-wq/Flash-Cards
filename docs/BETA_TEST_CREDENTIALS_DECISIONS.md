# Beta Test Credentials — Decision Summary

_Status: planning + implementation companion for Draft PR #182. PR #181 has merged; PR #182 owns implementation. The detailed current execution contract is `BETA_TEST_CREDENTIALS_IMPLEMENTATION_PLAN.md`; `BETA_TEST_CREDENTIALS_IMPLEMENTATION_AMENDMENT.md` records the review corrections now incorporated there._

## Lifecycle

- Keep PR #182 Draft.
- Do not create a separate implementation PR.
- PR #181 has merged and #182 is targeted to `main`.
- Before product implementation, rebase the existing #182 branch onto exact current `main`, then implement in #182.

## Decisions

- Keep Better Auth email/password as the only authentication architecture.
- Do not add the Better Auth username plugin or a username schema column.
- A beta username maps deterministically to `<username>@beta.invalid`.
- Beta usernames are normalized to lowercase and must be non-empty using only ASCII letters, numbers, hyphens, or underscores, with no length limit; whitespace, `@`, other punctuation, and Unicode are rejected so the synthetic email remains Better Auth-compatible.
- `@beta.invalid` is a reserved synthetic namespace owned only by the dedicated Beta Learner creation path.
- The normal Add account path must reject `@beta.invalid` for both Learner and Administrator creation, with no identity created.
- Beta accounts are ordinary Learners (`role = user`) and may not become Production Administrators.
- Production Admin chooses the initial beta password and may later replace it from the Accounts portal.
- Beta account creation/password replacement never calls Resend.
- Public password recovery must not create beta reset tokens or attempt beta reset email processing through either `/forgot-password` or direct `/api/auth/request-password-reset`; public behavior remains generic/non-enumerating.
- Existing real-email account creation and password recovery remain unchanged for future custom-domain rollout.
- Current passwords are never viewable after submission and are never persisted outside Better Auth's credential hash.
- Existing merged PR #181 account lifecycle, deletion, Preview/Production, session, and last-Admin protections are reused rather than rebuilt.
- No schema migration is expected.

## Beta login example

```text
Learner enters:
  beta01
  <password>

UI maps beta01 to:
  beta01@beta.invalid

Better Auth performs the existing email/password sign-in.
```

## Validation additions

Executable proof must include:

- blank, whitespace-containing, `@`-containing, punctuation-containing, and Unicode beta usernames rejected;
- standard Add account rejects `@beta.invalid` for both Learner and Administrator with no identity created;
- `/forgot-password` beta request remains generic and creates no reset token/email side effect;
- direct `/api/auth/request-password-reset` beta request remains generic/non-enumerating and creates no reset token/email side effect;
- normal real-email recovery still works;
- planned real Better Auth/local D1 beta create → sign in → Admin password replacement → old password fails → new password succeeds;
- direct `/api/auth/admin/set-user-password` remains blocked with credential state unchanged.

## Intentionally deferred

- converting beta identities to real email identities;
- self-service beta password recovery;
- bulk beta account creation;
- forced password changes/expiry;
- username plugin/schema migration;
- any replacement for Resend;
- new auth architecture, new rate-limit architecture, or password/session transaction machinery.
