import { test } from 'node:test'; import assert from 'node:assert/strict';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { unlinkSync, existsSync } from 'node:fs';
import { recordEvents, readSessions, mostRecentSession } from '../src/store.mjs';
test('records events and groups them into sessions', () => {
  const dir = join(tmpdir(), 'c12store-' + Date.now() + '.jsonl');
  recordEvents([{ type:'blueprint_earned', name:'A', ts:'2026-06-28T22:00:00.000Z' }], { sessionKey:'s1', dir });
  recordEvents([{ type:'blueprint_earned', name:'B', ts:'2026-06-28T22:05:00.000Z' }], { sessionKey:'s1', dir });
  recordEvents([{ type:'actor_death', role:'kill', ts:'2026-06-29T20:00:00.000Z' }], { sessionKey:'s2', dir });
  const sessions = readSessions(dir);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].sessionKey, 's1');           // sorted oldest-first
  assert.equal(sessions[0].events.length, 2);
  assert.equal(mostRecentSession(dir).sessionKey, 's2'); // newest
  if (existsSync(dir)) unlinkSync(dir);
});
import { getState, setState } from '../src/store.mjs';
test('state round-trips (recap dedup marker)', () => {
  const dir = join(tmpdir(), 'c12state-' + Date.now() + '.json');
  setState({ lastRecapKey: 'abc' }, dir);
  assert.equal(getState(dir).lastRecapKey, 'abc');
  setState({ other: 1 }, dir);
  assert.equal(getState(dir).lastRecapKey, 'abc'); // merge, not overwrite
  if (existsSync(dir)) unlinkSync(dir);
});
