export function createOperationGuard(getContext, onBusyChange = () => {}) {
  let active = null;
  let sequence = 0;

  const notify = () => onBusyChange(active);

  return {
    begin(kind, label) {
      if (active) return null;
      const context = getContext();
      active = { id: ++sequence, kind, label, generation: context.generation, bundle: context.bundle };
      notify();
      return active;
    },
    isCurrent(token) {
      const context = getContext();
      return active === token && token.generation === context.generation && token.bundle === context.bundle;
    },
    finish(token) {
      if (active !== token) return false;
      const current = this.isCurrent(token);
      active = null;
      notify();
      return current;
    },
    cancel() {
      if (!active) return;
      active = null;
      notify();
    },
    get active() {
      return active;
    }
  };
}
