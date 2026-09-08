# Slide source preparation agent guidance

This file supplements the repository-wide `AGENTS.md` for `tools/slide-source-prep/`.

- This tool is local/offline source preparation before ChatGPT; it is not the slide reviewer/finalizer and must not contact production or external services.
- Preserve the one-semantic-step boundary: this tool may expose deterministic source evidence but must not infer Cases, questions, answers, diagnoses, Topics, Tags, learner Assets, or other Flash-Cards semantics.
- PowerPoint itself is the PPTX visual-rendering authority in v1. Do not replace it with a custom renderer merely for portability.
- The copied original source must remain unchanged; never save back into the user's input file.
- `source-map.json` is a versioned retrieval sidecar. Missing geometry/style must remain `null` rather than being guessed.
- Markdown must derive from the same normalized source-map representation so identities and ordering cannot drift.
- Chunking is mechanical and must preserve original slide/page numbering; do not add semantic boundary detection.
- No OCR in v1. PDF extraction uses native/selectable text only.
- Keep PowerPoint/Poppler/platform adapters narrow and put deterministic logic under ordinary Node tests.
- Use `npm run slide-prep:test` for focused tests, then follow repository-owned `agent:checks` and final validation guidance for handoff.

Planning authority for PR #164 is `docs/SLIDE_SOURCE_PREPARATION_PLAN.md` plus `docs/SLIDE_SOURCE_PREPARATION_SOURCE_MAP_AMENDMENT.md`. After implementation is complete, current executable behavior and reconciled living slide-workflow documentation outrank these historical planning records.
