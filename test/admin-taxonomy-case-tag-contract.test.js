import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const organizer = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyOrganizer.svelte', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/CaseClassificationInspector.svelte', import.meta.url), 'utf8');

test('taxonomy organizer exposes staged Case Tag editing without turning Tags into draggable tree nodes', () => {
  assert.match(inspector, /Search existing Tags/);
  assert.match(inspector, /Stage add/);
  assert.match(inspector, /Stage remove/);
  assert.match(inspector, /up to 60 selected Cases/);
  assert.doesNotMatch(organizer, /beginTagDrag|draggedTag|application\/x-flashcards-tag/i);
  assert.doesNotMatch(inspector, /draggable=/i);
});