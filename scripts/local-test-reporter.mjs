import path from 'node:path';
import { inspect } from 'node:util';

const DETAIL_FAILURE_LIMIT = 5;
const EXTRA_IDENTITY_LIMIT = 10;
const MESSAGE_LIMIT = 600;
const VALUE_LIMIT = 1200;
const CAPTURED_OUTPUT_LIMIT = 1200;
const STACK_FRAME_LIMIT = 3;

/** @typedef {Error & { code?: unknown, cause?: unknown, operator?: unknown, expected?: unknown, actual?: unknown }} TestError */

/** @param {unknown} value @param {number} limit */
export function boundedPreview(value, limit) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  const omitted = text.length - limit;
  return `${text.slice(0, limit)}\n… ${omitted} characters omitted`;
}

/** @param {unknown} file */
function repositoryPath(file) {
  if (!file) return null;
  const filename = String(file);
  const relative = path.relative(process.cwd(), filename);
  if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return filename.split(path.sep).join('/');
}

/** @param {unknown} wrapper @returns {TestError | null} */
function actualTestError(wrapper) {
  if (!(wrapper instanceof Error)) return null;
  const error = /** @type {TestError} */ (wrapper);
  if (error.cause instanceof Error) return /** @type {TestError} */ (error.cause);
  return error;
}

/** @param {unknown} value */
function formatValue(value) {
  return boundedPreview(inspect(value, {
    depth: 5,
    breakLength: 100,
    compact: false,
    maxArrayLength: 30,
    maxStringLength: 2400,
  }), VALUE_LIMIT);
}

/** @param {string} value @param {string} [prefix] */
function indentBlock(value, prefix = '   ') {
  return String(value).split(/\r?\n/).map((line) => `${prefix}${line}`).join('\n');
}

/** @param {TestError | null} error */
function usefulStack(error) {
  const stack = String(error?.stack ?? '').split(/\r?\n/);
  const frames = stack.filter((line) => /^\s+at\s/.test(line)).slice(0, STACK_FRAME_LIMIT);
  return frames.length ? frames.join('\n') : null;
}

/** @param {any} data */
function failureIdentity(data) {
  const file = repositoryPath(data?.file);
  const location = file
    ? `${file}${data?.line ? `:${data.line}${data?.column ? `:${data.column}` : ''}` : ''}`
    : '<unknown location>';
  return { file, location, name: String(data?.name ?? '<unnamed test>') };
}

/** @param {Map<string, { stdout: string, stderr: string }>} captures @param {string | null} file */
function captureForFile(captures, file) {
  if (!file) return { stdout: '', stderr: '' };
  return captures.get(file) ?? { stdout: '', stderr: '' };
}

/** @param {any} data @param {{ stdout?: string, stderr?: string }} [captured] */
export function formatLocalTestFailure(data, captured = {}) {
  const wrapper = data?.details?.error;
  const error = actualTestError(wrapper);
  const identity = failureIdentity(data);
  const lines = [identity.location, `   ${identity.name}`];
  if (error) {
    const code = error.code ? ` [${String(error.code)}]` : '';
    lines.push(`   ${error.name || 'Error'}${code}: ${boundedPreview(error.message, MESSAGE_LIMIT)}`);
    if (error.operator) lines.push(`   operator: ${String(error.operator)}`);
    if (Object.hasOwn(error, 'expected')) {
      lines.push('   expected:');
      lines.push(indentBlock(formatValue(error.expected), '      '));
    }
    if (Object.hasOwn(error, 'actual')) {
      lines.push('   actual:');
      lines.push(indentBlock(formatValue(error.actual), '      '));
    }
    const stack = usefulStack(error);
    if (stack) {
      lines.push('   stack:');
      lines.push(indentBlock(stack, '      '));
    }
  } else if (wrapper) {
    lines.push(`   error: ${boundedPreview(wrapper, MESSAGE_LIMIT)}`);
  } else {
    lines.push('   error: test failed without an Error payload');
  }
  if (captured.stdout) {
    lines.push('   stdout:');
    lines.push(indentBlock(boundedPreview(captured.stdout, CAPTURED_OUTPUT_LIMIT), '      '));
  }
  if (captured.stderr) {
    lines.push('   stderr:');
    lines.push(indentBlock(boundedPreview(captured.stderr, CAPTURED_OUTPUT_LIMIT), '      '));
  }
  return lines.join('\n');
}

