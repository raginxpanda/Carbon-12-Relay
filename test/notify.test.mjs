import { test } from 'node:test'; import assert from 'node:assert/strict';
import { makeBlueprintNotifier } from '../src/relay.mjs';
test('single blueprint -> single-name toast', async () => {
  const msgs = []; const n = makeBlueprintNotifier((m) => msgs.push(m), 10);
  n.push('Geist Armor Core Forest');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0], 'Blueprint earned: Geist Armor Core Forest');
});
test('a burst coalesces into one toast', async () => {
  const msgs = []; const n = makeBlueprintNotifier((m) => msgs.push(m), 10);
  n.push('A'); n.push('B'); n.push('C');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /3 blueprints earned: A, B, C/);
});
