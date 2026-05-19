# Job Dashboard Approval Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Railway-hosted Postgres dashboard and local Playwright runner for reviewing and approving Romanian job applications.

**Architecture:** Add `apps/job-dashboard` as a focused Node HTTP app with a Postgres persistence layer and a browser-native dashboard UI. Add a separate local runner that talks to the dashboard API and uses Playwright locally so portal sessions stay on the user's machine.

**Tech Stack:** Node.js ESM, `pg`, `dotenv`, `node:test`, browser HTML/CSS/JS, Playwright for the local runner, Railway Postgres.

---

## File Structure

- Create `apps/job-dashboard/package.json`: dashboard scripts and dependencies.
- Create `apps/job-dashboard/src/schema.mjs`: idempotent Postgres schema creation.
- Create `apps/job-dashboard/src/db.mjs`: Postgres pool and query helpers.
- Create `apps/job-dashboard/src/fit-score.mjs`: deterministic OwlApply-style fit scoring.
- Create `apps/job-dashboard/src/importers.mjs`: local career-ops file import helpers.
- Create `apps/job-dashboard/src/routes.mjs`: API route handlers.
- Create `apps/job-dashboard/src/server.mjs`: HTTP server and static asset hosting.
- Create `apps/job-dashboard/public/index.html`: dashboard shell.
- Create `apps/job-dashboard/public/styles.css`: operational dashboard styling.
- Create `apps/job-dashboard/public/app.js`: client-side dashboard behavior.
- Create `apps/job-dashboard/runner/api-client.mjs`: runner API client.
- Create `apps/job-dashboard/runner/playwright-runner.mjs`: local Playwright runner.
- Create `apps/job-dashboard/tests/*.test.mjs`: unit tests.
- Create `apps/job-dashboard/railway.json`: Railway start command.
- Modify root `.gitignore`: ignore local dashboard env files.

## Tasks

### Task 1: App Scaffold and Tests

**Files:**
- Create: `apps/job-dashboard/package.json`
- Create: `apps/job-dashboard/src/fit-score.mjs`
- Create: `apps/job-dashboard/tests/fit-score.test.mjs`

- [ ] Write failing tests for support/MDM/developer fit scoring.
- [ ] Run `npm test --prefix apps/job-dashboard`; expect module-not-found or assertion failure.
- [ ] Implement the scoring module.
- [ ] Re-run tests; expect pass.

### Task 2: Database Schema

**Files:**
- Create: `apps/job-dashboard/src/schema.mjs`
- Create: `apps/job-dashboard/src/db.mjs`
- Create: `apps/job-dashboard/tests/schema.test.mjs`

- [ ] Write tests that verify generated schema SQL includes `profile`, `portal_credentials`, `jobs`, `application_packages`, and `events`.
- [ ] Run tests; expect failure because schema module does not exist.
- [ ] Implement idempotent schema SQL and `migrate`.
- [ ] Re-run tests; expect pass.

### Task 3: Local Importers

**Files:**
- Create: `apps/job-dashboard/src/importers.mjs`
- Create: `apps/job-dashboard/tests/importers.test.mjs`

- [ ] Write tests for parsing `cv.md`, `config/profile.yml`, `portals.yml`, and `data/applications.md` samples.
- [ ] Run tests; expect failure because importer module does not exist.
- [ ] Implement import helpers.
- [ ] Re-run tests; expect pass.

### Task 4: API Routes

**Files:**
- Create: `apps/job-dashboard/src/routes.mjs`
- Create: `apps/job-dashboard/tests/routes.test.mjs`

- [ ] Write tests for route dispatch with mocked storage functions.
- [ ] Run tests; expect failure because route module does not exist.
- [ ] Implement profile, portals, jobs, packages, approval, and events route handlers.
- [ ] Re-run tests; expect pass.

### Task 5: Server and Dashboard UI

**Files:**
- Create: `apps/job-dashboard/src/server.mjs`
- Create: `apps/job-dashboard/public/index.html`
- Create: `apps/job-dashboard/public/styles.css`
- Create: `apps/job-dashboard/public/app.js`
- Create: `apps/job-dashboard/tests/server.test.mjs`

- [ ] Write tests for static serving and health response.
- [ ] Run tests; expect failure because server module does not exist.
- [ ] Implement server and UI.
- [ ] Re-run tests; expect pass.

### Task 6: Local Playwright Runner

**Files:**
- Create: `apps/job-dashboard/runner/api-client.mjs`
- Create: `apps/job-dashboard/runner/playwright-runner.mjs`
- Create: `apps/job-dashboard/tests/runner-client.test.mjs`

- [ ] Write tests for fetching approved packages and marking runner status.
- [ ] Run tests; expect failure because runner client does not exist.
- [ ] Implement runner API client and safe local runner shell.
- [ ] Re-run tests; expect pass.

### Task 7: Railway Deployment

**Files:**
- Create: `apps/job-dashboard/railway.json`
- Create: `apps/job-dashboard/.env.example`
- Modify: `.gitignore`

- [ ] Add Railway runtime config and env example.
- [ ] Run `npm test --prefix apps/job-dashboard`; expect pass.
- [ ] Run `npm run migrate --prefix apps/job-dashboard` against local or Railway `DATABASE_URL` if available.
- [ ] Create/link Railway project, add Postgres, set service root to `apps/job-dashboard`, and deploy.

### Task 8: Verification

**Files:**
- Modify only if tests expose issues.

- [ ] Run `npm test --prefix apps/job-dashboard`.
- [ ] Run `node verify-pipeline.mjs`.
- [ ] Start dashboard locally with `npm start --prefix apps/job-dashboard`.
- [ ] Open local dashboard and verify it loads.
- [ ] Verify Railway deployment URL responds to `/api/health`.
