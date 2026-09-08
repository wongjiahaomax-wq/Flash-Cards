# Portable AI Extraction Contract v1

This contract is the complete instruction set for reconstructing one prepared slide source into a reviewable bundle. Follow it using only the files supplied with the prepared source.

## Deliverable

Produce one `<batch>-review.zip` with exactly this review-bundle shape:

```text
<batch>-review.zip
├── manifest.json
├── media/
├── review-map.json
└── source-previews/
```

This is a proposed review bundle, not a production import archive. Do not produce or claim a production import archive at this stage. The proposed `manifest.json` must already contain the content a human reviewer will inspect; `review-map.json` contains provenance and review metadata.

## Prepared evidence

- A rendered PDF is the visual authority for a slide source. For a PDF source, the supplied PDF is the visual authority.
- The numbered Markdown index is a retrieval aid containing visible text and speaker notes.
- The source-map JSON is deterministic structural and retrieval evidence. It is not semantic output and does not identify Cases, questions, answers, diagnoses, Topics, or boundaries.
- Slide/page numbering is aligned across the supplied evidence and must be preserved in every source reference.
- Hidden slides remain represented. Treat them as source evidence while respecting their hidden status and context.
- PDF Markdown and source maps contain native/selectable text only. A blank entry may be an image-only or scanned page; inspect the visual page before deciding that evidence is absent.
- Mechanical chunks are retrieval units, not Case or question boundaries. Inspect adjacent ranges when content continues across a chunk boundary.

## Source fidelity

Reconstruct what the supplied teaching material supports. Do not add medical knowledge that is not present in the source. Do not silently correct, modernize, complete, or reconcile source content. Preserve contradictions, suspected errors, and uncertainty for human review.

Speaker notes are source evidence, but they are not automatically learner-facing text. When text or structure conflicts with the visual source, preserve the conflict and flag it for review rather than silently choosing a preferred version.

## Case reconstruction

Do not assume one slide or page is one Case. Use the complete evidence, including order, repeated stems or images, repeated questions, answer additions, headings, notes, formatting, tables, and visual continuity. A Case may span several slides/pages or cross a mechanical chunk boundary.

If a Case boundary is uncertain, make only the source-supported reconstruction and record the uncertainty in review metadata. Do not hide the ambiguity.

## Manifest profile

`manifest.json` must validate against `manifest-slide-profile-v1.schema.json`. The profile is a narrow slide-ingestion subset:

- `version` is `1`; `packageId` and every package-local ID are stable non-empty identifiers.
- `topics` contains exactly one active `create` Topic for the temporary holding Topic of this logical batch. It has no parent Topic.
- Normal slide-derived content uses `create` records only. Do not emit `use` or `skip` records.
- Created Cases have a non-empty title, source-supported vignette or `null`, the holding Topic as `primaryTopicId`, `secondaryTopicIds: []`, and `questionSelectionMode: "all"`.
- Created slide-derived images are JPEG or PNG `create` Assets whose actual bytes exist under the declared `media/` path. Link them through `create` CaseAssets and preserve source display order with `displayOrder`.
- Keep learner-facing QuestionPrompt wording in `questionPrompts[].promptMd` and the source-supported answer in the linked `caseQuestions[].answerMd`. Never place an answer in a prompt to work around a missing Case Question.
- `topicQuestions` is exactly `[]`.
- Use only the fields allowed by the supplied schema. Do not add taxonomy, Tags, Shared Questions, stimulus groups, Image Collections, deduplication decisions, confidence, warnings, or source references to `manifest.json`.

The manifest is production-shaped content for review, but it is not final merely because it passes the profile schema. Human review remains required.

## Unresolved questions

Never invent an answer. If a source question is identifiable but its answer cannot be reliably established from the supplied evidence, leave it out of `caseQuestions` and do not create a placeholder answer. Record it in `review-map.json` as an unresolved candidate with its source references, a blocking warning, and a non-approved review status.

## Media and previews

- Every declared learner image must be an actual JPEG or PNG file under `media/`, with bytes matching its declared MIME type.
- Preserve source display order. Use the embedded original, a faithful crop, or a rendered composite according to the source intent.
- Learner alt text must describe what the learner should see without revealing the answer. Do not use answer-side arrows, labels, diagnoses, or annotations as learner media.
- Treat uncertain answer leakage as a blocking review warning.
- Calculate SHA-256 over the actual learner-media bytes and record the digest in the corresponding review metadata.
- Provide one corresponding `source-previews/` file for every source slide/page and use those paths in source coverage.

## Review map

`review-map.json` must validate against the supplied `review-map-v1.schema.json`. Use the exact v1 values:

- AI-generated Cases, Assets, and Questions use only `pending` or `needs_review`; never use `approved` for AI output.
- Confidence is one of `high`, `medium`, or `low`.
- Warning severity is one of `blocking`, `warning`, or `info`.
- Manifest-backed Cases, Assets, and Questions have source references. Unresolved candidates and their warnings also have source references where evidence exists.
- `sourceFiles` declares each source and its positive page count.
- `sourceCoverage` accounts for every source slide/page exactly once. Use `caseIds: []` for non-Case material such as boilerplate, and do not silently omit it.
- `unresolvedQuestions` records identifiable missing-answer candidates outside the manifest.
- Batch warnings record source-wide contradictions, coverage gaps, or other issues that the human must see.

Keep review metadata separate from manifest content. Do not mark a record approved to conceal an unresolved or blocking issue.

## Final validation and response

Before creating the ZIP:

1. Validate `manifest.json` against `manifest-slide-profile-v1.schema.json`.
2. Validate `review-map.json` against `review-map-v1.schema.json`.
3. Check unique IDs, valid manifest references, valid source references, and the relationship between Cases, Assets, CaseAssets, QuestionPrompts, and CaseQuestions.
4. Check that every declared media file exists, has the declared JPEG/PNG MIME type, and has the recorded SHA-256 digest.
5. Check exact source coverage, preview paths, original numbering, no invented answers, and no answer leakage into learner media or prompts.
6. Create `<batch>-review.zip` with `manifest.json`, `media/`, `review-map.json`, and `source-previews/`.

Return the ZIP and a concise summary of reconstructed Cases, Questions, Assets, and blocking or notable review warnings. If a capability or supplied file is missing, report the limitation and preserve the affected evidence as unresolved rather than guessing.
