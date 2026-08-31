/**
 * Parse the repository-pinned svelte-check 4.7.4 machine-verbose protocol.
 *
 * svelte-check prefixes every machine record with a millisecond timestamp.
 * Diagnostic payloads are JSON objects. START/COMPLETED/FAILURE are framed
 * text records. Diagnostic coordinates are LSP-style zero-based positions;
 * this module normalizes them to one-based human/GitHub coordinates.
 */

const COMPLETED_RECORD = /^COMPLETED (\d+) FILES (\d+) ERRORS (\d+) WARNINGS (\d+) FILES_WITH_PROBLEMS$/;

/** @param {unknown} value @returns {number | null} */
function nonNegativeInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** @param {unknown} value @returns {number | null} */
function oneBasedCoordinate(value) {
  const coordinate = nonNegativeInteger(value);
  return coordinate === null ? null : coordinate + 1;
}

/** @param {unknown} value */
function normalizeCode(value) {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

/** @param {unknown} value */
function normalizeSource(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** @param {unknown} value */
function normalizeFile(value) {
  return typeof value === 'string' && value.length > 0 ? value.replaceAll('\\', '/') : null;
}

/**
 * @param {any} payload
 * @returns {{
 *   severity: 'error' | 'warning',
 *   file: string,
 *   line: number,
 *   column: number,
 *   endLine: number | null,
 *   endColumn: number | null,
 *   message: string,
 *   code: string | number | null,
 *   source: string | null,
 * } | null}
 */
function normalizeDiagnostic(payload) {
  if (payload?.type !== 'ERROR' && payload?.type !== 'WARNING') return null;

  const file = normalizeFile(payload.filename);
  const line = oneBasedCoordinate(payload.start?.line);
  const column = oneBasedCoordinate(payload.start?.character);
  const message = typeof payload.message === 'string' ? payload.message : null;
  if (!file || line === null || column === null || message === null) return null;

  return {
    severity: payload.type === 'ERROR' ? 'error' : 'warning',
    file,
    line,
    column,
    endLine: oneBasedCoordinate(payload.end?.line),
    endColumn: oneBasedCoordinate(payload.end?.character),
    message,
    code: normalizeCode(payload.code),
    source: normalizeSource(payload.source),
  };
}

/**
 * @param {string} output
 */
export function parseSvelteMachineOutput(output) {
  const diagnostics = [];
  let protocolStarted = false;
  let workspace = null;
  let completion = null;
  let failure = null;
  let malformedDiagnosticRecords = 0;

  for (const rawLine of String(output ?? '').split(/\r?\n/)) {
    const match = /^(\d+)\s+(.+)$/.exec(rawLine);
    if (!match) continue;
    const record = match[2];

    if (record.startsWith('START ')) {
      try {
        const parsedWorkspace = JSON.parse(record.slice('START '.length));
        if (typeof parsedWorkspace === 'string') {
          protocolStarted = true;
          workspace = parsedWorkspace;
        }
      } catch {
        // A malformed lifecycle line is ignored. Command exit status remains authoritative.
      }
      continue;
    }

    if (!protocolStarted) continue;

    const completed = COMPLETED_RECORD.exec(record);
    if (completed) {
      completion = {
        files: Number(completed[1]),
        errors: Number(completed[2]),
        warnings: Number(completed[3]),
        filesWithProblems: Number(completed[4]),
      };
      continue;
    }

    if (record.startsWith('FAILURE ')) {
      try {
        const parsedFailure = JSON.parse(record.slice('FAILURE '.length));
        failure = typeof parsedFailure === 'string' ? parsedFailure : String(parsedFailure);
      } catch {
        failure = 'svelte-check emitted a malformed FAILURE record';
      }
      continue;
    }

    if (!record.startsWith('{')) continue;

    let payload;
    try {
      payload = JSON.parse(record);
    } catch {
      malformedDiagnosticRecords += 1;
      continue;
    }

    if (payload?.type !== 'ERROR' && payload?.type !== 'WARNING') continue;
    const diagnostic = normalizeDiagnostic(payload);
    if (diagnostic) {
      diagnostics.push(diagnostic);
    } else {
      malformedDiagnosticRecords += 1;
    }
  }

  return {
    protocolStarted,
    workspace,
    diagnostics,
    completion,
    failure,
    malformedDiagnosticRecords,
  };
}
