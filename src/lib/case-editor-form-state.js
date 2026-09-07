// @ts-nocheck

export function captureEditableFormSnapshot(form) {
  return [...form.elements]
    .filter((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
      return !(element instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'reset'].includes(element.type));
    })
    .map((element) => {
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return { name: element.name, type: element.type, checked: element.checked };
      if (element instanceof HTMLInputElement && element.type === 'file') return { name: element.name, type: element.type, files: [...(element.files ?? [])].map((file) => ({ name: file.name, size: file.size, lastModified: file.lastModified, type: file.type })) };
      return { name: element.name, type: element.type, value: element.value };
    });
}

export function sameEditableFormSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function formHasMeaningfulUnsubmittedInput(form) {
  return [...form.elements].some((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
    if (element instanceof HTMLInputElement && element.type === 'file') return Boolean(element.files?.length);
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return element.checked !== element.defaultChecked;
    if (element instanceof HTMLSelectElement) return [...element.options].some((option) => option.selected !== option.defaultSelected);
    return element.value.trim() !== element.defaultValue.trim();
  });
}

export function formHasMeaningfulUnsubmittedInputAgainst(form, baseline) {
  return !sameEditableFormSnapshot(captureEditableFormSnapshot(form), baseline);
}

export function formCanHoldMeaningfulStructuralInput(form) {
  return [...form.elements].some((element) => element instanceof HTMLInputElement
    ? !['hidden', 'submit', 'button', 'reset'].includes(element.type)
    : element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement);
}

export function mutationMayChangeEditorFormTopology(records) {
  const mayChange = (node) => {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches?.('form, input, textarea, select')) return true;
    return Boolean(node.querySelector?.('form, input, textarea, select'));
  };
  return records.some((record) => [...record.addedNodes, ...record.removedNodes].some(mayChange));
}

function fieldLabel(form, value) {
  const action = form?.getAttribute?.('action') ?? '';
  const name = value?.name ?? '';
  const type = value?.type ?? '';
  if (action.includes('createCaseTopic') && name === 'name') return 'Topic name';
  if (action.includes('case-tags') && name === 'name') return 'Tag name';
  if (action.includes('promoteTopic')) {
    if (!name && type === 'search') return 'Topic search';
    if (!name && type.startsWith('select')) return 'System selection';
  }
  if (action.includes('assignPrimaryTopicToSystem') && name === 'system_id') return 'Parent System';
  return {
    '': type === 'file' ? 'Image file' : type === 'search' ? 'Topic search' : 'Selection',
    title: 'Internal title',
    vignette_md: 'Vignette',
    prompt_md: 'Prompt',
    answer_md: 'Answer',
    reusable_for_topic: 'Share with Topic',
    caption: 'Caption',
    image: 'Image file',
    name: action.includes('StimulusGroup') || action.includes('startAlternativeSet') ? 'Image-set name' : 'Name',
    set_name: 'Image-set name',
    specific_question_mode: 'Coverage',
    minimum_specific_questions: 'Minimum questions',
    target: 'Target',
    prompt_id: 'Question',
    group_id: 'Image set'
  }[name] ?? name;
}

export function changedFormFieldLabels(form, baseline, current = undefined) {
  if (!baseline) return [];
  const snapshot = current ?? captureEditableFormSnapshot(form);
  const labels = [];
  snapshot.forEach((value, index) => {
    const previous = baseline[index];
    if (JSON.stringify(value) === JSON.stringify(previous)) return;
    labels.push(fieldLabel(form, value));
  });
  return [...new Set(labels)];
}
