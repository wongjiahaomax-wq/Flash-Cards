import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readSource = path => readFile(path, 'utf8').then(source => source.replace(/\r\n?/g, '\n'));
const [template, coreV2, coreFacade, app, autosave, resourceCache, reviewFilters, operationGuard, crop] = await Promise.all([
  readSource(resolve(root, 'index.template.html')),
  readSource(resolve(root, 'src/core-v2.js')),
  readSource(resolve(root, 'src/core.js')),
  readSource(resolve(root, 'src/app.js')),
  readSource(resolve(root, 'src/autosave.js')),
  readSource(resolve(root, 'src/resource-cache.js')),
  readSource(resolve(root, 'src/review-filters.js')),
  readSource(resolve(root, 'src/operation-guard.js')),
  readSource(resolve(root, 'src/crop.js'))
]);

function moduleDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
}

const coreV2Url = moduleDataUrl(coreV2);
const bundledCoreFacade = coreFacade.replaceAll("'./core-v2.js'", JSON.stringify(coreV2Url));
const coreFacadeUrl = moduleDataUrl(bundledCoreFacade);
const autosaveUrl = moduleDataUrl(autosave);
const resourceCacheUrl = moduleDataUrl(resourceCache);
const reviewFiltersUrl = moduleDataUrl(reviewFilters);
const operationGuardUrl = moduleDataUrl(operationGuard);
const cropUrl = moduleDataUrl(crop);
const bundledApp = app.replace("'./core.js'", JSON.stringify(coreFacadeUrl)).replace("'./autosave.js'", JSON.stringify(autosaveUrl)).replace("'./resource-cache.js'", JSON.stringify(resourceCacheUrl)).replace("'./review-filters.js'", JSON.stringify(reviewFiltersUrl)).replace("'./operation-guard.js'", JSON.stringify(operationGuardUrl)).replace("'./crop.js'", JSON.stringify(cropUrl));

const marker = '<script type="module" src="./src/app.js"></script>';
if (!template.includes(marker)) throw new Error('Standalone reviewer template script marker is missing.');
const html = template.replace(marker, `<script type="module">\n${bundledApp}\n</script>`);
const output = resolve(root, 'reviewer.html');
if (process.argv.includes('--check') || process.env.CI === 'true') {
  let committed;
  try { committed = await readFile(output, 'utf8'); } catch { throw new Error(`Generated reviewer is missing: ${output}`); }
  if (committed !== html) throw new Error(`Generated reviewer is stale: ${output}. Run npm run slide-review:build locally and commit the updated reviewer.html.`);
  console.log(`Verified ${output}`);
} else {
  await mkdir(resolve(root), { recursive: true });
  await writeFile(output, html);
  console.log(`Built ${output}`);
}
