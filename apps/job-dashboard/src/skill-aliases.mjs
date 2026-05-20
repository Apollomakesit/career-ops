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
  'node.js': 'node.js',
  nodejs: 'node.js',
  node: 'node.js',
  'next.js': 'next.js',
  nextjs: 'next.js',
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
