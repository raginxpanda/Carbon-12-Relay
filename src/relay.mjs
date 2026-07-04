import { createParser } from './parser.mjs';
import { tailFile } from './tail.mjs';
import { IngestClient } from './client.mjs';
import { recordEvents, mostRecentSession, sessionByKey, prune, getState, setState } from './store.mjs';
import { formatDigest, buildRecap } from './digest.mjs';
const SCOPED = new Set(['blueprint_earned', 'actor_death']);

// Live per-blueprint desktop toast. Coalesces a burst (SC can grant several at
// once) into a single notification within `delay` ms.
export function makeBlueprintNotifier(tell, delay = 1500) {
  let buffer = []; let timer = null;
  return {
    push(name) {
      buffer.push(name);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const names = buffer; buffer = []; timer = null;
        if (names.length === 1) tell(`Blueprint earned: ${names[0]}`);
        else tell(`${names.length} blueprints earned: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '\u2026' : ''}`);
      }, delay);
    },
    stop() { if (timer) { clearTimeout(timer); timer = null; } },
  };
}
export function makeClients(pairings, fetchImpl) {
  return (pairings || []).map((p) => ({ label: p.label, client: new IngestClient({ endpoint: p.endpoint, token: p.token, fetchImpl }) }));
}
export function startRelay({ config, fetchImpl, log = console.log, notify, storePath, statePath, showLastOnStart = true, onHaulChanged } = {}) {
  const tell = notify || ((msg) => log(`\n  \u2605 ${msg}\n`));
  const parser = createParser();
  const clients = makeClients(config.pairings, fetchImpl);
  prune(30, storePath);
  for (const { label, client } of clients) {
    client.whoami().then((r) => {
      if (r.ok) log(`[${label}] connected \u2713 ${r.org ? '(' + r.org + ')' : ''}`);
      else if (r.reason === 'unauthorized') log(`[${label}] token rejected \u2717 — regenerate it from the dashboard`);
      else if (r.reason === 'http' && r.status === 404) log(`[${label}] connected (update the bot to enable the token check)`);
      else log(`[${label}] connection check deferred (${r.reason || 'error'})`);
    }).catch(() => {});
  }
  const bpNotifier = makeBlueprintNotifier(tell);
  const fanout = (ev) => { for (const c of clients) c.client.enqueue(ev); };
  const primary = (ev) => { if (clients[0]) clients[0].client.enqueue(ev); };
  function emitDigest(session) {
    if (!session) return;
    if (getState(statePath).lastRecapKey === session.sessionKey) return;
    const text = formatDigest(session); const recap = buildRecap(session);
    if (text) tell(text); if (recap) primary(recap);
    setState({ lastRecapKey: session.sessionKey }, statePath);
  }
  if (showLastOnStart) emitDigest(mostRecentSession(storePath));
  let sessionKey = `launch-${Date.now()}`;
  let haulDirty = false; // set when a blueprint is captured live; cleared after we refresh the UI count
  const stopTail = tailFile(config.logPath, (line) => {
    for (const ev of parser.feed(line)) {
      if (ev.type === 'handle_detected') log(`identified as ${ev.handle}`);
      if (ev.type === 'session_start' && ev.sessionId && ev.sessionId !== sessionKey) { emitDigest(sessionByKey(sessionKey, storePath)); sessionKey = ev.sessionId; }
      if (SCOPED.has(ev.type)) {
        fanout(ev); recordEvents([ev], { sessionKey, dir: storePath });
        if (ev.type === 'blueprint_earned') { log(`blueprint earned: ${ev.name}`); bpNotifier.push(ev.name); haulDirty = true; }
      }
    }
  }, { fromStart: false });
  const timer = setInterval(async () => {
    let sentSomething = false;
    for (const { label, client } of clients) {
      if (!client.pending) continue;
      const r = await client.flush();
      if (r.sent) { log(`[${label}] sent ${r.sent} event(s)`); sentSomething = true; }
      else if (!r.ok && r.reason !== 'unconfigured') log(`[${label}] deferred (${r.reason}), ${client.pending} queued`);
    }
    // A blueprint was captured live AND we just flushed to the bot — tell the UI to
    // re-fetch the haul so the on-screen count updates without a manual reload / catch-up.
    if (haulDirty && sentSomething) {
      haulDirty = false;
      if (typeof onHaulChanged === 'function') { try { onHaulChanged(); } catch {} }
    }
  }, config.flushMs || 5000);
  return { stop: () => { stopTail(); clearInterval(timer); bpNotifier.stop(); }, clients, parser };
}
