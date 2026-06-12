#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const CONFIG_DIR = process.env.SUPABASE_DISPENSER_CONFIG_DIR || path.join(os.homedir(), ".config", "supabase-dispenser-skill");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const P = BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f");
const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
const G = {
  x: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  y: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
};
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

async function main() {
  const [command = "help", ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "help" || command === "--help" || command === "-h") return printHelp();
  if (command === "setup") return setup(args);
  if (command === "login") return loginCommand(args);
  if (command === "config") return configCommand(args);
  if (command === "health") return healthCommand(args);
  if (command === "list") return listCommand(args);
  if (command === "create") return createCommand(args);
  if (command === "connections" || command === "url" || command === "env") return connectionsCommand(args);
  if (["start", "stop", "restart"].includes(command)) return lifecycleCommand(command, args);
  if (command === "archive" || command === "delete") return archiveCommand(args);
  if (command === "resources") return resourcesCommand(args);
  if (command === "logs") return logsCommand(args);
  if (command === "database") return databaseCommand(args);
  if (command === "table") return tableCommand(args);
  if (command === "studio" || command === "edit") return studioCommand(args);
  if (command === "api-key" || command === "api-keys") return apiKeyCommand(args);
  if (command === "admins") return adminsCommand(args);
  if (command === "settings") return settingsCommand(args);

  throw new Error(`Unknown command: ${command}`);
}

async function setup(args) {
  const existing = readConfig();
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  let endpoint = stringFlag(args, "endpoint") || process.env.SUPABASE_DISPENSER_URL || existing.endpoint || "";
  let apiKey = stringFlag(args, "api-key") || process.env.SUPABASE_DISPENSER_API_KEY || existing.apiKey || "";
  let nsec = stringFlag(args, "nsec") || process.env.SUPABASE_DISPENSER_NSEC || existing.nsec || "";

  if (!endpoint && interactive) {
    endpoint = await promptText("Supabase Dispenser endpoint URL: ");
  }
  if (!endpoint) {
    throw new Error("Missing endpoint. Run setup interactively or pass --endpoint <url>.");
  }

  if (!hasFlag(args, "api-key") && !process.env.SUPABASE_DISPENSER_API_KEY && interactive) {
    const value = await promptHidden("Agent API key (optional, enter to skip): ");
    if (value) apiKey = value;
  }
  if (!hasFlag(args, "nsec") && !process.env.SUPABASE_DISPENSER_NSEC && interactive) {
    const value = await promptHidden("Nostr nsec/private key for admin login (optional, enter to skip): ");
    if (value) nsec = value;
  }
  if (hasFlag(args, "no-api-key")) apiKey = "";
  if (hasFlag(args, "no-nsec")) nsec = "";

  const next = {
    ...existing,
    endpoint: normalizeEndpoint(endpoint),
    apiKey: apiKey || undefined,
    nsec: nsec || undefined
  };

  if (next.nsec) {
    const secret = decodeSecretKey(next.nsec);
    next.pubkey = publicKeyFromSecret(secret);
  }

  writeConfig(next);

  if (next.nsec && hasFlag(args, "login")) {
    await loginWithNsec(next, { persist: true });
  }

  console.log(`Saved config: ${CONFIG_PATH}`);
  console.log("Endpoint configured. Secrets are stored locally and are not part of the skill repository.");
}

async function loginCommand(args) {
  const config = requireEndpoint(loadConfig());
  const session = await loginWithNsec(config, { persist: true, force: true });
  console.log(`Logged in as ${session.pubkey}`);
}

async function configCommand(args) {
  const [subcommand = "show"] = args.positionals;
  if (subcommand !== "show") throw new Error(`Unknown config command: ${subcommand}`);
  const config = loadConfig();
  console.log(JSON.stringify(redactConfig(config), null, 2));
}

async function healthCommand(args) {
  const config = requireEndpoint(loadConfig());
  const result = await apiRequest(config, "/api/health", { auth: "none" });
  printPayload(result, args);
}

async function listCommand(args) {
  const config = requireEndpoint(loadConfig());
  const result = await apiRequest(config, "/api/projects", { auth: "any" });
  if (hasFlag(args, "json")) return printPayload(result, args);
  const projects = result.projects || [];
  printTable(
    projects.map((project) => ({
      slug: project.slug,
      name: project.name,
      status: project.status,
      url: project.publicUrl || "",
      postgres: project.ports?.postgres || ""
    })),
    ["slug", "name", "status", "url", "postgres"]
  );
}

