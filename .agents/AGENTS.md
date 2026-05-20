# Career-Ops Custom Claude Agents

This directory contains 4 specialized agents designed to automate and optimize your job search pipeline. Each agent handles a specific phase of the career-ops workflow.

## Agent Overview

| Agent | Role | When to Use | Key Capability |
|-------|------|-------------|-----------------|
| **Offer Analyzer** | Evaluator | Paste a job URL or evaluate an offer | Scores offers, generates reports, creates tailored CVs |
| **Job Scout** | Discoverer | Need to find new job opportunities | Scans portals, checks liveness, avoids duplicates |
| **Pipeline Architect** | Strategist | Plan your job search or optimize pipeline | Designs search strategy, analyzes patterns, optimizes follow-up timing |
| **Offer Reviewer** | Quality Auditor | Verify evaluations or audit decisions | Catches scoring errors, ensures alignment, validates tracker |

## Agent Workflows

### Typical Job Search Workflow

```
Job Scout (find opportunities)
    ↓
Offer Analyzer (evaluate & report)
    ↓
Offer Reviewer (audit decision)
    ↓
Apply (user decides)
    ↓
Follow-up (track conversations)
```

### Strategic Planning Workflow

```
Pipeline Architect (design strategy)
    ↓
Job Scout (source candidates per strategy)
    ↓
Offer Analyzer (batch evaluate)
    ↓
Offer Reviewer (consistency audit)
    ↓
Adjust & repeat
```

## Agent Details

### 1. Offer Analyzer 🎯

**File:** `offer-analyzer.agent.md`

**Purpose:** Evaluate job offers and process applications through the career-ops pipeline.

**Use when:**
- You paste a job URL or offer details
- You want to evaluate a specific company/role
- You need a tailored CV generated
- You want to batch-process multiple offers

**What it does:**
- Fetches job postings from URLs (Playwright navigation)
- Scores offers against all 6 blocks (A-F: fit, salary, culture, growth, stability + G: legitimacy)
- Generates evaluation reports in `reports/`
- Creates tailored CVs (if fit >= 4.0)
- Manages `applications.md` tracker
- Runs through language-specific modes (English, German, French, Japanese, Turkish)

**Example prompts:**
```
"Evaluate this fintech role: {url}"
"I got an offer from Acme Corp for Senior ML Engineer. Score it."
"Generate a PDF for the Microsoft offer."
"Batch evaluate the 5 URLs in my pipeline."
```

---

### 2. Job Scout 🔍

**File:** `job-scout.agent.md`

**Purpose:** Discover new job opportunities and manage the discovery pipeline.

**Use when:**
- You want to search job portals for new roles
- You need to check if a posting is still active
- You want to source candidates matching your profile
- You need to avoid duplicate evaluations

**What it does:**
- Scans Greenhouse/Ashby/Lever APIs (zero-token cost via `scan.mjs`)
- Checks job posting liveness
- Deduplicates against existing evaluations and pipeline
- Feeds URLs to `data/pipeline.md`
- Verifies company legitimacy

**Example prompts:**
```
"Scan for AI/automation roles at these companies: {list}"
"Do a quick search for remote backend roles"
"Is this posting still active? {url}"
"Find all new fintech opportunities from the past week"
```

**Search breadth options:**
- **Quick**: 5-10 min, top companies, top fits
- **Medium**: 15-20 min, all configured portals, filtered
- **Thorough**: 30-45 min, medium + manual research + LinkedIn

---

### 3. Pipeline Architect 🏗️

**File:** `pipeline-architect.agent.md`

**Purpose:** Design and optimize your job search strategy and execution pipeline.

**Use when:**
- You're starting a job search (need a strategy)
- You want to optimize follow-up timing
- You need to analyze patterns in past evaluations
- You want to refine your archetype weights or evaluation criteria

**What it does:**
- Clarifies your job search goals (timeline, scope, constraints)
- Analyzes past evaluation patterns (fit distribution, company clusters, outcomes)
- Proposes tailored search strategies (sourcing, evaluation cadence, application threshold)
- Optimizes follow-up timing using historical response windows
- Recommends archetype adjustments

