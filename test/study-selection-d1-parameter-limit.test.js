// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { buildStudySelectionCreationWrites } from '../src/lib/server/db/study-selection.ts';

test('large study selections keep every D1 statement below the bound-parameter limit', async () => {
  const boundParameterCounts = [];
  const d1 = {
    prepare(sql) {
      return {
        bind(...params) {
          if (params.length > 100) {
            throw new Error(`D1 parameter limit exceeded: ${params.length}`);
          }
          boundParameterCounts.push(params.length);
          return {
            async run() {
              return { success: true, results: [], meta: { changes: 0 } };
            }
          };
        }
      };
    },
    async batch(statements) {
      return statements.map(() => ({ success: true, results: [], meta: { changes: 0 } }));
    }
  };
  const db = createDb(d1);
  const routes = Array.from({ length: 40 }, (_, index) => ({
    routeType: 'topic',
    routeId: `topic-${index}`
  }));
  const writes = buildStudySelectionCreationWrites(db, {
    id: 'selection-40-routes',
    userId: 'learner',
    systemId: 'system-a',
    routes
  });

  assert.equal(writes.length, 3, 'selection + two route chunks should be batched together');
  await db.batch(writes);

  assert.equal(Math.max(...boundParameterCounts), 90);
  assert.deepEqual(boundParameterCounts, [3, 90, 30]);
});
