import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
export const CONFIG_PATH = process.env.CARBON12_CONFIG || join(homedir(), '.carbon12-relay', 'config.json');
export function defaultEndpoint() { return process.env.CARBON12_ENDPOINT || 'https://carbon-12.gg/dashboard/api/companion/ingest'; }
export function defaultLogPath() { return process.env.SC_LOG || 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log'; }
export function loadConfig(path = CONFIG_PATH) {
  const base = { pairings: [], logPath: defaultLogPath(), flushMs: 5000 };
  let raw = {};
  if (existsSync(path)) { try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch {} }
  const cfg = { ...base, ...raw };
  if ((!cfg.pairings || !cfg.pairings.length) && raw.token) {
    cfg.pairings = [{ label: raw.label || 'My org', endpoint: raw.endpoint || defaultEndpoint(), token: raw.token }];
  }
  delete cfg.token; delete cfg.endpoint; delete cfg.label;
  if (!Array.isArray(cfg.pairings)) cfg.pairings = [];
  return cfg;
}
export function saveConfig(cfg, path = CONFIG_PATH) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(cfg, null, 2)); return cfg; }
export function addPairing(cfg, { label, token, endpoint } = {}) {
  if (!token) return cfg;
  const ep = endpoint || defaultEndpoint();
  const existing = cfg.pairings.find((p) => p.token === token);
  if (existing) { if (label) existing.label = label; existing.endpoint = ep; }
  else cfg.pairings.push({ label: label || `Org ${cfg.pairings.length + 1}`, endpoint: ep, token });
  return cfg;
}
export function removePairing(cfg, index) { if (index >= 0 && index < cfg.pairings.length) cfg.pairings.splice(index, 1); return cfg; }
