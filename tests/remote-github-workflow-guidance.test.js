import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const executionWorkflow = fs.readFileSync(
  new URL('../docs/DEVELOPMENT_EXECUTION_WORKFLOW.md', import.meta.url),
  'utf8',
);
const rootAgents = fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
const taskMap = fs.readFileSync(new URL('../docs/AGENT_TASK_MAP.md', import.meta.url), 'utf8');

function remoteWriteSection() {
  const start = executionWorkflow.indexOf('### Remote GitHub write discipline');
  const end = executionWorkflow.indexOf('### Validation evidence in remote mode', start);
  assert.notEqual(start, -1, 'Remote GitHub write discipline section must exist');
  assert.notEqual(end, -1, 'write discipline must remain inside the Remote GitHub authority');
  return executionWorkflow.slice(start, end);
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

test('Detailed Git-data write procedure has one execution authority rather than being duplicated into routing guidance', () => {
  for (const routingDocument of [rootAgents, taskMap]) {
    assert.equal(routingDocument.includes('### Remote GitHub write discipline'), false);
    assert.equal(routingDocument.includes('create changed-file blobs'), false);
    assert.equal(routingDocument.includes("tree based on that exact head's tree"), false);
  }

  assert.match(rootAgents, /Batch related edits where practical, use logical commits/i);
  assert.match(taskMap, /batch related writes where practical, and use logical commits rather than one commit per file/i);
  assert.match(taskMap, /review the complete branch\/PR diff/i);
});