async function createCommand(args) {
  const config = requireEndpoint(loadConfig());
  const name = stringFlag(args, "name") || args.positionals.join(" ").trim();
  const slug = stringFlag(args, "slug") || (name ? slugFromName(name) : "");
  const kind = stringFlag(args, "kind") || "postgres";
  if (!["postgres", "supabase"].includes(kind)) throw new Error("Expected --kind postgres or --kind supabase.");
  if (!slug) throw new Error("Missing project name or --slug.");
  const start = hasFlag(args, "stopped") || hasFlag(args, "no-start") ? false : true;
  const pgbouncer = hasFlag(args, "pgbouncer") || hasFlag(args, "pooler");
  const created = await apiRequest(config, "/api/projects", {
    method: "POST",
    auth: "any",
    body: { slug, name: name || slug, kind, start, pgbouncer }
  });
  const projectId = created.project?.id || created.project?.slug || slug;
  const connections = await apiRequest(config, `/api/projects/${encodeURIComponent(projectId)}/connection-strings`, { auth: "any" });
  if (hasFlag(args, "json")) return printPayload({ ...created, connections }, args);
  console.log(`# ${created.project?.name || name || slug} (${created.project?.status || "created"})`);
  printEnv(connections);
}

async function connectionsCommand(args) {
  const config = requireEndpoint(loadConfig());
  const project = args.positionals[0];
  if (!project) throw new Error("Missing project slug or id.");
  const connections = await apiRequest(config, `/api/projects/${encodeURIComponent(project)}/connection-strings`, { auth: "any" });
  if (hasFlag(args, "json")) return printPayload(connections, args);
  printEnv(connections);
}

async function lifecycleCommand(command, args) {
  const config = requireEndpoint(loadConfig());
  const project = args.positionals[0];
  if (!project) throw new Error(`Missing project slug or id for ${command}.`);
  const result = await apiRequest(config, `/api/projects/${encodeURIComponent(project)}/${command}`, {
    method: "POST",
    auth: "any"
  });
  printPayload(result, args);
}

async function archiveCommand(args) {
  const config = requireEndpoint(loadConfig());
  const project = args.positionals[0];
  if (!project) throw new Error("Missing project slug or id.");
  const result = await apiRequest(config, `/api/projects/${encodeURIComponent(project)}`, {
    method: "DELETE",
    auth: "any"
  });
  printPayload(result, args);
}

async function resourcesCommand(args) {
  const config = requireEndpoint(loadConfig());
  const result = await apiRequest(config, "/api/resources", { auth: "any" });
  printPayload(result, args);
}

async function logsCommand(args) {
  const config = requireEndpoint(loadConfig());
  const project = args.positionals[0];
  if (!project) throw new Error("Missing project slug or id.");
  const url = new URL(`/api/projects/${encodeURIComponent(project)}/logs`, config.endpoint);
  const service = stringFlag(args, "service");
  const lines = stringFlag(args, "lines");
  if (service) url.searchParams.set("service", service);
  if (lines) url.searchParams.set("lines", lines);
  const result = await apiRequest(config, `${url.pathname}${url.search}`, { auth: "any" });
  if (hasFlag(args, "json")) return printPayload(result, args);
  console.log(result.logs || "");
}

async function databaseCommand(args) {
  const config = requireEndpoint(loadConfig());
  const project = args.positionals[0];
  if (!project) throw new Error("Missing project slug or id.");
  const result = await apiRequest(config, `/api/projects/${encodeURIComponent(project)}/database`, { auth: "any" });
  printPayload(result, args);
}

async function tableCommand(args) {
  const config = requireEndpoint(loadConfig());
  const project = args.positionals[0];
  const schema = stringFlag(args, "schema") || "public";
  const table = stringFlag(args, "table") || args.positionals[1];
  const limit = stringFlag(args, "limit") || "50";
  if (!project) throw new Error("Missing project slug or id.");
  if (!table) throw new Error("Missing --table <name>.");
  const url = new URL(`/api/projects/${encodeURIComponent(project)}/database/table`, config.endpoint);
  url.searchParams.set("schema", schema);
  url.searchParams.set("table", table);
  url.searchParams.set("limit", limit);
  const result = await apiRequest(config, `${url.pathname}${url.search}`, { auth: "any" });
  printPayload(result, args);
}

