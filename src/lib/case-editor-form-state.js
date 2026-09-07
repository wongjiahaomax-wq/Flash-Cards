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

export function changedFormFieldLabels(form, baseline) {
  if (!baseline) return [];
  const current = captureEditableFormSnapshot(form);
  const labels = [];
  current.forEach((value, index) => {
    const previous = baseline[index];
    if (JSON.stringify(value) === JSON.stringify(previous)) return;
    labels.push({
      title: 'Internal title',
      vignette_md: 'Vignette',
      prompt_md: 'Prompt',
      answer_md: 'Answer',
      reusable_for_topic: 'Share with Topic',
      caption: 'Caption',
      image: 'Image file',
      name: 'Image-set name',
      set_name: 'Image-set name',
      specific_question_mode: 'Coverage',
      minimum_specific_questions: 'Minimum questions',
      target: 'Target',
      prompt_id: 'Question',
      group_id: 'Image set'
    }[value.name] ?? value.name);
  });
  return [...new Set(labels)];
}
