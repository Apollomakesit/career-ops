# Career-Ops Job Dashboard — Comprehensive Audit Report

**Date:** 2026-05-20  
**Scope:** `apps/job-dashboard/` — the local job dashboard application running at `http://127.0.0.1:3000`  
**Files reviewed:** 60+ source files across frontend, backend, runner, and test layers

---

## Architecture Overview

The dashboard is a Node.js/ESM application with:

- **Frontend:** Vanilla HTML/CSS/JS (`public/`) — single-page app with view-based navigation
- **Backend:** Custom HTTP server (`src/server.mjs`) with route dispatch (`src/routes.mjs`)
- **Database:** PostgreSQL (production) or SQLite via `better-sqlite3` (local), with a translation layer (`src/db.mjs`)
- **AI:** OpenAI Responses API or Anthropic Messages API via CLIProxyAPI (`src/ai-generator.mjs`)
- **Runners:** Separate CLI processes for discovery, AI scoring, AI drafting, and form filling (`runner/`)
- **Control server:** Local runner HTTP API at `http://127.0.0.1:48731` (`runner/control-server.mjs`)

---

## 1. CRITICAL BUGS

### 1.1 `generatePackage` button has no handler in the job details dialog
- **File:** [`apps/job-dashboard/public/app.js:292-352`](apps/job-dashboard/public/app.js)
- **Issue:** The `showJobDetails()` function renders a "Score with AI" button but **no "Generate Package" button**. The `generatePackage()` function exists at line 375 but is never wired to any UI element in the details dialog. Users can only generate packages via the Review queue, not from the job detail view.
- **Fix:** Add a "Generate Package" button to the Actions section in `showJobDetails()` and wire it to `generatePackage(jobId, button)`.

### 1.2 `PATCH /api/jobs/:id/fit` does not validate the job exists
- **File:** [`apps/job-dashboard/src/routes.mjs:116-118`](apps/job-dashboard/src/routes.mjs)
- **Issue:** `updateJobFit()` is called without first checking if the job exists. If `store.getJob()` returns null, the code proceeds to call `store.updateJobFit()` with an invalid ID, which will return null but the route still returns 200 with `null` body — the frontend receives `null` and may crash trying to access properties.
- **Fix:** Add a null check on the job before calling `updateJobFit()`, return 404 if not found.

### 1.3 `POST /api/jobs/:id/fit/generate` does not pass `cv`/`projects` to the AI generator
- **File:** [`apps/job-dashboard/src/routes.mjs:120-143`](apps/job-dashboard/src/routes.mjs)
- **Issue:** The `generateAiFitScore` call at line 125 passes `cv` and `projects` from `getMatcherContext()`, but the `generateAiFitScore` function signature expects `rulesFit` which is derived from `jobToFit(job)` — this is correct. However, the `cv` and `projects` are fetched fresh on every call to `getMatcherContext()` which does file I/O and parsing. Under concurrent requests this is wasteful and could fail if `cv.md` is being written.
- **Fix:** Cache the matcher context at request scope, not per-call.

### 1.4 `POST /api/jobs/:id/package/generate` returns 201 but should return 200 for updates
- **File:** [`apps/job-dashboard/src/routes.mjs:146-169`](apps/job-dashboard/src/routes.mjs)
- **Issue:** The route returns `json(201, ...)` for package generation. If a package already exists for the job, `store.createPackage` will create a duplicate (no upsert logic). The `ON CONFLICT` constraint is only on `job_id` if the schema had one — but the `application_packages` table has no unique constraint on `job_id`, so duplicate packages can accumulate.
- **Fix:** Add a uniqueness check or upsert logic in `createPackage`, and return 200 for updates vs 201 for creates.

### 1.5 `DELETE /api/jobs/bulk` uses wrong HTTP semantics for body parsing
- **File:** [`apps/job-dashboard/src/server.mjs:131-136`](apps/job-dashboard/src/server.mjs)
- **Issue:** `readJsonBody()` includes `DELETE` in its method check. While this works, the `dispatchApi` function in `routes.mjs` receives the body from the server, but the server reads the body for all DELETE requests. This is unconventional and could cause issues with proxies. More critically, the body is read as `{}` if empty, so `request.body || {}` in the route handler works, but the `ids` extraction from `request.body.ids` could fail if the body is `{}`.
- **Status:** Works but fragile — no explicit validation that `ids` is present before the `arrayOfStrings` call.

