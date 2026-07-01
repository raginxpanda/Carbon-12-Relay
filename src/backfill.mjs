// Scan a folder of historical Game.log backups and extract scoped events
// (blueprints, kills) so the org can catch up on past sessions. Each .log is a
// separate game launch, so we parse each with a fresh parser.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createParser } from './parser.mjs';

const SCOPED = new Set(['blueprint_earned', 'actor_death']);

export function scanFile(file, { onScoped, stats } = {}) {
  let text;
  try { if (!statSync(file).isFile()) return []; text = readFileSync(file, 'utf8'); } catch { return []; }
  const parser = createParser();
  const events = [];
  for (const line of text.split('\n')) {
    if (stats && line.includes('Received Blueprint')) stats.rawLines += 1;
    for (const ev of parser.feed(line)) {
      if (SCOPED.has(ev.type)) { events.push(ev); if (onScoped) onScoped(ev); }
    }
  }
  return events;
}

export function scanLogs(dir, { onScoped } = {}) {
  let names;
  try { names = readdirSync(dir); } catch (e) { return { files: 0, events: [], error: e.code || String(e), rawLines: 0 }; }
  const files = names.filter((f) => f.toLowerCase().endsWith('.log')).sort();
  const stats = { rawLines: 0 };
  const events = [];
  for (const f of files) events.push(...scanFile(join(dir, f), { onScoped, stats }));
  return { files: files.length, events, rawLines: stats.rawLines, allFiles: names.length };
}
