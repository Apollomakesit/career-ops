import { extractGenericDetail, extractListPage } from './shared.mjs';

export { extractListPage };

export async function extractDetail(page) {
  return extractGenericDetail(page, {
    descriptionSelector: '#JobDescription, body',
    salarySelectors: ['.salary-box', '[class*="salary"]'],
    workModelSelectors: ['.work-type', '.job-tags', '[class*="work"]'],
    postedSelectors: ['[class*="posted"]', '[class*="date"]'],
    employmentSelectors: ['.work-type', '.job-tags'],
  });
}
