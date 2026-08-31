import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { applyCurrentSchema } from './current-schema.js';

function indexColumns(sqlite, indexName) {
  return sqlite
    .prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno')
    .all(indexName)
    .map((row) => row.name);
}

test('Topic deletion provenance lookups have current-schema indexes', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    applyCurrentSchema(sqlite);
    assert.deepEqual(
      indexColumns(sqlite, 'reviews_navigation_route_idx'),
      ['navigation_route_type', 'navigation_route_id']
    );
    assert.deepEqual(
      indexColumns(sqlite, 'review_questions_source_concept_idx'),
      ['source_concept_id']
    );
  } finally {
    sqlite.close();
  }
});
