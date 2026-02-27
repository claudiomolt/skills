#!/usr/bin/env bun
/**
 * NWC CLI — pay, receive, balance via Nostr Wallet Connect
 * Reads NWC string from ~/.nwc-monitor/config.yml (first wallet)
 * or --nwc flag / NWC_CONNECTION env var.
 *
 * Usage:
 *   nwc-cli.mjs balance [--wallet name]
 *   nwc-cli.mjs pay <invoice> [--wallet name]
 *   nwc-cli.mjs pay-address <amount_sats> <lightning_address> [--wallet name]
 *   nwc-cli.mjs make-invoice <amount_sats> [--description "text"] [--wallet name]
 *   nwc-cli.mjs list [--limit 10] [--wallet name]
 */

import { nwc } from '@getalby/sdk';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

function loadNwcString(walletName) {
  // 1. ENV
  if (process.env.NWC_CONNECTION) return process.env.NWC_CONNECTION;

  // 2. --nwc flag
  const nwcIdx = process.argv.indexOf('--nwc');
  if (nwcIdx !== -1 && process.argv[nwcIdx + 1]) return process.argv[nwcIdx + 1];

  // 3. Config file
  const configPath = resolve(process.env.HOME || '~', '.nwc-monitor', 'config.yml');
  if (!existsSync(configPath)) {
    console.error('❌ No NWC connection found. Set NWC_CONNECTION, use --nwc, or configure ~/.nwc-monitor/config.yml');
    process.exit(1);
  }

  const config = parse(readFileSync(configPath, 'utf-8'));
  if (!config.wallets || config.wallets.length === 0) {
    console.error('❌ No wallets in config');
    process.exit(1);
  }

  const wallet = walletName
    ? config.wallets.find(w => w.name === walletName)
    : config.wallets[0];

  if (!wallet) {
    console.error(`❌ Wallet "${walletName}" not found. Available: ${config.wallets.map(w => w.name).join(', ')}`);
    process.exit(1);
  }

  return wallet.nwc;
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const command = process.argv[2];
const walletName = getArg('--wallet');
const nwcString = loadNwcString(walletName);
const client = new nwc.NWCClient({ nostrWalletConnectUrl: nwcString });

try {
  switch (command) {
    case 'balance': {
      const { balance } = await client.getBalance();
      console.log(`⚡ Balance: ${Math.floor(balance / 1000)} sats`);
      break;
    }

    case 'pay': {
      const invoice = process.argv[3];
      if (!invoice) { console.error('Usage: nwc-cli.mjs pay <bolt11_invoice>'); process.exit(1); }
      console.log('💸 Paying invoice...');
      const result = await client.payInvoice({ invoice });
      console.log(`✅ Paid! Preimage: ${result.preimage}`);
      break;
    }

    case 'pay-address': {
      const amount = parseInt(process.argv[3]);
      const address = process.argv[4];
      if (!amount || !address) { console.error('Usage: nwc-cli.mjs pay-address <sats> <ln_address>'); process.exit(1); }

      const [username, domain] = address.split('@');
      console.log(`🔍 Resolving ${address}...`);
      const lnurl = await (await fetch(`https://${domain}/.well-known/lnurlp/${username}`)).json();
      if (lnurl.status === 'ERROR') throw new Error(lnurl.reason);

      console.log(`💸 Requesting invoice for ${amount} sats...`);
      const inv = await (await fetch(`${lnurl.callback}?amount=${amount * 1000}`)).json();
      if (inv.status === 'ERROR') throw new Error(inv.reason);

      console.log('⚡ Paying...');
      const result = await client.payInvoice({ invoice: inv.pr });
      console.log(`✅ Sent ${amount} sats to ${address}! Preimage: ${result.preimage}`);
      break;
    }

    case 'make-invoice': {
      const amount = parseInt(process.argv[3]);
      if (!amount) { console.error('Usage: nwc-cli.mjs make-invoice <sats> [--description "text"]'); process.exit(1); }
      const description = getArg('--description') || '';
      console.log(`📄 Creating invoice for ${amount} sats...`);
      const result = await client.makeInvoice({ amount: amount * 1000, description });
      console.log(`⚡ Invoice: ${result.invoice}`);
      console.log(`   Payment hash: ${result.payment_hash}`);
      break;
    }

    case 'list': {
      const limit = parseInt(getArg('--limit') || '10');
      const { transactions } = await client.listTransactions({ limit });
      if (!transactions || transactions.length === 0) {
        console.log('No transactions found.');
        break;
      }
      for (const tx of transactions) {
        const sats = Math.floor(tx.amount / 1000);
        const date = new Date(tx.settled_at * 1000).toISOString().slice(0, 19);
        const dir = tx.type === 'incoming' ? '⬇️' : '⬆️';
        console.log(`${dir} ${date} | ${sats} sats | ${tx.description || '(no description)'}`);
      }
      break;
    }

    default:
      console.log(`NWC CLI — Wallet operations via Nostr Wallet Connect

Commands:
  balance                              Check wallet balance
  pay <bolt11_invoice>                 Pay a Lightning invoice
  pay-address <sats> <ln_address>      Pay to a Lightning address
  make-invoice <sats> [--description]  Create a receivable invoice
  list [--limit N]                     List recent transactions

Options:
  --wallet <name>     Use specific wallet from config
  --nwc <string>      Use NWC connection string directly

Config: ~/.nwc-monitor/config.yml`);
      break;
  }
} catch (error) {
  console.error('❌', error.message || error);
  process.exit(1);
} finally {
  client.close();
}
