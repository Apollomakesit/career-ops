export const supportedPortals = ['ejobs', 'bestjobs', 'hipo', 'linkedin'];

const defaultKeywords = [
  'Technical Support',
  'Application Support',
  'MDM',
  'Python FastAPI',
  'Full Stack Developer',
  'AI Automation Engineer',
];

export function buildPortalSearchPlan({
  keywords = defaultKeywords,
  portals = supportedPortals,
  perPortalLimit = Number(process.env.PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL || 6),
} = {}) {
  const selectedKeywords = unique(keywords).slice(0, perPortalLimit);
  const plan = [];

  for (const portal of portals.filter(item => supportedPortals.includes(item))) {
    for (const keyword of selectedKeywords) {
      plan.push({
        portal,
        keyword,
        url: searchUrlFor(portal, keyword),
      });
    }
  }

  return plan;
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

function unique(values) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

function capitalize(value) {
  if (/^[A-Z0-9]{2,}$/.test(value)) return value;
  return value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : value;
}
