import { readFileSync, writeFileSync } from 'node:fs';

const typesPath = new URL('../worker-configuration.d.ts', import.meta.url);
const generatedTypes = readFileSync(typesPath, 'utf8');
const mainModuleBlock =
  /\n\tinterface GlobalProps \{\n\t\tmainModule: typeof import\([^;]+;\n\t\}\n/;

// Wrangler sees SvelteKit's generated Worker after the first build and adds a
// type-only import for that compiled JavaScript bundle. In a checkJs project,
// TypeScript then checks the generated bundle as source. The binding and
// runtime declarations remain fully generated; only that build-artifact import
// is removed.
const normalizedTypes = generatedTypes
  .replace(mainModuleBlock, '\n')
  .split('\n')
  .map((line) => line.trimEnd())
  .join('\n');

if (normalizedTypes === generatedTypes && generatedTypes.includes('interface GlobalProps')) {
  throw new Error('Wrangler generated an unexpected GlobalProps declaration.');
}

writeFileSync(typesPath, normalizedTypes);
