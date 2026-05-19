# Romanian Portal AI Loop Design

## Goal

Build the missing operational loop for the Railway dashboard: local portal discovery finds Romanian job posts, imports them to the dashboard, AI drafts application packages, the user approves, and a local Playwright runner fills forms without submitting.

## Architecture

The hosted Railway app remains the source of truth for profile, portals, jobs, application packages, approvals, and activity. Portal access stays local through visible Playwright runners using a persistent browser profile so eJobs, BestJobs, HiPo, and LinkedIn sessions can survive across runs. The hosted app exposes package-generation APIs that call OpenAI only when `OPENAI_API_KEY` is configured; otherwise it returns a clear setup error and preserves the deterministic fit score.

## Components

- `src/ai-generator.mjs`: builds prompts, calls the OpenAI Responses API with structured JSON output, validates package shape, and produces a deterministic fallback error when no API key exists.
- `src/routes.mjs`: adds job lookup and `POST /api/jobs/:id/package/generate` so packages can be generated from stored profile and job data.
- `runner/portal-config.mjs`: converts profile and portal keywords into concrete search URLs for eJobs, BestJobs, HiPo, and LinkedIn.
- `runner/portal-extractor.mjs`: extracts job candidates from a visible Playwright page with portal-specific link patterns and generic fallbacks.
- `runner/portal-discovery-runner.mjs`: uses a persistent browser profile, visits configured search URLs, lets the user complete login/CAPTCHA when needed, extracts jobs, and imports them through `/api/jobs`.
- `runner/form-filler.mjs`: centralizes portal-aware field filling so both tests and the local application runner use the same mapper.
- Dashboard UI: exposes "Generate AI Draft" from job rows and shows package required fields, missing fields, and runner state.

## Data Flow

1. User starts `portal-discovery-runner.mjs` locally with `DASHBOARD_URL` and `DASHBOARD_TOKEN`.
2. Runner opens a persistent Chromium profile in visible mode.
3. Runner visits portal search URLs derived from target-role keywords and `portals.yml`.
4. Runner extracts job title, company, location, URL, description snippet, source portal, and search query.
5. Runner posts each candidate to `/api/jobs`, where fit scoring runs.
6. User opens the dashboard, reviews jobs, and requests AI generation for good-fit jobs.
7. Dashboard calls `/api/jobs/:id/package/generate`, stores a draft package, and leaves it unapproved.
8. User approves a package.
9. User starts `playwright-runner.mjs`; it opens approved package URLs locally, fills recognized fields, records missing fields, and stops before submit.

## Error Handling

- Login, 2FA, CAPTCHA, and bot checks are handled by leaving the browser visible and pausing when needed.
- The discovery runner deduplicates by URL during a run; the dashboard deduplicates by job URL through the database unique constraint.
- OpenAI failures return HTTP 424 with `ai_not_configured` or `ai_generation_failed`; no package is approved automatically.
- Form fields that cannot be filled are written back to `missing_fields`.
- The runner never clicks final submit or send controls.

## Testing

Tests cover search URL generation, job extraction from fixture-like anchor data, API client job import, form field mapping, AI prompt/response parsing, route-level package generation, and the static dashboard shell.

## Sources

The OpenAI integration uses the Responses API and structured JSON output, per OpenAI docs checked on 2026-05-19:
- https://platform.openai.com/docs/guides/text
- https://platform.openai.com/docs/guides/structured-outputs
- https://platform.openai.com/docs/api-reference/responses
