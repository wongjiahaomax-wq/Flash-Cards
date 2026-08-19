import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const [template, core, app] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'src/core.js'), 'utf8'),
  readFile(resolve(root, 'src/app.js'), 'utf8')
]);
const appWithoutImport = app.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/core\.js['"];\s*/m, '');
const marker = '<script type="module" src="./src/app.js"></script>';
if (!template.includes(marker)) throw new Error('Standalone reviewer template script marker is missing.');
const html = template.replace(marker, `<script type="module">\n${core}\n${appWithoutImport}\n</script>`);
await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/index.html'), html);
console.log(`Built ${resolve(root, 'dist/index.html')}`);
