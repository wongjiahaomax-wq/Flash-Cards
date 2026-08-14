// Temporary learner-demo content reconstructed from the earlier Anki design review.
// This intentionally lives outside the database so the study UI can be tested
// before the D1/R2 content pipeline is wired end-to-end.

export const demoTopics = [
  {
    id: 'cardiology',
    name: 'Cardiology',
    description: 'ECG interpretation and acute coronary syndromes',
    cases: [
      {
        id: 'anterior-stemi-a',
        title: 'Anterior STEMI — ECG A',
        concept: 'Anterior STEMI',
        summary: 'Classic anterior ST elevation pattern',
      },
      {
        id: 'anterior-stemi-b',
        title: 'Anterior STEMI — ECG B',
        concept: 'Anterior STEMI',
        summary: 'Hyperacute anterior changes',
      },
      {
        id: 'anterior-stemi-c',
        title: 'Anterior STEMI — ECG C',
        concept: 'Anterior STEMI',
        summary: 'Extensive anterior STEMI with an additional conduction abnormality',
      },
    ],
  },
  {
    id: 'dermatology',
    name: 'Dermatology',
    description: 'Clinical morphology and multi-image pattern recognition',
    cases: [
      {
        id: 'pityriasis-rosea',
        title: 'Pityriasis rosea',
        concept: 'Pityriasis rosea',
        summary: 'A multi-image case: herald patch followed by truncal eruption',
      },
      {
        id: 'lichen-planus',
        title: 'Lichen planus',
        concept: 'Lichen planus',
        summary: 'A multi-site case: wrist lesions and oral mucosal changes',
      },
    ],
  },
];

export const demoCases = {
  'anterior-stemi-a': {
    id: 'anterior-stemi-a',
    title: 'Anterior STEMI — ECG A',
    concept: 'Anterior STEMI',
    category: 'Cardiology',
    vignette: 'Review the ECG as a single clinical stimulus. The exact patient vignette will be replaced with the source Anki material when the package is re-imported.',
    assets: [
      {
        label: 'ECG A',
        type: 'ECG image',
        caption: 'Anterior STEMI example A',
      },
    ],
    questions: [
      {
        prompt: 'Describe this ECG.',
        answer: 'ST elevation in V1–V4 with reciprocal inferior ST depression.',
        scope: 'Case-specific answer',
      },
      {
        prompt: 'What is the diagnosis?',
        answer: 'Acute anterior ST-elevation myocardial infarction (STEMI).',
        scope: 'Concept question',
      },
      {
        prompt: 'What is the preferred reperfusion strategy?',
        answer: 'Urgent reperfusion is required; primary PCI is preferred when it can be delivered within the appropriate timeframe.',
        scope: 'Inherited STEMI question',
      },
    ],
    nextCaseId: 'anterior-stemi-b',
  },
  'anterior-stemi-b': {
    id: 'anterior-stemi-b',
    title: 'Anterior STEMI — ECG B',
    concept: 'Anterior STEMI',
    category: 'Cardiology',
    vignette: 'This second example tests whether the same reusable prompt can resolve to a different answer for a different ECG.',
    assets: [
      {
        label: 'ECG B',
        type: 'ECG image',
        caption: 'Anterior STEMI example B',
      },
    ],
    questions: [
      {
        prompt: 'Describe this ECG.',
        answer: 'Hyperacute anterior T waves with subtle anterior ST elevation.',
        scope: 'Case-specific answer',
      },
      {
        prompt: 'What is the diagnosis?',
        answer: 'Acute anterior STEMI.',
        scope: 'Concept question',
      },
      {
        prompt: 'Which coronary artery is most likely involved?',
        answer: 'The left anterior descending (LAD) coronary artery.',
        scope: 'Anterior STEMI question',
      },
    ],
    nextCaseId: 'anterior-stemi-c',
  },
  'anterior-stemi-c': {
    id: 'anterior-stemi-c',
    title: 'Anterior STEMI — ECG C',
    concept: 'Anterior STEMI',
    category: 'Cardiology',
    vignette: 'This example tests a case-specific finding that should not leak into the question set for the other anterior STEMI ECGs.',
    assets: [
      {
        label: 'ECG C',
        type: 'ECG image',
        caption: 'Anterior STEMI example C',
      },
    ],
    questions: [
      {
        prompt: 'Describe this ECG.',
        answer: 'Extensive anterior ST elevation with associated right bundle branch block.',
        scope: 'Case-specific answer',
      },
      {
        prompt: 'What additional conduction abnormality is present on this ECG?',
        answer: 'Right bundle branch block.',
        scope: 'Case-only question',
      },
      {
        prompt: 'What is the diagnosis?',
        answer: 'Extensive anterior STEMI.',
        scope: 'Concept question',
      },
    ],
    nextCaseId: 'pityriasis-rosea',
  },
  'pityriasis-rosea': {
    id: 'pityriasis-rosea',
    title: 'Pityriasis rosea',
    concept: 'Pityriasis rosea',
    category: 'Dermatology',
    vignette: 'These two images belong to one case and should be interpreted together rather than treated as separate flashcards.',
    assets: [
      {
        label: 'Image 1',
        type: 'Clinical photograph',
        caption: 'Herald patch',
      },
      {
        label: 'Image 2',
        type: 'Clinical photograph',
        caption: 'Later truncal eruption',
      },
    ],
    questions: [
      {
        prompt: 'What is the diagnosis?',
        answer: 'Pityriasis rosea.',
        scope: 'Concept question',
      },
      {
        prompt: 'Which two visual findings should be considered together in this case?',
        answer: 'The initial herald patch and the subsequent truncal eruption.',
        scope: 'Case-specific answer',
      },
      {
        prompt: 'Why are both images shown in the same case?',
        answer: 'They represent related stages/findings that are intended to be interpreted together as one clinical presentation.',
        scope: 'Demo workflow question',
      },
    ],
    nextCaseId: 'lichen-planus',
  },
  'lichen-planus': {
    id: 'lichen-planus',
    title: 'Lichen planus',
    concept: 'Lichen planus',
    category: 'Dermatology',
    vignette: 'This case tests a multi-site presentation where skin and mucosal findings are grouped into one learner-facing case.',
    assets: [
      {
        label: 'Image 1',
        type: 'Clinical photograph',
        caption: 'Wrist lesions',
      },
      {
        label: 'Image 2',
        type: 'Clinical photograph',
        caption: 'Oral mucosal lesions',
      },
    ],
    questions: [
      {
        prompt: 'What is the diagnosis?',
        answer: 'Lichen planus.',
        scope: 'Concept question',
      },
      {
        prompt: 'Which sites are represented in the images?',
        answer: 'The wrist/skin and the oral mucosa.',
        scope: 'Case-specific answer',
      },
      {
        prompt: 'Should these images be presented as one case or as alternative examples?',
        answer: 'One case, because the findings belong together and are intended to be interpreted as one presentation.',
        scope: 'Demo workflow question',
      },
    ],
    nextCaseId: 'anterior-stemi-a',
  },
};

export function getDemoCase(id) {
  return demoCases[id] ?? null;
}
