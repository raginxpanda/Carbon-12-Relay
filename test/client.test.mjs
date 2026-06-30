import { test } from 'node:test'; import assert from 'node:assert/strict';
import { IngestClient } from '../src/client.mjs';
test('flush posts batch with bearer auth, clears queue', async () => {
  let seen=null;
  const fetchImpl=async (url,opts)=>{ seen={url,opts}; return { ok:true, status:200, json:async()=>({ok:true,blueprints_added:1}) }; };
  const c=new IngestClient({ endpoint:'http://x/ingest', token:'TOK', fetchImpl });
  c.enqueueAll([{type:'blueprint_earned',name:'A'},{type:'blueprint_earned',name:'B'}]);
  const r=await c.flush();
  assert.equal(r.sent,2); assert.equal(c.pending,0);
  assert.equal(seen.opts.headers.Authorization,'Bearer TOK');
  assert.deepEqual(JSON.parse(seen.opts.body).events.length,2);
});
test('network error keeps queue for retry', async () => {
  const c=new IngestClient({ endpoint:'http://x', token:'T', fetchImpl: async()=>{ throw new Error('down'); } });
  c.enqueue({type:'blueprint_earned',name:'A'});
  const r=await c.flush(); assert.equal(r.ok,false); assert.equal(r.reason,'network'); assert.equal(c.pending,1);
});
test('401 drops the queue (revoked token)', async () => {
  const c=new IngestClient({ endpoint:'http://x', token:'BAD', fetchImpl: async()=>({ ok:false, status:401, json:async()=>({}) }) });
  c.enqueue({type:'blueprint_earned',name:'A'});
  const r=await c.flush(); assert.equal(r.reason,'unauthorized'); assert.equal(c.pending,0);
});
test('unconfigured does not send', async () => {
  const c=new IngestClient({ endpoint:null, token:null }); c.enqueue({type:'x'});
  const r=await c.flush(); assert.equal(r.reason,'unconfigured'); assert.equal(c.pending,1);
});
