import { cleanJobDetailText, extractJobsFromPage } from '../portal-extractor.mjs';
import { parseEmploymentType } from '../parsers/employment-type.mjs';
import { parsePostedDate } from '../parsers/posted-date.mjs';
import { parseSalary } from '../parsers/salary.mjs';
import { parseWorkModel } from '../parsers/work-model.mjs';

export async function extractListPage(page, context) {
  return extractJobsFromPage(page, context);
}

export async function extractGenericDetail(page, {
  descriptionSelector = 'body',
  salarySelectors = [],
  workModelSelectors = [],
  postedSelectors = [],
  employmentSelectors = [],
} = {}) {
  await expandHiddenJobText(page);
  const bodyText = await page.locator(descriptionSelector).innerText({ timeout: 8000 })
    .catch(() => page.locator('body').innerText({ timeout: 8000 }).catch(() => ''));
  const rawDescription = cleanJobDetailText(bodyText);
  const description = trimToJobDetailText(rawDescription);
  const requirements_text = sectionAfter(description, requirementHeadings);
  const responsibilities_text = sectionAfter(description, responsibilityHeadings);
  const salaryRaw = await firstText(page, salarySelectors) || lineMatching(description, /(\d[\d.\s,]*\s*-\s*\d|eur|ron|lei|usd|\$|€|salari)/i);
  const workModelRaw = await firstText(page, workModelSelectors);
  const postedRaw = await firstText(page, postedSelectors);
  const employmentTypeRaw = await firstText(page, employmentSelectors);
  const salary = parseSalary(salaryRaw);

  // Scan ALL captured text for work model / employment / posted date instead
  // of short-circuiting on the first non-empty selector hit. Earlier we'd take
  // `.job-meta` text like "Limbi vorbite" as authoritative and miss the
  // "Hybrid" further down the description.
  const detailText = [workModelRaw, employmentTypeRaw, description].filter(Boolean).join('\n');
  const postedText = [postedRaw, description].filter(Boolean).join('\n');

  return {
    description,
    requirements_text,
    responsibilities_text,
    salaryRaw,
    workModelRaw,
    postedRaw,
    employmentTypeRaw,
    salary_min: salary.min,
    salary_max: salary.max,
    salary_currency: salary.currency,
    salary_period: salary.period,
    work_model: parseWorkModel(detailText),
    posted_date: parsePostedDate(postedRaw) || parsePostedDate(postedText),
    employment_type: parseEmploymentType(detailText),
  };
}

export async function expandHiddenJobText(page, { rounds = 3 } = {}) {
  let total = 0;
  for (let round = 0; round < rounds; round += 1) {
    const clicked = await page.evaluate(expandHiddenJobTextInPage).catch(() => 0);
    total += clicked;
    if (!clicked) break;
    await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
  }
  return total;
}

async function firstText(page, selectors) {
  for (const selector of selectors) {
    const text = await page.locator(selector).first().innerText({ timeout: 1500 }).catch(() => '');
    if (text.trim()) return text.trim();
  }
  return '';
}

const requirementHeadings = [
  'cerinte',
  'cerinte job',
  'requirements',
  'what you bring',
  'must have',
  'qualifications',
  'calificari',
  'profilul candidatului',
  'ce cautam',
];

const responsibilityHeadings = [
  'responsabilitati',
  'atributii',
  'responsibilities',
  'what you will do',
  'your role',
  'job description',
  'descrierea jobului',
  'ce vei face',
  'rolul tau',
];

const otherHeadings = [
  'about',
  'about us',
  'benefits',
  'beneficii',
  'we offer',
  'ce oferim',
  'oferta',
  'company',
  'companie',
  'similar jobs',
  'joburi similare',
];

const allSectionHeadings = [...requirementHeadings, ...responsibilityHeadings, ...otherHeadings];
const detailStartHeadings = [
  'about the job',
  'descrierea jobului',
  'descriere job',
  'job description',
  ...requirementHeadings,
  ...responsibilityHeadings,
];
const detailStopHeadings = [
  'about the company',
  'despre companie',
  'seniority level',
  'employment type',
  'job function',
  'industries',
  'referrals increase',
  'get notified',
  'people also viewed',
  'similar jobs',
  'show more jobs like this',
  'joburi similare',
  'mai mult despre',
  'locuri de munca in',
  'vezi toate',
  'jobul urmator',
];

export function trimToJobDetailText(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return '';

  const start = lines.findIndex(line => headingMatches(line, detailStartHeadings));
  let selected = start === -1 ? lines : lines.slice(start);
  const stop = selected.findIndex((line, index) => index > 0 && headingMatches(line, detailStopHeadings));
  if (stop !== -1) selected = selected.slice(0, stop);

  return selected.join('\n').trim() || String(text || '').trim();
}

function sectionAfter(text, headings) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const start = lines.findIndex(line => headingMatches(line, headings));
  if (start === -1) return '';
  const collected = [];
  for (const line of lines.slice(start + 1)) {
    if (headingMatches(line, allSectionHeadings)) break;
    collected.push(line);
  }
  return collected.join('\n').trim();
}

function headingMatches(line, headings) {
  const heading = normalizeHeading(line);
  return headings.some(candidate => heading === candidate || heading.startsWith(`${candidate}:`));
}

function normalizeHeading(line) {
  return String(line || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}: -]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lineMatching(text, pattern) {
  return String(text || '').split(/\r?\n/).find(line => pattern.test(line)) || '';
}

function expandHiddenJobTextInPage() {
  const expandLabels = [
    'show more',
    'see more',
    'read more',
    'view more',
    'more details',
    'show full description',
    'see full description',
    'vezi mai mult',
    'afiseaza mai mult',
    'arata mai mult',
    'citeste mai mult',
    'detalii complete',
    'vezi descrierea completa',
    'mai mult',
  ];
  const denyLabels = [
    'apply',
    'aplica',
    'salveaza',
    'save',
    'login',
    'log in',
    'sign in',
    'similar jobs',
    'joburi similare',
    'cookie',
    'cookies',
  ];

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  }

  function isSafeExpandable(element) {
    const label = normalize([
      element.innerText,
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
    ].filter(Boolean).join(' '));
    if (!label || label.length > 100) return false;
    if (denyLabels.some(item => label.includes(item))) return false;
    if (!expandLabels.some(item => label === item || label.includes(item))) return false;

    const tag = element.tagName.toLowerCase();
    const href = element.getAttribute('href') || '';
    const ariaExpanded = element.getAttribute('aria-expanded');
    if (tag === 'a' && href && !href.startsWith('#') && !href.startsWith('javascript:') && ariaExpanded === null) {
      return false;
    }
    return isVisible(element);
  }

  const selectors = [
    'button',
    '[role="button"]',
    'summary',
    'a',
    '[aria-expanded="false"]',
    '[class*="show-more"]',
    '[class*="read-more"]',
    '[class*="expand"]',
  ].join(',');

  let clicked = 0;
  for (const element of [...document.querySelectorAll(selectors)]) {
    if (clicked >= 8) break;
    if (!isSafeExpandable(element)) continue;
    try {
      element.click();
      clicked += 1;
    } catch {
      // Ignore stale or intercepted controls and keep trying siblings.
    }
  }
  for (const details of document.querySelectorAll('details:not([open])')) {
    details.open = true;
    clicked += 1;
  }
  return clicked;
}
