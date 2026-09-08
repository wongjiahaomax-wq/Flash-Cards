# Slide Source Prep Portable AI Handoff Plan

_Status: implementation-ready amendment for Draft PR #168. Implement in this same PR._

## Goal

Make every prepared slide source self-contained enough that it can be handed to any sufficiently capable AI agent — ChatGPT, another hosted model, or a local model — with **no Flash-Cards repository, GitHub, prior-chat, or network access**, and that agent can produce the existing Flash-Cards Reviewable Import Bundle ZIP.

Target operator flow:

```text
Run Slide Prep
→ prepared folder contains source evidence + portable AI contract
→ give prepared files to any capable AI
→ paste one short provider-neutral handoff prompt
→ AI returns <batch>-review.zip
→ open ZIP in the existing human reviewer
```

The extraction agent is assumed to have zero repository access. Any instruction that requires reading `main`, GitHub, repository documentation, source code, or repository-owned schemas at extraction time is invalid for this workflow.

## Capability assumption

The portable workflow may assume the extraction AI can:

- inspect PDFs/images visually;
- read Markdown and JSON;
- create/edit text and JSON files;
- create/crop/export JPEG/PNG learner media where required;
- calculate SHA-256 or use an equivalent local tool;
- create a ZIP archive.

If an AI lacks those capabilities, it may report that limitation, but the contract must not require Flash-Cards-specific repository access to compensate.

## Prepared output contract

After preparation, the root `*-prepared/` directory must include the existing evidence plus provider-neutral extraction artifacts:

```text
Teaching Deck-prepared/
├── Teaching Deck.pptx                 # PPTX source only
├── Teaching Deck-rendered.pdf         # PPTX source only; visual authority
# or Teaching Deck.pdf                 # PDF source; visual authority
├── Teaching Deck-index.md
├── Teaching Deck-source-map.json
├── AI_EXTRACTION_HANDOFF_PROMPT.md
├── AI_EXTRACTION_CONTRACT.md
├── manifest-slide-profile-v1.schema.json
├── review-map-v1.schema.json
└── chunks/                             # only when mechanically chunked
```

The contract/schema files are copied as immutable task inputs for that prepared run. They are not generated semantically from the source deck.

Do not duplicate them into every mechanical chunk. When a user supplies only one or more chunk triplets to an AI, the root portable contract/schema files must accompany those chunks.

## Provider-neutral handoff prompt

Replace the current repository-dependent `CHATGPT_EXTRACTION_HANDOFF_PROMPT.md` concept with a short provider-neutral prompt.

Canonical content should be approximately this size and responsibility:

```text
Process the attached prepared slide source according to AI_EXTRACTION_CONTRACT.md.

Produce the completed Flash-Cards Reviewable Import Bundle ZIP defined by that contract. Use the supplied schemas when validating JSON output.

Do not use outside medical knowledge to correct or complete the source. Preserve missing, contradictory, or uncertain evidence according to the contract.

Return the final ZIP plus a concise summary of reconstructed Cases and blocking/notable review warnings.
```

The handoff prompt must not mention:

- GitHub;
- the Flash-Cards repository;
- `main`;
- repository paths;
- implementation source files;
- external documentation that is not included in the prepared folder;
- Cloudflare/D1/R2;
- a requirement to browse the web.

The short handoff prompt is only an entry point. It must not duplicate the detailed extraction contract.

## Portable extraction contract

Create a canonical provider-neutral `AI_EXTRACTION_CONTRACT.md` under the slide-source-prep tool and copy it unchanged into each prepared output.

It is the complete runtime authority for a repository-blind extraction agent. It must be self-contained and versioned.

It must directly specify, without repository references:

1. **Purpose and final deliverable**
   - reconstruct source teaching material into one `<batch>-review.zip`;
   - exact review-bundle directory shape: `manifest.json`, `media/`, `review-map.json`, `source-previews/`;
   - do not produce or claim a production import ZIP at this stage.

2. **Prepared evidence semantics**
   - rendered/source PDF is visual authority;
   - Markdown index is numbered visible-text + speaker-note retrieval aid;
   - source-map JSON is deterministic structural/retrieval evidence, not semantic output;
   - source numbering is aligned and must be preserved;
   - hidden slides remain represented;
   - PDF index/source map contain native/selectable text only and may be empty for scanned/image-only content;
   - mechanical chunks are not semantic/Case boundaries.

