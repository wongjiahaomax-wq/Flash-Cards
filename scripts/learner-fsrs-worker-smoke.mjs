import { Buffer } from 'node:buffer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

export async function runFsrsWorkerBundleSmoke() {
  const entry = fileURLToPath(
    new URL('../src/lib/server/learning/fsrs-scheduler.js', import.meta.url)
  );
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: { entry, formats: ['es'], fileName: () => 'fsrs-worker-smoke.js' },
      rollupOptions: { output: { inlineDynamicImports: true } }
    }
  });

  const results = Array.isArray(result) ? result : [result];
  /** @type {import('rolldown').OutputChunk|undefined} */
  let output;
  for (const buildResult of results) {
    if (!('output' in buildResult)) {
      throw new Error('Vite unexpectedly returned a watcher for the FSRS smoke build.');
    }
    const chunk = buildResult.output.find((item) => item.type === 'chunk');
    if (chunk?.type === 'chunk') {
      output = chunk;
      break;
    }
  }

  if (!output) {
    throw new Error('Vite did not produce an FSRS smoke bundle.');
  }
  if (/from\s+["']ts-fsrs["']/.test(output.code)) {
    throw new Error('FSRS smoke bundle unexpectedly left ts-fsrs external.');
  }
  if (/from\s+["']node:/.test(output.code)) {
    throw new Error('FSRS Worker bundle unexpectedly depends on a Node built-in.');
  }

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.code).toString('base64')}`;
  const adapter = await import(moduleUrl);
  const parameters = adapter.createDefaultFsrsParameters();
  const card = adapter.createInitialFsrsCard(Date.UTC(2026, 8, 2, 0, 0, 0));
  const transition = adapter.scheduleFsrsReview({
    card,
    rating: 'good',
    now: Date.UTC(2026, 8, 2, 0, 0, 0),
    parameters
  });
  if (!Number.isFinite(transition.nextDueAt) || transition.nextDueAt <= 0) {
    throw new Error('Bundled FSRS adapter did not execute a valid transition.');
  }

  return {
    bundledBytes: Buffer.byteLength(output.code),
    schedulerRevision: transition.schedulerRevision,
    schedulerLibraryVersion: transition.schedulerLibraryVersion,
    nextDueAt: transition.nextDueAt
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await runFsrsWorkerBundleSmoke();
  console.log(JSON.stringify(result, null, 2));
}