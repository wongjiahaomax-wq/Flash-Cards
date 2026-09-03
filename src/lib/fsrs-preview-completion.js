// The local-only FSRS preview and learner Study now share the same active-Review
// completion owner. Keep this named export as a compatibility surface for the
// accepted preview implementation and its regression tests.
export { completeStudyRunRequest as completeFsrsPreviewRequest } from './study-run-completion.js';
