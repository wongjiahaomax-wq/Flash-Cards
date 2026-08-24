import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { viteCli, wranglerCli } from './local-runtime-lib.mjs';

const maxProcessListBuffer = 10 * 1024 * 1024;

/**
 * @typedef {{ pid: number, ppid: number, commandLine: string }} ProcessRecord
 * @typedef {ProcessRecord & { kind: 'dev' | 'preview' }} LocalServerProcess
 */

/**
 * @param {string | null | undefined} value
 * @param {NodeJS.Platform} [platform]
 */
export function normalizeCommandLine(value, platform = process.platform) {
  const normalized = String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/["']/g, '');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * @param {string} commandLine
 * @param {NodeJS.Platform} [platform]
 * @returns {'dev' | 'preview' | null}
 */
export function classifyLocalServerCommand(commandLine, platform = process.platform) {
  const normalized = normalizeCommandLine(commandLine, platform);
  const normalizedVite = normalizeCommandLine(viteCli, platform);
  const normalizedWrangler = normalizeCommandLine(wranglerCli, platform);

  if (normalized.includes(`${normalizedVite} dev`)) return 'dev';
  if (normalized.includes(`${normalizedWrangler} dev`)) return 'preview';
  return null;
}

/** @param {string} output */
export function parsePosixProcessList(output) {
  /** @type {ProcessRecord[]} */
  const records = [];
  for (const line of String(output ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    records.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      commandLine: match[3]
    });
  }
  return records;
}

/** @param {string} output */
export function parseWindowsProcessList(output) {
  const text = String(output ?? '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => ({
      pid: Number(row?.ProcessId),
      ppid: Number(row?.ParentProcessId),
      commandLine: String(row?.CommandLine ?? '')
    }))
    .filter((row) => Number.isInteger(row.pid) && row.pid > 0 && Number.isInteger(row.ppid) && row.ppid >= 0);
}

/**
 * @param {ProcessRecord[]} processes
 * @param {NodeJS.Platform} [platform]
 * @returns {LocalServerProcess[]}
 */
export function findLocalServerProcesses(processes, platform = process.platform) {
  /** @type {LocalServerProcess[]} */
  const matches = [];
  for (const record of processes) {
    const kind = classifyLocalServerCommand(record.commandLine, platform);
    if (kind) matches.push({ ...record, kind });
  }
  return matches;
}

/**
 * @param {number} rootPid
 * @param {ProcessRecord[]} processes
 */
export function descendantPids(rootPid, processes) {
  /** @type {Map<number, number[]>} */
  const childrenByParent = new Map();
  for (const processRecord of processes) {
    const children = childrenByParent.get(processRecord.ppid) ?? [];
    children.push(processRecord.pid);
    childrenByParent.set(processRecord.ppid, children);
  }

  /** @type {number[]} */
  const descendants = [];
  const pending = [...(childrenByParent.get(rootPid) ?? [])];
  while (pending.length > 0) {
    const pid = pending.shift();
    if (pid === undefined) continue;
    descendants.push(pid);
    pending.push(...(childrenByParent.get(pid) ?? []));
  }
  return descendants;
}

/** @param {NodeJS.Platform} [platform] */
export function createProcessListPlan(platform = process.platform) {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress'
      ]
    };
  }
  return {
    command: 'ps',
    args: ['-axww', '-o', 'pid=,ppid=,command=']
  };
}

/**
 * @param {NodeJS.Platform} [platform]
 * @returns {ProcessRecord[]}
 */
export function listProcesses(platform = process.platform) {
  const plan = createProcessListPlan(platform);
  const result = spawnSync(plan.command, plan.args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: maxProcessListBuffer
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${plan.command} exited with ${result.status}: ${String(result.stderr ?? '').trim()}`);
  }
  return platform === 'win32'
    ? parseWindowsProcessList(result.stdout)
    : parsePosixProcessList(result.stdout);
}

/** @param {number} pid */
function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH') return false;
    return true;
  }
}

/**
 * @param {LocalServerProcess} server
 * @param {ProcessRecord[]} processes
 * @param {NodeJS.Platform} [platform]
 */
export function stopLocalServerProcess(server, processes, platform = process.platform) {
  if (platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && processIsAlive(server.pid)) {
      throw new Error(`taskkill could not stop PID ${server.pid}: ${String(result.stderr ?? result.stdout ?? '').trim()}`);
    }
    return;
  }

  const targets = [...descendantPids(server.pid, processes).reverse(), server.pid];
  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH') continue;
      throw error;
    }
  }
}

async function main() {
  const processes = listProcesses();
  const servers = findLocalServerProcesses(processes);

  if (servers.length === 0) {
    console.log('No Flash-Cards local dev/preview servers are running.');
    return;
  }

  for (const server of servers) {
    const label = server.kind === 'dev' ? 'Vite dev' : 'Wrangler preview';
    console.log(`Stopping Flash-Cards ${label} server (PID ${server.pid})...`);
    stopLocalServerProcess(server, processes);
  }

  console.log(`Stopped ${servers.length} Flash-Cards local server${servers.length === 1 ? '' : 's'}.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(`Local server cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
