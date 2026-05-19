# Career Ops Job Dashboard

The dashboard is local-first. By default it runs at `http://127.0.0.1:3000`,
stores data in a local SQLite database, drives browser automation on this PC,
and uses CLIProxyAPI for Anthropic/OpenAI account-backed AI. No Railway token
is needed for the local workflow.

Railway hosting is still supported as an optional remote deployment, but the
normal daily flow should use the local dashboard and local runner.

## Start Here

Run these from `E:\Github Repos\career-ops`.

### 1. One-time setup

```powershell
npm install --prefix apps/job-dashboard
npx playwright install chromium
```

Log into CLIProxyAPI once if your local Anthropic/OpenAI account is not already connected:

```powershell
cd "E:\Github Repos\CLIProxyAPI"
go run ./cmd/server -claude-login
go run ./cmd/server -codex-login
```

You do not need OpenAI or Anthropic API keys for the normal local flow. Career Ops uses the local CLIProxyAPI auth key from `E:\Github Repos\CLIProxyAPI\config.yaml`, which routes to your logged-in Claude/Codex accounts.

### 2. Start the local engine

```powershell
cd "E:\Github Repos\career-ops"
powershell -ExecutionPolicy Bypass -File apps/job-dashboard/scripts/start-local.ps1
```

This script:

- runs without `DASHBOARD_TOKEN` for local-only use
- reads the local CLIProxyAPI auth key from `E:\Github Repos\CLIProxyAPI\config.yaml`
- writes `.career-ops-runner.local.json`
- starts CLIProxyAPI on `http://127.0.0.1:8317`
- starts the dashboard server on `http://127.0.0.1:3000`
- starts the Career Ops local runner control server on `http://127.0.0.1:48731`

Use OpenAI/Codex instead of Anthropic/Claude:

```powershell
powershell -ExecutionPolicy Bypass -File apps/job-dashboard/scripts/start-local.ps1 -AiProvider openai -AiModel gpt-5.4-mini
```

The default Anthropic model is `SubscriptionGateway/claude-haiku-4-5-20251001`, the cheapest working Claude option currently exposed by your CLIProxyAPI configuration. The dashboard can also test `gpt-5.4-mini` through Codex/OpenAI when that OAuth session is fresh.

### 3. Connect the dashboard

Open:

```text
http://127.0.0.1:3000
```

Go to `Operations` and click `Check Local Runner`. It should show `career-ops-local-runner connected`.

Use the same page to choose and test AI models:

- `AI model`: shows the requested OpenAI and Anthropic model list, with gateway availability.
- `Test Selected Model`: sends a tiny local CLIProxyAPI call using the selected provider/model.
- `Test Cheap Models`: tests `gpt-5.4-mini` and `SubscriptionGateway/claude-haiku-4-5-20251001`.

Command-line equivalent:

```powershell
npm run test:models --prefix apps/job-dashboard
```

Interpreting the model test results:

- `auth_unavailable` / `Invalid authentication credentials`: the OAuth session
  expired. Refresh it, then restart CLIProxyAPI:

  ```powershell
  cd "E:\Github Repos\CLIProxyAPI"
  go run ./cmd/server -codex-login
  ```

- `usage_limit_reached`: the account is authenticated but the subscription
  plan's quota is exhausted. This is **not** an auth problem — re-logging in
  will not help. Wait for the reset window (the error includes `resets_at`)
  or switch to the other provider in the dashboard model selector.

### 4. Configure profile and portals

In the dashboard:

- `Profile`: confirm name, email, target roles, location, skills.
- `Portals`: configure eJobs, BestJobs, HiPo, and LinkedIn profile URLs, login email, discovery keywords, and field hints.
- Do not store portal passwords. Log in manually inside the Chromium window when a runner opens it.

### 5. Find jobs

Dashboard path:

```text
Operations -> Find Jobs
```

The runner opens visible Chrome using the dedicated `.career-ops-chrome`
automation profile when Chrome is installed, so your portal sessions survive
between runs without touching your personal Chrome profile. Log into
LinkedIn/eJobs/BestJobs/HiPo the first time if prompted.

Command-line equivalent:

```powershell
npm run discover --prefix apps/job-dashboard
```

Portal smoke test without importing jobs:

```powershell
npm run smoke:portals --prefix apps/job-dashboard
```

This checks whether eJobs, BestJobs, HiPo, and LinkedIn search pages are reachable and whether the extractor can see postings.

### 6. AI-score discovered jobs

Dashboard path:

```text
Operations -> AI Score Jobs
```

This calls CLIProxyAPI locally and updates the job fit percentage, matched skills, missing skills, risk flags, reasons, and recommendation.

Command-line equivalent:

```powershell
npm run score:ai --prefix apps/job-dashboard
```

### 7. Generate application drafts

Dashboard path:

```text
Operations -> Generate AI Drafts
```

This creates cover letters, tailored CV markdown, required fields, and missing fields for jobs above your configured minimum fit.

Command-line equivalent:

```powershell
npm run draft:ai --prefix apps/job-dashboard
```

### 8. Review and approve

Dashboard path:

```text
Review -> approve only the packages you actually want to send
```

Low-fit jobs should be skipped unless you have a specific reason to override the score.

### 9. Fill approved applications

Dashboard path:

```text
Operations -> Fill Approved
```

The runner fills what it can and writes missing fields back to the dashboard. It stops before final submit. You review the portal page and manually click Submit/Send/Apply only if everything is correct.

Command-line equivalent:

```powershell
npm run run:applications --prefix apps/job-dashboard
```

## Useful Commands

```powershell
npm test --prefix apps/job-dashboard
node verify-pipeline.mjs
npm run runner:control --prefix apps/job-dashboard
npm run test:models --prefix apps/job-dashboard
npm run smoke:portals --prefix apps/job-dashboard
npm run discover --prefix apps/job-dashboard
npm run score:ai --prefix apps/job-dashboard
npm run draft:ai --prefix apps/job-dashboard
npm run run:applications --prefix apps/job-dashboard
```

## Optional Railway Deploys

Railway is no longer required for local use. If you choose to keep a hosted
copy, GitHub-triggered auto-deploy still requires manual authorization:

1. Open Railway.
2. Go to project settings or service settings for `job-dashboard`.
3. Connect/authorize the Railway GitHub App for `Apollomakesit/career-ops`.
4. Ensure the service root/watch path is `apps/job-dashboard`.

This cannot be completed from code because GitHub/Railway requires your account consent.

## Troubleshooting

- `Local runner offline`: run `apps/job-dashboard/scripts/start-local.ps1`, then click `Check Local Runner`.
- `AI generation failed`: confirm CLIProxyAPI is online at `http://127.0.0.1:8317` and the local runner config has an AI provider/base URL/key.
- `Invalid authentication credentials`: rerun `go run ./cmd/server -claude-login` or `go run ./cmd/server -codex-login` in `E:\Github Repos\CLIProxyAPI`, then restart CLIProxyAPI.
- `No portals configured`: run `npm run migrate --prefix apps/job-dashboard` and refresh the local dashboard.
- `Portal login/CAPTCHA`: complete it manually in the opened Chrome automation window.
- `No jobs found`: edit portal keywords, reduce filters, or log into the portal in the runner browser profile.
