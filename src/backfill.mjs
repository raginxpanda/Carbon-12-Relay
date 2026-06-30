// Scan a folder of historical Game.log backups and extract scoped events
// (blueprints, kills) so the org can catch up on past sessions. Each .log is a
// separate game launch, so we parse each with a fresh parser.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createParser } from './parser.mjs';

const SCOPED = new Set(['blueprint_earned', 'actor_death']);

export function scanLogs(dir, { onScoped } = {}) {
  let names;
  try { names = readdirSync(dir); } catch { return { files: 0, events: [] }; }
  const files = names.filter((f) => f.toLowerCase().endsWith('.log')).sort();
  const events = [];
  for (const f of files) {
    let text;
    try { if (!statSync(join(dir, f)).isFile()) continue; text = readFileSync(join(dir, f), 'utf8'); } catch { continue; }
    const parser = createParser();
    for (const line of text.split('\n')) {
      for (const ev of parser.feed(line)) {
        if (SCOPED.has(ev.type)) { events.push(ev); if (onScoped) onScoped(ev); }
      }
    }
  }
  return { files: files.length, events };
}
