import { test } from 'node:test'; import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { scanLogs } from '../src/backfill.mjs';
test('scanLogs extracts scoped events across multiple log files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'c12bf-'));
  writeFileSync(join(dir, 'a.log'), '<t> [Notice] <AccountLoginCharacterStatus_Character> - name P - state STATE_CURRENT\n<t> Received Blueprint: Omnisky III: x\n');
  writeFileSync(join(dir, 'b.log'), "<t> <Actor Death> CActor::Kill: 'V' [1] in zone 'Z' killed by 'P' [2] using 'gun' [c] with damage type 'Bullet'\n");
  writeFileSync(join(dir, 'notes.txt'), 'ignored\n');
  const { files, events } = scanLogs(dir);
  assert.equal(files, 2);
  assert.ok(events.some((e) => e.type === 'blueprint_earned' && e.name === 'Omnisky III'), 'found blueprint');
  assert.ok(events.some((e) => e.type === 'actor_death' && e.killer === 'P'), 'found kill');
  rmSync(dir, { recursive: true, force: true });
});
test('scanLogs handles a missing folder gracefully', () => {
  assert.deepEqual(scanLogs('/no/such/dir'), { files: 0, events: [] });
});
