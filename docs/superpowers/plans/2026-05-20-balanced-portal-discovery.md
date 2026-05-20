# Balanced Portal Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade local Playwright discovery to import around 1000 relevant jobs, balanced across eJobs, BestJobs, HiPo, and LinkedIn, with full detail-page descriptions captured before AI scoring.

**Architecture:** Keep the dashboard and runner control APIs unchanged. Add local, deterministic discovery helpers for portal budgets, resume/profile keyword matching, location filtering, and detail-page text extraction, then wire them into `portal-discovery-runner.mjs`.

**Tech Stack:** Node.js ESM, Playwright, SQLite/Postgres dashboard API, `node:test`.

---

### Task 1: Local Discovery Filters

**Files:**
- Create: `apps/job-dashboard/runner/discovery-filter.mjs`
- Test: `apps/job-dashboard/tests/discovery-filter.test.mjs`

- [ ] Write failing tests for portal budget defaults, location allow/block, profile keyword matching, and partial detail marking.
- [ ] Run `node --test apps/job-dashboard/tests/discovery-filter.test.mjs` and confirm the module is missing.
- [ ] Implement `buildDiscoveryBudgets`, `buildLocalMatchContext`, `shouldImportJob`, and `markPartialDescription`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Detail Page Extraction

**Files:**
- Modify: `apps/job-dashboard/runner/portal-extractor.mjs`
- Test: `apps/job-dashboard/tests/portal-extractor.test.mjs`

- [ ] Write failing tests for `cleanJobDetailText` keeping responsibilities/requirements and removing navigation/cookie noise.
- [ ] Run the focused extractor test and confirm the new export is missing.
- [ ] Implement `cleanJobDetailText` and `mergeJobDetail`.
- [ ] Re-run the focused extractor test and confirm it passes.

### Task 3: Balanced Playwright Discovery Runner

**Files:**
- Modify: `apps/job-dashboard/runner/portal-discovery-runner.mjs`
- Test: `apps/job-dashboard/tests/portal-discovery-runner.test.mjs`

- [ ] Write failing tests for per-portal counters and import decisions without invoking AI.
- [ ] Run the focused runner test and confirm the helper exports are missing.
- [ ] Export pure helpers from the runner for budget-aware import decisions.
- [ ] Update the runner loop to enforce per-portal caps and visit detail pages before import.
- [ ] Re-run the focused runner test and confirm it passes.

### Task 4: Docs And Verification

**Files:**
- Modify: `apps/job-dashboard/README.md`

- [ ] Document the default 1000 total and 250 per-portal discovery budget.
- [ ] Document that full descriptions are captured from detail pages before AI scoring.
- [ ] Run `npm test --prefix apps/job-dashboard`.
- [ ] Restart the local stack if needed.
- [ ] Start the `discover` runner from `http://127.0.0.1:48731/start`.
- [ ] Verify dashboard health, runner health, and discover runner status/logs.
