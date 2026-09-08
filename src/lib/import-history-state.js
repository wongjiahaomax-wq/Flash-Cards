// @ts-nocheck

const TERMINAL_STATUSES = new Set(['complete', 'cancelled']);

export function createImportHistoryState(initial = {}) {
  let snapshot = {
    jobs: [...(initial.jobs ?? [])],
    hasEligibleTerminalHistory: Boolean(initial.hasEligibleTerminalHistory)
  };

  function sync() {
    snapshot = { ...snapshot, jobs: [...snapshot.jobs] };
  }

  return {
    upsert(job) {
      if (!job) return;
      const index = snapshot.jobs.findIndex((item) => item.id === job.id);
      if (index >= 0) snapshot.jobs[index] = job;
      else snapshot.jobs = [job, ...snapshot.jobs].slice(0, 10);
      if (TERMINAL_STATUSES.has(job.status)) snapshot.hasEligibleTerminalHistory = true;
      sync();
    },
    replace(history) {
      snapshot = {
        jobs: [...(history?.jobs ?? [])],
        hasEligibleTerminalHistory: Boolean(history?.hasEligibleTerminalHistory)
      };
    },
    value() {
      return { jobs: [...snapshot.jobs], hasEligibleTerminalHistory: snapshot.hasEligibleTerminalHistory };
    }
  };
}
