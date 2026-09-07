export function createAutosaveCoordinator({ hasPending, write, schedule }) {
  let active = null;

  async function flush() {
    if (active) {
      const inFlight = active;
      await inFlight;
      return hasPending() ? flush() : true;
    }
    if (!hasPending()) return false;
    const operation = Promise.resolve().then(write);
    active = operation;
    let succeeded = false;
    try {
      const result = await operation;
      succeeded = true;
      return result;
    } finally {
      if (active === operation) active = null;
      if (succeeded && hasPending()) schedule();
    }
  }

  return {
    flush,
    get active() { return active; }
  };
}
