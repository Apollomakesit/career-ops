const defaultLocationAllow = [
  'remote',
  'hybrid',
  'hibrid',
  'bucharest',
  'bucuresti',
  'bucuresti',
  'romania',
  'românia',
];

const outsideBucharestSignals = [
  'cluj',
  'iasi',
  'iași',
  'timisoara',
  'timișoara',
  'brasov',
  'brașov',
  'sibiu',
  'constanta',
  'constanța',
  'craiova',
  'oradea',
];

const genericTerms = new Set([
  'and',
  'with',
  'the',
  'for',
  'engineer',
  'specialist',
  'administrator',
  'developer',
  'software',
  'technical',
  'support',
  'full',
  'stack',
]);

const strongDomainTerms = [
  'servicenow',
  'workspace one',
  'airwatch',
  'ivanti',
  'mobileiron',
  'soti',
  'mobicontrol',
  'mdm',
  'itsm',
  'fastapi',
  'python',
  'next.js',
  'react',
  'typescript',
  'postgresql',
  'prisma',
  'playwright',
  'automation',
  'application support',
  'technical support',
  'support automation',
];

const negativeRolePatterns = [
  /\bbusiness developer\b/,
  /\bbusiness development\b/,
  /\bsales developer\b/,
  /\bsales representative\b/,
  /\bsales consultant\b/,
  /\baccount developer\b/,
  /\baccount manager\b/,
  /\bkey account\b/,
  /\bbrand ambassador\b/,
  /\bdoor to door\b/,
  /\bfield sales\b/,
  /\bhoreca\b/,
  /\bretail sales\b/,
  /\bcold outreach\b/,
  /\bcold calling\b/,
  /\bprospecting\b/,
  /\blead qualification\b/,
  /\bcasino\b/,
  /\bbetting\b/,
];

export function buildDiscoveryBudgets({
  totalMax = 1000,
  portals = [],
  perPortalMax,
} = {}) {
  const normalizedPortals = unique(portals.map(portal => String(portal || '').trim().toLowerCase()).filter(Boolean));
  const safeTotal = positiveInteger(totalMax, 1000);
  const derivedPerPortal = normalizedPortals.length > 0
    ? Math.ceil(safeTotal / normalizedPortals.length)
    : safeTotal;
  const safePerPortal = positiveInteger(perPortalMax, derivedPerPortal);
  return {
    totalMax: safeTotal,
    perPortalMax: safePerPortal,
    remainingByPortal: Object.fromEntries(normalizedPortals.map(portal => [portal, safePerPortal])),
  };
}

export function buildLocalMatchContext({ profile = {}, textSources = [] } = {}) {
  const targetRoles = arrayOfStrings(profile.targetRoles || profile.target_roles);
  const skills = arrayOfStrings(profile.skills);
  const sourceTerms = [...targetRoles, ...skills, ...textSources, ...strongDomainTerms];
  const terms = unique(sourceTerms.flatMap(term => keywordVariants(term)))
    .filter(term => term.length >= 3);
  return {
    terms,
    locationAllow: defaultLocationAllow,
  };
}

export function shouldImportJob(job = {}, context = buildLocalMatchContext()) {
  const location = locationDecision(job);
  if (!location.allowed) return { import: false, reason: 'location', details: location.details };

  const title = normalizeText(job.title);
  const text = normalizeText([
    job.title,
    job.company,
    job.location,
    job.description,
  ].join(' '));
  const matchedTerms = (context.terms || []).filter(term => text.includes(term));
  const hasStrongMatch = strongDomainTerms.some(term => text.includes(term));
  const hasRoleMatch = /application support|technical support|support engineer|product support|mdm|mobility|fastapi|full stack|backend|automation/i.test(text);
  const hasNegativeRole = negativeRolePatterns.some(pattern => pattern.test(text));
  const genericCustomerSupportTitle = /\b(customer support|customer care|client support)\b/.test(title)
    && !/\b(technical|application|product|it|software|mdm|engineer)\b/.test(title);

  if (
    hasNegativeRole
    || genericCustomerSupportTitle
    || (!hasStrongMatch && !hasRoleMatch && matchedTerms.length < 2)
  ) {
    return { import: false, reason: 'relevance', matchedTerms };
  }
  return { import: true, reason: 'matched', matchedTerms };
}

export function markPartialDescription(job = {}) {
  const marker = '[Partial listing capture - detail page unavailable]';
  const description = String(job.description || '').startsWith(marker)
    ? String(job.description || '')
    : `${marker}\n${job.description || ''}`.trim();
  const source = String(job.source || '').includes(':partial-detail')
    ? job.source
    : `${job.source || 'portal-discovery'}:partial-detail`;
  return { ...job, description, source };
}

function locationDecision(job = {}) {
  const text = normalizeText([job.location, job.title, job.description].join(' '));
  if (!text) return { allowed: true, details: 'missing-location' };
  const remote = /\b(remote|work from home|wfh|anywhere)\b/.test(text);
  const bucharest = /\b(bucharest|bucuresti|bucuresti)\b/.test(text);
  const romaniaOnly = /\b(romania|romania)\b/.test(text) && !outsideBucharestSignals.some(city => text.includes(city));
  const onsite = /\b(onsite|on-site|on site|office based|from office)\b/.test(text);
  const outsideBucharest = outsideBucharestSignals.some(city => text.includes(city));

  if (remote || bucharest || romaniaOnly) return { allowed: true, details: 'target-location' };
  if (onsite && outsideBucharest) return { allowed: false, details: 'onsite-outside-bucharest' };
  if (outsideBucharest && !remote) return { allowed: false, details: 'outside-bucharest' };
  return { allowed: false, details: 'unknown-location' };
}

function keywordVariants(value) {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  const words = normalized.split(/\s+/).filter(word => word.length >= 3 && !genericTerms.has(word));
  return [normalized, ...words];
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.+#/\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function unique(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}
