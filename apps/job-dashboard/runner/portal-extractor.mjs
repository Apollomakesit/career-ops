const portalUrlPatterns = {
  ejobs: [/ejobs\.ro\/user\/locuri-de-munca\//i, /ejobs\.ro\/locuri-de-munca\/[^/?#]+\/\d+/i],
  bestjobs: [/bestjobs\.eu\/(?:ro\/)?locuri-de-munca\//i, /bestjobs\.eu\/job\//i],
  hipo: [/hipo\.ro\/locuri-de-munca\/locuri_de_munca\//i, /hipo\.ro\/locuri-de-munca\/job\//i],
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
  'salveaza cautarea',
  'set job alert',
];

export async function extractJobsFromPage(page, { portal, sourceUrl, keyword }) {
  const links = await page.$$eval('a', anchors => anchors.map(anchor => ({
    href: anchor.href,
    text: anchor.innerText || anchor.textContent || '',
  })));
  const pageText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const jobs = normalizeExtractedLinks({ portal, sourceUrl, links, keyword });
  return jobs.map(job => ({
    ...job,
    description: job.description || summarizeAround(pageText, job.title),
  }));
}

export function normalizeExtractedLinks({ portal, sourceUrl, links = [], keyword = '' }) {
  return links
    .map(link => normalizeLink({ portal, sourceUrl, link, keyword }))
    .filter(Boolean);
}

export function dedupeJobs(jobs) {
  const seen = new Set();
  const result = [];
  for (const job of jobs) {
    const key = canonicalUrl(job.url);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...job, url: key });
  }
  return result;
}

function normalizeLink({ portal, sourceUrl, link, keyword }) {
  if (!link.href || String(link.href).trim().startsWith('#')) return null;
  const url = canonicalUrl(link.href || '', sourceUrl);
  const text = cleanText(link.text || '');
  if (!url || !looksLikeJobUrl(portal, url) || isNavigationText(text)) return null;

  const lines = text.split('\n').map(line => cleanText(line)).filter(Boolean);
  const title = firstMeaningfulLine(lines);
  if (!title || isNavigationText(title)) return null;

  return {
    url,
    portal,
    source: `portal-discovery:${portal}`,
    sourceQuery: keyword,
    company: lines[1] && !looksLikeLocation(lines[1]) ? lines[1] : '',
    title,
    location: lines.find(looksLikeLocation) || '',
    description: lines.slice(0, 6).join('\n'),
    discoveredAt: new Date().toISOString(),
    sourceUrl,
  };
}

function looksLikeJobUrl(portal, url) {
  const patterns = portalUrlPatterns[portal] || [];
  return patterns.some(pattern => pattern.test(url));
}

function firstMeaningfulLine(lines) {
  return lines.find(line => {
    const lower = line.toLowerCase();
    return line.length >= 4 && !navigationWords.some(word => lower === word || lower.includes(`[${word}]`));
  });
}

function isNavigationText(text) {
  const lower = text.toLowerCase();
  return !lower || navigationWords.some(word => lower === word || lower.includes(word) && lower.length <= word.length + 8);
}

function looksLikeLocation(line) {
  return /\b(bucuresti|bucharest|romania|românia|remote|hybrid|hibrid|cluj|iasi|iași|timisoara|timișoara|brasov|brașov|sibiu)\b/i.test(line);
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
