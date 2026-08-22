import {
  applyChildExit,
  createLocalPreviewPlan,
  ensureLocalXdgConfigHome,
  repoRoot,
  runForeground
} from './local-runtime-lib.mjs';

/**
 * @param {{ command: string, args: string[] }} step
 * @param {Record<string, string | undefined>} env
 */
async function runStep(step, env) {
  const result = await runForeground(step.command, step.args, { cwd: repoRoot, env });
  if (result.signal || result.code !== 0) {
    applyChildExit(result);
    return false;
  }
  return true;
}

async function main() {
  await ensureLocalXdgConfigHome();
  const plan = createLocalPreviewPlan();

  if (!await runStep(plan.build, plan.env)) return;
  if (!await runStep(plan.migrate, plan.env)) return;

  console.log(`Starting production-style local preview at ${plan.origin}.`);
  const result = await runForeground(plan.serve.command, plan.serve.args, {
    cwd: repoRoot,
    env: plan.env
  });
  applyChildExit(result);
}

main().catch((error) => {
  console.error(`Local preview failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
