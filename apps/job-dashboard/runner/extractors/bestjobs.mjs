import { extractGenericDetail, extractListPage } from './shared.mjs';

export { extractListPage };

export async function extractDetail(page) {
  return extractGenericDetail(page, {
    descriptionSelector: '.job-description-section, body',
    salarySelectors: ['.job-salary-range', '[class*="salary"]'],
    workModelSelectors: ['.job-meta', '[class*="job-meta"]', '[class*="work"]'],
    postedSelectors: ['[class*="posted"]', '[class*="date"]'],
    employmentSelectors: ['.job-meta', '[class*="contract"]'],
  });
}
