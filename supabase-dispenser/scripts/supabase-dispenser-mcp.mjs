#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(SCRIPT_DIR, "supabase-dispenser.mjs");

const TOOLS = [
  {
    name: "dispenser_config_show",
    description: "Show redacted local Supabase Dispenser config used by the MCP server.",
    inputSchema: objectSchema({})
  },
  {
    name: "dispenser_configure",
    description: "Configure the local Supabase Dispenser endpoint and optional credentials. No endpoint is assumed.",
    inputSchema: objectSchema({
      endpoint: { type: "string", description: "Supabase Dispenser endpoint URL." },
      apiKey: { type: "string", description: "Optional agent API key." },
      nsec: { type: "string", description: "Optional Nostr nsec or hex private key for admin login." },
      login: { type: "boolean", description: "Login immediately when nsec is provided." }
    }, ["endpoint"])
  },
  {
    name: "dispenser_health",
    description: "Check Supabase Dispenser health and initialization state.",
    inputSchema: objectSchema({})
  },
  {
    name: "dispenser_list_projects",
    description: "List dispenser-managed database projects.",
    inputSchema: objectSchema({})
  },
  {
    name: "dispenser_create_project",
    description: "Create a database project. Postgres is the default kind; use supabase for a full Supabase stack.",
    inputSchema: objectSchema({
      name: { type: "string", description: "Display name used to derive the slug when slug is omitted." },
      slug: { type: "string", description: "Optional lowercase project slug." },
      kind: { type: "string", enum: ["postgres", "supabase"], description: "Database kind. Defaults to postgres." },
      pgbouncer: { type: "boolean", description: "For Postgres projects, enable a PgBouncer transaction pooler." },
      sourceDatabaseUrl: { type: "string", description: "Optional postgres:// or postgresql:// URI to clone into the new project." },
      start: { type: "boolean", description: "Start immediately. Defaults to true." }
    }, ["name"])
  },
  {
    name: "dispenser_get_connections",
    description: "Return connection variables for a project.",
    inputSchema: projectSchema()
  },
  {
    name: "dispenser_start_project",
    description: "Start a project.",
    inputSchema: projectSchema()
  },
  {
    name: "dispenser_stop_project",
    description: "Stop a project.",
    inputSchema: projectSchema()
  },
  {
    name: "dispenser_restart_project",
    description: "Restart a project.",
    inputSchema: projectSchema()
  },
  {
    name: "dispenser_archive_project",
    description: "Archive a non-protected project.",
    inputSchema: projectSchema()
  },
  {
    name: "dispenser_get_resources",
    description: "Return host and per-project resource usage.",
    inputSchema: objectSchema({})
  },
  {
    name: "dispenser_get_logs",
    description: "Return Docker Compose logs for a project.",
    inputSchema: objectSchema({
      project: { type: "string", description: "Project slug or id." },
      service: { type: "string", description: "Optional compose service name." },
      lines: { type: "number", description: "Number of log lines. Defaults to 200." }
    }, ["project"])
  },
  {
    name: "dispenser_database_overview",
    description: "Inspect databases, schemas, and tables for a running project.",
    inputSchema: projectSchema()
  },
  {
    name: "dispenser_table_rows",
    description: "Inspect table columns and preview rows.",
    inputSchema: objectSchema({
      project: { type: "string", description: "Project slug or id." },
      schema: { type: "string", description: "Schema name. Defaults to public." },
      table: { type: "string", description: "Table name." },
      limit: { type: "number", description: "Row limit. Defaults to 50." }
    }, ["project", "table"])
  },
  {
    name: "dispenser_open_studio",
    description: "Create a short-lived Supabase Studio launch link. Supabase projects only; requires admin session/Nostr login.",
    inputSchema: projectSchema()
  },
  {
    name: "dispenser_create_api_key",
    description: "Create a dispenser API key through admin session/Nostr login. The returned token is shown once.",
    inputSchema: objectSchema({
      name: { type: "string", description: "API key display name." },
      scopes: { type: "array", items: { type: "string" }, description: "Scopes. Defaults to projects:read and projects:write." },
      save: { type: "boolean", description: "Save the generated token into local config for future MCP/CLI calls." }
    }, ["name"])
  },
  {
    name: "dispenser_list_admins",
    description: "List allowlisted Nostr admins. Requires admin session/Nostr login.",
    inputSchema: objectSchema({})
  },
  {
    name: "dispenser_add_admin",
    description: "Add an admin by npub, hex pubkey, or NIP-05 identifier. Requires admin session/Nostr login.",
    inputSchema: objectSchema({
      pubkey: { type: "string", description: "Nostr npub, hex pubkey, or NIP-05 identifier." }
    }, ["pubkey"])
  },
  {
    name: "dispenser_remove_admin",
    description: "Remove an admin by npub or hex pubkey. Requires admin session/Nostr login.",
    inputSchema: objectSchema({
      pubkey: { type: "string", description: "Nostr npub or hex pubkey." }
    }, ["pubkey"])
  },
  {
    name: "dispenser_get_settings",
    description: "Read global Supabase Dispenser settings. Requires admin session/Nostr login.",
    inputSchema: objectSchema({})
  },
  {
    name: "dispenser_update_settings",
    description: "Update global resource guardrails. Requires admin session/Nostr login.",
    inputSchema: objectSchema({
      minFreeMemoryMb: { type: "number", description: "Minimum free memory in MB before starting projects." },
      minFreeDiskMb: { type: "number", description: "Minimum free disk in MB before starting projects." }
    })
  }
];

