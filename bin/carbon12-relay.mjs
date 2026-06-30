#!/usr/bin/env node
import { loadConfig, saveConfig, addPairing, removePairing } from '../src/config.mjs';
import { startRelay } from '../src/relay.mjs';
import { mostRecentSession } from '../src/store.mjs';
import { formatDigest } from '../src/digest.mjs';
import { scanLogs } from '../src/backfill.mjs';
import { IngestClient } from '../src/client.mjs';
const [cmd, ...args] = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
if (cmd === 'pair') {
  const cfg = loadConfig();
  if (!opt('token')) { console.error('Usage: carbon12-relay pair --token <device-token> [--label "Org name"] [--endpoint <url>]'); process.exit(1); }
  addPairing(cfg, { token: opt('token'), label: opt('label'), endpoint: opt('endpoint') });
  if (opt('log')) cfg.logPath = opt('log');
  saveConfig(cfg);
  console.log(`Paired ${cfg.pairings.length} org(s):`); cfg.pairings.forEach((p, i) => console.log(`  [${i}] ${p.label}`));
} else if (cmd === 'list') {
  const cfg = loadConfig();
  if (!cfg.pairings.length) console.log('No orgs paired.'); else cfg.pairings.forEach((p, i) => console.log(`  [${i}] ${p.label}  (\u2026${p.token.slice(-4)})`));
} else if (cmd === 'unpair') {
  const cfg = loadConfig(); const i = Number(args[0]);
  if (!Number.isInteger(i)) { console.error('Usage: carbon12-relay unpair <index>'); process.exit(1); }
  removePairing(cfg, i); saveConfig(cfg); console.log(`Now paired with ${cfg.pairings.length} org(s).`);
} else if (cmd === 'backfill') {
  const dir = args[0]; if (!dir) { console.error('Usage: carbon12-relay backfill <Logbackups folder>'); process.exit(1); }
  const cfg = loadConfig(); const { files, events } = scanLogs(dir);
  console.log(`Scanned ${files} log file(s) -> ${events.length} event(s).`);
  if (!events.length) process.exit(0);
  if (!cfg.pairings.length) { console.error('No orgs paired; run `carbon12-relay pair` first.'); process.exit(1); }
  for (const p of cfg.pairings) { const client = new IngestClient({ endpoint: p.endpoint, token: p.token }); client.enqueueAll(events); const r = await client.flush(); console.log(r.ok ? `[${p.label}] sent ${r.sent}` : `[${p.label}] failed: ${r.reason}`); }
} else if (cmd === 'digest') {
  console.log(formatDigest(mostRecentSession()) || 'No recorded haul yet.');
} else if (cmd === 'run' || !cmd) {
  const cfg = loadConfig();
  if (!cfg.pairings.length) { console.error('Not paired. Run: carbon12-relay pair --token <device-token> [--label "Org"]'); process.exit(1); }
  console.log(`Carbon-12 Relay — watching ${cfg.logPath} -> ${cfg.pairings.length} org(s)`);
  const r = startRelay({ config: cfg });
  process.on('SIGINT', () => { r.stop(); console.log('\nstopped'); process.exit(0); });
} else { console.error('Usage: carbon12-relay [pair|unpair|list|run|digest|backfill]'); process.exit(1); }
