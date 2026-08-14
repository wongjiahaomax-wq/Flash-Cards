import { error } from '@sveltejs/kit';
import { getDemoCase } from '$lib/demo-content.js';

export function load({ params }) {
  const caseStudy = getDemoCase(params['review-id']);

  if (!caseStudy) {
    throw error(404, 'Demo case not found');
  }

  return { caseStudy };
}
