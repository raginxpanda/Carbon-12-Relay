import { test } from 'node:test'; import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { scanLogs } from '../src/backfill.mjs';
test('scanLogs extracts scoped events across multiple log files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'c12bf-'));
  writeFileSync(join(dir, 'a.log'), '<t> [Notice] <AccountLoginCharacterStatus_Character> - name P - state STATE_CURRENT\n<t> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Omnisky III: " [1] to queue.\n');
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
import { scanFile } from '../src/backfill.mjs';
import { mkdtempSync as mkd2, writeFileSync as wf2, rmSync as rm2 } from 'node:fs';
test('scanFile parses a single log (Saint\'s real blueprint line)', () => {
  const dir = mkd2(join(tmpdir(), 'c12sf-'));
  const f = join(dir, 'Game.log');
  wf2(f, '<2026-07-01T02:43:09.630Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Geist Armor Core Forest: " [33] to queue.\n');
  const ev = scanFile(f);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].name, 'Geist Armor Core Forest');
  rm2(dir, { recursive: true, force: true });
});
