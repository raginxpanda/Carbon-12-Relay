import { test } from 'node:test'; import assert from 'node:assert/strict';
import { makeClients } from '../src/relay.mjs';
test('makeClients builds one client per pairing and fans out enqueues', () => {
  const cs=makeClients([{label:'A',endpoint:'http://a',token:'1'},{label:'B',endpoint:'http://b',token:'2'}], async()=>({ok:true,status:200,json:async()=>({})}));
  assert.equal(cs.length,2); assert.equal(cs[0].label,'A');
  cs.forEach(c=>c.client.enqueue({type:'blueprint_earned',name:'X'}));
  assert.equal(cs[0].client.pending,1); assert.equal(cs[1].client.pending,1);
});
