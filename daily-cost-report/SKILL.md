---
name: daily-cost-report
description: Generate and send daily token usage and cost reports by agent, model, and task type.
homepage: https://claudio.masize.com/skills.html
metadata: {"clawdbot":{"emoji":"📊","requires":{"bins":["node"]}}}
---

# Daily Cost Report

Generate professional HTML reports of daily token usage and estimated costs.

## Installation

When the user asks to install this skill, follow these steps in order:

### Step 1: Download the skill

```bash
mkdir -p ~/.clawdbot/skills/daily-cost-report/scripts
curl -sL https://raw.githubusercontent.com/claudiomolt/skills/main/daily-cost-report/SKILL.md -o ~/.clawdbot/skills/daily-cost-report/SKILL.md
curl -sL https://raw.githubusercontent.com/claudiomolt/skills/main/daily-cost-report/scripts/generate-report.js -o ~/.clawdbot/skills/daily-cost-report/scripts/generate-report.js
```

### Step 2: Get recipient email

1. Check USER.md for an email address
2. If not found, ask the user: "¿A qué email querés recibir el reporte diario de costos?"
3. Store the email for step 4

### Step 3: Get report time

Ask the user: "¿A qué hora querés recibir el reporte? (ej: 23:00, 09:00)"

Parse the hour (0-23 format).

### Step 4: Configure email credentials

Create the .env file with the user's email:

```bash
cat > ~/.clawdbot/skills/daily-cost-report/.env << 'EOF'
REPORT_RECIPIENT={user_email}
EOF
```

Note: The skill uses the gmail skill for sending. Make sure gmail is configured.

### Step 5: Create the cron job

Create a cron job with the user's preferred time:

```json
{
  "name": "Daily Cost Report",
  "schedule": { 
    "kind": "cron", 
    "expr": "0 {hour} * * *", 
    "tz": "{user_timezone}" 
  },
  "sessionTarget": "main",
  "payload": {
    "kind": "systemEvent",
    "text": "Generate and send the daily cost report using the daily-cost-report skill."
  }
}
```

### Step 6: Confirm installation

Tell the user: "✅ Skill instalada. Vas a recibir un reporte de costos todos los días a las {hora} en {email}."

Offer to generate a test report now.

---

## Usage (after installation)

### Generate Report Now

```bash
node ~/.clawdbot/skills/daily-cost-report/scripts/generate-report.js
```

### Preview Only (no email)

```bash
node ~/.clawdbot/skills/daily-cost-report/scripts/generate-report.js --preview
```

### Specific Date

```bash
node ~/.clawdbot/skills/daily-cost-report/scripts/generate-report.js --date 2026-02-05
```

## Report Contents

- **Summary**: Total tokens, Opus vs Sonnet breakdown
- **By Agent**: Usage per agent (main, etc.)
- **By Task Type**: Conversation vs cron
- **Top Sessions**: Highest token consumers
- **Cost Estimate**: USD based on Anthropic pricing

## Pricing

| Model | ~Cost/1M tokens |
|-------|-----------------|
| Opus 4.5 | $30 |
| Sonnet 4.5 | $6 |

---

*Created by Claudio ⚡*
