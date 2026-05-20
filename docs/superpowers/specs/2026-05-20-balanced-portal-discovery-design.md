# Balanced Portal Discovery Design

## Goal

Optimize the local job dashboard discovery flow so Playwright detects around
1000 relevant jobs before AI ranking, with roughly 250 imported candidates from
each configured portal: eJobs, BestJobs, HiPo, and LinkedIn.

Discovery must stay non-AI. AI is used only after Playwright has detected and
imported jobs, through the existing AI scoring runner.

## Requirements

- Use a default total discovery budget of 1000 jobs.
- Use a default per-portal budget of 250 jobs.
- Include detected jobs from all four portals whenever each portal has enough
  matching results available.
- Filter discovered jobs before import for Ioan's target location policy:
  remote, Romania, Bucharest, or hybrid Bucharest.
- Filter discovered jobs before import for resume/profile relevance using local
  keyword and skill matching from `cv.md`, `config/profile.yml`, and dashboard
  profile data.
- For every imported job, Playwright must attempt to open the job detail page
  and capture the full job description, including responsibilities,
  requirements, qualifications, benefits, and technology sections when present.
- The runner should not import jobs with only title, company, location, and work
  mode unless the detail page cannot be read. In that fallback case, the job
  source/description must make the partial capture clear enough for review.
- AI scoring remains a separate step after discovery.

## Architecture

The dashboard server and local runner boundaries stay the same. The change is
inside the discovery path:

1. `portal-config.mjs` builds a balanced search plan for the four portals.
2. `portal-discovery-runner.mjs` tracks a separate import budget per portal.
3. `portal-extractor.mjs` extracts candidate links from search result pages.
4. A new detail extraction step opens each candidate URL with Playwright before
   import and reads a fuller description from the page.
5. Local filters decide whether a candidate should be imported.
6. Imported jobs enter the existing dashboard API and deterministic fit scoring.
7. The user later runs `AI Score Jobs`, which uses AI only on imported jobs.

## Components

### Portal Budgets

Discovery should use a per-portal counter instead of a single global stop
condition. The runner may still stop once all configured portals hit their
budgets or no more configured searches remain.

Environment variables should remain available for tuning:

- `PORTAL_DISCOVERY_MAX_JOBS`, default `1000`
- `PORTAL_DISCOVERY_PER_PORTAL_MAX_JOBS`, default derived from total budget and
  number of portals, normally `250`
- `PORTAL_DISCOVERY_KEYWORDS_PER_PORTAL`, default should be high enough to feed
  the larger budget

### Local Match Filtering

Filtering should run before import and should be explainable without AI:

- Location allow: remote, Romania, Bucharest, Bucuresti, hybrid Bucharest, or
  country-wide Romania.
- Location block: clearly onsite outside Bucharest or outside Romania unless
  marked remote.
- Skill/title relevance: target role keywords and skills from dashboard profile,
  `config/profile.yml`, and `cv.md`.
- Strong support/MDM/application support matches should pass even when developer
  keywords are absent.

### Full Description Capture

Each candidate selected from search results should be enriched by visiting its
detail URL. The extractor should prefer visible main-content text and remove
obvious navigation, footer, cookie, login, and related-job noise.

The stored `description` should include the job's actual content, not just a
listing snippet. Good captures usually include sections like:

- About the role
- Responsibilities
- Requirements
- Qualifications
- Benefits
- Tech stack
- Work model or location policy

If a portal blocks detail content behind login, bot checks, or a failed page
load, the runner may import the listing snippet only when it passes local
filters, but it should mark the capture as partial in the description or source.

### Portal Coverage

The runner should not exhaust the whole 1000-job budget on one or two portals.
It should preserve a fair share for all portals by counting imports per portal
and continuing through the search plan until every active portal has either:

- reached its configured budget, or
- exhausted configured searches without enough matching jobs.

## Data Flow

1. User starts the local stack and opens `http://127.0.0.1:3000/`.
2. User clicks Operations -> Find Jobs.
3. The runner opens visible Playwright with the persistent automation profile.
4. The runner visits search pages round-robin across eJobs, BestJobs, HiPo, and
   LinkedIn.
5. Search pages yield candidate job URLs.
6. Candidate URLs are deduplicated, checked against each portal budget, and
   opened as detail pages.
7. Detail text is extracted and combined with title, company, portal, URL,
   location, work mode, and source query.
8. Local relevance and location filters decide whether to import.
9. Imported jobs are posted to `/api/jobs`.
10. The user separately runs Operations -> AI Score Jobs.

## Error Handling

- A failing portal should not stop the other portals.
- A failing detail page should not stop the whole run.
- Login, CAPTCHA, and 2FA remain manual in the visible browser.
- The runner should log counts for imported, skipped by location, skipped by
  relevance, skipped as duplicate, detail-captured, and partial-detail jobs.
- Final output should show per-portal counts so the user can see whether each
  portal contributed jobs.

## Testing

Tests should cover:

- Per-portal budget allocation from a 1000-job total.
- Search plan fairness across the four portals.
- Location filtering for remote, Bucharest, Romania, and outside-location cases.
- Resume/profile keyword extraction for Ioan's support, MDM, developer, and
  automation targets.
- Detail-page text cleanup that keeps responsibilities and requirements while
  dropping navigation noise.
- Discovery runner import behavior that respects per-portal caps.
- AI scoring remains separate from discovery.

## Verification

After implementation:

- Run `npm test --prefix apps/job-dashboard`.
- Start the local dashboard at `http://127.0.0.1:3000/`.
- Verify `/api/health`.
- Verify the Operations page can reach the local runner.
- Run or smoke-test discovery with a small budget first.
- Confirm runner logs show all four portals, detail capture attempts, and
  per-portal counts.
