import { pathToFileURL } from 'node:url';

export function getSingleFullTrafficVersionId(deployment) {
  if (!deployment || typeof deployment !== 'object') {
    throw new Error('Worker deployment status must be a JSON object.');
  }

  const versions = deployment.versions;
  if (!Array.isArray(versions) || versions.length !== 1) {
    throw new Error('Expected exactly one active Worker version before Production mutation.');
  }

  const [version] = versions;
  const percentage = Number(version?.percentage);
  const versionId = typeof version?.version_id === 'string' ? version.version_id.trim() : '';

  if (percentage !== 100 || versionId.length === 0) {
    throw new Error('Expected one Worker version serving exactly 100% of Production traffic.');
  }

  return versionId;
}

export function assertSingleFullTrafficVersion(deployment, expectedVersionId) {
  const actualVersionId = getSingleFullTrafficVersionId(deployment);
  if (actualVersionId !== expectedVersionId) {
    throw new Error(`Expected Worker version ${expectedVersionId}, found ${actualVersionId}.`);
  }
  return actualVersionId;
}

async function readStdinJson() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) throw new Error('Expected Worker deployment status JSON on stdin.');
  return JSON.parse(raw);
}

async function main(args = process.argv.slice(2)) {
  const [command, expectedVersionId] = args;
  const deployment = await readStdinJson();

  if (command === 'current-version') {
    process.stdout.write(getSingleFullTrafficVersionId(deployment));
    return;
  }

  if (command === 'verify-version') {
    if (!expectedVersionId) throw new Error('verify-version requires an expected version ID.');
    assertSingleFullTrafficVersion(deployment, expectedVersionId);
    process.stdout.write(expectedVersionId);
    return;
  }

  throw new Error(`Unknown command: ${command ?? '<missing>'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
