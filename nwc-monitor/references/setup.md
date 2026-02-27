# NWC Monitor — Setup Guide

## Prerequisites

- **bun** — `curl -fsSL https://bun.sh/install | bash`
- **NWC connection string** — from any NWC-compatible wallet
- **openclaw** (optional) — only for `session_send` notifications

## Install

```bash
bash {baseDir}/scripts/install.sh
```

Installs to `~/.nwc-monitor/`:
- `repo/` — cloned source + built binary
- `config.yml` — your config (created from example)
- `data/` — SQLite databases

## Getting an NWC Connection String

**Option A: lncurl (disposable wallet)**
Use the `lncurl` skill: `lncurl create --name monitor`
> ⚠️ lncurl wallets cost ~1 sat/hour. Fund via lightning address to keep alive.

**Option B: Alby Hub / LNbits / any NWC provider**
Get the string from your wallet's NWC settings. Format:
```
nostr+walletconnect://PUBKEY?relay=wss://relay.example.com&secret=SECRET&lud16=user@domain.com
```

## Configure

Edit `~/.nwc-monitor/config.yml`:

```yaml
monitor:
  pollInterval: 60000
  limit: 50

wallets:
  - name: my-wallet
    nwc: "nostr+walletconnect://..."
    actions:
      - type: console
        enabled: true
        template: "⚡ [{wallet}] {amount_sats} sats - {description}"

      - type: sqlite
        enabled: true
        database: "~/.nwc-monitor/data/payments.db"

      # Notifications via OpenClaw:
      - type: session_send
        enabled: true
        channel: whatsapp        # whatsapp | telegram | discord
        target: "+1234567890"    # phone or chat id
        template: "⚡ Payment: {amount_sats} sats — {description}"
```

Multiple wallets supported — each with independent action pipelines.

## Start Service

```bash
systemctl --user enable --now nwc-monitor
```

## Available Actions

| Action | Description | Key Config |
|--------|-------------|------------|
| `console` | Print to stdout/logs | `template` |
| `sqlite` | Store in SQLite DB | `database` path |
| `webhook` | HTTP POST on payment | `url`, `headers`, `retry`, `timeout` |
| `email` | Send email via SMTP | `smtp`, `from`, `to`, `subject_template` |
| `file` | Append to file | `path`, `format` (jsonl\|csv) |
| `session_send` | Notify via OpenClaw | `channel`, `target`, `template` |

## Template Variables

`{wallet}`, `{amount_sats}`, `{description}`, `{payment_hash}`, `{preimage}`, `{type}`, `{settled_at}`, `{id}`, `{payer_pubkey}`

## Uninstall

```bash
bash {baseDir}/scripts/uninstall.sh
```

## Troubleshooting

- **0 wallet monitors** — `nwc` field missing in config
- **openclaw not found** — re-run `install.sh` after installing openclaw
- **Service won't persist** — `sudo loginctl enable-linger $USER`
