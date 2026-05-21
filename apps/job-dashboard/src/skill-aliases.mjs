export const ALIASES = new Map(Object.entries({
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  k8s: 'kubernetes',
  kubernetes: 'kubernetes',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  mysql: 'mysql',
  sql: 'sql',
  'node.js': 'node.js',
  nodejs: 'node.js',
  node: 'node.js',
  'next.js': 'next.js',
  nextjs: 'next.js',
  graphql: 'graphql',
  'rest api': 'rest api',
  'rest apis': 'rest api',
  git: 'git',
  webhooks: 'webhooks',
  webhook: 'webhooks',
  gcp: 'google cloud platform',
  'google cloud': 'google cloud platform',
  'google cloud platform': 'google cloud platform',
  'cloud run': 'cloud run',
  shopify: 'shopify',
  'shopify admin api': 'shopify admin api',
  'shopify app bridge': 'shopify app bridge',
  'shopify billing api': 'shopify billing api',
  liquid: 'liquid',
  metafields: 'metafields',
  metaobjects: 'metaobjects',
  jquery: 'jquery',
  html5: 'html5',
  css3: 'css3',
  reactjs: 'react',
  'dezvoltator full stack': 'full stack developer',
  'full stack developer': 'full stack developer',
  'full-stack developer': 'full stack developer',
  'inginer backend': 'backend engineer',
  'dezvoltator backend': 'backend engineer',
  'dezvoltator python': 'python developer',
  'inteligenta artificiala': 'artificial intelligence',
  'inteligenta artificiala generativa': 'generative ai',
  'invatare automata': 'machine learning',
  automatizari: 'automation',
  automatizare: 'automation',
  'automatizare procese': 'process automation',
  fastapi: 'fastapi',
  prisma: 'prisma',
  docker: 'docker',
  servicnow: 'servicenow',
  servicenow: 'servicenow',
  mdm: 'mdm',
  'workspace one': 'workspace one',
  'workspace one/airwatch': 'workspace one',
  'vmware workspace one/airwatch': 'workspace one',
  airwatch: 'workspace one',
  ivanti: 'ivanti',
  'ivanti neurons': 'ivanti',
  dezvoltator: 'developer',
  programator: 'programmer',
  'programator python': 'python developer',
  'programator backend': 'backend engineer',
  'inginer software': 'software engineer',
  'inginer ai': 'ai engineer',
  'specialist ai': 'ai engineer',
  'inginer automatizari': 'automation engineer',
  experienta: 'experience',
  cerinte: 'requirements',
  responsabilitati: 'responsibilities',
  hibrid: 'hybrid',
  'la birou': 'onsite',
  'la sediu': 'onsite',
  'de la distanta': 'remote',
  telemunca: 'remote',
}));

export function normalize(token = '') {
  const normalized = String(token || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.+#/-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES.get(normalized) || normalized;
}

export function tokenize(text = '') {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const tokens = normalized
    .split(/[^\p{L}\p{N}.+#/-]+/u)
    .map(normalize)
    .filter(token => token.length >= 2);
  return [...new Set(tokens)];
}
