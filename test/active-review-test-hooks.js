import { registerHooks } from 'node:module';

const mixedSnapshotTests = new Set([
  'asset-higher-resolution-replacement.test.js',
  'case-questions.test.js',
  'original-stimulus-semantics.test.js',
  'preview-workspace.test.js',
  'stimulus-groups.test.js',
  'tag-shared-behavior.test.js'
]);
const historicalAssetLibraryTests = new Set([
  'asset-library.test.js',
  'asset-preview-isolation.test.js'
]);
const historicalPreviewWorkspaceTests = new Set([
  'preview-workspace-foundations.test.js'
]);

const snapshotAdapterUrl = new URL('./active-review-snapshot-adapter.js', import.meta.url).href;
const assetLibraryAdapterUrl = new URL('./asset-library-test-adapter.js', import.meta.url).href;
const previewWorkspaceAdapterUrl = new URL('./preview-workspace-test-adapter.js', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL ?? '';
    if (
      specifier === '../src/lib/server/db/learning.js'
      && [...mixedSnapshotTests].some((name) => parent.endsWith(`/test/${name}`))
    ) {
      return { url: snapshotAdapterUrl, shortCircuit: true };
    }
    if (
      specifier === '../src/lib/server/db/asset-library.js'
      && [...historicalAssetLibraryTests].some((name) => parent.endsWith(`/test/${name}`))
    ) {
      return { url: assetLibraryAdapterUrl, shortCircuit: true };
    }
    if (
      specifier === '../src/lib/server/db/preview-workspace.js'
      && [...historicalPreviewWorkspaceTests].some((name) => parent.endsWith(`/test/${name}`))
    ) {
      return { url: previewWorkspaceAdapterUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});
