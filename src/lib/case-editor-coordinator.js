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
    dirtyCount(excludedKey = null) {
      return [...entries.entries()]
        .filter(([key]) => key !== excludedKey)
        .filter(([, entry]) => entry.isDirty()).length;
    },
    isSavingAll() {
      return savingAll;
    },
    async saveAll() {
      if (savingAll) return { attempted: 0, succeeded: 0, failed: 0 };
      savingAll = true;
      notify();
      let attempted = 0;
      let succeeded = 0;
      let failed = 0;
      try {
        for (const entry of [...entries.values()]) {
          if (!entry.isDirty()) continue;
          attempted += 1;
          try {
            if (await entry.save()) succeeded += 1;
            else failed += 1;
          } catch {
            failed += 1;
          }
        }
      } finally {
        savingAll = false;
        notify();
      }
      return { attempted, succeeded, failed };
    }
  };
}
