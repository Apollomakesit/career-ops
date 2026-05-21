export const supportedPortals = ['ejobs', 'bestjobs', 'hipo', 'linkedin'];

const defaultKeywords = [
  'Full Stack Developer',
  'AI Engineer',
  'Backend Engineer',
  'Python Developer',
];

const romanianKeywordAliases = new Map([
  ['full stack developer', ['Dezvoltator Full Stack']],
  ['backend engineer', ['Programator Backend', 'Inginer Software']],
  ['python developer', ['Programator Python']],
  ['ai engineer', ['Specialist AI', 'Inginer AI']],
  ['automation engineer', ['Inginer Automatizari']],
  ['ai automation engineer', ['Specialist AI', 'Inginer AI', 'Inginer Automatizari']],
]);

export const defaultPortalRows = supportedPortals.map(portal => ({
  portal,
  profileUrl: portal === 'linkedin' ? 'https://www.linkedin.com/in/ioanstefanvlaicu/' : '',
  usernameEmail: '',
  notes: defaultPortalNotes(portal),
  fieldHints: {
    discovery: {
      enabled: true,
      keywords: defaultKeywords,
    },
    fieldAliases: {},
  },
}));

export function buildPortalSearchPlan({
  keywords = defaultKeywords,
  portals = supportedPortals,
  perPortalLimit = Number(process.env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL || 10),
} = {}) {
  const portalRows = normalizePortalRows(portals);

  // Build one search queue per portal, then round-robin across portals so a
  // fixed job budget is shared fairly instead of being exhausted by whichever
  // portal happens to run first.
  const perPortalQueues = portalRows.map(row => {
    const selectedKeywords = keywordsForPortal(row, keywords).slice(0, perPortalLimit);
    return selectedKeywords.map(keyword => ({
      portal: row.portal,
      keyword,
      url: searchUrlFor(row.portal, keyword),
    }));
  });

  const plan = [];
  const maxDepth = Math.max(0, ...perPortalQueues.map(queue => queue.length));
  for (let depth = 0; depth < maxDepth; depth += 1) {
    for (const queue of perPortalQueues) {
      if (queue[depth]) plan.push(queue[depth]);
    }
  }

  return plan;
}

export function normalizePortalRows(portals = supportedPortals, { includeDisabled = false } = {}) {
  const rows = portals.length > 0 ? portals : defaultPortalRows;
  return rows
    .map(item => {
      if (typeof item === 'string') {
        return { portal: item, fieldHints: {} };
      }
      return {
        ...item,
        portal: String(item.portal || '').trim().toLowerCase(),
        fieldHints: item.fieldHints || item.field_hints || {},
      };
    })
    .filter(item => supportedPortals.includes(item.portal))
    .filter(item => includeDisabled || item.fieldHints?.discovery?.enabled !== false);
}

export function searchUrlFor(portal, keyword, opts = {}) {
  const {
    city = 'Bucuresti',
    county = 'Ilfov',
    workModels = ['remote', 'hybrid', 'onsite'],
  } = opts;
  const slug = keywordSlug(keyword, portal);
  if (portal === 'ejobs') {
    return `https://www.ejobs.ro/locuri-de-munca/${slug}?judet=${encodeURIComponent(county)}&oras=${encodeURIComponent(city)}&tip_job=${mapEjobsWorkModels(workModels)}`;
  }
  if (portal === 'bestjobs') {
    return `https://www.bestjobs.eu/ro/locuri-de-munca/${slug}?location=${encodeURIComponent(city.toLowerCase())}&work_type=${mapBestjobsWorkModels(workModels)}`;
  }
  if (portal === 'hipo') {
    return `https://www.hipo.ro/locuri-de-munca/cautajob/Toate-Domeniile/${encodeURIComponent(city)}/${slug}?type_munca=${mapHipoWorkModels(workModels)}`;
  }
  if (portal === 'linkedin') {
    const linkedinLocation = /^bucuresti$/i.test(city) ? 'Bucharest, Romania' : `${city}, Romania`;
    return `https://ro.linkedin.com/jobs/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(linkedinLocation)}&f_WT=${encodeURIComponent(mapLinkedinFWT(workModels))}`;
  }
  throw new Error(`Unsupported portal: ${portal}`);
}

export function keywordSlug(keyword, portal) {
  const normalized = String(keyword)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  if (portal === 'bestjobs') {
    return encodeURIComponent(normalized.toLowerCase().replace(/\s+/g, '+'));
  }
  if (portal === 'hipo') {
    return normalized.split(/\s+/).map(capitalize).join('-');
  }
  return normalized.toLowerCase().replace(/\s+/g, '-');
}

export function keywordsFromProfile(profile = {}) {
  return expandRomanianAliases(unique([
    ...(profile.targetRoles || []),
    ...(profile.skills || []),
    'Full Stack Developer',
    'AI Engineer',
    'Backend Engineer',
    'Python Developer',
  ]).filter(Boolean));
}

function keywordsForPortal(row, fallbackKeywords) {
  const configured = row.fieldHints?.discovery?.keywords || [];
  return unique([...configured, ...fallbackKeywords]);
}

function unique(values) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

function expandRomanianAliases(values) {
  const expanded = [];
  for (const value of values) {
    expanded.push(value);
    const aliases = romanianKeywordAliases.get(String(value).trim().toLowerCase()) || [];
    expanded.push(...aliases);
  }
  return unique(expanded);
}

function mapEjobsWorkModels(workModels = []) {
  return mapWorkModels(workModels, {
    remote: 'remote',
    hybrid: 'hibrid',
    onsite: 'la-birou',
  }).join(',');
}

function mapBestjobsWorkModels(workModels = []) {
  return mapWorkModels(workModels, {
    remote: 'remote',
    hybrid: 'hybrid',
    onsite: 'on-site',
  }).join(',');
}

function mapHipoWorkModels(workModels = []) {
  return mapWorkModels(workModels, {
    remote: 'remote',
    hybrid: 'hibrid',
    onsite: 'la-sediu',
  }).join(',');
}

function mapLinkedinFWT(workModels = []) {
  return mapWorkModels(workModels, {
    onsite: '1',
    remote: '2',
    hybrid: '3',
  }).join(',');
}

function mapWorkModels(workModels, table) {
  return unique(workModels.map(model => table[String(model).trim().toLowerCase()]).filter(Boolean));
}

function capitalize(value) {
  if (/^[A-Z0-9]{2,}$/.test(value)) return value;
  return value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : value;
}

function defaultPortalNotes(portal) {
  if (portal === 'ejobs') return 'Romanian job board discovery and assisted application hints.';
  if (portal === 'bestjobs') return 'BestJobs Romania discovery and assisted application hints.';
  if (portal === 'hipo') return 'HiPo Romania discovery and assisted application hints.';
  return 'LinkedIn Romania discovery; login and final submit stay manual.';
}
