import { test } from 'node:test'; import assert from 'node:assert/strict';
import { IngestClient } from '../src/client.mjs';
test('whoami returns org on 200, flags 401, derives /whoami url', async () => {
  const ok = new IngestClient({ endpoint:'https://h/dashboard/api/companion/ingest', token:'t', fetchImpl: async (u)=>{ assert.match(u,/\/whoami$/); return { ok:true, status:200, json: async()=>({ ok:true, org:'Black Diamond', orgId:1 }) }; } });
  const r = await ok.whoami(); assert.equal(r.ok, true); assert.equal(r.org, 'Black Diamond');
  const bad = new IngestClient({ endpoint:'https://h/dashboard/api/companion/ingest', token:'t', fetchImpl: async ()=>({ ok:false, status:401, json: async()=>({}) }) });
  const r2 = await bad.whoami(); assert.equal(r2.ok, false); assert.equal(r2.reason, 'unauthorized');
});
test('health flips to ok with lastSuccessAt after a flush', async () => {
  const c = new IngestClient({ endpoint:'https://h/x/ingest', token:'t', fetchImpl: async ()=>({ ok:true, status:200, json: async()=>({}) }) });
  c.enqueue({ type:'blueprint_earned', name:'A' });
  assert.equal(c.health().status, 'idle');
  await c.flush();
  assert.equal(c.health().status, 'ok'); assert.ok(c.health().lastSuccessAt);
});
test('haul() GETs /haul and returns count + recent', async () => {
  const c = new IngestClient({ endpoint:'https://h/dashboard/api/companion/ingest', token:'t', fetchImpl: async (u)=>{ assert.match(u,/\/haul$/); return { ok:true, status:200, json: async()=>({ ok:true, org:'Black Diamond', count:3, recent:['A','B','C'] }) }; } });
  const r = await c.haul(); assert.equal(r.count, 3); assert.equal(r.org, 'Black Diamond');
});
