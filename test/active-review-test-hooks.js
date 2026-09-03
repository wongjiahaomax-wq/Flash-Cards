import { registerHooks } from 'node:module';

const mixedSnapshotTests = new Set([
  'asset-higher-resolution-replacement.test.js',
  'case-questions.test.js',
  'original-stimulus-semantics.test.js',
  'preview-workspace.test.js',
  'stimulus-groups.test.js',
  'tag-shared-behavior.test.js'
]);

const adapterUrl = new URL('./active-review-snapshot-adapter.js', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL ?? '';
    if (
      specifier === '../src/lib/server/db/learning.js'
      && [...mixedSnapshotTests].some((name) => parent.endsWith(`/test/${name}`))
    ) {
      return { url: adapterUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});
