#!/usr/bin/env node
/**
 * Daily Cost Report Generator
 * Generates and sends professional HTML reports of token usage and costs.
 * 
 * Usage:
 *   node generate-report.js [--date YYYY-MM-DD] [--preview] [--no-email]
 * 
 * Created by Claudio ⚡
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// === CONFIGURATION ===
const CONFIG = {
  // Email settings
  emailFrom: 'Claudio ⚡',
  emailTo: process.env.REPORT_RECIPIENT || 'webmaster@masize.com',
  
  // Pricing (USD per 1M tokens, averaged input/output)
  pricing: {
    opus: 30,    // ~$15 in, $75 out → avg $30/1M
    sonnet: 6,   // ~$3 in, $15 out → avg $6/1M
  },
  
  // Paths
  envPath: process.env.EMAIL_ENV_PATH || '/home/agustin/clawd/.env.email',
  archivePath: process.env.ARCHIVE_PATH || '/home/agustin/clawd/memory/costs',
};

// === PARSE ARGUMENTS ===
const args = process.argv.slice(2);
const flags = {
  date: null,
  preview: args.includes('--preview'),
  noEmail: args.includes('--no-email'),
};
const dateIdx = args.indexOf('--date');
if (dateIdx !== -1 && args[dateIdx + 1]) {
  flags.date = args[dateIdx + 1];
}

const reportDate = flags.date || new Date().toISOString().split('T')[0];

// === LOAD EMAIL CREDENTIALS ===
function loadEnv(filepath) {
  const env = {};
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    content.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    });
  } catch (e) {
    console.error('Warning: Could not load env file:', filepath);
  }
  return env;
}

const emailEnv = loadEnv(CONFIG.envPath);

// === SAMPLE DATA (Replace with actual sessions_list integration) ===
// In production, this would come from the gateway API or sessions_list tool
function getSessions() {
  // This is sample data structure - replace with actual data collection
  return [
    { agent: 'main', model: 'opus', tokens: 150783, type: 'conversation', desc: 'DM WhatsApp' },
    { agent: 'main', model: 'sonnet', tokens: 59032, type: 'conversation', desc: 'Main session' },
    { agent: 'main', model: 'sonnet', tokens: 17450, type: 'cron', desc: 'Idea 8pm' },
    { agent: 'main', model: 'sonnet', tokens: 17546, type: 'cron', desc: 'Update Check' },
    { agent: 'main', model: 'sonnet', tokens: 17300, type: 'cron', desc: 'Idea 5pm' },
    { agent: 'main', model: 'sonnet', tokens: 17484, type: 'cron', desc: 'Idea 2pm' },
    { agent: 'main', model: 'sonnet', tokens: 17512, type: 'cron', desc: 'Idea 11am' },
    { agent: 'main', model: 'sonnet', tokens: 27182, type: 'cron', desc: 'Newsletter Cami' },
    { agent: 'main', model: 'sonnet', tokens: 17452, type: 'cron', desc: 'Idea 9am' },
    { agent: 'main', model: 'sonnet', tokens: 33149, type: 'cron', desc: 'Daily Newsletter' },
    { agent: 'main', model: 'sonnet', tokens: 17314, type: 'cron', desc: 'Daily motivation' },
    { agent: 'gorilatron', model: 'opus', tokens: 23606, type: 'cron', desc: 'Daily Report 7PM' },
    { agent: 'gorilatron', model: 'opus', tokens: 88159, type: 'conversation', desc: 'Telegram DM' },
    { agent: 'gorilatron', model: 'opus', tokens: 42056, type: 'cron', desc: 'Resumen LaWallet' },
    { agent: 'gorilatron', model: 'opus', tokens: 29279, type: 'cron', desc: 'Daily Standup' },
    { agent: 'academy', model: 'sonnet', tokens: 9990, type: 'cron', desc: 'Reporte Diario' },
  ];
}

// === AGGREGATE DATA ===
function aggregateData(sessions) {
  const byAgent = {};
  const byModel = { opus: 0, sonnet: 0 };
  const byType = { conversation: 0, cron: 0 };

  sessions.forEach(s => {
    // By agent
    if (!byAgent[s.agent]) byAgent[s.agent] = { opus: 0, sonnet: 0, total: 0 };
    byAgent[s.agent][s.model] += s.tokens;
    byAgent[s.agent].total += s.tokens;
    
    // By model
    byModel[s.model] += s.tokens;
    
    // By type
    byType[s.type] += s.tokens;
  });

  const totalTokens = byModel.opus + byModel.sonnet;
  const opusCost = (byModel.opus / 1000000) * CONFIG.pricing.opus;
  const sonnetCost = (byModel.sonnet / 1000000) * CONFIG.pricing.sonnet;
  const totalCost = opusCost + sonnetCost;

  return { byAgent, byModel, byType, totalTokens, opusCost, sonnetCost, totalCost };
}

// === GENERATE HTML ===
function generateHTML(sessions, data, date) {
  const { byAgent, byModel, byType, totalTokens, opusCost, sonnetCost, totalCost } = data;
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #1a1a1a; font-size: 13px; line-height: 1.4; }
    .container { max-width: 680px; margin: 0 auto; background: #fff; }
    .header { background: linear-gradient(135deg, #0a0f1a 0%, #1a2540 100%); color: #fff; padding: 20px 24px; }
    .header h1 { font-size: 18px; font-weight: 600; margin-bottom: 2px; }
    .header .date { color: rgba(255,255,255,0.6); font-size: 12px; }
    .metrics { display: flex; border-bottom: 1px solid #e5e5e5; }
    .metric { flex: 1; padding: 16px 24px; text-align: center; border-right: 1px solid #e5e5e5; }
    .metric:last-child { border-right: none; }
    .metric .value { font-size: 28px; font-weight: 700; color: #0a0f1a; }
    .metric .value.orange { color: #ff8c00; }
    .metric .value.blue { color: #2563eb; }
    .metric .label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-top: 2px; }
    .section { padding: 16px 24px; border-bottom: 1px solid #e5e5e5; }
    .section:last-child { border-bottom: none; }
    .section-title { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 10px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 6px 8px; background: #f9f9f9; font-weight: 600; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { padding: 8px; border-bottom: 1px solid #f0f0f0; }
    tr:last-child td { border-bottom: none; }
    .text-right { text-align: right; }
    .opus { color: #ff8c00; font-weight: 600; }
    .sonnet { color: #2563eb; font-weight: 600; }
    .tag { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 500; }
    .tag-opus { background: #fff3e0; color: #e65100; }
    .tag-sonnet { background: #e3f2fd; color: #1565c0; }
    .tag-conversation { background: #e8f5e9; color: #2e7d32; }
    .tag-cron { background: #f3e5f5; color: #7b1fa2; }
    .cost-bar { background: #0a0f1a; color: #fff; padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; }
    .cost-bar .total { font-size: 22px; font-weight: 700; color: #ff8c00; }
    .cost-bar .breakdown { font-size: 11px; color: rgba(255,255,255,0.6); }
    .footer { padding: 12px 24px; background: #f9f9f9; font-size: 10px; color: #888; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ Token Usage Report</h1>
      <div class="date">${date}</div>
    </div>

    <div class="metrics">
      <div class="metric">
        <div class="value">${(totalTokens / 1000).toFixed(0)}K</div>
        <div class="label">Total Tokens</div>
      </div>
      <div class="metric">
        <div class="value orange">${(byModel.opus / 1000).toFixed(0)}K</div>
        <div class="label">Opus</div>
      </div>
      <div class="metric">
        <div class="value blue">${(byModel.sonnet / 1000).toFixed(0)}K</div>
        <div class="label">Sonnet</div>
      </div>
      <div class="metric">
        <div class="value">${sessions.length}</div>
        <div class="label">Sessions</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">By Agent</div>
      <table>
        <tr><th>Agent</th><th class="text-right">Opus</th><th class="text-right">Sonnet</th><th class="text-right">Total</th><th class="text-right">Share</th></tr>
        ${Object.entries(byAgent).sort((a,b) => b[1].total - a[1].total).map(([agent, d]) => `
        <tr>
          <td><strong>${agent}</strong></td>
          <td class="text-right opus">${d.opus > 0 ? (d.opus / 1000).toFixed(1) + 'K' : '—'}</td>
          <td class="text-right sonnet">${d.sonnet > 0 ? (d.sonnet / 1000).toFixed(1) + 'K' : '—'}</td>
          <td class="text-right"><strong>${(d.total / 1000).toFixed(1)}K</strong></td>
          <td class="text-right">${((d.total / totalTokens) * 100).toFixed(0)}%</td>
        </tr>`).join('')}
      </table>
    </div>

    <div class="section">
      <div class="section-title">By Task Type</div>
      <table>
        <tr><th>Type</th><th class="text-right">Tokens</th><th class="text-right">Share</th></tr>
        <tr><td>Conversation</td><td class="text-right">${(byType.conversation / 1000).toFixed(1)}K</td><td class="text-right">${((byType.conversation / totalTokens) * 100).toFixed(0)}%</td></tr>
        <tr><td>Automated (Cron)</td><td class="text-right">${(byType.cron / 1000).toFixed(1)}K</td><td class="text-right">${((byType.cron / totalTokens) * 100).toFixed(0)}%</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Session Details (Top 10)</div>
      <table>
        <tr><th>Agent</th><th>Task</th><th>Type</th><th>Model</th><th class="text-right">Tokens</th></tr>
        ${sessions.sort((a, b) => b.tokens - a.tokens).slice(0, 10).map(s => `
        <tr>
          <td>${s.agent}</td>
          <td>${s.desc}</td>
          <td><span class="tag tag-${s.type}">${s.type}</span></td>
          <td><span class="tag tag-${s.model}">${s.model}</span></td>
          <td class="text-right">${(s.tokens / 1000).toFixed(1)}K</td>
        </tr>`).join('')}
        ${sessions.length > 10 ? `<tr><td colspan="5" style="color:#888;font-style:italic;">+ ${sessions.length - 10} more sessions</td></tr>` : ''}
      </table>
    </div>

    <div class="cost-bar">
      <div>
        <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;">Estimated Cost</div>
        <div class="total">$${totalCost.toFixed(2)}</div>
      </div>
      <div class="breakdown">
        Opus $${opusCost.toFixed(2)} · Sonnet $${sonnetCost.toFixed(2)}
      </div>
    </div>

    <div class="footer">
      Claudio ⚡ — Automated Daily Report · Pricing: Opus ~$${CONFIG.pricing.opus}/1M, Sonnet ~$${CONFIG.pricing.sonnet}/1M
    </div>
  </div>
</body>
</html>`;
}

// === GENERATE MARKDOWN ARCHIVE ===
function generateMarkdown(sessions, data, date) {
  const { byAgent, byModel, byType, totalTokens, opusCost, sonnetCost, totalCost } = data;
  
  return `# Daily Cost Report — ${date}

## Summary

| Metric | Value |
|--------|-------|
| Total Tokens | ${(totalTokens / 1000).toFixed(1)}K |
| Opus | ${(byModel.opus / 1000).toFixed(1)}K |
| Sonnet | ${(byModel.sonnet / 1000).toFixed(1)}K |
| Sessions | ${sessions.length} |
| **Estimated Cost** | **$${totalCost.toFixed(2)}** |

## By Agent

| Agent | Opus | Sonnet | Total | Share |
|-------|------|--------|-------|-------|
${Object.entries(byAgent).sort((a,b) => b[1].total - a[1].total).map(([agent, d]) => 
`| ${agent} | ${d.opus > 0 ? (d.opus / 1000).toFixed(1) + 'K' : '—'} | ${d.sonnet > 0 ? (d.sonnet / 1000).toFixed(1) + 'K' : '—'} | ${(d.total / 1000).toFixed(1)}K | ${((d.total / totalTokens) * 100).toFixed(0)}% |`
).join('\n')}

## By Task Type

| Type | Tokens | Share |
|------|--------|-------|
| Conversation | ${(byType.conversation / 1000).toFixed(1)}K | ${((byType.conversation / totalTokens) * 100).toFixed(0)}% |
| Cron | ${(byType.cron / 1000).toFixed(1)}K | ${((byType.cron / totalTokens) * 100).toFixed(0)}% |

## Cost Breakdown

- Opus: $${opusCost.toFixed(2)} (${(byModel.opus / 1000).toFixed(1)}K tokens)
- Sonnet: $${sonnetCost.toFixed(2)} (${(byModel.sonnet / 1000).toFixed(1)}K tokens)
- **Total: $${totalCost.toFixed(2)}**

---
*Generated by daily-cost-report skill*
`;
}

// === SEND EMAIL ===
async function sendEmail(html, data, date) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailEnv.GMAIL_USER,
      pass: emailEnv.GMAIL_APP_PASSWORD
    }
  });

  const subject = `📊 Token Report ${date} — ${(data.totalTokens / 1000).toFixed(0)}K tokens · $${data.totalCost.toFixed(2)}`;

  await transporter.sendMail({
    from: `${CONFIG.emailFrom} <${emailEnv.GMAIL_USER}>`,
    to: CONFIG.emailTo,
    subject,
    html
  });

  console.log(`Email sent to ${CONFIG.emailTo}`);
}

// === MAIN ===
async function main() {
  console.log(`Generating report for ${reportDate}...`);
  
  // Get sessions data
  const sessions = getSessions();
  
  // Aggregate
  const data = aggregateData(sessions);
  
  // Generate HTML
  const html = generateHTML(sessions, data, reportDate);
  
  // Save preview
  const previewPath = `/tmp/daily-cost-report-${reportDate}.html`;
  fs.writeFileSync(previewPath, html);
  console.log(`Preview saved: ${previewPath}`);
  
  // Save markdown archive
  const archiveDir = CONFIG.archivePath;
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
  const mdPath = path.join(archiveDir, `${reportDate}.md`);
  fs.writeFileSync(mdPath, generateMarkdown(sessions, data, reportDate));
  console.log(`Archive saved: ${mdPath}`);
  
  // Send email (unless preview/no-email mode)
  if (!flags.preview && !flags.noEmail) {
    try {
      await sendEmail(html, data, reportDate);
    } catch (e) {
      console.error('Failed to send email:', e.message);
    }
  }
  
  // Summary
  console.log(`\n📊 Report Summary:`);
  console.log(`   Total: ${(data.totalTokens / 1000).toFixed(1)}K tokens`);
  console.log(`   Cost:  $${data.totalCost.toFixed(2)}`);
}

main().catch(console.error);
