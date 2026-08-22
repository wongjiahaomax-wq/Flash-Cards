import { spawnSync } from 'node:child_process';

export const VALIDATION_MODES = Object.freeze({
  fast: [
    ['git', ['diff', '--check']],
    ['npm', ['test']],
    ['npm', ['run', 'check']],
  ],
  full: [
    ['git', ['diff', '--check']],
    ['npm', ['run', 'db:check']],
    ['npm', ['test']],
    ['npm', ['run', 'check']],
    ['npm', ['run', 'build']],
    ['node', ['scripts/local-auth-smoke.mjs']],
  ],
});

export function executableFor(command, platform = process.platform) {
  return command === 'npm' && platform === 'win32' ? 'npm.cmd' : command;
}

export function runValidation(mode, spawn = spawnSync) {
  const commands = VALIDATION_MODES[mode];
  if (!commands) {
    console.error(`Unknown validation mode: ${mode}. Use fast or full.`);
    return 2;
  }
  for (const [command, args] of commands) {
    console.log(`\n> ${command} ${args.join(' ')}`);
    const result = spawn(executableFor(command), args, { stdio: 'inherit', shell: false });
    if (result.error) {
      console.error(`Failed to start ${command}: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) {
      console.error(`Validation stopped: ${command} exited with ${result.status}.`);
      return result.status ?? 1;
    }
  }
  console.log(`\nvalidate:${mode} passed.`);
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  process.exitCode = runValidation(process.argv[2]);
}
