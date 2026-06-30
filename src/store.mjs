// Local event history for the digest. Notable events are appended as JSONL and
// grouped into sessions by their session key. Lives in the relay's config dir.
import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
export const STORE_PATH = process.env.CARBON12_STORE || join(homedir(), '.carbon12-relay', 'events.jsonl');
export const STATE_PATH = process.env.CARBON12_STATE || join(homedir(), '.carbon12-relay', 'state.json');

export function getState(path = STATE_PATH) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
}
export function setState(patch, path = STATE_PATH) {
  const st = { ...getState(path), ...patch };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(st, null, 2));
  return st;
}

export function recordEvents(events, { sessionKey, dir = STORE_PATH } = {}) {
  if (!events || !events.length) return 0;
  mkdirSync(dirname(dir), { recursive: true });
  const now = new Date().toISOString();
  const lines = events.map((e) => JSON.stringify({ ...e, _session: sessionKey || 'unknown', _at: e.ts || now })).join('\n') + '\n';
  appendFileSync(dir, lines);
  return events.length;
}

export function readSessions(dir = STORE_PATH) {
  if (!existsSync(dir)) return [];
  const byKey = new Map();
  for (const ln of readFileSync(dir, 'utf8').split('\n')) {
    if (!ln.trim()) continue;
    let e; try { e = JSON.parse(ln); } catch { continue; }
    const k = e._session || 'unknown';
    if (!byKey.has(k)) byKey.set(k, { sessionKey: k, firstAt: e._at, lastAt: e._at, events: [] });
    const s = byKey.get(k);
    s.events.push(e);
    if (e._at && e._at < s.firstAt) s.firstAt = e._at;
    if (e._at && e._at > s.lastAt) s.lastAt = e._at;
  }
  return [...byKey.values()].sort((a, b) => (a.lastAt < b.lastAt ? -1 : 1));
}

export function mostRecentSession(dir = STORE_PATH) {
  const s = readSessions(dir);
  return s.length ? s[s.length - 1] : null;
}
export function sessionByKey(key, dir = STORE_PATH) {
  return readSessions(dir).find((s) => s.sessionKey === key) || null;
}

// Keep the store from growing forever: drop events older than `days`.
export function prune(days = 30, dir = STORE_PATH) {
  if (!existsSync(dir)) return;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const kept = readFileSync(dir, 'utf8').split('\n').filter((ln) => {
    if (!ln.trim()) return false;
    try { return (JSON.parse(ln)._at || '') >= cutoff; } catch { return false; }
  });
  writeFileSync(dir, kept.length ? kept.join('\n') + '\n' : '');
}