### 1.6 `PUT /api/cv` body parsing assumes object shape
- **File:** [`apps/job-dashboard/src/routes.mjs:42-49`](apps/job-dashboard/src/routes.mjs)
- **Issue:** The body is extracted as `(request.body || {}).markdown`, but if the body is a raw string (not JSON), this will be `undefined`. The `readJsonBody` in server.mjs parses JSON, so this is fine for normal use, but the error message is unhelpful if markdown is empty — it silently writes an empty string.
- **Fix:** Add explicit validation that `markdown` is a non-empty string.

### 1.7 `claimRunnerCommand` race condition
- **File:** [`apps/job-dashboard/src/routes.mjs:778-796`](apps/job-dashboard/src/routes.mjs)
- **Issue:** The claim uses a subquery `WHERE id = (SELECT id ... LIMIT 1)` without `FOR UPDATE` or serializable isolation. Under concurrent requests from multiple runner sync cycles, the same command could be claimed twice. The comment at line 779-780 acknowledges this is "single-user" so it's acceptable, but the cloud-sync runner polls every 3 seconds and could overlap.
- **Fix:** Use `SELECT ... FOR UPDATE SKIP LOCKED` in Postgres, or accept the risk for local-only use.

### 1.8 `updateRunnerDesiredConfig` doesn't merge nested objects properly
- **File:** [`apps/job-dashboard/src/routes.mjs:726-751`](apps/job-dashboard/src/routes.mjs)
- **Issue:** The spread `{ ...(current.desiredConfig || {}), ...payload }` does a shallow merge. If `desiredConfig` has nested objects (e.g., `{ ai: { provider: 'openai' } }`) and the payload is `{ ai: { model: 'gpt-5' } }`, the entire `ai` key is replaced instead of merged.
- **Fix:** Use deep merge for nested config objects.

---

## 2. MISSING FEATURES

### 2.1 No "Generate Package" button in job details dialog
- **File:** [`apps/job-dashboard/public/app.js:292-352`](apps/job-dashboard/public/app.js)
- **Details:** The `generatePackage()` function exists but is never connected to any UI element in the job details dialog. Users must go to the Review tab to find packages after they're created.

### 2.2 No job editing capability
- **File:** [`apps/job-dashboard/src/routes.mjs`](apps/job-dashboard/src/routes.mjs)
- **Details:** There is no `PATCH /api/jobs/:id` endpoint for updating job fields (title, company, description, etc.). The only update paths are fit score, bulk status, and bulk delete. If a user manually adds a job with a typo, they must delete and re-add it.

### 2.3 No pagination on the jobs API
- **File:** [`apps/job-dashboard/src/routes.mjs:76-78`](apps/job-dashboard/src/routes.mjs)
- **Details:** The `listJobs` endpoint accepts a `limit` parameter (default 200) but has no `offset`/`page` parameter. The frontend fetches all jobs at once and paginates client-side. With 500+ jobs, this becomes slow.

### 2.4 No real-time job status updates
- **File:** [`apps/job-dashboard/public/app.js:119-137`](apps/job-dashboard/public/app.js)
- **Details:** `loadAll()` fetches everything in parallel but is only called on manual refresh or after operations. There's no polling for job list updates (only runner status polls every 5s and progress every 2s). If a runner imports jobs in the background, the user won't see them until they click Refresh.

### 2.5 No error boundary / global error handling in frontend
- **File:** [`apps/job-dashboard/public/app.js:991-1018`](apps/job-dashboard/public/app.js)
- **Details:** The `api()` function catches non-OK responses and shows a toast, but unhandled promise rejections (e.g., network failures during `loadAll`) will silently fail. There's no `window.onerror` or `unhandledrejection` handler.

### 2.6 No confirmation for "AI Score" on single job
- **File:** [`apps/job-dashboard/public/app.js:383-391`](apps/job-dashboard/public/app.js)
- **Details:** `scoreWithAi()` does not show a confirmation dialog before calling the AI API. The bulk AI score does confirm, but the single-job version doesn't. This could lead to accidental AI usage/costs.

### 2.7 No way to cancel a single AI scoring/drafting operation
- **File:** [`apps/job-dashboard/public/app.js`](apps/job-dashboard/public/app.js)
- **Details:** There's no mechanism to abort an in-flight AI request. The `withButtonLoading` helper disables the button but doesn't use `AbortController`. If the AI call hangs, the button stays disabled until the request times out or completes.

