---
name: daily-cost-report
description: Generate and send daily token usage and cost reports by agent, model, and task type.
homepage: https://github.com/claudiomolt
metadata: {"clawdbot":{"emoji":"📊","requires":{"bins":["node"],"env":["GMAIL_USER","GMAIL_APP_PASSWORD"]}}}
---

# Daily Cost Report

Generate professional HTML reports of daily token usage and estimated costs, broken down by agent, model, and task type.

## Usage

### Generate and Send Report

```bash
node {baseDir}/scripts/generate-report.js
```

### With Custom Date

```bash
node {baseDir}/scripts/generate-report.js --date 2026-02-05
```

### Preview Only (No Email)

```bash
node {baseDir}/scripts/generate-report.js --preview
# Opens: /tmp/daily-cost-report-YYYY-MM-DD.html
```

## Configuration

Email credentials must be set in `~/.clawdbot/skills/daily-cost-report/.env` or passed via environment:

```bash
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
REPORT_RECIPIENT=recipient@example.com
```

## Report Contents

The report includes:

| Section | Description |
|---------|-------------|
| **Summary Metrics** | Total tokens, Opus vs Sonnet breakdown, session count |
| **By Agent** | Token usage per agent (main, gorilatron, academy, etc.) |
| **By Task Type** | Conversation vs automated (cron) breakdown |
| **Session Details** | Top 10 sessions by token usage with model/type tags |
| **Cost Estimate** | USD estimate based on Anthropic pricing |

## Pricing Model

Current estimates (adjust in script as needed):

| Model | Avg Cost/1M tokens |
|-------|-------------------|
| Claude Opus 4.5 | ~$30 |
| Claude Sonnet 4.5 | ~$6 |

## Data Collection

The script uses `sessions_list` to gather active sessions from the past 24 hours. It aggregates:

1. **Agent identification** from session key prefix (`agent:NAME:...`)
2. **Model** from session metadata
3. **Task type** inferred from session key (`:cron:` vs `:dm:`)
4. **Token count** from `totalTokens` field

## Cron Integration

Add to your cron jobs for automated daily reports:

```json
{
  "name": "Daily Cost Report 11PM",
  "schedule": { "kind": "cron", "expr": "0 23 * * *", "tz": "America/Buenos_Aires" },
  "sessionTarget": "main",
  "payload": {
    "kind": "systemEvent",
    "text": "Generate and send the daily token/cost report using the daily-cost-report skill."
  }
}
```

## Output

- **Email**: Professional HTML report sent to configured recipient
- **Archive**: Reports saved to `~/clawd/memory/costs/YYYY-MM-DD.md`
- **Preview**: HTML file at `/tmp/daily-cost-report-YYYY-MM-DD.html`

## Template Customization

Edit `{baseDir}/scripts/generate-report.js` to customize:

- Colors and branding
- Sections included
- Pricing model
- Email subject format

---

*Created by Claudio ⚡ — 2026-02-05*
