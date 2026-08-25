# Password recovery and transactional email

_Status: implemented in repository by Account Management PR A; production email configuration, deployment, and live verification remain separate operator work._

_Last reviewed: 25 August 2026._

This document records the current repository contract for self-service password recovery and the transactional-email foundation used by authentication workflows.

It does **not** mean that Resend has been configured in production, that a sending domain has been verified, that the Worker has been deployed with these changes, or that production password recovery has been live-tested. Keep those release facts separate.

## Scope

PR A provides:

```text
/sign-in
→ Forgot password?
→ /forgot-password
→ generic anti-enumeration result
→ Better Auth reset token
→ transactional reset email
→ /reset-password?token=...
→ Better Auth password reset
→ existing sessions revoked
```

It also provides a small server-side transactional-email boundary that later account-management work can reuse for a **Set your password** invitation.

PR A does not add public registration, `/admin/accounts`, account creation, role management, disable/restore controls, invitation creation, or production deployment/configuration.

## Better Auth ownership

The application remains on pinned Better Auth `1.6.25`.

Better Auth owns:

- reset-token generation and persistence;
- token validation and expiry;
- single-use token consumption;
- password-policy enforcement;
- password hashing/update;
- session revocation after a successful reset.

Current configuration in `src/lib/server/auth.js` preserves:

```text
disableSignUp: true
```

and configures:

```text
resetPasswordTokenExpiresIn = 3600 seconds
revokeSessionsOnPasswordReset = true
```

No application-owned reset-token table or custom cryptographic token scheme is introduced.

## Learner-facing privacy behavior

The forgot-password page always presents the same learner-facing result after a syntactically valid request attempt:

> If an account exists for that email address, we’ve sent password reset instructions.

The browser does not expose whether Better Auth found a user or whether external email delivery succeeded.

Better Auth `1.6.25` itself also returns the same successful reset-request response for known and unknown email addresses. Its unknown-user path performs dummy token/database work to reduce timing differences.

External email delivery is scheduled as background work rather than being awaited by the learner-facing request when a Cloudflare Worker execution context is available. `src/lib/server/auth.js` delegates the task through Better Auth's `advanced.backgroundTasks` handler to Cloudflare `ExecutionContext.waitUntil()`.

Operational email failures are logged only as generic failures or a provider HTTP status. Do not add recipient addresses, complete reset URLs, reset tokens, message bodies, provider response bodies, passwords, or API keys to these logs.

## Reset URL construction

Better Auth remains the reset-token authority. Its `sendResetPassword` callback supplies the generated token and Better Auth reset URL.

The application email layer reuses the trusted origin from that Better Auth URL and constructs the learner route:

```text
<application-origin>/reset-password?token=<Better-Auth-token>
```

Therefore `BETTER_AUTH_URL` must continue to identify the correct application origin for each runtime environment.

The reset page reads the token in the browser, keeps it in memory, and removes the query string from the visible address with `history.replaceState` after initial parsing. Server page data does not include the token.

Invalid, expired, missing, and already-consumed tokens fail closed and direct the learner back to request a new reset email.

## Transactional email boundary

Provider-neutral authentication/email composition lives under:

```text
src/lib/server/email/
```

Current responsibilities are intentionally small:

```text
password-reset.ts
→ reset URL + password-reset template
→ sendTransactionalEmail(...)

resend.ts
→ Resend HTTP transport
```

Authentication and route code should not scatter direct Resend API calls through the application.

PR B may reuse `sendTransactionalEmail(...)` for the future **Set your Flash-Cards password** invitation without changing Better Auth's reset semantics. PR A does not implement that invitation yet.

## Required runtime configuration

The email transport expects these server-side Cloudflare environment values:

```text
RESEND_API_KEY
AUTH_EMAIL_FROM
```

`RESEND_API_KEY` is a credential and must be stored as a Cloudflare secret or equivalent server-only binding. Never commit it or place it in browser-visible configuration.

`AUTH_EMAIL_FROM` is the configured sender identity, for example a verified application-domain mailbox/display name. Do not commit a production sender merely to make local development work. The production sender/domain must first be configured and verified with Resend by the operator.

The repository does not contain a production Resend key, does not configure a production sending domain, and does not claim that either value currently exists in Cloudflare.

## Local development and testing

Ordinary automated tests do **not** send real Resend email.

Focused tests inject a mocked `fetch` transport, and the local Better Auth/D1 smoke test exercises reset-token/password/session behavior without supplying real Resend credentials.

For deliberate local end-to-end email testing, a developer may provide local-only values through the repository's existing local Cloudflare secret/config mechanism such as `.dev.vars`. Never commit `.dev.vars` or real provider credentials.

When `ExecutionContext.waitUntil()` is unavailable in the local Vite/Node request environment, authentication email work is started without awaiting provider latency. This local fallback is best-effort and is not a guarantee that a process terminated immediately after the request will finish email delivery. Production Cloudflare Worker requests use `waitUntil()`.

## Rate limiting and residual limitation

Pinned Better Auth `1.6.25` includes a built-in password-reset rule for `/request-password-reset` of:

```text
3 requests per 60 seconds
```

using its derived client-IP/path rate-limit key.

The current application has a D1-backed Better Auth database but does not have the Better Auth `rateLimit` database model/table or a configured secondary/custom rate-limit store. Better Auth therefore uses its in-memory rate-limit storage by default.

That gives useful narrow per-isolate protection but is **not a durable distributed Cloudflare-wide rate limit**. Different Worker isolates may not share the same counters. PR A deliberately does not add a rate-limit table, Durable Object, KV design, or other infrastructure solely to solve that residual limitation.

Treat durable distributed reset/sign-in abuse protection as a later security-hardening item if production usage or threat modelling justifies it.

## Security invariants

Current password-recovery work must preserve all of these:

1. Public signup remains disabled.
2. No learner self-registration is introduced.
3. Reset requests do not reveal whether an account exists.
4. Better Auth owns reset-token generation, persistence, validation, and consumption.
5. Reset links expire after approximately one hour.
6. Reset tokens are single-use.
7. Passwords, reset tokens, complete reset URLs, and provider credentials are never logged.
8. Resend credentials remain server-only.
9. Successful password reset revokes existing sessions.
10. Invalid/expired reset links fail closed.
11. Production/Preview authority boundaries are unchanged.
12. Preview Admin authority is not expanded.
13. No production data/configuration/deployment operation is implied by repository implementation.

## Production rollout still required

After this code is reviewed and merged, production enablement remains an explicit operator task. At minimum:

1. configure and verify the intended Resend sending domain/from identity;
2. set the production Worker `RESEND_API_KEY` securely;
3. configure the intended production `AUTH_EMAIL_FROM` runtime value;
4. confirm `BETTER_AUTH_URL` still matches the production application origin;
5. deploy the reviewed repository commit through the normal production release path;
6. manually verify known-account reset delivery, unknown-account generic behavior, token expiry/failure behavior, password change, and prior-session revocation.

A merged PR is not evidence that any of the above rollout steps happened.

## Next stage — Account Management PR B

PR B may build the production Admin Accounts workflow on top of this foundation:

```text
production Admin creates account
→ server creates Better Auth user
→ same transactional-email transport
→ Set your Flash-Cards password link
→ recipient chooses password
```

PR B remains responsible for the production Admin account-management UI and lifecycle/security rules. Do not add those responsibilities to the password-recovery modules merely because they share the email transport.