### 2.8 No job deduplication on manual creation
- **File:** [`apps/job-dashboard/src/routes.mjs:80-89`](apps/job-dashboard/src/routes.mjs)
- **Details:** When creating a job manually via `POST /api/jobs`, the URL is used for upsert (`ON CONFLICT (url)`), but if the user leaves the URL empty, it generates `manual:{Date.now()}` which is always unique. This means the same job can be added multiple times with different URLs.

### 2.9 No search/filter by status
- **File:** [`apps/job-dashboard/public/app.js:57-82`](apps/job-dashboard/public/app.js)
- **Details:** The filter bar has work model, portal, salary, date, match score, and text search, but no status filter. Users cannot easily view only "applied" or "rejected" jobs.

### 2.10 No data export for packages
- **File:** [`apps/job-dashboard/public/app.js:921-926`](apps/job-dashboard/public/app.js)
- **Details:** Jobs can be exported as CSV, but there's no export for application packages (cover letters, tailored CVs).

### 2.11 No keyboard shortcuts
- **File:** [`apps/job-dashboard/public/app.js`](apps/job-dashboard/public/app.js)
- **Details:** No keyboard navigation support. The app is entirely mouse-driven. Power users would benefit from shortcuts for refresh, search, view switching, etc.

### 2.12 No responsive table on mobile
- **File:** [`apps/job-dashboard/public/styles.css:833-887`](apps/job-dashboard/public/styles.css)
- **Details:** The jobs table switches to a 3-column layout on mobile (`@media (max-width: 860px)`), but the header is hidden and rows show only checkbox, CV score, and a combined column. The AI fit score, salary, posted date, and status are all hidden.

### 2.13 No loading states for initial page load
- **File:** [`apps/job-dashboard/public/app.js:112`](apps/job-dashboard/public/app.js)
- **Details:** `await loadAll()` blocks the initial render. If the API is slow, the user sees a blank page with no loading indicator.

### 2.14 No offline indicator
- **File:** [`apps/job-dashboard/public/app.js:479-503`](apps/job-dashboard/public/app.js)
- **Details:** When the local runner is offline, the status shows "Local runner offline" but there's no visual indicator for the dashboard itself being offline (e.g., if the server is unreachable).

### 2.15 `PATCH /api/jobs/:id/fit` doesn't validate fit payload
- **File:** [`apps/job-dashboard/src/routes.mjs:505-534`](apps/job-dashboard/src/routes.mjs)
- **Details:** The `normalizeFitPayload` function clamps the score to 0-100 but doesn't validate that required fields are present. An empty body would set score to 0, category to empty string, and wipe all arrays.

---

## 3. SECURITY ISSUES

### 3.1 CORS wildcard on local runner control server
- **File:** [`apps/job-dashboard/runner/control-server-core.mjs:5-12`](apps/job-dashboard/runner/control-server-core.mjs)
- **Severity:** Medium
- **Issue:** `access-control-allow-origin: *` is set on the local runner API. Any website visited by the user could make requests to `http://127.0.0.1:48731` and control the runner (start/stop jobs, read config with API keys).
- **Fix:** Restrict to `http://127.0.0.1:3000` or the specific dashboard origin.

### 3.2 Dashboard token stored in localStorage
- **File:** [`apps/job-dashboard/public/app.js:37,1002-1004`](apps/job-dashboard/public/app.js)
- **Severity:** Medium
- **Issue:** The `DASHBOARD_TOKEN` is stored in `localStorage` and sent as a Bearer token. Any XSS vulnerability (or malicious browser extension) can read it. The token is also prompted via `prompt()` on 401, which is not secure.
- **Fix:** Use `httpOnly` cookies for the token, or at minimum use `sessionStorage` so it doesn't persist across sessions.

### 3.3 No CSRF protection
- **File:** [`apps/job-dashboard/src/server.mjs`](apps/job-dashboard/src/server.mjs)
- **Severity:** Low (local-only app)
- **Issue:** API endpoints don't check `Origin` headers or require CSRF tokens. Since the dashboard is local-only, this is lower risk, but combined with the CORS wildcard on the runner, it could be exploited.

