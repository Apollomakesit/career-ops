# Romanian Portal AI Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing portal discovery, AI draft generation, persistent local browser profile, and portal-aware application filling loop.

**Architecture:** Keep Railway as the hosted dashboard and database. Keep portal browsing and application filling local through visible Playwright with a persistent user-data directory. Add a small OpenAI Responses API integration behind a package-generation endpoint, with clear failure when the key is absent.

**Tech Stack:** Node.js ESM, Playwright, Railway Postgres, browser Fetch API, OpenAI Responses API over `fetch`, `node:test`.

---

### Task 1: AI Draft Generator

**Files:**
- Create: `apps/job-dashboard/src/ai-generator.mjs`
- Modify: `apps/job-dashboard/src/routes.mjs`
- Test: `apps/job-dashboard/tests/ai-generator.test.mjs`
- Test: `apps/job-dashboard/tests/routes.test.mjs`

- [ ] Write failing tests for missing key, structured response parsing, and route-level package creation.
- [ ] Implement prompt construction, Responses API request body, structured package validation, and explicit setup errors.
- [ ] Add `getJob()` and `generatePackage()` route flow.
- [ ] Run `npm test --prefix apps/job-dashboard`.

### Task 2: Portal Discovery Runner

**Files:**
- Create: `apps/job-dashboard/runner/portal-config.mjs`
- Create: `apps/job-dashboard/runner/portal-extractor.mjs`
- Create: `apps/job-dashboard/runner/portal-discovery-runner.mjs`
- Modify: `apps/job-dashboard/runner/api-client.mjs`
- Test: `apps/job-dashboard/tests/portal-config.test.mjs`
- Test: `apps/job-dashboard/tests/portal-extractor.test.mjs`
- Test: `apps/job-dashboard/tests/runner-client.test.mjs`

- [ ] Write failing tests for eJobs, BestJobs, HiPo, and LinkedIn URL generation.
- [ ] Write failing tests for anchor-based candidate extraction and deduplication.
- [ ] Add API client `createJob()`.
- [ ] Implement visible persistent Chromium runner using `launchPersistentContext`.
- [ ] Run `npm test --prefix apps/job-dashboard`.

### Task 3: Portal-Aware Form Filling

**Files:**
- Create: `apps/job-dashboard/runner/form-filler.mjs`
- Modify: `apps/job-dashboard/runner/playwright-runner.mjs`
- Test: `apps/job-dashboard/tests/form-filler.test.mjs`

- [ ] Write failing tests for field alias generation and protected submit detection.
- [ ] Move existing fill logic into reusable helpers.
- [ ] Add common aliases for name, email, phone, LinkedIn, GitHub, cover letter, work authorization, and location fields.
- [ ] Ensure submit buttons are never clicked.
- [ ] Run `npm test --prefix apps/job-dashboard`.

### Task 4: Dashboard Operations UI

**Files:**
- Modify: `apps/job-dashboard/public/index.html`
- Modify: `apps/job-dashboard/public/app.js`
- Modify: `apps/job-dashboard/public/styles.css`
- Test: `apps/job-dashboard/tests/server.test.mjs`

- [ ] Add a visible operations section with runner commands.
- [ ] Change job actions from placeholder draft creation to AI generation.
- [ ] Render required and missing fields in review packages.
- [ ] Preserve token-protected API behavior while serving the static shell.
- [ ] Run `npm test --prefix apps/job-dashboard`.

### Task 5: Docs, Environment, Deploy

**Files:**
- Modify: `apps/job-dashboard/.env.example`
- Modify: `apps/job-dashboard/README.md`
- Modify: `.gitignore`

- [ ] Document `OPENAI_API_KEY`, optional `OPENAI_MODEL`, and persistent browser profile path.
- [ ] Ignore local Playwright profile directories.
- [ ] Run `npm test --prefix apps/job-dashboard`.
- [ ] Run `node verify-pipeline.mjs`.
- [ ] Deploy to Railway and verify `/api/health`.
