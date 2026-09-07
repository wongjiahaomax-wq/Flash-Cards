// @ts-nocheck

export function cloneCaseEditorSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

export function sameCaseEditorSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** @param {{ promptId?: string, questions?: Array<{ id: string, questionPromptId?: string }>, pendingQuestionIds?: Iterable<string> }} input */
export function canReorderCaseQuestion({ promptId = '', questions = [], pendingQuestionIds = [] }) {
  const question = questions.find((candidate) => candidate.questionPromptId === promptId);
  return Boolean(question && !new Set(pendingQuestionIds).has(question.id));
}

export function coordinatedFormStatus({ pending = false, dirty = false, succeeded = true } = {}) {
  if (pending) return 'Saving…';
  if (dirty) return 'Unsaved changes';
  return succeeded ? 'Saved' : 'Save failed — try again';
}

function valueOrCall(value, fallback) {
  return typeof value === 'function' ? value() : value ?? fallback;
}

function normalizeDirtyFields(value) {
  const fields = valueOrCall(value, []);
  return Array.isArray(fields) ? fields.filter(Boolean) : [];
}

export function createCoordinatedFormSaveState(isDirty) {
  let pending = false;
  let succeeded = true;

  function refresh() {
    if (pending) return coordinatedFormStatus({ pending: true });
    if (isDirty()) return coordinatedFormStatus({ dirty: true, succeeded: true });
    return coordinatedFormStatus({ succeeded });
  }

  return {
    begin() {
      pending = true;
      return refresh();
    },
    complete(ok) {
      pending = false;
      succeeded = ok;
      return ok ? refresh() : coordinatedFormStatus({ succeeded: false });
    },
    cancel() {
      pending = false;
      return refresh();
    },
    refresh,
    isPending() { return pending; },
    hasFailed() { return !succeeded; }
  };
}

/** @param {{ resultRevision?: number | null, currentRevision?: number, dirtyCount?: number, saving?: boolean }} [input] */
export function shouldClearSaveAllResult({ resultRevision = null, currentRevision = 0, dirtyCount = 0, saving = false } = {}) {
  return resultRevision !== null && currentRevision > resultRevision && !saving && dirtyCount > 0;
}

export function reconcileSubmittedCaseEditorDraft(draft, submitted, authoritative) {
  return {
    baseline: cloneCaseEditorSnapshot(authoritative),
    draft: sameCaseEditorSnapshot(draft, submitted)
      ? cloneCaseEditorSnapshot(authoritative)
      : cloneCaseEditorSnapshot(draft)
  };
}

export function createCaseEditorCoordinator() {
  const entries = new Map();
  const listeners = new Set();
  let savingAll = false;

  function notify() {
    for (const listener of listeners) listener();
  }

  return {
    register(key, entry) {
      entries.set(key, entry);
      notify();
      return () => {
        if (entries.get(key) === entry) entries.delete(key);
        notify();
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh() {
      notify();
    },
    rebaseline(key, snapshot = null) {
      const entry = entries.get(key);
      if (!entry?.rebaseline) return false;
      entry.rebaseline(snapshot);
      notify();
      return true;
    },
    dirtyItems({ excludeKey = null } = {}) {
      return [...entries.entries()]
        .filter(([key]) => key !== excludeKey)
        .filter(([, entry]) => entry.isDirty())
        .map(([key, entry]) => {
          const fields = normalizeDirtyFields(entry.dirtyFields ?? entry.fields);
          const label = valueOrCall(entry.label, key);
          const status = valueOrCall(entry.status, entry.saveable === false ? 'Not submitted' : entry.isSaving?.() ? 'Saving…' : 'Unsaved — included in Save all');
          return {
            key,
            label,
            fields,
            status,
            saveable: entry.saveable !== false,
            target: valueOrCall(entry.target, null)
          };
        });
    },
    hasUnsavedWork() {
      return this.dirtyItems().length > 0;
    },
    saveableDirtyCount() {
      return this.dirtyItems().filter((item) => item.saveable).length;
    },
    describeUnsavedWork(limit = 4) {
      const items = this.dirtyItems();
      const visible = items.slice(0, limit).map((item) => item.fields.length ? `${item.label} — ${item.fields.join(', ')}` : item.label);
      const remaining = items.length - visible.length;
      return `${visible.join('; ')}${remaining > 0 ? `; and ${remaining} more` : ''}`;
    },
    dirtyCount(excludedKey = null) {
      return this.dirtyItems({ excludeKey: excludedKey }).length;
    },
    isSavingAll() {
      return savingAll;
    },
    async saveAll() {
      if (savingAll) return { attempted: 0, succeeded: 0, failed: 0 };
      // Capture every valid draft before starting a mutation.  The individual
      // enhanced forms can then all post before any response reconciles the
      // page, rather than letting the first redirect invalidate another form.
      const plans = [];
      for (const [key, entry] of entries) {
        if (entry.saveable === false || !entry.isDirty()) continue;
        const prepared = entry.prepareSave ? entry.prepareSave() : true;
        if (!prepared) return { attempted: 0, succeeded: 0, failed: 1 };
        plans.push({ key, entry, prepared });
      }
      if (!plans.length) return { attempted: 0, succeeded: 0, failed: 0 };
      savingAll = true;
      notify();
      const attempted = plans.length;
      let succeeded = 0;
      let failed = 0;
      try {
        // Do not await here: initiating all posts in this turn is the safety
        // boundary that keeps later drafts out of an intermediate invalidation.
        const outcomes = await Promise.allSettled(plans.map(({ entry, prepared }) => entry.save(prepared)));
        for (const outcome of outcomes) {
          if (outcome.status === 'fulfilled' && outcome.value) succeeded += 1;
          else failed += 1;
        }
      } finally {
        savingAll = false;
        notify();
      }
      return { attempted, succeeded, failed };
    }
  };
}
