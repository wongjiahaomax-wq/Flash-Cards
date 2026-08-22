import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { branchStatus, findRepositoryRoot, nodeMajorStatus, overallDoctorStatus, parseNodeMajor, wranglerVersionStatus } from './agent-doctor-lib.mjs';

const root = findRepositoryRoot();
if (!root) {
  console.error('ERROR: repository root could not be detected. Run this command from inside the Flash-Cards checkout.');
  process.exit(1);
}
process.chdir(root);

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const expectedNodeVersion = fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim();
const expectedNodeMajor = parseNodeMajor(expectedNodeVersion);
const expectedWrangler = pkg.devDependencies?.wrangler ?? null;
const checks = [];
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

const branchResult = git('branch', '--show-current');
const branchReadable = branchResult.status === 0;
const branch = branchReadable ? branchResult.stdout.trim() : null;
const branchCheck = branchStatus(branch, branchReadable);
checks.push({ level: branchCheck.level });

const worktreeResult = git('status', '--porcelain');
const worktreeReadable = worktreeResult.status === 0;
const worktree = worktreeReadable ? (worktreeResult.stdout.trim() ? 'dirty' : 'clean') : 'unknown';
checks.push({ level: worktreeReadable ? 'ok' : 'error' });

const nodeCheck = nodeMajorStatus(process.version, expectedNodeMajor);
checks.push({ level: nodeCheck.ok ? 'ok' : 'error' });

const nodeModulesPresent = fs.existsSync(path.join(root, 'node_modules'));
let installedWrangler = null;
const wranglerPkgPath = path.join(root, 'node_modules', 'wrangler', 'package.json');
if (fs.existsSync(wranglerPkgPath)) {
  installedWrangler = JSON.parse(fs.readFileSync(wranglerPkgPath, 'utf8')).version ?? null;
}
const wranglerCheck = wranglerVersionStatus(expectedWrangler, installedWrangler);
if (!nodeModulesPresent || !installedWrangler || !wranglerCheck.ok) checks.push({ level: 'error' });

const devVarsPresent = fs.existsSync(path.join(root, '.dev.vars'));
const wranglerStatePresent = fs.existsSync(path.join(root, '.wrangler'));
const replicaPresent = wranglerStatePresent && fs.existsSync(path.join(root, '.wrangler', 'state'));

const branchSuffix = branchCheck.level === 'ok' ? '' : `  ${branchCheck.level.toUpperCase()}`;
console.log(`Repository         ${root}`);
console.log(`Branch             ${branchCheck.branch}${branchSuffix}`);
console.log(`Worktree           ${worktree}${worktreeReadable ? '' : '  ERROR'}`);
console.log('');
console.log(`Node               ${process.version}  ${nodeCheck.ok ? 'OK' : `ERROR (expected major ${expectedNodeMajor})`}`);
console.log(`Dependencies       ${nodeModulesPresent ? 'present' : 'missing'}`);
console.log(`Wrangler expected  ${expectedWrangler ?? 'unknown'}`);
console.log(`Wrangler installed ${installedWrangler ?? 'missing'}  ${wranglerCheck.ok ? 'OK' : 'ERROR'}`);
console.log('');
console.log(`.dev.vars          ${devVarsPresent ? 'present' : 'absent'}`);
console.log(`.wrangler/         ${wranglerStatePresent ? 'present' : 'absent'}`);
console.log(`Local replica      ${replicaPresent ? 'appears present' : 'not detected'}`);

if (branchCheck.message) {
  const log = branchCheck.level === 'error' ? console.error : console.warn;
  log(`\n${branchCheck.level.toUpperCase()}: ${branchCheck.message}`);
}
if (!worktreeReadable) console.error('\nERROR: Git worktree state could not be read. Confirm Git is available and this checkout is healthy.');
if (!nodeCheck.ok) console.error(`\nERROR: Node ${expectedNodeMajor}.x is required. Switch Node versions, then rerun npm ci.`);
if (!nodeModulesPresent || !installedWrangler) console.error('\nERROR: repository dependencies are not installed.\nRun: npm ci');
else if (!wranglerCheck.ok) console.error(`\nERROR: installed Wrangler does not match package.json (${expectedWrangler}).\nRun: npm ci`);

const status = overallDoctorStatus(checks);
if (status === 'error') process.exit(1);
console.log(status === 'warning' ? '\nEnvironment usable with warnings.' : '\nEnvironment ready.');
