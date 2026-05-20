import { extractGenericDetail, extractListPage } from './shared.mjs';

export { extractListPage };

export async function extractDetail(page) {
  return extractGenericDetail(page, {
    salarySelectors: ['.job-salary', '[class*="salary"]'],
    workModelSelectors: ['.job-tags', '.tags-row', '[class*="tag"]'],
    postedSelectors: ['[class*="posted"]', '[class*="date"]'],
    employmentSelectors: ['.job-tags', '.tags-row'],
  });
}
