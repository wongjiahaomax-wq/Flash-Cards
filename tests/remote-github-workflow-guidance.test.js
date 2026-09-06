import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const executionWorkflow = fs.readFileSync(
  new URL('../docs/DEVELOPMENT_EXECUTION_WORKFLOW.md', import.meta.url),
  'utf8',
);
const rootAgents = fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
const taskMap = fs.readFileSync(new URL('../docs/AGENT_TASK_MAP.md', import.meta.url), 'utf8');
const localCodexGuidance = fs.readFileSync(
  new URL('../docs/LOCAL_CODEX_EXECUTION_GUIDANCE.md', import.meta.url),
  'utf8',
);

function remoteWriteSection() {
  const start = executionWorkflow.indexOf('### Remote GitHub write discipline');
  const end = executionWorkflow.indexOf('### Validation evidence in remote mode', start);
  assert.notEqual(start, -1, 'Remote GitHub write discipline section must exist');
  assert.notEqual(end, -1, 'write discipline must remain inside the Remote GitHub authority');
  return executionWorkflow.slice(start, end);
}

function localTaskMapSection() {
  const start = taskMap.indexOf('### Local checkout mode');
  const end = taskMap.indexOf('### Remote GitHub mode', start);
  assert.notEqual(start, -1, 'Local checkout routing section must exist');
  assert.notEqual(end, -1, 'Local checkout routing must remain bounded from Remote GitHub mode');
  return taskMap.slice(start, end);
}

function remoteTaskMapSection() {
  const start = taskMap.indexOf('### Remote GitHub mode');
  const end = taskMap.indexOf('### Hybrid mode', start);
  assert.notEqual(start, -1, 'Remote GitHub routing section must exist');
  assert.notEqual(end, -1, 'Remote GitHub routing must remain bounded from Hybrid mode');
  return taskMap.slice(start, end);
}

function hybridTaskMapSection() {
  const start = taskMap.indexOf('### Hybrid mode');
  const end = taskMap.indexOf('## Local agent commands', start);
  assert.notEqual(start, -1, 'Hybrid routing section must exist');
  assert.notEqual(end, -1, 'Hybrid routing must remain bounded from local command guidance');
  return taskMap.slice(start, end);
}

