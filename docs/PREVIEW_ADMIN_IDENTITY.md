# Preview Admin identity

## Decision

The owner may use the same Better Auth identity for both normal production Admin and Preview Admin access.

The shared D1 auth tables store multiple Better Auth roles as a comma-separated string. The intended combined owner role is:

```text
admin,preview_admin
```

This preserves normal production Admin authorization through the `admin` role and independently grants Preview authorization through the `preview_admin` role.

The production and Preview Workers still use separate `BETTER_AUTH_SECRET` values. Therefore the identity/password can be the same while production and Preview browser sessions remain cryptographically separate.

## Existing production Admin

For an email that already belongs to a valid, non-banned production `admin`, `npm run preview-admin:bootstrap` now promotes the existing identity instead of creating a duplicate user.

The operation:

- requires the existing user to have the `admin` role;
- requires exactly one existing credential account;
- preserves the existing user ID and credential account;
- does not read, replace, re-hash, or otherwise modify the existing password;
- preserves any other existing roles;
- adds `preview_admin` once;
- refuses to create a second distinct Preview Admin;
- verifies both `admin` and `preview_admin` after the D1 update;
- is idempotent when the requested account already has both roles.

Example:

```text
before: admin
after:  admin,preview_admin
```

or, if other roles already exist:

```text
before: admin,author
after:  admin,author,preview_admin
```

## Existing non-Admin account

If the requested email already exists but does not have the production `admin` role, the bootstrap refuses the operation. It must not silently elevate a learner or other ordinary account.

## New dedicated Preview identity

If the email does not already exist and no Preview Admin exists, the bootstrap retains the original dedicated-account path. It creates a new Better Auth credential user whose role is only:

```text
preview_admin
```

That path requires a name, explicit `CREATE PREVIEW` confirmation, and a password of at least 12 characters.

## Operator procedure

Always start from current `main` before running the bootstrap:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run preview-admin:bootstrap
```

For an existing production Admin email, the script asks for the email and then requires:

```text
ADD PREVIEW
```

It does not ask for a new password because the existing credential is retained.

After success, sign in separately to:

```text
Production Admin:
https://flash-cards.mmed-fm-flashcardstest.workers.dev/sign-in

Preview Admin:
https://flash-cards-preview.mmed-fm-flashcardstest.workers.dev/sign-in
```

Use the same email/password for both Workers when the identity has `admin,preview_admin`.

## Current Study restriction

The existing safety policy deliberately denies any identity carrying `preview_admin` from learner `/study` routes on the production Worker, and the Preview Worker blocks `/study` entirely.

Therefore an owner account promoted to `admin,preview_admin` remains usable for production Admin and Preview Admin, but is not a learner Study identity. If a future product decision requires the same owner identity to study as a learner too, that should be reviewed as a separate authorization change rather than weakening this bootstrap implicitly.

## Security invariants

This identity reuse does not change the Preview content-isolation model:

- Preview Worker `/admin/**` remains blocked;
- Preview Worker `/study/**` remains blocked;
- Preview Worker `/api/auth/admin/**` remains blocked;
- Preview authoring still requires both `preview_admin` and `PREVIEW_MODE=true`;
- production Admin still requires the `admin` role;
- Preview Cases/Prompts/Assets remain explicitly session-owned and excluded from learner/normal Admin read models;
- no second D1 database or R2 bucket is introduced.