async function studioCommand(args) {
  const config = requireEndpoint(loadConfig());
  const project = args.positionals[0];
  if (!project) throw new Error("Missing project slug or id.");
  const result = await apiRequest(config, `/api/projects/${encodeURIComponent(project)}/studio-link`, {
    method: "POST",
    auth: "session"
  });
  if (hasFlag(args, "json")) return printPayload(result, args);
  console.log(`STUDIO_LAUNCH_URL=${shellQuote(result.launchUrl)}`);
  if (result.studioUrl) console.log(`STUDIO_URL=${shellQuote(result.studioUrl)}`);
  if (result.dashboardUsername) console.log(`STUDIO_USERNAME=${shellQuote(result.dashboardUsername)}`);
  if (result.dashboardPassword) console.log(`STUDIO_PASSWORD=${shellQuote(result.dashboardPassword)}`);
  if (result.expiresAt) console.log(`EXPIRES_AT=${shellQuote(result.expiresAt)}`);
}

async function apiKeyCommand(args) {
  const [subcommand, ...rest] = args.positionals;
  const nested = { ...args, positionals: rest };
  if (subcommand !== "create") throw new Error("Usage: supabase-dispenser api-key create <name> [--scopes a,b] [--save]");
  const config = requireEndpoint(loadConfig());
  const name = rest.join(" ").trim() || stringFlag(args, "name");
  if (!name) throw new Error("Missing API key name.");
  const scopes = (stringFlag(args, "scopes") || "projects:read,projects:write")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  const result = await apiRequest(config, "/api/api-keys", {
    method: "POST",
    auth: "session",
    body: { name, scopes }
  });
  if (hasFlag(args, "save")) {
    const next = { ...readConfig(), apiKey: result.token };
    writeConfig(next);
  }
  printPayload(result, nested);
}

async function adminsCommand(args) {
  const [subcommand, ...rest] = args.positionals;
  const config = requireEndpoint(loadConfig());
  if (subcommand === "list") {
    const result = await apiRequest(config, "/api/admins", { auth: "session" });
    return printPayload(result, args);
  }
  if (subcommand === "add") {
    const pubkey = rest[0];
    if (!pubkey) throw new Error("Missing admin npub, hex pubkey, or NIP-05 identifier.");
    const result = await apiRequest(config, "/api/admins", {
      method: "POST",
      auth: "session",
      body: { pubkey }
    });
    return printPayload(result, args);
  }
  if (subcommand === "remove" || subcommand === "delete") {
    const pubkey = rest[0];
    if (!pubkey) throw new Error("Missing admin npub or hex pubkey.");
    const result = await apiRequest(config, `/api/admins/${encodeURIComponent(pubkey)}`, {
      method: "DELETE",
      auth: "session"
    });
    return printPayload(result, args);
  }
  throw new Error("Usage: supabase-dispenser admins list|add|remove ...");
}

async function settingsCommand(args) {
  const [subcommand = "get"] = args.positionals;
  const config = requireEndpoint(loadConfig());
  if (subcommand === "get") {
    const result = await apiRequest(config, "/api/settings", { auth: "session" });
    return printPayload(result, args);
  }
  if (subcommand === "set") {
    const current = await apiRequest(config, "/api/settings", { auth: "session" });
    const guardrails = current.resourceGuardrails || {};
    const memory = stringFlag(args, "min-free-memory-mb");
    const disk = stringFlag(args, "min-free-disk-mb");
    if (memory === undefined && disk === undefined) {
      throw new Error("Pass --min-free-memory-mb and/or --min-free-disk-mb.");
    }
    const result = await apiRequest(config, "/api/settings", {
      method: "PUT",
      auth: "session",
      body: {
        resourceGuardrails: {
          minFreeMemoryMb: memory === undefined ? guardrails.minFreeMemoryMb : Number.parseInt(memory, 10),
          minFreeDiskMb: disk === undefined ? guardrails.minFreeDiskMb : Number.parseInt(disk, 10)
        }
      }
    });
    return printPayload(result, args);
  }
  throw new Error("Usage: supabase-dispenser settings get|set ...");
}

