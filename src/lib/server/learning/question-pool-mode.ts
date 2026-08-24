import { resolveQuestionPool } from './questions.js';

export const QUESTION_POOL_MODES = ['core', 'expanded'] as const;

export type QuestionPoolMode = (typeof QUESTION_POOL_MODES)[number];

type ResolverInput = NonNullable<Parameters<typeof resolveQuestionPool>[0]>;

export const QUESTION_POOL_MODE_DETAILS = {
  core: {
    label: 'Original questions',
    description: 'Questions curated specifically for this Case.'
  },
  expanded: {
    label: 'Expanded Learning',
    description: 'Includes reusable questions relevant to this Case.'
  }
} as const satisfies Record<QuestionPoolMode, { label: string; description: string }>;

export class QuestionPoolUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionPoolUnavailableError';
  }
}

export function isQuestionPoolMode(value: unknown): value is QuestionPoolMode {
  return value === 'core' || value === 'expanded';
}

export function assertQuestionPoolMode(value: unknown): asserts value is QuestionPoolMode {
  if (!isQuestionPoolMode(value)) {
    throw new TypeError('Question pool mode must be core or expanded.');
  }
}

/**
 * Select source inputs before duplicate-Prompt precedence is resolved.
 *
 * Core intentionally excludes reusable Topic, ancestor Topic, Shared Question,
 * and Asset Question inputs so none of them can override a Case-owned Prompt
 * before the narrower pool is resolved.
 */
export function resolveQuestionPoolForMode(mode: QuestionPoolMode, input: ResolverInput = {}) {
  assertQuestionPoolMode(mode);
  if (mode === 'expanded') return resolveQuestionPool(input);

  return resolveQuestionPool({
    caseQuestions: input.caseQuestions ?? [],
    stimulusGroupQuestions: input.stimulusGroupQuestions ?? [],
    stimulusOptionQuestions: input.stimulusOptionQuestions ?? []
  });
}