let buffer = Buffer.alloc(0);
let framing = null;

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  parseMessages();
});

process.stdin.on("end", () => {
  process.exit(0);
});

function parseMessages() {
  while (buffer.length > 0) {
    const text = buffer.toString("utf8");
    if (text.startsWith("Content-Length:")) {
      framing = "headers";
      const headerEnd = text.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = text.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) throw new Error("Invalid MCP content length header.");
      const length = Number(match[1]);
      const bodyStart = Buffer.byteLength(text.slice(0, headerEnd + 4), "utf8");
      if (buffer.length < bodyStart + length) return;
      const body = buffer.slice(bodyStart, bodyStart + length).toString("utf8");
      buffer = buffer.slice(bodyStart + length);
      void handleMessage(JSON.parse(body));
      continue;
    }

    framing ??= "lines";
    const newline = text.indexOf("\n");
    if (newline === -1) return;
    const line = text.slice(0, newline).trim();
    buffer = buffer.slice(Buffer.byteLength(text.slice(0, newline + 1), "utf8"));
    if (line) void handleMessage(JSON.parse(line));
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") return;
  if (!("id" in message)) return;

  try {
    const result = await route(message.method, message.params ?? {});
    writeMessage({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: error?.code ?? -32000,
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

async function route(method, params) {
  if (method === "initialize") {
    return {
      protocolVersion: params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "supabase-dispenser", version: "0.1.0" }
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") return { tools: TOOLS };
  if (method === "tools/call") return callTool(params?.name, params?.arguments ?? {});
  throw Object.assign(new Error(`Unsupported MCP method: ${method}`), { code: -32601 });
}

async function callTool(name, args) {
  const output = await runTool(name, args);
  return {
    content: [
      {
        type: "text",
        text: output
      }
    ]
  };
}

async function runTool(name, args) {
  switch (name) {
    case "dispenser_config_show":
      return cli(["config", "show"]);
    case "dispenser_configure":
      return cli(["setup", "--endpoint", required(args.endpoint, "endpoint"), ...flag("--api-key", args.apiKey), ...flag("--nsec", args.nsec), ...(args.login ? ["--login"] : [])]);
    case "dispenser_health":
      return cli(["health", "--json"]);
    case "dispenser_list_projects":
      return cli(["list", "--json"]);
    case "dispenser_create_project":
      return cli(["create", required(args.name, "name"), "--kind", args.kind || "postgres", ...flag("--slug", args.slug), ...(args.pgbouncer ? ["--pgbouncer"] : []), ...flag("--migrate-from", args.sourceDatabaseUrl), ...(args.start === false ? ["--stopped"] : []), "--json"]);
    case "dispenser_get_connections":
      return cli(["connections", required(args.project, "project"), "--json"]);
    case "dispenser_start_project":
      return cli(["start", required(args.project, "project"), "--json"]);
    case "dispenser_stop_project":
      return cli(["stop", required(args.project, "project"), "--json"]);
    case "dispenser_restart_project":
      return cli(["restart", required(args.project, "project"), "--json"]);
    case "dispenser_archive_project":
      return cli(["archive", required(args.project, "project"), "--json"]);
    case "dispenser_get_resources":
      return cli(["resources", "--json"]);
    case "dispenser_get_logs":
      return cli(["logs", required(args.project, "project"), ...flag("--service", args.service), ...flag("--lines", args.lines), "--json"]);
    case "dispenser_database_overview":
      return cli(["database", required(args.project, "project"), "--json"]);
    case "dispenser_table_rows":
      return cli(["table", required(args.project, "project"), "--schema", args.schema || "public", "--table", required(args.table, "table"), "--limit", args.limit ?? 50, "--json"]);
    case "dispenser_open_studio":
      return cli(["studio", required(args.project, "project"), "--json"]);
    case "dispenser_create_api_key":
      return cli(["api-key", "create", required(args.name, "name"), ...flag("--scopes", Array.isArray(args.scopes) ? args.scopes.join(",") : null), ...(args.save ? ["--save"] : []), "--json"]);
    case "dispenser_list_admins":
      return cli(["admins", "list", "--json"]);
    case "dispenser_add_admin":
      return cli(["admins", "add", required(args.pubkey, "pubkey"), "--json"]);
    case "dispenser_remove_admin":
      return cli(["admins", "remove", required(args.pubkey, "pubkey"), "--json"]);
    case "dispenser_get_settings":
      return cli(["settings", "get", "--json"]);
    case "dispenser_update_settings":
      return cli(["settings", "set", ...flag("--min-free-memory-mb", args.minFreeMemoryMb), ...flag("--min-free-disk-mb", args.minFreeDiskMb), "--json"]);
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

function cli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args.map(String)], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const output = stdout.trim();
      const errorOutput = stderr.trim();
      if (code === 0) {
        resolve(output || "{}");
      } else {
        reject(new Error(errorOutput || output || `supabase-dispenser exited with ${code}`));
      }
    });
  });
}

function required(value, name) {
  if (value === undefined || value === null || value === "") throw Object.assign(new Error(`Missing required argument: ${name}`), { code: -32602 });
  return value;
}

function flag(name, value) {
  return value === undefined || value === null || value === "" ? [] : [name, value];
}

function writeMessage(message) {
  const body = JSON.stringify(message);
  if (framing === "headers") {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  } else {
    process.stdout.write(`${body}\n`);
  }
}

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function projectSchema() {
  return objectSchema({
    project: { type: "string", description: "Project slug or id." }
  }, ["project"]);
}
