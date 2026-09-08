# Slide Source Prep Windows Launcher UX Plan

_Status: implemented in Draft PR #168; focused Windows PDF and picker-cancellation launcher smoke passed._

_Base when planned: `main` at `286bcce9455e32c43880fe4873e1dee9dfaabd07`._

## Goal

Make the existing Windows slide-source preparer feel like a simple local utility without changing the preparation engine:

```text
Double-click prepare-slides.cmd
→ native Windows file picker
→ choose one .pptx or .pdf
→ existing slide-prep CLI runs
→ prepared output folder opens in File Explorer on success
```

Preserve the current fast path:

```text
Drag .pptx/.pdf onto prepare-slides.cmd
→ prepare immediately
→ prepared output folder opens on success
```

The normal `npm run slide-prep -- "<source>"` CLI remains unchanged and non-interactive.

## Current state

`tools/slide-source-prep/prepare-slides.cmd` is a thin Windows launcher. When no argument is supplied it asks the user to paste a source path into a console prompt; when a file is supplied by drag/drop it invokes `tools/slide-source-prep/cli.mjs` directly.

The current CLI already owns preparation behavior, output naming, validation, failure cleanup, `--force`, chunking, PowerPoint/Poppler integration, and the human-readable summary. This PR must not duplicate or redesign those responsibilities.

## Required UX behavior

### Double-click

When `prepare-slides.cmd` is launched without a source argument:

1. show a native Windows Open File dialog;
2. restrict the visible/selectable source types to `.pptx` and `.pdf`;
3. allow exactly one source file;
4. if the user cancels, exit cleanly without running preparation or showing a failure state;
5. if the user selects a file, invoke the existing slide-prep CLI with that exact path;
6. preserve the CLI's normal console output so preparation/failure details remain inspectable;
7. on successful preparation, open the exact generated `*-prepared` directory in File Explorer;
8. on failure, do not open File Explorer and preserve a visible failure result before the launcher exits.

### Drag/drop

When a `.pptx` or `.pdf` is supplied to `prepare-slides.cmd` as an argument:

- bypass the file picker;
- invoke the same existing CLI path;
- open the prepared folder only after successful preparation;
- preserve paths containing spaces and ordinary Windows-special path characters supported by the existing CLI.

### Existing-output safety

The launcher must preserve the current fail-closed behavior for an already existing prepared directory. It must never silently add `--force`, delete an existing prepared directory, or create an overwrite confirmation path that bypasses the CLI contract.

Users who intentionally need replacement can continue to use the existing CLI `--force` path.

## Recommended implementation shape

Keep the committed launcher path stable:

```text
tools/slide-source-prep/prepare-slides.cmd
```

A small Windows-only PowerShell helper under `tools/slide-source-prep/` is acceptable and preferred over embedding complex quoting/UI logic in batch syntax. Use native Windows/.NET facilities already present on the supported Windows environment; do not add an npm dependency or a GUI framework.

The helper should be only an adapter around the existing CLI. Do not move PowerPoint extraction, PDF extraction, chunking, source-map generation, output-directory cleanup, semantic policy, or other preparation logic into the launcher.

Where the launcher needs the successful output directory, prefer consuming/reusing the existing preparation contract rather than creating an independent second preparation model. If a small amount of Windows-path derivation is unavoidable, verify the directory actually exists before opening it and keep the duplication isolated to the launcher adapter.

## Preserve

- `cli.mjs` remains the executable preparation authority.
- The original source is never modified.
- No network/external service use.
- No AI/semantic inference.
- No OCR.
- PowerPoint remains PPTX rendering authority.
- Existing PowerPoint/Poppler requirements and failure behavior remain unchanged.
- Existing source-map/index/chunk semantics remain unchanged.
- Existing `npm run slide-prep` behavior remains unchanged.

## Non-goals

Do not add in this PR:

- Electron, Svelte, Tauri, WinUI, or another GUI application;
- a custom progress window or fake percentage progress;
- Windows context-menu registration;
- a `Send to` installer/shortcut;
- multi-file batch selection;
- custom output-directory selection;
- automatic `--force` overwrite;
- changes to slide extraction/rendering/source-map/chunking behavior;
- changes to the slide reviewer/finalizer or production importer.

## Executable acceptance contract

| Invariant | Required behavior | Required proof |
| --- | --- | --- |
| Double-click is discoverable | No-argument launcher opens native `.pptx`/`.pdf` file picker | Windows manual smoke through the committed launcher |
| Cancellation is clean | Cancel performs no preparation and is not reported as an error | Windows manual smoke; focused helper coverage where practical |
| Existing prep engine is reused | Selected/dragged source reaches the current CLI without a second preparation implementation | Focused launcher/helper coverage plus code review |
| Success opens output | Explorer opens only the successfully created prepared directory | Windows manual smoke with a real PPTX and/or PDF |
| Failure stays fail-closed | CLI failure/non-zero exit never opens Explorer and remains visible | Windows manual smoke or executable helper test using a controlled failing invocation |
| Existing-output protection survives | Launcher does not silently overwrite an existing `*-prepared` directory | Focused regression/manual smoke |
| Drag/drop still works | Passing a source argument bypasses picker and prepares that source | Windows manual smoke through the committed launcher |
| CLI compatibility is unchanged | `npm run slide-prep -- "<source>"` still behaves as before | Existing `slide-prep:test` plus repository-required validation |

Static/source-inspection tests may supplement these checks but must not be the only evidence for behavior that depends on the actual Windows launcher/file-picker/Explorer boundary.

## Documentation

Update `tools/slide-source-prep/README.md` so the primary Windows instructions become:

```text
Double-click prepare-slides.cmd → choose a PPTX/PDF → prepared folder opens
```

Also retain drag/drop and CLI instructions, and document that an existing output still requires explicit CLI `--force` replacement.

## Implementation and validation evidence

The bounded launcher implementation is in Draft PR #168. On Windows on 2026-09-08:

- `npm run slide-prep:test` passed all 18 focused tests.
- Poppler 25.07.0 was verified from the WinGet installation.
- A real PDF with a spaced Windows path passed through the committed `prepare-slides.cmd` with exit code 0; the exact prepared directory, index, and source map were created, and the Explorer-opening step completed.
- A real Windows double-click/file-association launch opened the native picker; clicking `Cancel` completed with final launcher exit code 0 without running preparation, showing failure, or requiring another keypress.
- Controlled failure and existing-output smoke checks remained visible and fail-closed; the existing output sentinel was preserved.

A real PowerPoint success run remains a manual check for a desktop user environment; this evidence does not claim that interaction was automated in the coding session.

## Luna / Codex implementation guidance

This is a small bounded local-tool UX task. A Luna coding agent should use the local checkout and shell, start from the directly affected launcher/README/tests, read the scoped `tools/slide-source-prep/AGENTS.md`, and broaden retrieval only if implementation evidence requires it.

Do not turn this into a slide-prep architecture audit. Do not refactor `cli.mjs` or the preparation engine merely to make the launcher look cleaner. Make the smallest robust Windows adapter that satisfies the executable acceptance contract, run focused validation during iteration, then follow current repository-owned final checks and report the actual Windows smoke evidence.
