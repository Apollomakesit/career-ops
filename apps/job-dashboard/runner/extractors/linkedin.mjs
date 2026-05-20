import { extractGenericDetail, extractListPage } from './shared.mjs';

export { extractListPage };

export async function extractDetail(page) {
  return extractGenericDetail(page, {
    descriptionSelector: '.show-more-less-html__markup, body',
    salarySelectors: ['.compensation__salary', '[class*="salary"]'],
    workModelSelectors: ['.workplace-type', '[class*="workplace"]'],
    postedSelectors: ['time', '[class*="posted"]'],
    employmentSelectors: ['[class*="employment"]', '[class*="job-criteria"]'],
  });
}
