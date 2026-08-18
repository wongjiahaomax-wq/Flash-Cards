import assert from 'node:assert/strict';
import test from 'node:test';

import { AssetLibraryInputError, renameImageCollection } from '../src/lib/server/db/asset-library.js';

test('Collection rename translates a concurrent unique-name conflict into a client input error', async () => {
  let selectCall = 0;
  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                async limit() {
                  selectCall += 1;
                  return selectCall === 1 ? [{ id: 'collection-a', name: 'Old name' }] : [];
                }
              };
            }
          };
        }
      };
    },
    update() {
      return {
        set() {
          return {
            async where() {
              throw new Error('UNIQUE constraint failed: image_collections.name');
            }
          };
        }
      };
    }
  };

  await assert.rejects(
    () => renameImageCollection(/** @type {any} */ (db), 'collection-a', 'ECG'),
    (error) => error instanceof AssetLibraryInputError && error.message === 'A Collection with that name already exists.'
  );
});
