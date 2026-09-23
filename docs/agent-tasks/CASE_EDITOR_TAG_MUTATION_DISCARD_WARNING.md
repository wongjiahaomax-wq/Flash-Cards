# Case Editor Tag mutation triggers a false leave/discard confirmation

## Status
Implementation is pushed to the existing Draft PR. Keep it Draft; do not create another PR, merge, or deploy.

## Observed behavior and root cause
The user confirmed the **Case Editor's own** `Unsaved Case-editor work ... Leave and lose these changes?` confirmation (not the browser unload prompt) when selecting an existing Tag and when creating and attaching a new Tag.

- `CaseTopicsSection.svelte` uses native POST forms to `/admin/cases/[caseId]/case-tags` for `add`, `create-and-add` and `remove`. That endpoint mutates the Tag association and redirects (303) to the Case Editor.
- `+page.svelte` registers editable structural forms in the dirty coordinator. The selected Tag or typed new Tag is legitimately dirty **until its own submission completes**; `beforeNavigate` prompts for *any* dirty item when the native submission/redirect navigates. `suppressNextBeforeUnload` addresses a different browser guard and does not exempt the Case Editor's `beforeNavigate`.
- `registerCaseEditorStableForms` intentionally excludes non-`?/` endpoint forms (their HTML redirect is not a SvelteKit enhanced action result). The native redirect can also replace unrelated unsaved drafts. Do not "fix" this by globally suppressing the navigation guard.

Verify this call sequence on the actual current PR head before editing; report any changed behavior rather than assuming a stale line reference.

## Product requirement
Adding an existing Tag and creating+adding a Tag should finish inline **without a leave/discard confirmation**. Removing a Tag should use the same safe behavior. A successful mutation immediately updates the displayed Tags and available add options; failed mutations show an error without falsely updating the UI or losing the user's entered value. Other Case Editor drafts (including partially entered structural forms) remain intact. Genuine attempts to navigate away with unsaved work must still prompt.

## Minimal implementation direction
1. Keep the existing dedicated `case-tags` endpoint and its native POST/redirect contract for callers that need it. It already accepts `response=json` and returns structured information for add/remove. For create-and-add, return the created authoritative Tag information through that same JSON path (the authoring service already returns the created Tag); leave the native response unchanged.
2. Submit the Case Editor's Tag forms with a small, scoped inline handler using this JSON path; prevent native navigation for handled submissions. Reconcile only the affected Case Tag display/options from a successful authoritative response. Preserve the existing local editor state and avoid a broad `invalidateAll()`/page reload that would wipe other drafts. Use the simplest Svelte state approach consistent with the current component; do not build a general mutation framework.
3. Keep pending/error handling proportional: prevent duplicate submissions of the same Tag operation, report server errors, clear the submitted input only after success and avoid a stale UI after a failed request. Do not bypass `beforeNavigate`, disable dirty tracking globally, or silently drop unsubmitted work.

## Focused acceptance
- In the real Case Editor, selecting an existing Tag and clicking **Add Tag** produces no Case Editor leave confirmation; the new chip is visible, and the option is no longer offered for addition. Creating+adding a new Tag likewise shows the created chip with no confirmation. Removing a chip updates the UI without a confirmation.
- Start with an unrelated unsaved ordinary draft (e.g. vignette), perform a Tag mutation, and verify the draft is still visible, dirty and savable by Save All. Also verify a partially entered unrelated creation form is not discarded. Do not confuse the submitted Tag field with *unrelated* unsaved work.
- A genuine All Cases/back navigation while such unsaved work exists continues to display the Case Editor leave warning; Cancel preserves the draft.
- A failed Tag operation retains the entered Tag/name, shows an error and does not claim success. A subsequent reload reflects server-persisted Tag membership.
- Focused endpoint coverage checks the create-and-add JSON response and preserves native redirect behavior. One small browser/manual interaction pass is sufficient for the actual confirmation behavior; avoid broad Playwright expansion.

## Scope and handoff
No learner eligibility, Preview Worker, auth, FSRS, schema/migrations, or unrelated Case Editor refactor. This PR covers the Tag confirmation defect only; the unassigned-Case preview and Markdown numbering defects are separate requests. Follow the repository's current progressive retrieval and validation guidance. Report what ran and the exact PR head and CI state. Leave this PR Draft, unmerged and undeployed.
