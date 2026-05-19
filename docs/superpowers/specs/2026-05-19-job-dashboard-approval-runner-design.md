# Job Dashboard Approval Runner Design

## Goal

Build a live Railway-hosted dashboard for Ioan's career-ops workflow using Railway Postgres for persistent private application data, plus a local Playwright runner that fills job portals from approved drafts and stops before final submission.

## Scope

This project adds a new web dashboard and local runner without changing career-ops' core Markdown-based pipeline rules. The dashboard becomes the operational UI for applications, profile data, portal field data, fit scoring, and approval decisions. The local runner remains responsible for browser automation because eJobs, BestJobs, Hipo, and LinkedIn sessions are sensitive and often protected by login, CAPTCHA, or anti-bot flows.

## Architecture

The implementation will add a new `apps/job-dashboard` Node application. It will run on Railway, connect to `DATABASE_URL`, and serve both API endpoints and a compact single-page dashboard UI. It will use plain Node HTTP server modules, `pg` for Postgres, and browser-native HTML/CSS/JavaScript to avoid pulling in a large framework before the product boundaries settle.

The local Playwright runner will live under `apps/job-dashboard/runner`. It will pull approved application packages from the dashboard API, open the target portal locally, help fill fields using saved profile and portal defaults, and update the application status to `ready_for_user_submit` when the package is filled. It must not click final Submit/Send/Apply.

## Data Model

Postgres stores the dashboard state:

- `profile`: one active candidate profile with contact details, role targets, work authorization, salary notes, and reusable application defaults.
- `portal_credentials`: non-secret portal metadata such as profile URL, username email, and field preferences. Passwords are never stored.
- `jobs`: discovered jobs with URL, company, title, portal, location, description, source, fit score, matched skills, missing skills, recommendation, and status.
- `application_packages`: generated cover letter, tailored CV markdown, required fields JSON, missing fields JSON, approval state, and local runner status.
- `events`: append-only activity log for scans, evaluations, draft generation, approvals, runner updates, and manual notes.

The database includes seed/import code that reads existing local `cv.md`, `config/profile.yml`, `portals.yml`, `article-digest.md`, and `data/applications.md` when run locally. On Railway, it can initialize from environment variables and later be edited from the dashboard.

## Dashboard UX

The dashboard first screen is the work queue, not a landing page. It has a left navigation rail and dense operational views:

- **Applications:** table of jobs with fit %, status, portal, role, company, and next action.
- **Review:** side-by-side job fit breakdown, draft cover letter, tailored CV excerpt, required fields, and missing info.
- **Profile:** editable candidate details and application defaults.
- **Portals:** editable portal metadata and per-portal field hints for eJobs, BestJobs, Hipo, and LinkedIn.
- **Activity:** event log and runner updates.

Fit scoring is shown as a percentage with explanation, similar in spirit to OwlApply: matched role category, matched skills, missing skills, location fit, support/MDM relevance, developer-track relevance, and recommendation.

## Fit Scoring

The first implementation uses deterministic scoring so it works without model keys:

- Role category match: support/MDM/application support/developer/AI automation.
- Skill match: job text against profile skills and project proof points.
- Location match: Romania, Bucharest, remote, hybrid, EU/EMEA.
- Seniority match: excludes internships and flags overly senior developer roles.
- Negative signals: pure sales, pure call center, student-only, unrelated stacks.

The score is stored with structured matched and missing arrays so an LLM-based evaluator can replace or augment it later without changing the UI.

## Runner Workflow

1. User opens a job in the dashboard.
2. Dashboard shows fit score and application draft.
3. User clicks Approve.
4. Local runner fetches approved packages with `node apps/job-dashboard/runner/playwright-runner.mjs`.
5. Runner opens the portal in a local browser context and fills known fields.
6. If required fields are missing, runner writes them back to the package as `missing_fields`.
7. Runner stops at review/final-submit stage and marks status `ready_for_user_submit`.

## Deployment

Railway deployment uses a new Railway project with:

- One web service rooted at `apps/job-dashboard`.
- One Railway Postgres database.
- `DATABASE_URL` injected by Railway.
- GitHub-connected deploys from the repo branch.

The app provides:

- `npm start` for Railway runtime.
- `npm test` for unit tests.
- `npm run migrate` for idempotent table creation.
- `npm run import:local` to import local career-ops files into Postgres.

## Safety and Privacy

- Do not store portal passwords in Git or Postgres.
- Do not auto-submit applications.
- Keep personal career files ignored locally.
- Use a simple dashboard access token via `DASHBOARD_TOKEN` if configured.
- Mark all runner-filled packages as requiring user final review.

## Testing

Tests cover:

- Deterministic fit scoring.
- Markdown tracker parsing.
- Profile import normalization.
- API route behavior for profile, portals, jobs, packages, approval, and events.
- Runner API client behavior without launching browser for unit tests.

End-to-end Playwright browser tests are deferred until the first dashboard surfaces are stable.