**Example prompts:**
```
"Design a job search strategy for landing an AI role in 2 months"
"I've evaluated 50 roles with avg fit 3.8. Why is that? Should I adjust my targeting?"
"Optimize my follow-up timing for Series B startups"
"What search strategy matches my stated targets?"
```

---

### 4. Offer Reviewer ✅

**File:** `offer-reviewer.agent.md`

**Purpose:** Audit evaluations and verify quality of decisions.

**Use when:**
- You want to verify a score before applying
- You suspect an evaluation error
- You want to audit your application decisions
- You need to check tracker consistency

**What it does:**
- Re-scores evaluations independently against mode criteria
- Verifies posting liveness before trusting evaluation
- Audits application decisions against your strategy
- Checks tracker consistency (`applications.md` vs `reports/`)
- Identifies pattern drift from your stated profile

**Example prompts:**
```
"Review this report: reports/042-netflix-2025-05-15.md"
"Is the decision to skip this role justified? {url}"
"Audit the last 10 evaluations — are they aligned with my profile?"
"Check if all reports in applications.md are consistent"
```

---

## Integration Points

### Data Layer

All agents read/write to:

**User layer (customizable):**
- `cv.md` — canonical CV (read by all)
- `config/profile.yml` — goals, targets, constraints (read by all)
- `modes/_profile.md` — custom archetypes, weights, preferences (read by all)
- `article-digest.md` — proof points (read by Offer Analyzer)
- `data/applications.md` — application tracker (read/write by Offer Analyzer, read by others)
- `data/pipeline.md` — pending URLs (read/write by Job Scout, read by Offer Analyzer)
- `data/follow-ups.md` — follow-up history (read by all, written manually or via follow-up system)
- `portals.yml` — company search config (read by Job Scout, read by Pipeline Architect)

**System layer (auto-updatable):**
- `modes/oferta.md` (and other language modes) — evaluation criteria (read by Offer Analyzer & Reviewer)
- `reports/` — evaluation reports (written by Offer Analyzer, read by Offer Reviewer)
- `data/scan-history.tsv` — scan dedup history (written by Job Scout, read by Job Scout)
- `batch/tracker-additions/` — pending tracker entries (written by Offer Analyzer, merged by `merge-tracker.mjs`)
- `jds/` — raw job postings (written by Job Scout, referenced by Offer Analyzer)

### Tool Interactions

```
Job Scout
  ├─ Runs: scan.mjs, check-liveness.mjs, verify-pipeline.mjs
  └─ Updates: data/pipeline.md, jds/, data/scan-history.tsv

Offer Analyzer
  ├─ Calls: Job Scout (for missing URLs)
  ├─ Runs: generate-pdf.mjs, generate-latex.mjs, verify-pipeline.mjs
  └─ Updates: reports/, batch/tracker-additions/, data/pipeline.md

Pipeline Architect
  ├─ Runs: analyze-patterns.mjs, followup-cadence.mjs, verify-pipeline.mjs
  └─ Calls: Job Scout (for sourcing phase)

Offer Reviewer
  ├─ Runs: verify-pipeline.mjs, check-liveness.mjs, analyze-patterns.mjs
  └─ Calls: none (purely read-only)
```

## Getting Started

### First Time?

1. **Start with Pipeline Architect** → Define your job search strategy
   ```
   "Design a job search strategy for a Senior ML Engineer role in the Bay Area, 
    looking for funded Series B-C startups, $300k+ total comp, 6-month timeline"
   ```

2. **Then Job Scout** → Find opportunities matching your strategy
   ```
   "Search for [Strategy] roles matching the strategy we designed"
   ```

3. **Then Offer Analyzer** → Evaluate promising opportunities
   ```
   "Evaluate these 3 URLs we found"
   ```

4. **Then Offer Reviewer** → Verify before applying
   ```
   "Audit these evaluations to confirm they match our strategy"
   ```

