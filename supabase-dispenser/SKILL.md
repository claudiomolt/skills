---
name: supabase-dispenser
description: Create, start, stop, inspect, and manage self-hosted Supabase Dispenser database projects from any agent workspace through CLI or MCP tools. Use when the user needs a fresh Postgres database by default, an explicit Supabase stack, connection strings, project lifecycle control, resource/settings checks, Studio access, API key generation, Nostr admin login, or an MCP server for a configured Supabase Dispenser endpoint.
---

# Supabase Dispenser

Manage Supabase Dispenser database projects with the bundled CLI. The skill is endpoint-agnostic: never assume a default endpoint, and never commit an endpoint, API key, nsec, cookie, or connection string into a repository. Postgres is the default database kind; use Supabase only when the task needs Supabase REST/auth/storage/Studio.

## First-Time Setup

Install globally into Claude Code and Codex with the Skills CLI:

```bash
npx skills add claudiomolt/skills \
  --skill supabase-dispenser \
  --global \
  --agent claude-code codex \
  --copy \
  --yes
```

When installing from a checkout of this skill repository, use the bundled
installer. It copies the skill into both `~/.codex/skills` and
`~/.claude/skills` and creates the `supabase-dispenser` and
`supabase-dispenser-mcp` wrappers:

```bash
bash {baseDir}/scripts/install.sh --codex --claude
```

Then configure once. Ask the user for the endpoint URL when it is not already configured; do not suggest or fill a default endpoint.

```bash
supabase-dispenser setup
```

Setup stores local-only config in `~/.config/supabase-dispenser-skill/config.json` with restrictive permissions. It can store either an agent API key, a Nostr `nsec`/hex private key, or both. Prefer an API key for routine project operations. Use the `nsec` only when session-admin endpoints are needed, such as Studio launch links, admin management, settings, or API key creation.

Environment variables override local config for one-off use:

```bash
SUPABASE_DISPENSER_URL="https://example.invalid" \
SUPABASE_DISPENSER_API_KEY="sd_live_..." \
supabase-dispenser list
```

## Credential Modes

- **User provides an API key**: save it with `supabase-dispenser setup --endpoint <url> --api-key <token>` or pass it as `SUPABASE_DISPENSER_API_KEY`. Use this for normal project work: create, list, start, stop, restart, archive, resources, logs, and connection strings.
- **User provides Nostr admin access**: save an `nsec`/hex private key with `supabase-dispenser setup --endpoint <url> --nsec <nsec> --login`. Use this for admin-only tasks: creating dispenser API keys, saving a generated key locally, opening Studio launch links, managing admins, and changing settings.
- **Create an API key from Nostr admin login**: run `supabase-dispenser api-key create "agent-name" --save`. This stores the returned key locally for future API-key mode use. The token is shown once by the server, so treat it as a secret.

## Common Commands

```bash
# Create and start a Postgres project by display name; slug is derived unless --slug is supplied.
supabase-dispenser create "Feature Preview"

# Create and start Postgres with PgBouncer transaction pooling.
supabase-dispenser create "Feature Preview" --pgbouncer

# Create and clone from an existing Postgres or Supabase database URI.
supabase-dispenser create "Feature Preview" --migrate-from "postgresql://user:password@host:5432/database"

# Create and start a full Supabase stack.
supabase-dispenser create "Feature Preview" --kind supabase

# Create without starting.
supabase-dispenser create "Feature Preview" --stopped

# Print copy-ready environment variables for an existing project.
supabase-dispenser connections <project-slug-or-id>

# Lifecycle.
supabase-dispenser list
supabase-dispenser start <project>
supabase-dispenser stop <project>
supabase-dispenser restart <project>
supabase-dispenser archive <project>

# Resources and logs.
supabase-dispenser resources
supabase-dispenser logs <project> --lines 100

# Schema inspection.
supabase-dispenser database <project>
supabase-dispenser table <project> --schema public --table users

# Admin/session operations. These require stored nsec login or an existing session cookie.
supabase-dispenser login
supabase-dispenser studio <project>
supabase-dispenser api-key create "codex-agent" --save
supabase-dispenser admins add name@example.com
supabase-dispenser settings set --min-free-memory-mb 512
```

## MCP Server

Install also creates a stdio MCP server wrapper:

```bash
supabase-dispenser-mcp
```

Configure MCP clients to run that command. The server uses the same local config and environment variables as the CLI, so run `supabase-dispenser setup` first or provide `SUPABASE_DISPENSER_URL` and `SUPABASE_DISPENSER_API_KEY` in the MCP environment.

The MCP exposes tools for configuration, health, project create/list/start/stop/restart/archive, connection strings, resources, logs, database/table inspection, Studio links, admin allowlist management, settings, and API key creation. Postgres is still the default kind for `dispenser_create_project`; pass `kind: "supabase"` when a full Supabase stack is needed.

Example MCP config:

```json
{
  "mcpServers": {
    "supabase-dispenser": {
      "command": "supabase-dispenser-mcp"
    }
  }
}
```

## Agent Workflow

1. If the user asks for a new database, create Postgres by default with `supabase-dispenser create "<display name>"`. Use `--kind supabase` only when the user asks for Supabase features.
2. If setup is missing, ask the user for the endpoint URL and run `supabase-dispenser setup`. Do not use any remembered endpoint as a default.
3. If the user provides an API key, use it directly. If the user provides Nostr admin credentials and asks for reusable access, create an API key with `supabase-dispenser api-key create "agent-name" --save`.
4. Return `DATABASE_URL` for Postgres projects, plus `DATABASE_POOL_URL` when PgBouncer is enabled. For migrations, use `--migrate-from <postgres-uri>` or MCP `sourceDatabaseUrl`; never echo the source URI back. For Supabase projects, also return `SUPABASE_URL`, anon key, service role key, pooler URL, and Studio URL when present.
5. Use `--json` when the caller needs structured output.
6. Treat `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, API keys, session cookies, and `nsec` values as secrets.
7. For editing tables or managing the database visually, run `supabase-dispenser studio <project>` only for Supabase projects; use `supabase-dispenser database` and `supabase-dispenser table` for either kind.
