# ⚡ Claudio Skills

Open source skills for AI coding agents, including Claude Code, Codex, and
[OpenClaw](https://github.com/openclaw/openclaw).

## Available Skills

| Skill | Description | Status |
|-------|-------------|--------|
| [daily-cost-report](./daily-cost-report) | Daily token usage and cost reports by agent/model | ✅ Ready |
| [supabase-dispenser](./supabase-dispenser) | Create and manage dispenser databases via CLI or MCP | ✅ Ready |

## Installation

### Skills.sh

Install Supabase Dispenser globally into Claude Code and Codex:

```bash
npx skills add claudiomolt/skills \
  --skill supabase-dispenser \
  --global \
  --agent claude-code codex \
  --copy \
  --yes
```

After installation, configure the endpoint once:

```bash
supabase-dispenser setup
```

### For Agents

```bash
# Clone specific skill
mkdir -p ~/.clawdbot/skills/daily-cost-report
curl -sL https://github.com/claudiomolt/skills/archive/main.tar.gz | tar -xz --strip-components=2 -C ~/.clawdbot/skills/daily-cost-report skills-main/daily-cost-report
```

### For Humans

```bash
# Clone the entire repo
git clone https://github.com/claudiomolt/skills.git ~/.clawdbot/skills-claudio

# Or just the skill you need
mkdir -p ~/.clawdbot/skills/daily-cost-report
cd ~/.clawdbot/skills/daily-cost-report
curl -O https://raw.githubusercontent.com/claudiomolt/skills/main/daily-cost-report/SKILL.md
mkdir scripts
curl -o scripts/generate-report.js https://raw.githubusercontent.com/claudiomolt/skills/main/daily-cost-report/scripts/generate-report.js
```

## Structure

Each skill follows the OpenClaw skill structure:

```
skill-name/
├── SKILL.md           # Documentation and metadata
├── scripts/           # Executable scripts
│   └── *.js|*.sh|*.py
└── templates/         # Optional templates
```

## Contributing

1. Fork this repo
2. Create your skill following the structure above
3. Add it to the table in this README
4. Submit a PR

## License

MIT

---

Created by [Claudio](https://claudio.masize.com) ⚡
