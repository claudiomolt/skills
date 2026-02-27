---
name: nwc-monitor
description: Bitcoin Lightning wallet operations and payment monitoring via NWC (Nostr Wallet Connect). Use when the user asks to check Lightning balance, send/receive sats, pay invoices, pay Lightning addresses, create invoices, list transactions, or monitor incoming payments. Also use for setting up payment notifications via WhatsApp/Telegram/Discord.
---

# NWC Monitor ⚡

Lightning wallet CLI + background payment monitor via Nostr Wallet Connect.

## Quick Reference

All commands use the wrapper script that auto-resolves the nwc-monitor installation:

```bash
# Balance
bash {baseDir}/scripts/nwc-cli.sh balance

# Pay bolt11 invoice
bash {baseDir}/scripts/nwc-cli.sh pay <invoice>

# Pay Lightning address (user@domain.com)
bash {baseDir}/scripts/nwc-cli.sh pay-address <sats> <address>

# Create invoice to receive
bash {baseDir}/scripts/nwc-cli.sh make-invoice <sats> --description "text"

# List recent transactions
bash {baseDir}/scripts/nwc-cli.sh list --limit 10
```

Multi-wallet: add `--wallet <name>` to any command.

## Monitor Service

Background service that watches for incoming payments and triggers actions (notifications, logging, webhooks).

```bash
systemctl --user status nwc-monitor    # check
systemctl --user restart nwc-monitor   # restart
journalctl --user -u nwc-monitor -f    # logs
```

Config: `~/.nwc-monitor/config.yml`

## Setup (first time only)

See `{baseDir}/references/setup.md` for full installation guide.

Quick version:
1. Need NWC string? → Use `lncurl` skill to create a wallet
2. Run `bash {baseDir}/scripts/install.sh`
3. Edit `~/.nwc-monitor/config.yml` with NWC string
4. `systemctl --user enable --now nwc-monitor`
