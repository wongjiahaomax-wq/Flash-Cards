import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const [template, coreV2, coreFacade, app] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'src/core-v2.js'), 'utf8'),
  readFile(resolve(root, 'src/core.js'), 'utf8'),
  readFile(resolve(root, 'src/app.js'), 'utf8')
]);

function moduleDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
}

const coreV2Url = moduleDataUrl(coreV2);
const bundledCoreFacade = coreFacade.replaceAll("'./core-v2.js'", JSON.stringify(coreV2Url));
const coreFacadeUrl = moduleDataUrl(bundledCoreFacade);
const bundledApp = app.replace("'./core.js'", JSON.stringify(coreFacadeUrl));

const marker = '<script type="module" src="./src/app.js"></script>';
if (!template.includes(marker)) throw new Error('Standalone reviewer template script marker is missing.');
const html = template.replace(marker, `<script type="module">\n${bundledApp}\n</script>`);
await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/index.html'), html);
console.log(`Built ${resolve(root, 'dist/index.html')}`);
