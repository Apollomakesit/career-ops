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

Set this on the Railway `job-dashboard` service before using "Generate AI Draft":

```powershell
railway variable set --service job-dashboard OPENAI_API_KEY="sk-your-key"
railway variable set --service job-dashboard OPENAI_MODEL="gpt-5.2"
```

The generator uses OpenAI structured JSON output and creates draft packages only. Approval and final submission stay manual.

## Portal Discovery Runner

Run this locally so eJobs, BestJobs, HiPo, and LinkedIn logins stay on your machine:

```powershell
$env:DASHBOARD_URL="https://job-dashboard-production-0773.up.railway.app"
$env:DASHBOARD_TOKEN=(railway variable list --service job-dashboard --json | ConvertFrom-Json).DASHBOARD_TOKEN
npm run discover --prefix apps/job-dashboard
```

The runner opens a visible Chromium window with a persistent profile at `.career-ops-browser`. Log in or solve 2FA/CAPTCHA in that window when prompted.

## Application Filling Runner

The runner must be launched locally so portal logins and browser sessions stay on your machine:

```powershell
$env:DASHBOARD_URL="https://job-dashboard-production-0773.up.railway.app"
$env:DASHBOARD_TOKEN=(railway variable list --service job-dashboard --json | ConvertFrom-Json).DASHBOARD_TOKEN
npm run run:applications --prefix apps/job-dashboard
```

The runner opens approved packages, fills fields it can identify, writes missing fields back to the dashboard, and stops before final submit.
