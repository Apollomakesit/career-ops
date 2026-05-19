# Career Ops Job Dashboard

Railway-hosted dashboard for the career-ops application workflow.

## Commands

```bash
npm install
npm test
npm run migrate
npm start
```

## AI Draft Generation

Preferred setup: run AI locally through CLIProxyAPI so your OpenAI/Codex or Anthropic/Claude account stays on your machine.

1. Start CLIProxyAPI from `E:\Github Repos\CLIProxyAPI`:

```powershell
go run ./cmd/server
```

2. If you have not logged in yet, use one of:

```powershell
go run ./cmd/server -codex-login
go run ./cmd/server -claude-login
```

3. Start the Career Ops local runner control server:

```powershell
$env:DASHBOARD_URL="https://job-dashboard-production-0773.up.railway.app"
$env:DASHBOARD_TOKEN=(railway variable list --service job-dashboard --json | ConvertFrom-Json).DASHBOARD_TOKEN
npm run runner:control --prefix apps/job-dashboard
```

Then use the dashboard Operations tab to configure:

- `openai` with `http://127.0.0.1:8317/api/provider/openai/v1` for OpenAI/Codex
- `anthropic` with `http://127.0.0.1:8317/api/provider/anthropic/v1` for Anthropic/Claude

The dashboard can start local discovery, local AI draft generation, and local application filling from that tab.

Optional hosted fallback: set this on the Railway `job-dashboard` service if you still want the hosted app to call OpenAI directly:

```powershell
railway variable set --service job-dashboard OPENAI_API_KEY="sk-your-key"
railway variable set --service job-dashboard OPENAI_MODEL="gpt-5.2"
```

Both generators create draft packages only. Approval and final submission stay manual.

## Portal Discovery Runner

Run this locally so eJobs, BestJobs, HiPo, and LinkedIn logins stay on your machine:

```powershell
$env:DASHBOARD_URL="https://job-dashboard-production-0773.up.railway.app"
$env:DASHBOARD_TOKEN=(railway variable list --service job-dashboard --json | ConvertFrom-Json).DASHBOARD_TOKEN
npm run discover --prefix apps/job-dashboard
```

The runner opens a visible Chromium window with a persistent profile at `.career-ops-browser`. Log in or solve 2FA/CAPTCHA in that window when prompted.

Portal search keywords and form field hints are editable in the dashboard Portals tab.

## Local AI Draft Runner

```powershell
$env:DASHBOARD_URL="https://job-dashboard-production-0773.up.railway.app"
$env:DASHBOARD_TOKEN=(railway variable list --service job-dashboard --json | ConvertFrom-Json).DASHBOARD_TOKEN
$env:AI_PROVIDER="openai"
$env:AI_BASE_URL="http://127.0.0.1:8317/api/provider/openai/v1"
$env:AI_MODEL="gpt-5.2"
npm run draft:ai --prefix apps/job-dashboard
```

Use `AI_PROVIDER="anthropic"` and `AI_BASE_URL="http://127.0.0.1:8317/api/provider/anthropic/v1"` for Claude via CLIProxyAPI.

## Application Filling Runner

The runner must be launched locally so portal logins and browser sessions stay on your machine:

```powershell
$env:DASHBOARD_URL="https://job-dashboard-production-0773.up.railway.app"
$env:DASHBOARD_TOKEN=(railway variable list --service job-dashboard --json | ConvertFrom-Json).DASHBOARD_TOKEN
npm run run:applications --prefix apps/job-dashboard
```

The runner opens approved packages, fills fields it can identify, writes missing fields back to the dashboard, and stops before final submit.
