const portalUrlPatterns = {
  ejobs: [
    /ejobs\.ro\/user\/locuri-de-munca\//i,
    /ejobs\.ro\/locuri-de-munca\/[^/?#]+\/\d+/i,
  ],
  bestjobs: [
    /bestjobs\.eu\/(?:ro\/)?locuri-de-munca\/[^/?#]+(?:\/\d+)?/i,
    /bestjobs\.eu\/loc-de-munca\/[^/?#]+/i,
    /bestjobs\.eu\/(?:ro\/)?job\//i,
  ],
  hipo: [
    /hipo\.ro\/locuri-de-munca\/locuri_de_munca\//i,
    /hipo\.ro\/locuri-de-munca\/job\//i,
  ],
  linkedin: [/linkedin\.com\/jobs\/view\//i],
};

const navigationWords = [
  'login',
  'intra in cont',
  'cont nou',
  'pagina urmatoare',
  'urmatoarea',
  'aplica',
  'apply',
  'aplica rapid',
  'salveaza cautarea',
  'set job alert',
  'inscriere',
  'detalii',
  'vezi job',
  'home',
  'acasa',
  'myhipo',
  'adauga cv',
  'adaugă cv',
  'top talents romania',
];

// Promoted-listing badges that appear as their own card line before the company.
const badgeWords = ['premium', 'promovat', 'promoted', 'nou', 'new', 'urgent', 'recomandat', 'featured', 'hot', 'top'];

const monthWords = /\b(ian|feb|mar|apr|mai|iun|iul|aug|sep|oct|nov|noi|dec|january|february|march|april|may|june|july|august|september|october|november|december)\w*\b/i;

// Walk up from a job anchor to the smallest reasonable "card" container and
// return its text plus a company hint, all evaluated inside the browser page.
const cardExtractorScript = `(() => {
  function climbToCard(anchor) {
    let el = anchor;
    let best = anchor;
    for (let i = 0; i < 8 && el.parentElement; i++) {
      el = el.parentElement;
      const text = (el.innerText || '').trim();
      if (text.length > 1100) break;
      if (text.length >= 24) best = el;
    }
    return best;
  }
  return [...document.querySelectorAll('a[href]')].map(anchor => {
    const card = climbToCard(anchor);
    const companyLink = card.querySelector('a[href*="/company/"], a[href*="/companie/"], a[href*="/companii/"]');
    return {
      href: anchor.href,
      text: (anchor.innerText || anchor.textContent || '').trim(),
      cardText: (card.innerText || '').trim(),
      companyHint: companyLink ? (companyLink.innerText || '').trim() : '',
    };
  });
})()`;

export async function extractJobsFromPage(page, { portal, sourceUrl, keyword }) {
  const links = await page.evaluate(cardExtractorScript);
  const pageText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const jobs = normalizeExtractedLinks({ portal, sourceUrl, links, keyword });
  return jobs.map(job => ({
    ...job,
    description: job.description || summarizeAround(pageText, job.title),
  }));
}

export async function extractDetailForPortal(page, portal) {
  const extractor = await import(`./extractors/${portal}.mjs`);
  return extractor.extractDetail(page);
}

export function normalizeExtractedLinks({ portal, sourceUrl, links = [], keyword = '' }) {
  return links
    .map(link => normalizeLink({ portal, sourceUrl, link, keyword }))
    .filter(Boolean);
}

export function dedupeJobs(jobs) {
  const seen = new Map();
  for (const job of jobs) {
    const key = canonicalUrl(job.url);
    const existing = seen.get(key);
    // Keep the record with the most complete data (company + location).
    if (!existing || recordScore(job) > recordScore(existing)) {
      seen.set(key, { ...job, url: key });
    }
  }
  return [...seen.values()];
}

export function cleanJobDetailText(text, { maxLength = 12000 } = {}) {
  const lines = splitLines(text)
    .filter(line => !isDetailNoise(line))
    .filter(line => line.length <= 900);
  const deduped = [];
  const seen = new Set();
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }
  return deduped.join('\n').slice(0, maxLength).trim();
}

export function mergeJobDetail(job = {}, detailText = '') {
  const cleaned = cleanJobDetailText(detailText);
  const current = cleanText(job.description || '');
  if (cleaned.length < Math.max(240, current.length)) {
    return job;
  }
  const source = String(job.source || '').includes(':detail')
    ? job.source
    : `${job.source || 'portal-discovery'}:detail`;
  return {
    ...job,
    description: cleaned,
    source,
  };
}

function recordScore(job) {
  return (job.company ? 2 : 0) + (job.location ? 1 : 0) + (job.title ? 1 : 0);
}

function normalizeLink({ portal, sourceUrl, link, keyword }) {
  if (!link.href || String(link.href).trim().startsWith('#')) return null;
  const url = canonicalUrl(link.href || '', sourceUrl);
  if (!url || !looksLikeJobUrl(portal, url)) return null;

  const anchorLines = splitLines(link.text || '');
  const cardLines = splitLines(link.cardText || link.text || '');
  const companyHint = cleanText(link.companyHint || '');

  const title = pickTitle({ anchorLines, cardLines });
  if (!title || isNavigationText(title)) return null;

  const company = pickCompany({ portal, url, cardLines, companyHint, title });
  const location = cardLines.find(line => (
    line !== title
    && line !== company
    && line.length <= 70
    && looksLikeLocation(line)
  )) || '';

  return {
    url,
    portal,
    source: `portal-discovery:${portal}`,
    sourceQuery: keyword,
    company,
    title,
    location,
    description: cardLines.filter(line => line !== title).slice(0, 6).join('\n'),
    discoveredAt: new Date().toISOString(),
    sourceUrl,
  };
}

function looksLikeJobUrl(portal, url) {
  const patterns = portalUrlPatterns[portal] || [];
  if (!patterns.some(pattern => pattern.test(url))) return false;
  if (looksLikeSearchOnlyUrl(portal, url)) return false;
  // HiPo's job-URL pattern also covers recruitment-event pages (e.g. the
  // "Top Talents Romania" widget linked from every page); exclude those.
  if (portal === 'hipo' && /\/(inscrie|top-talents|eveniment)/i.test(url)) return false;
  return true;
}

function looksLikeSearchOnlyUrl(portal, url) {
  if (portal === 'ejobs') return /\/locuri-de-munca\/[^/?#]+(?:\?.*)?$/i.test(url) && !/\/\d+(?:[/?#]|$)/.test(url);
  if (portal === 'bestjobs') return /\/locuri-de-munca\/[^/?#]+(?:\?.*)?$/i.test(url) && !/\/\d+(?:[/?#]|$)/.test(url);
  return false;
}

function pickTitle({ anchorLines, cardLines }) {
  // The anchor text is the cleanest title source when it is a single line.
  const anchorTitle = firstMeaningfulLine(anchorLines);
  if (anchorTitle && !looksLikeDate(anchorTitle) && !looksLikeLocation(anchorTitle) && !looksLikeSalary(anchorTitle)) {
    return anchorTitle;
  }
  return firstMeaningfulLine(cardLines.filter(line => !looksLikeDate(line))) || '';
}

function pickCompany({ portal, url, cardLines, companyHint, title }) {
  if (companyHint && !isNavigationText(companyHint) && companyHint.length <= 80) {
    return companyHint;
  }

  const candidate = cardLines.find(line => (
    line !== title
    && line.length >= 2
    && line.length <= 80
    && !looksLikeDate(line)
    && !looksLikeLocation(line)
    && !looksLikeSalary(line)
    && !isNavigationText(line)
    && !badgeWords.includes(line.toLowerCase())
  ));
  if (candidate) return candidate;

  if (portal === 'hipo') {
    const match = url.match(/\/locuri_de_munca\/\d+\/([^/]+)\//i);
    if (match) {
      return decodeURIComponent(match[1]).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

function splitLines(text) {
  return String(text)
    .split('\n')
    .map(line => cleanText(line))
    .filter(Boolean);
}

function firstMeaningfulLine(lines) {
  return lines.find(line => {
    const lower = line.toLowerCase();
    return line.length >= 4 && !navigationWords.some(word => lower === word || lower.includes(`[${word}]`));
  });
}

function isNavigationText(text) {
  const lower = String(text).toLowerCase().trim();
  return !lower || navigationWords.some(word => lower === word || (lower.includes(word) && lower.length <= word.length + 8));
}

function isDetailNoise(line) {
  const value = String(line || '').trim();
  const lower = value.toLowerCase();
  if (!value) return true;
  if (value.length <= 2) return true;
  if (/^(accept|reject|manage)?\s*(all\s*)?(cookies|cookie settings)$/i.test(value)) return true;
  if (/^(login|log in|sign in|register|create account|careers|home|menu|search|back|next)$/i.test(value)) return true;
  if (/^(apply|aplica|aplica rapid|save job|set job alert|similar jobs|recommended jobs)$/i.test(value)) return true;
  if (/privacy policy|terms of use|all rights reserved|cookie policy|newsletter/i.test(value)) return true;
  if (navigationWords.some(word => lower === word)) return true;
  return false;
}

function looksLikeLocation(line) {
  return /\b(bucuresti|bucurești|bucharest|romania|românia|remote|hybrid|hibrid|on-site|on site|cluj|iasi|iași|timisoara|timișoara|brasov|brașov|sibiu|constanta|constanța|craiova|oradea|europe|emea)\b/i.test(line);
}

function looksLikeDate(line) {
  const value = String(line).trim();
  if (/^\d{1,2}\s+\S+\s+\d{4}$/.test(value)) return true;
  if (/^(acum|azi|ieri|today|yesterday)\b/i.test(value)) return true;
  return /\d/.test(value) && monthWords.test(value) && value.length <= 24;
}

function looksLikeSalary(line) {
  const value = String(line);
  if (!/\d/.test(value)) return false;
  return /(\bron\b|\beur\b|\blei\b|\busd\b|estimare|salar|brut|net\b|gross|\d[\d.\s,]*-\s*\d)/i.test(value);
}

function cleanText(value) {
  return String(value).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

function canonicalUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(trk|ref|utm_|originalSubdomain)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\?$/, '');
  } catch {
    return '';
  }
}

function summarizeAround(text, title) {
  const body = cleanText(text).slice(0, 12000);
  const index = body.toLowerCase().indexOf(String(title || '').toLowerCase());
  if (index === -1) return body.slice(0, 1200);
  return body.slice(Math.max(0, index), index + 1200);
}
