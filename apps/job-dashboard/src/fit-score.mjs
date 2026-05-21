const CATEGORY_KEYWORDS = {
  support_mdm: [
    'technical support',
    'application support',
    'product support',
    'support engineer',
    'support specialist',
    'mdm',
    'mobile device management',
    'workspace one',
    'airwatch',
    'ivanti',
    'mobileiron',
    'soti',
    'servicenow',
    'l2 support',
    'l3 support',
  ],
  developer: [
    'python',
    'fastapi',
    'backend',
    'back-end',
    'software developer',
    'software engineer',
    'full stack',
    'full-stack',
    'react',
    'next.js',
    'typescript',
    'postgresql',
  ],
  automation_ai: [
    'automation',
    'ai automation',
    'rpa',
    'playwright',
    'workflow automation',
    'agent',
    'llm',
    'ai engineer',
  ],
};

const DEFAULT_EXPECTED_SKILLS = {
  support_mdm: ['ServiceNow', 'Workspace ONE', 'AirWatch', 'Ivanti', 'SOTI', 'Jira', 'Android', 'iOS'],
  developer: ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'React', 'Next.js', 'TypeScript', 'CI/CD'],
  automation_ai: ['Python', 'Playwright', 'ServiceNow', 'Workflow Automation', 'AI Evaluation', 'FastAPI'],
};

const LOCATION_KEYWORDS = [
  'romania',
  'românia',
  'bucharest',
  'bucuresti',
  'bucurești',
  'remote',
  'hybrid',
  'hibrid',
  'europe',
  'emea',
  'eu',
];

const RISK_PATTERNS = [
  { flag: 'internship_or_student', patterns: ['internship', 'intern ', 'student', 'practică', 'practica'] },
  { flag: 'pure_sales', patterns: ['door to door', 'field sales', 'cold calling', 'sales targets'] },
  { flag: 'unrelated_domain', patterns: ['casino', 'gambling', 'crypto', 'web3'] },
];

export function scoreJobFit(job, profile = {}) {
  const text = normalize([
    job?.title,
    job?.company,
    job?.location,
    job?.description,
  ].filter(Boolean).join(' '));

  const categoryScores = Object.fromEntries(
    Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => [
      category,
      keywords.filter(keyword => text.includes(normalize(keyword))).length,
    ]),
  );

  const category = chooseCategory(categoryScores);
  const expectedSkills = DEFAULT_EXPECTED_SKILLS[category] || [];
  const hasProfileSkills = Array.isArray(profile.skills) && profile.skills.length > 0;
  const profileSkills = hasProfileSkills ? profile.skills : expectedSkills;
  const matchedSkills = unique(
    profileSkills.filter(skill => text.includes(normalize(skill))),
  );
  // Gaps the candidate actually has: category-expected skills that don't appear
  // in their profile. Previously this listed expected skills missing from the
  // JD text, which surfaced user-held skills like "Workspace ONE" as gaps
  // whenever a posting didn't reprint them.
  const missingSkills = hasProfileSkills
    ? expectedSkills.filter(skill => !profileSkills.some(p => sameSkill(p, skill)))
    : expectedSkills.filter(skill => !matchedSkills.some(match => sameSkill(match, skill)));
  const riskFlags = RISK_PATTERNS
    .filter(({ patterns }) => patterns.some(pattern => text.includes(normalize(pattern))))
    .map(({ flag }) => flag);

  let score = 25;
  score += Math.min(30, categoryScores[category] * 8);
  score += Math.min(25, matchedSkills.length * 4);
  score += locationScore(job?.location || '');
  score -= riskFlags.length * 18;

  if (category === 'support_mdm') score += 8;
  if (category === 'developer' && categoryScores.support_mdm === 0) score -= 4;
  if (text.includes('senior') && category === 'developer' && matchedSkills.length < 5) score -= 8;

  score = clamp(Math.round(score), 0, 100);

  return {
    score,
    category,
    matchedSkills,
    missingSkills,
    riskFlags,
    recommendation: recommendationFor(score),
    reasons: buildReasons({ category, matchedSkills, missingSkills, riskFlags, location: job?.location || '' }),
  };
}

function chooseCategory(categoryScores) {
  const sorted = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]);
  if (sorted[0]?.[1] > 0) return sorted[0][0];
  return 'developer';
}

function locationScore(location) {
  const lower = normalize(location);
  if (!lower) return 5;
  return LOCATION_KEYWORDS.some(keyword => lower.includes(keyword)) ? 12 : 0;
}

function recommendationFor(score) {
  if (score >= 85) return 'strong_apply';
  if (score >= 65) return 'apply';
  if (score >= 45) return 'review';
  return 'skip';
}

function buildReasons({ category, matchedSkills, missingSkills, riskFlags, location }) {
  const reasons = [`Role category: ${category.replace('_', ' / ')}`];
  if (matchedSkills.length > 0) reasons.push(`Matched skills: ${matchedSkills.join(', ')}`);
  if (missingSkills.length > 0) reasons.push(`Profile gaps vs role: ${missingSkills.join(', ')}`);
  if (location) reasons.push(`Location: ${location}`);
  if (riskFlags.length > 0) reasons.push(`Risk flags: ${riskFlags.join(', ')}`);
  return reasons;
}

function normalize(value) {
  return String(value || '').toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

function sameSkill(left, right) {
  return normalize(left) === normalize(right);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