async function apiRequest(config, route, options = {}) {
  const auth = options.auth || "any";
  const headers = new Headers(options.headers || {});
  let activeConfig = config;

  if (auth === "session") {
    activeConfig = await ensureSession(activeConfig);
    headers.set("cookie", activeConfig.sessionCookie);
  } else if (auth === "any") {
    if (activeConfig.apiKey) {
      headers.set("authorization", `Bearer ${activeConfig.apiKey}`);
    } else {
      activeConfig = await ensureSession(activeConfig);
      headers.set("cookie", activeConfig.sessionCookie);
    }
  }

  if (options.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(new URL(route, activeConfig.endpoint), {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if ((response.status === 401 || response.status === 403) && auth !== "none" && activeConfig.nsec && activeConfig.sessionCookie && !options._retried) {
    const next = { ...activeConfig, sessionCookie: undefined };
    writeConfig({ ...readConfig(), sessionCookie: undefined });
    await loginWithNsec(next, { persist: true, force: true });
    return apiRequest(loadConfig(), route, { ...options, _retried: true });
  }

  return parseResponse(response);
}

async function parseResponse(response) {
  const text = await response.text();
  const payload = text ? safeJson(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Request failed with HTTP ${response.status}`);
  }
  return payload;
}

async function ensureSession(config) {
  if (config.sessionCookie) return config;
  if (!config.nsec) {
    throw new Error("This command requires session admin login. Run setup with a Nostr nsec/private key, or use an API key for non-admin commands.");
  }
  return loginWithNsec(config, { persist: true });
}

async function loginWithNsec(config, { persist = true } = {}) {
  if (!config.nsec) throw new Error("Missing Nostr nsec/private key. Run supabase-dispenser setup.");
  const secret = decodeSecretKey(config.nsec);
  const pubkey = publicKeyFromSecret(secret);
  const challengeResponse = await fetch(new URL("/api/auth/nostr-challenge", config.endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pubkey })
  });
  const challenge = await parseResponse(challengeResponse);
  const event = finalizeEvent({ ...challenge.eventTemplate, pubkey }, secret);
  const loginResponse = await fetch(new URL("/api/auth/nostr-login", config.endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challengeId: challenge.challengeId, event })
  });
  const body = await parseResponse(loginResponse);
  const cookie = extractSessionCookie(loginResponse);
  if (!cookie) throw new Error("Login succeeded but no sd_session cookie was returned.");
  const next = { ...config, pubkey: body.pubkey || pubkey, sessionCookie: cookie };
  if (persist) writeConfig({ ...readConfig(), ...next });
  return next;
}

function finalizeEvent(template, secret) {
  const event = {
    kind: Number(template.kind),
    pubkey: template.pubkey,
    created_at: Number(template.created_at),
    tags: template.tags,
    content: String(template.content || "")
  };
  const idBytes = sha256Bytes(Buffer.from(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]), "utf8"));
  event.id = bytesToHex(idBytes);
  event.sig = schnorrSign(idBytes, secret);
  return event;
}

function schnorrSign(message32, secret32) {
  if (message32.length !== 32 || secret32.length !== 32) throw new Error("Invalid Schnorr signing input.");
  const d0 = bytesToNumber(secret32);
  if (d0 <= 0n || d0 >= N) throw new Error("Invalid Nostr private key.");
  const point = scalarMultiply(d0, G);
  const d = isEven(point.y) ? d0 : N - d0;
  const px = numberToBytes(point.x);
  const aux = crypto.randomBytes(32);
  const t = xorBytes(numberToBytes(d), taggedHash("BIP0340/aux", aux));
  const k0 = bytesToNumber(taggedHash("BIP0340/nonce", t, px, message32)) % N;
  if (k0 === 0n) throw new Error("Invalid Schnorr nonce.");
  const rPoint = scalarMultiply(k0, G);
  const k = isEven(rPoint.y) ? k0 : N - k0;
  const rx = numberToBytes(rPoint.x);
  const e = bytesToNumber(taggedHash("BIP0340/challenge", rx, px, message32)) % N;
  const s = mod(k + e * d, N);
  return bytesToHex(Buffer.concat([rx, numberToBytes(s)]));
}

function publicKeyFromSecret(secret32) {
  const d0 = bytesToNumber(secret32);
  if (d0 <= 0n || d0 >= N) throw new Error("Invalid Nostr private key.");
  return bytesToHex(numberToBytes(scalarMultiply(d0, G).x));
}

function decodeSecretKey(value) {
  const trimmed = String(value || "").trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");
  if (!/^nsec1/i.test(trimmed)) throw new Error("Expected a Nostr nsec or 64-character hex private key.");
  const decoded = bech32Decode(trimmed);
  if (decoded.hrp !== "nsec") throw new Error("Expected an nsec private key.");
  const bytes = Buffer.from(convertBits(decoded.words, 5, 8, false));
  if (bytes.length !== 32) throw new Error("Invalid nsec private key length.");
  return bytes;
}

function scalarMultiply(scalar, point) {
  let n = scalar;
  let result = null;
  let addend = point;
  while (n > 0n) {
    if (n & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    n >>= 1n;
  }
  if (!result) throw new Error("Invalid elliptic curve multiplication.");
  return result;
}

function pointAdd(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.x === b.x && mod(a.y + b.y, P) === 0n) return null;
  const m =
    a.x === b.x && a.y === b.y
      ? mod(3n * a.x * a.x * invert(2n * a.y, P), P)
      : mod((b.y - a.y) * invert(b.x - a.x, P), P);
  const x = mod(m * m - a.x - b.x, P);
  const y = mod(m * (a.x - x) - a.y, P);
  return { x, y };
}

function invert(number, modulo) {
  let a = mod(number, modulo);
  let b = modulo;
  let x = 0n;
  let y = 1n;
  let u = 1n;
  let v = 0n;
  while (a !== 0n) {
    const q = b / a;
    [x, u] = [u, x - u * q];
    [y, v] = [v, y - v * q];
    [b, a] = [a, b - a * q];
  }
  return mod(x, modulo);
}

function bech32Decode(value) {
  const text = value.toLowerCase();
  if (value !== text && value !== value.toUpperCase()) throw new Error("Invalid mixed-case bech32 value.");
  const separator = text.lastIndexOf("1");
  if (separator < 1 || separator + 7 > text.length) throw new Error("Invalid bech32 value.");
  const hrp = text.slice(0, separator);
  const words = [...text.slice(separator + 1)].map((char) => {
    const index = BECH32_CHARSET.indexOf(char);
    if (index === -1) throw new Error("Invalid bech32 character.");
    return index;
  });
  if (bech32Polymod([...bech32HrpExpand(hrp), ...words]) !== 1) throw new Error("Invalid bech32 checksum.");
  return { hrp, words: words.slice(0, -6) };
}

function bech32HrpExpand(hrp) {
  return [...hrp].map((char) => char.charCodeAt(0) >> 5).concat([0], [...hrp].map((char) => char.charCodeAt(0) & 31));
}

function bech32Polymod(values) {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= generators[i];
    }
  }
  return chk;
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const maxv = (1 << toBits) - 1;
  const result = [];
  for (const value of data) {
    if (value < 0 || value >> fromBits) throw new Error("Invalid bech32 data.");
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) result.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    throw new Error("Invalid bech32 padding.");
  }
  return result;
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function loadConfig() {
  const config = readConfig();
  if (process.env.SUPABASE_DISPENSER_URL) config.endpoint = process.env.SUPABASE_DISPENSER_URL;
  if (process.env.SUPABASE_DISPENSER_API_KEY) config.apiKey = process.env.SUPABASE_DISPENSER_API_KEY;
  if (process.env.SUPABASE_DISPENSER_NSEC) config.nsec = process.env.SUPABASE_DISPENSER_NSEC;
  if (config.endpoint) config.endpoint = normalizeEndpoint(config.endpoint);
  return config;
}

function writeConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const clean = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined && value !== ""));
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(CONFIG_PATH, 0o600);
}

function requireEndpoint(config) {
  if (!config.endpoint) {
    throw new Error("No endpoint configured. Ask the user for the Supabase Dispenser endpoint, then run supabase-dispenser setup.");
  }
  return config;
}

function normalizeEndpoint(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "/");
}

async function promptText(question) {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function promptHidden(question) {
  if (!process.stdin.isTTY) return "";
  output.write(question);
  process.stdin.setRawMode?.(true);
  let value = "";
  return await new Promise((resolve) => {
    const onData = (buffer) => {
      const text = buffer.toString("utf8");
      for (const char of text) {
        if (char === "\r" || char === "\n") {
          process.stdin.off("data", onData);
          process.stdin.setRawMode?.(false);
          output.write("\n");
          resolve(value.trim());
          return;
        }
        if (char === "\u0003") {
          process.stdin.setRawMode?.(false);
          process.exit(130);
        }
        if (char === "\u007f") {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

function parseArgs(args) {
  const flags = new Map();
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const [rawKey, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) {
      flags.set(rawKey, inline);
    } else if (args[i + 1] && !args[i + 1].startsWith("--")) {
      flags.set(rawKey, args[i + 1]);
      i += 1;
    } else {
      flags.set(rawKey, true);
    }
  }
  return { flags, positionals };
}

function hasFlag(args, name) {
  return args.flags.has(name);
}

function stringFlag(args, name) {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function slugFromName(name) {
  let slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (!slug) slug = "database";
  if (slug.length < 3) slug = `${slug}-db`;
  slug = slug.slice(0, 40).replace(/-+$/g, "");
  if (slug.length < 3) slug = `${slug}db`.slice(0, 3);
  return slug;
}

function printPayload(payload, args) {
  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

function printEnv(connections) {
  const mapping = {
    supabaseUrl: "SUPABASE_URL",
    supabaseAnonKey: "SUPABASE_ANON_KEY",
    supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
    databaseUrl: "DATABASE_URL",
    studioUrl: "STUDIO_URL"
  };
  for (const [key, envName] of Object.entries(mapping)) {
    if (connections?.[key]) console.log(`${envName}=${shellQuote(connections[key])}`);
  }
  if (connections?.poolerUrl) {
    console.log(`DATABASE_POOL_URL=${shellQuote(connections.poolerUrl)}`);
    console.log(`POOLER_URL=${shellQuote(connections.poolerUrl)}`);
  }
}

function printTable(rows, columns) {
  const widths = Object.fromEntries(columns.map((column) => [column, column.length]));
  for (const row of rows) {
    for (const column of columns) widths[column] = Math.max(widths[column], String(row[column] ?? "").length);
  }
  console.log(columns.map((column) => column.padEnd(widths[column])).join("  "));
  console.log(columns.map((column) => "-".repeat(widths[column])).join("  "));
  for (const row of rows) {
    console.log(columns.map((column) => String(row[column] ?? "").padEnd(widths[column])).join("  "));
  }
}

function redactConfig(config) {
  return {
    ...config,
    apiKey: config.apiKey ? redact(config.apiKey) : undefined,
    nsec: config.nsec ? redact(config.nsec) : undefined,
    sessionCookie: config.sessionCookie ? "sd_session=..." : undefined
  };
}

function redact(value) {
  return `${String(value).slice(0, 8)}...${String(value).slice(-4)}`;
}

function extractSessionCookie(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = list.find((item) => item.startsWith("sd_session="));
  return cookie ? cookie.split(";")[0] : null;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function taggedHash(tag, ...parts) {
  const tagHash = sha256Bytes(Buffer.from(tag, "utf8"));
  return sha256Bytes(Buffer.concat([tagHash, tagHash, ...parts]));
}

function sha256Bytes(buffer) {
  return crypto.createHash("sha256").update(buffer).digest();
}

function xorBytes(a, b) {
  return Buffer.from(a.map((value, index) => value ^ b[index]));
}

function bytesToNumber(bytes) {
  return BigInt(`0x${bytesToHex(bytes)}`);
}

function numberToBytes(number) {
  return Buffer.from(number.toString(16).padStart(64, "0"), "hex");
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function mod(value, modulo) {
  const result = value % modulo;
  return result >= 0n ? result : result + modulo;
}

function isEven(value) {
  return value % 2n === 0n;
}

function printHelp() {
  console.log(`supabase-dispenser

Setup:
  supabase-dispenser setup
  supabase-dispenser setup --endpoint <url> --api-key <token>
  supabase-dispenser setup --endpoint <url> --nsec <nsec> --login

Credential modes:
  Use --api-key, or SUPABASE_DISPENSER_API_KEY, for normal project operations.
  Use --nsec to login as a Nostr admin, then create/save an API key:
  supabase-dispenser api-key create "agent-name" --save

Projects:
  supabase-dispenser create "Display Name" [--kind postgres|supabase] [--slug slug] [--pgbouncer] [--stopped] [--json]
  supabase-dispenser list [--json]
  supabase-dispenser connections <project> [--json]
  supabase-dispenser start|stop|restart <project>
  supabase-dispenser archive <project>

Management:
  supabase-dispenser resources
  supabase-dispenser logs <project> [--service name] [--lines 200]
  supabase-dispenser database <project>
  supabase-dispenser table <project> --schema public --table users
  supabase-dispenser studio <project>
  supabase-dispenser api-key create "name" [--scopes projects:read,projects:write] [--save]
  supabase-dispenser admins list|add|remove ...
  supabase-dispenser settings get
  supabase-dispenser settings set --min-free-memory-mb 512 --min-free-disk-mb 2048

Config:
  ${CONFIG_PATH}

No endpoint is bundled. Run setup and provide the endpoint explicitly.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