3. **Source-fidelity rules**
   - reconstruct the source faithfully;
   - do not add outside medical knowledge;
   - do not silently correct, modernize, complete, or reconcile source content;
   - preserve contradictions and uncertainty for human review;
   - speaker notes are source evidence but are not automatically learner-facing.

4. **Case reconstruction rules**
   - do not assume one page/slide = one Case;
   - use slide order, repeated stems/images/questions, answer additions, headings, notes, formatting, tables, and visual continuity;
   - uncertain boundaries must be flagged rather than hidden.

5. **Portable manifest profile**
   - exact supported slide-ingestion subset of Import Package v1;
   - exactly one temporary holding Topic per logical batch;
   - `create` records for normal slide-derived content;
   - stable package-local IDs;
   - created Cases use `questionSelectionMode: "all"` and `secondaryTopicIds: []`;
   - fixed Case Assets for initial slide-derived images;
   - QuestionPrompt wording separated from CaseQuestion answer;
   - `topicQuestions: []` for this workflow;
   - no automatic Tags, Shared Questions, stimulus groups, Image Collections, taxonomy enrichment, or production deduplication.

6. **Unresolved-question rules**
   - never invent an answer;
   - a missing-answer source question stays outside manifest CaseQuestions;
   - preserve it in `review-map.json` as an unresolved candidate with blocking warning and source refs.

7. **Media rules**
   - actual JPEG/PNG learner media must exist in `media/`;
   - preserve source display order;
   - use embedded original/crop/rendered composite according to source intent;
   - learner alt text must not leak the answer;
   - avoid answer-side arrows/labels/diagnostic annotations as learner media;
   - uncertain answer leakage is blocking;
   - compute SHA-256 over actual learner media bytes.

8. **Source preview and coverage rules**
   - every source slide/page must be accounted for exactly once in source coverage;
   - every source page must have a corresponding review preview path;
   - preserve original slide/page numbering;
   - boilerplate may be classified as non-Case material rather than silently omitted.

9. **Review-map rules**
   - exact version/status/confidence/warning semantics needed by the existing reviewer;
   - AI-generated status is only `pending` or `needs_review`, never `approved`;
   - manifest-backed Case/Asset/Question records must be traceable to source refs;
   - unresolved questions and batch warnings follow the supplied schema.

10. **Validation and final response**
    - validate `manifest.json` against the supplied slide-profile schema;
    - validate `review-map.json` against the supplied review-map schema;
    - check referential integrity, unique IDs, media existence/MIME, SHA-256, source coverage, no invented answers, and no answer leakage;
    - create the final `<batch>-review.zip`;
    - return the ZIP plus a concise counts/warnings summary.

The portable contract should be detailed enough to execute the extraction task, but it must avoid implementation history, repository navigation, coding-agent guidance, deployment details, and duplicated prose that the supplied schemas already express precisely.

## Portable manifest schema

Add a machine-readable `manifest-slide-profile-v1.schema.json` for the **narrow slide-ingestion profile**, not for every historical/possible Import Package operation.

This schema should encode exactly the subset the portable extraction contract allows and should reject fields/operations outside that profile. Keeping it narrow reduces the chance that a repository-blind model invents unsupported structures.

At minimum it must cover:

- top-level `version`, `packageId`, `topics`, `cases`, `assets`, `caseAssets`, `questionPrompts`, `caseQuestions`, `topicQuestions`;
- exact allowed fields for the `create` Topic/Case/Asset/CaseAsset/QuestionPrompt/CaseQuestion records used here;
- `topicQuestions` fixed to an empty array;
- non-empty strings where required;
- `questionSelectionMode` fixed to `all` for created Cases;
- `secondaryTopicIds` fixed to an empty array;
- allowed JPEG/PNG MIME types for created Assets;
- no unknown object keys.

This schema is a portable **subset contract**. It does not replace the production validator.

## Review-map schema

Use the existing executable `review-map-v1.schema.json` as the source and copy it byte-for-byte into prepared output. Do not maintain an independently rewritten second review-map schema.

## Drift prevention

The portable contract creates a new compatibility boundary, so add executable proof against repository authorities during development/CI even though runtime extraction requires no repository.

Required proof:

