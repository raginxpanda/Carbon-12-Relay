import { test } from 'node:test'; import assert from 'node:assert/strict';
import { createParser, matchBlueprint } from '../src/parser.mjs';
test('matches the earn line, ignores re-render echoes', () => {
  assert.equal(matchBlueprint('<t> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Omnisky XV Cannon: " [168] to queue. New queue size: 3').name, 'Omnisky XV Cannon');
  assert.equal(matchBlueprint('<t>    "Received Blueprint: Omnisky XV Cannon: " [168]'), null);
  assert.equal(matchBlueprint('<t> <UpdateNotificationItem> Notification "Received Blueprint: Omnisky XV Cannon: " [168], Action: Remove'), null);
});
test('a blueprint earned once counts once despite many echoes', () => {
  const p = createParser();
  const lines = [
    '<t> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Novian Crossbow: " [169] to queue.',
    '<t>    "Received Blueprint: Novian Crossbow: " [169]',
    '<t> <UpdateNotificationItem> Notification "Received Blueprint: Novian Crossbow: " [169], Action: Remove',
  ];
  let n = 0; for (const l of lines) for (const ev of p.feed(l)) if (ev.type==='blueprint_earned') n++;
  assert.equal(n, 1);
});
test('names with slashes and parens survive', () => {
  assert.equal(matchBlueprint('<t> Added notification "Received Blueprint: Mil/3/B Fulgur: " [5] to queue.').name, 'Mil/3/B Fulgur');
  assert.equal(matchBlueprint('<t> Added notification "Received Blueprint: Zenith Laser Sniper Rifle Battery (22 Cap): " [6] to queue.').name, 'Zenith Laser Sniper Rifle Battery (22 Cap)');
});
