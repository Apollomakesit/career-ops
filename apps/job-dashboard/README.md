# Career Ops Job Dashboard

Railway-hosted dashboard for the career-ops application workflow.

## Commands

```bash
npm install
npm test
npm run migrate
npm start
```

## Local Runner

The runner must be launched locally so portal logins and browser sessions stay on your machine:

```bash
$env:DASHBOARD_URL="https://your-dashboard.up.railway.app"
$env:DASHBOARD_TOKEN="your-token"
node runner/playwright-runner.mjs
```

The runner opens approved packages, fills fields it can identify, writes missing fields back to the dashboard, and stops before final submit.
