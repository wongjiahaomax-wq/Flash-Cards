import {
  applyChildExit,
  createLocalDevPlan,
  ensureLocalXdgConfigHome,
  runForeground
} from './local-runtime-lib.mjs';

async function main() {
  await ensureLocalXdgConfigHome();
  const plan = createLocalDevPlan();
  const result = await runForeground(plan.command, plan.args, {
    cwd: plan.cwd,
    env: plan.env
  });
  applyChildExit(result);
}

main().catch((error) => {
  console.error(`Local development failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
