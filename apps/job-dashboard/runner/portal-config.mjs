export const supportedPortals = ['ejobs', 'bestjobs', 'hipo', 'linkedin'];

const defaultKeywords = [
  'Technical Support',
  'Application Support',
  'MDM',
  'Python FastAPI',
  'Full Stack Developer',
  'AI Automation Engineer',
];

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
  perPortalLimit = Number(process.env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL || 6),
} = {}) {
  const portalRows = normalizePortalRows(portals);
  const plan = [];

  for (const row of portalRows) {
    const selectedKeywords = keywordsForPortal(row, keywords).slice(0, perPortalLimit);
    for (const keyword of selectedKeywords) {
      plan.push({
        portal: row.portal,
        keyword,
        url: searchUrlFor(row.portal, keyword),
      });
    }
  }

  return plan;
}

export function normalizePortalRows(portals = supportedPortals) {
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
    .filter(item => item.fieldHints?.discovery?.enabled !== false);
}

export function searchUrlFor(portal, keyword) {
  const slug = keywordSlug(keyword, portal);
  if (portal === 'ejobs') return `https://www.ejobs.ro/locuri-de-munca/${slug}`;
  if (portal === 'bestjobs') return `https://www.bestjobs.eu/ro/locuri-de-munca/${slug}`;
  if (portal === 'hipo') return `https://www.hipo.ro/locuri-de-munca/cautajob/Toate-Domeniile/Toate-Orasele/${slug}`;
  if (portal === 'linkedin') {
    return `https://ro.linkedin.com/jobs/search?keywords=${encodeURIComponent(keyword)}&location=Romania`;
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
  return unique([
    ...(profile.targetRoles || []),
    'Technical Support',
    'Application Support',
    'MDM',
    'Workspace ONE',
    'Python FastAPI',
    'Full Stack Developer',
    'Automation Engineer',
  ]).filter(Boolean);
}

function keywordsForPortal(row, fallbackKeywords) {
  const configured = row.fieldHints?.discovery?.keywords || [];
  return unique(configured.length > 0 ? configured : fallbackKeywords);
}

function unique(values) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
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