### Recurring Searches?

```
Job Scout (quick scan, 10 min) 
  → Offer Analyzer (evaluate top 3) 
  → Offer Reviewer (verify decisions) 
  → Repeat weekly
```

## Agent Configuration

Each agent is defined as a markdown file with YAML frontmatter:

```yaml
name: "Agent Name"
description: "When to use and what it does"
tools: [list of available tools]
agents: [can call these subagents]
user-invocable: true
argument-hint: "What information to provide"
```

The agents are Claude Code agents and can be invoked via:
- **Direct call** (if registered in VS Code or Claude Code CLI)
- **Through another agent** (via subagent delegation)
- **As text instructions** (copy-paste the prompt into your coding assistant)

## Common Patterns

### Pattern 1: Weekly Opportunity Scan

```
User → Job Scout: "Quick scan of the usual companies"
Job Scout → 8 new roles found, 2 already evaluated, 6 new
User → Offer Analyzer: "Evaluate the top 3 by fit"
Offer Analyzer → generates reports, scores 4.1, 3.8, 3.5
User → Offer Reviewer: "Audit these"
Offer Reviewer → confirms all defensible
User → applies to top 2
```

### Pattern 2: Strategic Pivot

```
User → Pipeline Architect: "I want to shift toward AI safety roles instead of startups"
Architect → analyzes past evaluations, recommends archetype adjustments
User → approves archetype changes in modes/_profile.md
User → Job Scout: "Search for AI safety roles"
Job Scout → finds candidates at established orgs + startups with safety teams
User → Offer Analyzer: "Batch evaluate 10 opportunities"
...
```

### Pattern 3: Offer Decision Stress Test

```
User → Offer Reviewer: "Review this fintech offer before I negotiate"
Reviewer → checks score, legitimacy, alignment with goals
Reviewer → flag: "Score is 4.2 but company's market is shrinking (news from 2025-05-15)"
User → decides to negotiate harder or walk away
```

## Troubleshooting

### "Agent says data is out of date"

- Run `node verify-pipeline.mjs` to check tracker health
- Run `node analyze-patterns.mjs` to refresh pattern insights
- Check if `config/profile.yml` needs updating (goals changed?)

### "Scores seem off"

- Use **Offer Reviewer** to audit recent evaluations
- Check if `modes/_profile.md` reflects your current preferences
- Ask **Pipeline Architect** if patterns suggest drift from profile

### "Missing opportunities"

- Use **Job Scout** to scan portals configured in `portals.yml`
- Add new companies to `portals.yml` if you want them included
- Run `node scan.mjs --config portals.yml` manually for one-off searches

### "Tracker is corrupted"

- Run `node verify-pipeline.mjs` to diagnose
- Check `batch/tracker-additions/` for pending merges
- Run `node merge-tracker.mjs` to consolidate

## Architecture Decisions

1. **Why 4 agents?**
   - Separation of concerns: discovery, evaluation, strategy, quality
   - Specialized prompts reduce hallucination
   - Easy to delegate sub-tasks in parallel
   - Each agent has a clear decision gate

2. **Why read-only for Architect & Reviewer?**
   - Strategy and audit need fresh eyes (no hidden state changes)
   - Prevents unintended mutations while planning/reviewing
   - Clearer responsibility: Analyzer writes, Architect/Reviewer advise

3. **Why the batch/tracker-additions system?**
   - Prevents duplicate tracker entries from concurrent evaluations
   - Single source of truth: `applications.md` is canonical
   - Merge script handles consolidation safely

4. **Why language modes?**
   - Users apply to jobs in their local language
   - Scoring criteria differ by market (German comp negotiation ≠ US)
   - Archetypes are localized (not all markets have "Series A startup")

## Next Steps

- Copy these agent files into your project `.agents/` directory
- Update with your specific tools/integrations as needed
- Test with a sample evaluation workflow
- Refine archetype weights in `modes/_profile.md` based on agent feedback