/** @param {string} file */
function commandArgument(file) {
  return /^[A-Za-z0-9_./:@+-]+$/.test(file) ? file : JSON.stringify(file);
}

/** @param {number} value */
function plural(value) {
  return value === 1 ? '' : 's';
}

/** @param {AsyncIterable<any>} source */
export default async function* localTestReporter(source) {
  const failures = [];
  const captures = new Map();
  let summary = null;

  for await (const event of source) {
    const data = event.data ?? {};
    if (event.type === 'test:fail') {
      if (data.details?.type !== 'suite') failures.push(data);
    } else if (event.type === 'test:stdout' || event.type === 'test:stderr') {
      const file = repositoryPath(data.file);
      if (!file) continue;
      const existing = captures.get(file) ?? { stdout: '', stderr: '' };
      const key = event.type === 'test:stdout' ? 'stdout' : 'stderr';
      existing[key] = boundedPreview(`${existing[key]}${String(data.message ?? '')}`, CAPTURED_OUTPUT_LIMIT);
      captures.set(file, existing);
    } else if (event.type === 'test:summary' && !data.file) {
      summary = data;
    }
  }

  const counts = summary?.counts ?? {};
  const passed = Number.isInteger(counts.passed) ? counts.passed : Math.max(0, Number(counts.tests ?? 0) - failures.length);
  const failed = Number.isInteger(counts.failed) ? counts.failed : failures.length;
  const seconds = Number.isFinite(summary?.duration_ms) ? ` (${(summary.duration_ms / 1000).toFixed(2)}s)` : '';
  const extras = [
    Number.isInteger(counts.skipped) && counts.skipped ? `${counts.skipped} skipped` : null,
    Number.isInteger(counts.todo) && counts.todo ? `${counts.todo} todo` : null,
    Number.isInteger(counts.cancelled) && counts.cancelled ? `${counts.cancelled} cancelled` : null,
  ].filter(Boolean);
  const extraText = extras.length ? `, ${extras.join(', ')}` : '';

  if (failed === 0 && failures.length === 0) {
    yield `✓ Node tests — ${passed} passed, 0 failed${extraText}${seconds}\n`;
    return;
  }

  const totalFailures = Math.max(failed, failures.length);
  yield `✗ Node tests — ${totalFailures} failure${plural(totalFailures)}${seconds}\n`;

  const detailed = failures.slice(0, DETAIL_FAILURE_LIMIT);
  for (let index = 0; index < detailed.length; index += 1) {
    const failure = detailed[index];
    const identity = failureIdentity(failure);
    yield `\n${index + 1}. ${formatLocalTestFailure(failure, captureForFile(captures, identity.file))}\n`;
  }

  const omittedDetailed = Math.max(0, totalFailures - detailed.length);
  if (omittedDetailed > 0) {
    yield `\n${omittedDetailed} additional failure${plural(omittedDetailed)} omitted from detailed output.\n`;
  }

  const remaining = failures.slice(DETAIL_FAILURE_LIMIT);
  const identities = [];
  const identityKeys = new Set();
  for (const failure of remaining) {
    const identity = failureIdentity(failure);
    const key = `${identity.location}\0${identity.name}`;
    if (identityKeys.has(key)) continue;
    identityKeys.add(key);
    identities.push(identity);
    if (identities.length >= EXTRA_IDENTITY_LIMIT) break;
  }
  if (identities.length) {
    yield `Additional failing identities (up to ${EXTRA_IDENTITY_LIMIT}):\n`;
    for (const identity of identities) yield `- ${identity.location} — ${identity.name}\n`;
    const unlisted = Math.max(0, remaining.length - identities.length);
    if (unlisted) yield `${unlisted} additional identities not listed.\n`;
  }

  const reproFiles = [...new Set(detailed.map((failure) => failureIdentity(failure).file).filter(Boolean))];
  yield '\nFocused reproduction:\n';
  if (reproFiles.length) {
    for (const file of reproFiles) yield `npm test -- ${commandArgument(file)}\n`;
  } else {
    yield 'npm test\n';
  }
  yield '\nVerbose reproduction:\n';
  if (reproFiles.length) {
    for (const file of reproFiles) yield `npm run test:verbose -- ${commandArgument(file)}\n`;
  } else {
    yield 'npm run test:verbose\n';
  }
}
