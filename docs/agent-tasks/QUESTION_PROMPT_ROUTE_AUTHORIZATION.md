# Question Prompt route authorization — implementation plan

## Objective
Close the missing Production Admin authorization boundary in `src/routes/admin/questions/[promptId]/+page.server.js`. This is a focused fix to the Question Prompt read and `updatePrompt` action; implement in this same Draft PR.

## Current behavior / risk
Neither route `load` nor `updatePrompt` explicitly checks `locals.user`. The parent Admin layout redirects non-admins during normal navigation, but does not authorize direct form-action POSTs. Shared-edit confirmation and Production-owned prompt filtering are not permission checks.

## Implementation
1. Reuse the existing Production Admin role predicate (`canManageCaseAssets(locals.user)` or current equivalent). In `load`, deny unauthorized access **before route-specific DB access or prompt lookup**. Preserve normal navigation behavior already provided by the parent Admin layout (unauthenticated users go to sign-in; learners go to Study); do not disclose prompt details through an unauthorized route load.
2. In the named `updatePrompt` action, reject unauthorized callers with **403 before route-specific DB access, prompt existence checks, form parsing, or mutation**. Do not rely on the parent layout or shared-edit guard to authorize a direct POST.
3. Preserve authorized behavior: Production-owned prompt filtering, shared-usage confirmation, conflict handling, error responses, and success redirect. Do not change global hooks, Preview, schemas, question library business logic, other Admin routes, or Cloudflare settings.

## Focused executable acceptance
- Exercise the **actual route load and named action**, not only a helper: unauthenticated and ordinary learner callers cannot obtain prompt details or cause a route-specific DB read/write; direct unauthorized `updatePrompt` calls return 403.
- Authorized Production Admin can load an existing Production prompt and successfully save it through the action with existing shared-edit behavior and redirect preserved; non-Production-owned prompts remain excluded.
- Reuse existing test fixtures. No separate Preview-only identity test or new Preview/browser suite: Preview is sunset and its existing `/admin` hook boundary is outside this change.
- Run focused tests and repository-required final validation; report results, head SHA, and limitations.

## PR handoff
Commit and push implementation to **this existing Draft PR**; do not open another PR, merge, deploy, or mark Ready for Review. Avoid unrelated security hardening or broad refactors.