1. a canonical valid slide-profile fixture passes `manifest-slide-profile-v1.schema.json` **and** the actual production Import Package validator;
2. representative out-of-profile structures are rejected by the portable schema;
3. the copied `review-map-v1.schema.json` in a prepared fixture is byte-identical to the canonical reviewer schema;
4. prepared output includes the exact canonical handoff prompt, extraction contract, manifest schema, and review-map schema;
5. the portable prompt/contract contain no runtime dependency on GitHub/repository/main/source-code retrieval;
6. existing slide-prep source evidence output and chunk semantics remain unchanged aside from the added portable files.

Static string assertions are appropriate for proving forbidden repository-runtime references are absent, but schema/validator compatibility must be executable.

## Existing `CHATGPT_EXTRACTION_HANDOFF_PROMPT.md`

The current file is too long and repository-dependent for the desired operator workflow.

Replace or retire it in favor of provider-neutral names. Avoid leaving two competing operator prompts.

Preferred naming:

```text
tools/slide-source-prep/AI_EXTRACTION_HANDOFF_PROMPT.md
tools/slide-source-prep/AI_EXTRACTION_CONTRACT.md
tools/slide-source-prep/manifest-slide-profile-v1.schema.json
```

If compatibility warrants retaining the old filename temporarily, it should be a tiny pointer to the provider-neutral prompt rather than a second full contract. Do not copy the legacy repository-dependent prompt into prepared output.

## CLI/launcher integration

The deterministic source-prep engine remains the preparation authority.

After successful preparation of source evidence, copy the four portable extraction artifacts into the newly created prepared root:

```text
AI_EXTRACTION_HANDOFF_PROMPT.md
AI_EXTRACTION_CONTRACT.md
manifest-slide-profile-v1.schema.json
review-map-v1.schema.json
```

They must also be present when using the ordinary non-interactive `npm run slide-prep` path, not only the Windows launcher.

If copying one of these required artifacts fails, preparation must fail and clean up the partial newly-created output under the existing failure semantics. A prepared directory missing its extraction contract must never masquerade as successful.

`--force` behavior remains unchanged.

## Scope boundaries

This amendment is intentionally in PR #168, but it must not turn the PR into a semantic extraction implementation.

Do not add:

- an LLM/API call to slide-prep;
- provider-specific integrations;
- an autonomous local model runner;
- OCR;
- semantic Case/Q&A inference in deterministic prep code;
- automatic invocation of ChatGPT/Claude/Gemini/etc.;
- changes to the reviewer/finalizer UX;
- changes to production import behavior;
- cloud/network dependencies.

Slide Prep still only prepares deterministic evidence plus the static portable extraction contract.

## Acceptance workflow

The implementation is complete when this can be demonstrated:

```text
1. Run Slide Prep on a real PPTX/PDF.
2. Prepared folder contains source evidence + the four portable extraction files.
3. Give only those prepared files to an extraction AI that has no repository access.
4. Paste the short AI_EXTRACTION_HANDOFF_PROMPT.md.
5. The AI can determine the exact required output shape without asking for repository files.
6. It returns a <batch>-review.zip containing manifest.json, media/, review-map.json, source-previews/.
7. The ZIP opens in the existing local reviewer without schema/structure errors.
```

A real end-to-end AI smoke may be performed manually because model/file-tool capabilities vary. Repository tests must still prove the deterministic packaging and schema compatibility boundaries.

## Luna / Codex implementation guidance

Continue the existing Draft PR #168; do not create another PR.

This amendment supersedes the earlier assumption that the extraction agent can inspect the Flash-Cards repository. The extraction agent must be treated as repository-blind.

For Luna, keep retrieval bounded: start from the current slide-source-prep implementation, current long ChatGPT handoff prompt, reviewed-import contract/schema, and production manifest validator only as needed to build the portable snapshot. Do not audit unrelated application architecture.

Implement in two bounded tranches:

1. **Portable contract/schema tranche** — provider-neutral short handoff, self-contained extraction contract, narrow manifest schema, compatibility tests.
2. **Prep packaging tranche** — copy those artifacts plus the canonical review-map schema into every successful prepared root, update README/tests, and preserve all existing launcher/prep behavior.

Use focused tests during iteration, then current repository-required final validation. Keep PR #168 Draft and report any contract ambiguity discovered rather than inventing a new content model.