### 3.4 API key visible in runner config endpoint
- **File:** [`apps/job-dashboard/runner/control-server-core.mjs:32-34`](apps/job-dashboard/runner/control-server-core.mjs)
- **Severity:** Medium
- **Issue:** `GET /config` returns the config with redacted tokens (good), but `PUT /config` accepts tokens and stores them in a local JSON file. The `redactLocalConfig` function replaces tokens with `"configured"` but the actual values are stored on disk in plaintext.
- **Fix:** Use OS-level secret storage or at least file permissions to restrict access.

### 3.5 `serveStatic` path traversal protection is minimal
- **File:** [`apps/job-dashboard/src/server.mjs:115-128`](apps/job-dashboard/src/server.mjs)
- **Severity:** Low
- **Issue:** The check `!filePath.startsWith(publicRoot)` prevents basic path traversal, but doesn't handle symlinks or case sensitivity on Windows. The `.${safePath}` concatenation is also fragile.
- **Fix:** Use `path.normalize()` and check the resolved path, or use a proper static file middleware.

### 3.6 No rate limiting on API endpoints
- **File:** [`apps/job-dashboard/src/server.mjs`](apps/job-dashboard/src/server.mjs)
- **Severity:** Low (local-only)
- **Issue:** No rate limiting on any endpoint. The AI generation endpoints could be called repeatedly, incurring costs.

---

## 4. CODE QUALITY ISSUES

### 4.1 Massive `app.js` file (1610 lines)
- **File:** [`apps/job-dashboard/public/app.js`](apps/job-dashboard/public/app.js)
- **Issue:** All frontend logic is in a single 1610-line file. This makes maintenance difficult and increases the chance of regressions.
- **Fix:** Split into modules: `api.js`, `views/jobs.js`, `views/operations.js`, `views/cv.js`, `views/profile.js`, `views/portals.js`, `views/activity.js`, `views/accounts.js`, `ui/toast.js`, `ui/dialog.js`, `state.js`.

### 4.2 Massive `routes.mjs` file (1007 lines)
- **File:** [`apps/job-dashboard/src/routes.mjs`](apps/job-dashboard/src/routes.mjs)
- **Issue:** All API routes, the Postgres store implementation, and utility functions are in a single file.
- **Fix:** Split into `routes.mjs` (route dispatch only), `store/postgres.mjs`, `store/sqlite.mjs`, `store/packages.mjs`, `store/events.mjs`, `utils/filters.mjs`, `utils/validation.mjs`.

### 4.3 No input sanitization on job description rendering
- **File:** [`apps/job-dashboard/public/app.js:1348-1360`](apps/job-dashboard/public/app.js)
- **Issue:** The `markdown()` function escapes HTML but then injects HTML tags via regex replacement. If job descriptions contain malicious HTML, the `escapeHtml()` call prevents XSS, but the regex replacements could create broken HTML that breaks layout.
- **Status:** XSS-safe due to `escapeHtml` being applied first, but fragile.

### 4.4 Inconsistent error handling in `loadRunnerStatus`
- **File:** [`apps/job-dashboard/public/app.js:479-503`](apps/job-dashboard/public/app.js)
- **Issue:** When the local runner is offline, the catch block tries `loadCloudRunnerState()`. If that also fails, the error is silently swallowed and `renderRunnerStatus({})` is called, which renders empty cards. No error toast is shown unless `alertOnError` is true.
- **Fix:** Always show a toast when both local and cloud runners are unreachable.

### 4.5 `renderJobs()` re-renders the entire table on every change
- **File:** [`apps/job-dashboard/public/app.js:139-206`](apps/job-dashboard/public/app.js)
- **Issue:** Every call to `renderJobs()` replaces `innerHTML` of the entire table, destroying all DOM state (scroll position, focused elements, inline editing state).
- **Fix:** Use a virtual DOM approach or at minimum preserve scroll position and re-attach event listeners more efficiently.