test('Remote GitHub write guidance prefers one coherent branch update when capabilities exist while keeping simple writes simple', () => {
  const section = remoteWriteSection();

  assert.match(section, /single-file change may use the integration's ordinary file-update capability/i);
  assert.match(section, /metadata-only PR change/i);
  assert.match(section, /logical implementation spans multiple files/i);
  assert.match(section, /required Git-data capabilities/i);
  assert.match(section, /one coherent Git commit/i);
  assert.match(section, /one branch update/i);
  assert.match(section, /one normal PR synchronize\/CI cycle/i);
  assert.match(section, /Multiple commits remain appropriate/i);
  assert.match(section, /genuinely separate logical changes/i);
});

test('Remote GitHub batched writes require exact-head fast-forward safety and reject force-updating as a normal recovery', () => {
  const section = remoteWriteSection();

  assert.match(section, /establish the exact feature-branch head/i);
  assert.match(section, /exact head as the intended parent/i);
  assert.match(section, /tree based on that exact head's tree/i);
  assert.match(section, /normal fast-forward update/i);
  assert.match(section, /never force-update the feature branch/i);
  assert.match(section, /branch moved concurrently/i);
  assert.match(section, /stale parent/i);
  assert.match(section, /preserve that existing work state/i);
});

test('Remote GitHub write guidance separates planning from mutation and retains complete final review and CI evidence', () => {
  const section = remoteWriteSection();
  const steps = [
    'inspect enough context',
    'form the coherent implementation',
    'self-review the intended changes',
    'mutate the branch coherently',
    'inspect the resulting complete diff',
    'inspect CI',
  ];

  let previous = -1;
  for (const step of steps) {
    const current = section.indexOf(step);
    assert.notEqual(current, -1, `missing Remote GitHub step: ${step}`);
    assert.equal(current > previous, true, `${step} must follow the preceding planning/write step`);
    previous = current;
  }

  assert.match(section, /atomic write is not evidence that the implementation is correct/i);
  assert.match(section, /complete intended base → current head change/i);
  assert.match(section, /verify that every intended file landed correctly/i);
  assert.match(section, /existing final-review and validation requirements/i);
});

test('Detailed Git-data write procedure has one execution authority and Remote GitHub routing points to it', () => {
  const routingSection = remoteTaskMapSection();

  assert.match(routingSection, /docs\/DEVELOPMENT_EXECUTION_WORKFLOW\.md/);
  assert.match(routingSection, /retrieval/i);
  assert.match(routingSection, /multi-file write/i);

  for (const routingDocument of [rootAgents, taskMap]) {
    assert.equal(routingDocument.includes('### Remote GitHub write discipline'), false);
    assert.equal(routingDocument.includes('create changed-file blobs'), false);
    assert.equal(routingDocument.includes("tree based on that exact head's tree"), false);
  }
});

test('Local Codex efficiency overlay is routed from Local and Hybrid Codex modes while ChatGPT GitHub-plugin Remote mode stays excluded', () => {
  const localSection = localTaskMapSection();
  const remoteSection = remoteTaskMapSection();
  const hybridSection = hybridTaskMapSection();

  assert.match(localSection, /active coding client is \*\*Codex\*\*/i);
  assert.match(localSection, /docs\/LOCAL_CODEX_EXECUTION_GUIDANCE\.md/);
  assert.match(localSection, /ChatGPT chat using the GitHub plugin\/Remote GitHub mode/i);

  assert.match(hybridSection, /active coding client is \*\*Codex\*\*/i);
  assert.match(hybridSection, /usable local execution/i);
  assert.match(hybridSection, /docs\/LOCAL_CODEX_EXECUTION_GUIDANCE\.md/);
  assert.match(hybridSection, /ChatGPT chat using the GitHub plugin without usable local execution remains on Remote GitHub mode/i);

  assert.equal(remoteSection.includes('LOCAL_CODEX_EXECUTION_GUIDANCE.md'), false);

  assert.match(localCodexGuidance, /Use this overlay only when the active coding client is \*\*Codex\*\*/i);
  assert.match(localCodexGuidance, /local-execution side of a Hybrid Codex session/i);
  assert.match(localCodexGuidance, /Do \*\*not\*\* load or apply this overlay when ChatGPT chat is working through the GitHub plugin/i);
  assert.match(localCodexGuidance, /Remote GitHub execution\/write discipline/i);
  assert.match(localCodexGuidance, /does not weaken or replace/i);
});

test('Local Codex bounded retrieval preserves completeness-sensitive search correctness', () => {
  assert.match(localCodexGuidance, /Bounded or truncated output is evidence only for what it actually contains/i);
  assert.match(localCodexGuidance, /may establish \*\*presence\*\* or inspect representative evidence/i);
  assert.match(localCodexGuidance, /must \*\*not\*\* be used to prove/i);
  assert.match(localCodexGuidance, /absence/);
  assert.match(localCodexGuidance, /uniqueness/);
  assert.match(localCodexGuidance, /exhaustive references or call sites/i);
  assert.match(localCodexGuidance, /complete coverage/i);
  assert.match(localCodexGuidance, /appropriately scoped \*\*exhaustive\*\* search/i);
  assert.match(localCodexGuidance, /Separate search completeness from presentation size/i);
});

test('Local Codex overlay narrows first-pass retrieval without changing final validation ownership', () => {
  assert.match(localCodexGuidance, /start from the directly affected symbol\/path/i);
  assert.match(localCodexGuidance, /smallest semantic unit needed/i);
  assert.match(localCodexGuidance, /Broaden only for a concrete unresolved dependency/i);
  assert.match(localCodexGuidance, /repository-owned compact reporters/i);
  assert.match(localCodexGuidance, /Bounded retrieval never means reduced final validation/i);
  assert.match(localCodexGuidance, /complete final intended-base-to-head review/i);
  assert.doesNotMatch(localCodexGuidance, /50\s*[–-]\s*150/);
});

test('Root guidance terminates discovery and reuses retained unchanged evidence', () => {
  assert.match(rootAgents, /Search -> bounded read -> decide/i);
  assert.match(rootAgents, /Discovery formally ends once the current work state/i);
  assert.match(rootAgents, /broad discovery requires a concrete unresolved question/i);
  assert.match(rootAgents, /host-injected repository authority counts as already retrieved evidence/i);
  assert.match(rootAgents, /Complete intended-base-to-head diff inspection belongs at the deliberate final review\/handoff checkpoint/i);
  assert.match(rootAgents, /make the coherent cross-file correction/i);
  assert.match(rootAgents, /common cause, correct that related set as one coherent batch/i);
});

test('Retained-context checkpoints preserve full context without requiring compaction or fresh threads', () => {
  assert.match(rootAgents, /concise operational index into the full session context/i);
  assert.match(rootAgents, /not context compaction/i);
  assert.match(rootAgents, /Do not require compaction or a fresh continuation thread/i);
  assert.match(executionWorkflow, /Full session context remains available/i);
  assert.match(executionWorkflow, /does not require context compaction or a fresh continuation thread/i);
  assert.match(executionWorkflow, /avoid rereading unchanged pre-checkpoint evidence/i);
});

test('Local Codex recovery corrects oversized retrieval and avoids undersized process polling', () => {
  assert.match(localCodexGuidance, /If a retrieval result is unexpectedly large or truncated/i);
  assert.match(localCodexGuidance, /do not repeat the same broad read as a default recovery/i);
  assert.match(localCodexGuidance, /identify the exact unresolved question/i);
  assert.match(localCodexGuidance, /narrow by symbol, file, line range, diagnostic, or smallest valid domain/i);
  assert.match(localCodexGuidance, /should not begin with repeated one-second polling/i);
  assert.match(localCodexGuidance, /use a meaningful follow-up wait/i);
  assert.match(localCodexGuidance, /Never terminate, skip, or weaken validation to save context/i);
  assert.match(localCodexGuidance, /output plus exit status remain independently attributable/i);
});
