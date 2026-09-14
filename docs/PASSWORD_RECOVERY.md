# Password recovery and transactional email

_Status: implemented in Draft PR #180; production email configuration, deployment, and live verification remain separate operator work._

_Last reviewed: 14 September 2026._

This is the living implementation note for PR A. It describes repository behavior; it does not claim that Resend is configured, that a sending domain is verified, or that the Worker has been deployed.

## Scope

The implemented learner flow is:

```text
/sign-in
→ /forgot-password
→ generic confirmation
→ Better Auth reset email
→ /reset-password#token=...
→ password reset
→ existing sessions revoked
```

PR A does not add public registration, `/admin/accounts`, account creation, role management, disable/restore controls, or production deployment/configuration.

## Better Auth ownership

The application remains on pinned Better Auth `1.6.25`. Better Auth owns reset-token generation, persistence, expiry, validation, single-use consumption, password hashing/update, and reset-session revocation.

The application configures:

```text
disableSignUp: true
resetPasswordTokenExpiresIn: 3600 seconds
revokeSessionsOnPasswordReset: true
```

No application-owned reset-token table or custom token scheme was added.

## Public behavior and email delivery

The `/forgot-password` action and Better Auth reset-request endpoint return account-neutral behavior. Syntactically valid requests use wording equivalent to:

> If an account exists for that email address, we’ve sent password reset instructions.

The application checks a small request-boundary guard before handling either reset-request entrypoint. The guard allows five requests per 60 seconds per derived client IP, shares the bucket across the application and direct Better Auth request paths, and returns an account-neutral `429` response. This is intentionally a narrow per-isolate guard, not a distributed Cloudflare-wide limiter; its residual limitation is documented rather than hidden. Better Auth's generic limiter is not treated as protection for direct server-side `auth.api` calls.

With a Cloudflare request execution context, Better Auth's background-task hook attaches email delivery to `ExecutionContext.waitUntil()`. Provider latency and later provider failure therefore do not change the already-produced public response. Failures are logged only as a generic message and optional provider status; recipient addresses, reset URLs/tokens, message bodies, passwords, and credentials are not logged.

The discovered public reset-request surfaces for the pinned configuration are:

| Surface | Behavior |
| --- | --- |
| `/forgot-password` | Application form action; guarded before the action calls `auth.api`. |
| `/api/auth/request-password-reset` | Direct Better Auth HTTP endpoint; guarded before Better Auth handles it. |
| Other configured reset-request aliases | None in the current core Better Auth configuration; no phone/email OTP plugins are installed. |

Reset consumption is available only through the normal reset UI/Better Auth reset endpoint. Preview blocks the recovery subtree before token creation or consumption.

## Reset URL and fragment hygiene

The Better Auth callback supplies the token and remains the token authority. The email layer uses its trusted origin to construct:

```text
<application-origin>/reset-password#token=<Better-Auth-token>
```

The fragment is not sent in the initial HTTP request URL. The reset page reads `window.location.hash`, retains the token only in browser state, and immediately calls `history.replaceState` to remove the fragment from the visible URL. The token is submitted only through the supported Better Auth reset API; it is not placed in server-rendered page data or request URLs.

Invalid, expired, missing, and already-used tokens fail closed without exposing internal validation details.

## Server-only email boundary

The small provider-neutral boundary is under `src/lib/server/email/`:

```text
transactional.ts  → message/sender contract and delivery error
password-reset.ts → reset URL and password-reset content
resend.ts         → Resend HTTP transport
auth.js           → Better Auth callback and request-lifetime scheduling
```

Required server-side configuration:

```text
RESEND_API_KEY
AUTH_EMAIL_FROM
```

Configuration is validated only when delivery is requested. Missing values therefore do not prevent Better Auth construction, session lookup, or existing email/password sign-in. Tests and local smoke coverage run without real provider credentials; automated tests mock transport/provider behavior.

Never put `RESEND_API_KEY` in committed configuration or browser-visible environment variables. `AUTH_EMAIL_FROM` must be a sender identity verified with Resend before live delivery is expected to work.

## Preview behavior

The Preview Worker shares production D1/auth state, so password recovery is intentionally unavailable there. The existing pre-auth path guard rejects, for every role including unauthenticated requests:

```text
/forgot-password
/reset-password
/api/auth/request-password-reset
/api/auth/reset-password
/api/auth/reset-password/:token
```

This prevents Preview from creating or consuming production reset state or changing production credentials. The same runtime proof confirms that Preview sign-in, sign-out, and get-session remain available.

## Validation completed for PR A

The focused implementation proof includes:

- Better Auth + local D1 reset/session integration;
- pending-provider non-blocking response and later failure handling;
- missing-email-configuration auth construction/session/sign-in runtime coverage;
- direct and application reset-request guard coverage;
- local Worker/D1 smoke coverage for reset behavior and the Preview boundary;
- focused Playwright fragment capture/removal and request-URL hygiene coverage.

These are repository/runtime proofs only. They do not constitute production deployment or live Resend verification.

## Production rollout still required

Before enabling live recovery, an operator must configure and verify the Resend sender/domain, set `RESEND_API_KEY` securely, set `AUTH_EMAIL_FROM`, confirm `BETTER_AUTH_URL`, deploy through the normal release path, and perform real known-account/unknown-account reset and session-revocation checks.

Merging this Draft PR does not perform any of those operations. PR B remains the next step for the production Admin Accounts lifecycle UI and actions.
