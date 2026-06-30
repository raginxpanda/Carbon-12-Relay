import { test } from 'node:test'; import assert from 'node:assert/strict';
import { summarize, relativeWhen, formatDigest, buildRecap } from '../src/digest.mjs';
test('summarize counts blueprints/kills/deaths', () => {
  const s = summarize([{type:'blueprint_earned',name:'A'},{type:'blueprint_earned',name:'B'},{type:'actor_death',role:'kill'},{type:'actor_death',role:'death'}]);
  assert.deepEqual(s.blueprints, ['A','B']); assert.equal(s.kills,1); assert.equal(s.deaths,1);
});
test('relativeWhen: evening yesterday -> last night', () => {
  assert.equal(relativeWhen('2026-06-28T23:00:00.000Z','2026-06-29T14:00:00.000Z'), 'last night');
});
test('formatDigest produces a welcome-back line, or null when empty', () => {
  const sess = { lastAt:'2026-06-28T23:00:00.000Z', events:[{type:'blueprint_earned',name:'Omnisky III'},{type:'actor_death',role:'kill'}] };
  const d = formatDigest(sess, '2026-06-29T14:00:00.000Z');
  assert.match(d, /Welcome back/); assert.match(d, /1 blueprint \(Omnisky III\)/); assert.match(d, /1 kill/);
  assert.equal(formatDigest({ lastAt:'x', events:[] }), null);
});
test('buildRecap emits a structured session_recap, null when empty', () => {
  const sess = { lastAt:'2026-06-28T23:00:00.000Z', sessionKey:'s', events:[{type:'blueprint_earned',name:'A'},{type:'actor_death',role:'kill'}] };
  const r = buildRecap(sess, '2026-06-29T14:00:00.000Z');
  assert.equal(r.type, 'session_recap'); assert.deepEqual(r.blueprints, ['A']); assert.equal(r.kills, 1); assert.equal(r.when, 'last night');
  assert.equal(buildRecap({ lastAt:'x', events:[] }), null);
});
