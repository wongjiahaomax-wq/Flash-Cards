# Question Prompt route authorization — implementation plan

## Objective
Close the missing Production Admin authorization boundary in `src/routes/admin/questions/[promptId]/+page.server.js`. This is a focused security fix to the existing Question Prompt detail/read and `updatePrompt` form action. Implement in this same Draft PR.

## Current behavior / risk
The route's `load` and `updatePrompt` read Production Question Prompts without checking `locals.user` or an admin role. The parent Admin layout redirects non-admins on normal navigation, but a direct form-action POST must enforce its own authorization. The shared-edit confirmation and Production-owned prompt check are not permission checks. Preview already blocks `/admin` requests in `hooks.server.js`; do not change Preview in this PR.

## Implementation
1. Inspect the current route and nearby Admin authorization conventions. Reuse the existing `canManageCaseAssets(locals.user)` Production Admin predicate (or the equivalent current common guard). In `load`, deny unauthorized reads **before** opening DB or looking up the prompt, using established route-level denial behavior. In `updatePrompt`, deny unauthorized calls with an explicit 403 **before** DB access, existence checks, form parsing, or mutation.
2. Preserve authorized behavior: Production-owned prompt filtering, shared-usage confirmation, conflict handling, error responses, and the success redirect. Do not alter schemas, generic authentication hooks, Preview, question library business logic, other Admin routes, or Cloudflare settings.

## Executable acceptance
- Invoke the **actual route load and named action** with unauthenticated and ordinary learner identities: neither may read prompt details or reach a DB read/write; action returns 403.
- Invoke the named action with an authorized Production Admin against an existing prompt: the normal save and redirect still work, including the existing shared-edit guard. Preserve the existing Production-ownership check.
- Add focused route-level regression coverage (not helper-only inspection), reusing existing test fixtures. Preview-only identity must not gain Production Admin access; preserve the existing Preview Worker `/admin` block without building a new Preview suite.
- Run focused tests and repository-required validation. Report what ran, resulting head SHA, and any limitations.

## PR handoff
Keep this Draft PR open and make implementation commits on **this branch**; do not open another PR, merge, deploy, or mark Ready for Review. Avoid a general auth audit or unrelated hardening.
