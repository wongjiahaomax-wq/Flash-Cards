# Beta Test Credentials — Decision Summary

_Status: planning companion. The detailed implementation contract is `BETA_TEST_CREDENTIALS_IMPLEMENTATION_PLAN.md`._

## Decisions

- Keep Better Auth email/password as the only authentication architecture.
- Do not add the Better Auth username plugin or a username schema column.
- A beta username maps deterministically to `<username>@beta.invalid`.
- Beta accounts are ordinary Learners (`role = user`) and may not become Production Administrators.
- Production Admin chooses the initial beta password and may later replace it from the Accounts portal.
- Beta account creation/password replacement never calls Resend.
- Current passwords are never viewable after submission and are never persisted outside Better Auth's credential hash.
- Existing real-email account creation and password recovery remain unchanged for future custom-domain rollout.
- Existing PR #181 account lifecycle, deletion, Preview/Production, session, and last-Admin protections are reused rather than rebuilt.
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

## Intentionally deferred

- converting beta identities to real email identities;
- self-service beta password recovery;
- bulk beta account creation;
- forced password changes/expiry;
- username plugin/schema migration;
- any replacement for Resend.