### 4.6 `setInterval` timers are never cleared
- **File:** [`apps/job-dashboard/public/app.js:116-117`](apps/job-dashboard/public/app.js)
- **Issue:** `setInterval(() => loadRunnerStatus(...), 5000)` and `setInterval(() => loadRunnerProgress(), 2000)` run forever, even when the user navigates away (in a SPA context, they're always active). This wastes resources.
- **Fix:** Clear intervals when the Operations view is not active, or use a shared timer with visibility-aware polling.

### 4.7 No TypeScript or JSDoc types
- **Issue:** The entire codebase is untyped JavaScript. This makes refactoring risky and IDE assistance limited.
- **Fix:** Add JSDoc types incrementally, or migrate to TypeScript for new files.

### 4.8 `jobIncompleteSql()` uses `OR` logic that may be too aggressive
- **File:** [`apps/job-dashboard/src/routes.mjs:949-958`](apps/job-dashboard/src/routes.mjs)
- **Issue:** A job is considered incomplete if ANY of: empty URL, empty title, empty company, empty description, description < 240 chars, source contains `:partial-detail`, or source doesn't contain `:detail`. This means a job with a valid URL but short description is flagged as incomplete, which may not be the intent.

---

## 5. TEST COVERAGE GAPS

The test suite has 28 test files covering most core modules. However:

### 5.1 No end-to-end tests
- **Issue:** All tests are unit/integration tests with mocked stores. There are no tests that spin up the full server with a real (in-memory SQLite) database and make HTTP requests through the entire stack.
- **Fix:** Add E2E tests using the existing `createDashboardServer()` with SQLite in-memory mode.

### 5.2 No frontend tests
- **Issue:** Zero tests for `app.js`, `dashboard-helpers.js`, or `filter-query.js` behavior in a DOM context. The `dashboard-helpers.test.mjs` and `filter-query.test.mjs` test utility functions but not DOM interactions.
- **Fix:** Add tests using `jsdom` or a headless browser for critical UI flows.

### 5.3 No tests for runner modules
- **Files:** `runner/portal-discovery-runner.mjs`, `runner/playwright-runner.mjs`, `runner/run-manager.mjs`
- **Issue:** The portal discovery runner, playwright runner, and run manager have no tests. These are the most complex and failure-prone parts of the system.
- **Fix:** Add integration tests with mocked browser and API client.

### 5.4 No tests for `server.mjs`
- **Note:** `server.test.mjs` exists and covers basic scenarios, but doesn't test:
  - Static file serving edge cases
  - Token auth with various header formats
  - SSE proxy error handling
  - Concurrent request handling

### 5.5 No tests for `importers.mjs`
- **Note:** `importers.test.mjs` exists but only tests parsing functions, not the full `importLocalCareerOps()` flow with a real database.

### 5.6 `control-server-core.test.mjs` doesn't test account management endpoints
- **File:** [`apps/job-dashboard/runner/control-server-core.mjs:136-178`](apps/job-dashboard/runner/control-server-core.mjs)
- **Issue:** The `/accounts`, `/accounts/login`, `/accounts/login-status`, and `/accounts/status` endpoints have no test coverage.

---

## 6. PERFORMANCE ISSUES

### 6.1 `loadAll()` fetches everything sequentially via `Promise.all`
- **File:** [`apps/job-dashboard/public/app.js:119-137`](apps/job-dashboard/public/app.js)
- **Issue:** 6 API calls are made in parallel on every refresh. If the database has thousands of jobs, the `/api/jobs` response could be very large (all jobs, all fields).
- **Fix:** Implement server-side pagination and fetch only the current page. Fetch stats separately with lighter queries.

### 6.2 `rescoreCvMatches()` is O(n) with individual DB updates
- **File:** [`apps/job-dashboard/src/routes.mjs:590-605`](apps/job-dashboard/src/routes.mjs)
- **Issue:** Re-scoring all jobs fetches all jobs, then updates each one individually. For 500+ jobs, this is 500+ DB round-trips.
- **Fix:** Batch the updates or use a single transaction.

### 6.3 `getMatcherContext()` does file I/O on every job creation
- **File:** [`apps/job-dashboard/src/cv-matcher.mjs:45-50`](apps/job-dashboard/src/cv-matcher.mjs)
- **Issue:** `loadCv()` reads and parses `cv.md` on every call (with mtime-based caching). If the cache is invalidated (e.g., after CV update), the next job creation triggers a full re-parse.
- **Status:** Acceptable for local use, but could be improved with a longer TTL cache.

### 6.4 Client-side sorting of all jobs
- **File:** [`apps/job-dashboard/public/app.js:1216-1225`](apps/job-dashboard/public/app.js)
- **Issue:** All jobs are sorted client-side after fetching. With 500+ jobs, this is noticeable on slower devices.
- **Fix:** Add server-side sorting via query parameters.

---

## 7. INFRASTRUCTURE / DEPLOYMENT ISSUES

### 7.1 No health check endpoint for the dashboard itself
- **File:** [`apps/job-dashboard/src/server.mjs`](apps/job-dashboard/src/server.mjs)
- **Issue:** `/api/health` returns `{ ok: true }` but doesn't check database connectivity. If the database is down, the health endpoint still returns 200.
- **Fix:** Add a database ping to the health check.

### 7.2 No graceful shutdown
- **File:** [`apps/job-dashboard/src/server.mjs:167-175`](apps/job-dashboard/src/server.mjs)
- **Issue:** The server doesn't handle `SIGTERM`/`SIGINT` for graceful shutdown. Active requests may be aborted and database connections may not be closed cleanly.
- **Fix:** Add signal handlers that stop accepting new requests, wait for in-flight requests, and close the pool.

### 7.3 No database connection retry logic
- **File:** [`apps/job-dashboard/src/db.mjs:17-31`](apps/job-dashboard/src/db.mjs)
- **Issue:** If the database is temporarily unavailable (e.g., during Railway deployment), the server crashes on startup.
- **Fix:** Add retry logic with exponential backoff for initial connection.

### 7.4 `better-sqlite3` is an optional dependency that fails silently
- **File:** [`apps/job-dashboard/package.json:30`](apps/job-dashboard/package.json)
- **Issue:** If `better-sqlite3` fails to install (common on Windows without build tools), the error only appears when trying to use SQLite mode. The error message is helpful but the failure mode is late.
- **Fix:** Add a startup check that verifies the SQLite module is available when `DATABASE_URL` is not set.

---

## 8. PRIORITIZED ACTION PLAN

### P0 — Critical (fix immediately)
1. Add "Generate Package" button to job details dialog (`app.js:292-352`)
2. Add null check for job existence in `PATCH /api/jobs/:id/fit` (`routes.mjs:116-118`)
3. Restrict CORS on local runner to dashboard origin (`control-server-core.mjs:7`)
4. Add database health check to `/api/health` (`server.mjs:30-32`)

### P1 — High (fix soon)
5. Add `PATCH /api/jobs/:id` for editing job fields (`routes.mjs`)
6. Add server-side pagination to `/api/jobs` (`routes.mjs:76-78`, `app.js:139-206`)
7. Add graceful shutdown handling (`server.mjs:167-175`)
8. Add confirmation dialog for single-job AI scoring (`app.js:383-391`)
9. Add status filter to the filter bar (`app.js:57-82`, `routes.mjs:899-912`)
10. Add loading indicator for initial page load (`app.js:112`)

### P2 — Medium (fix when possible)
11. Split `app.js` into modules
12. Split `routes.mjs` into modules
13. Add E2E tests with in-memory SQLite
14. Add tests for runner modules (portal discovery, run manager)
15. Add `AbortController` support for cancellable AI requests (`app.js:1039-1051`)
16. Add database connection retry logic (`db.mjs:17-31`)
17. Improve mobile table layout (`styles.css:860-867`)
18. Add job deduplication on manual creation (`routes.mjs:80-89`)

### P3 — Low (nice to have)
19. Add keyboard shortcuts
20. Add data export for packages
21. Add TypeScript/JSDoc types
22. Add real-time job list polling
23. Add offline indicator
24. Use `sessionStorage` instead of `localStorage` for dashboard token (`app.js:37`)
25. Add deep merge for runner desired config (`routes.mjs:726-751`)
26. Batch CV match re-scoring updates (`routes.mjs:590-605`)

---

## 9. SUMMARY

The Career-Ops Job Dashboard is a well-architected local-first application with good separation of concerns and comprehensive test coverage for core logic. The main issues are:

1. **Missing UI feature:** No "Generate Package" button in the job details dialog (the function exists but isn't wired up)
2. **Missing API features:** No job editing, no server-side pagination, no status filter
3. **Security:** CORS wildcard on local runner, token in localStorage
4. **Code organization:** Two massive files (`app.js` at 1610 lines, `routes.mjs` at 1007 lines) that should be split
5. **Test gaps:** No E2E tests, no frontend DOM tests, no runner module tests
6. **Resilience:** No graceful shutdown, no DB retry logic, no loading states

The codebase has zero TODO/FIXME comments, indicating the authors kept the issue tracker clean. The migration system is well-designed, the SQLite/Postgres dual-mode is elegant, and the AI prompt engineering is thoughtful with fallback handling.
