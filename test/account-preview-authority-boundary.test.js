import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const invariants = await readFile(
  new URL('../src/lib/server/accounts/admin-account-invariants.ts', import.meta.url),
  'utf8'
);
const accountDetailRoute = await readFile(
  new URL('../src/routes/admin/accounts/[userId]/+page.server.js', import.meta.url),
  'utf8'
);
const accountDetailUi = await readFile(
  new URL('../src/routes/admin/accounts/[userId]/+page.svelte', import.meta.url),
  'utf8'
);

/** @param {string} source @param {string} actionName @param {string} nextActionName */
function actionBlock(source, actionName, nextActionName) {
  const startMarker = `${actionName}: async (event) => {`;
  const endMarker = `${nextActionName}: async (event) => {`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(start, -1, `Expected ${actionName} action to exist.`);
  assert.notEqual(end, -1, `Expected ${nextActionName} action to follow ${actionName}.`);
  return source.slice(start, end);
}

test('Production lifecycle and session actions fail closed for Preview-enabled identities', () => {
  assert.match(accountDetailRoute, /async function assertProductionSecurityMutationScope/);
  assert.match(accountDetailRoute, /account\.hasPreviewAccess/);
  assert.match(accountDetailRoute, /PREVIEW_AUTHORITY_SEPARATE/);

  const disableAction = actionBlock(accountDetailRoute, 'disable', 'restore');
  const restoreAction = actionBlock(accountDetailRoute, 'restore', 'revokeSessions');
  const revokeAction = accountDetailRoute.slice(accountDetailRoute.indexOf('revokeSessions: async (event) => {'));

  assert.match(disableAction, /assertProductionSecurityMutationScope/);
  assert.match(restoreAction, /assertProductionSecurityMutationScope/);
  assert.match(revokeAction, /assertProductionSecurityMutationScope/);
});

test('Atomic disable independently rejects Preview Admin authority', () => {
  const disableFunction = invariants.slice(
    invariants.indexOf('export async function disableManagedAccountAtomically')
  );
  assert.match(disableFunction, /parseRoles\(target\.role\)\.includes\('preview_admin'\)/);
  assert.match(disableFunction, /previewAuthorityBlocked\(\)/);
  assert.match(disableFunction, /PREVIEW_AUTHORITY_SEPARATE/);
});

test('Account detail UI does not offer shared lifecycle/session controls for Preview-enabled identities', () => {
  assert.match(
    accountDetailUi,
    /\{#if data\.account\.hasPreviewAccess\}[\s\S]*Session revocation is unavailable here/
  );
  assert.match(
    accountDetailUi,
    /\{#if data\.account\.hasPreviewAccess\}[\s\S]*Lifecycle changes are unavailable here/
  );
});
