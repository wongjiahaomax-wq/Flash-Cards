# Admin Cases — faster opening

## Goal

When the administrator opens **Cases**, show the remembered filtered list promptly, without first loading and showing the unfiltered list. Keep existing filters and navigation behavior.

The 22 September HAR showed an unfiltered Cases request (~2.47 s) followed by a second filtered request (~2.70 s). The current Admin sidebar points to bare `/admin/cases`; saved state is restored only after the page mounts. These are observations from one recording, not performance targets.

## Implementation — small, targeted changes only

1. On normal hydrated Admin sidebar navigation, use the existing saved Case Library state/URL helper to link **directly** to the remembered filter. Ensure the link uses the latest state when clicked. Keep existing fallback restoration for direct bare-URL visits; do not add cookies, SSR gates, global navigation hooks or new persistence.
2. If it has no Case Library consumers, stop selecting `vignetteMd` in the **list-only** query to reduce response size. Do not alter Case Editor or study data.
3. Open Cases from another Admin page with the saved Unassigned filter and verify the initial request/list is filtered, with no second unfiltered→filtered navigation. Check Clear and explicit URLs still work. Run focused existing tests and repository-required validation.

If one filtered load is still unacceptably slow after this fix, report its observed timing as a **separate follow-up**; do not profile every SQL statement or redesign the database in this PR.

Continue this Draft PR; no unrelated refactors, database migrations, caching, merge or deployment.
