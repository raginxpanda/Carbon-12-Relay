import { test } from 'node:test'; import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { loadConfig, addPairing, removePairing } from '../src/config.mjs';
test('addPairing appends new tokens and updates existing by token', () => {
  const cfg={pairings:[]}; addPairing(cfg,{token:'t1',label:'A'}); addPairing(cfg,{token:'t2',label:'B'});
  assert.equal(cfg.pairings.length,2);
  addPairing(cfg,{token:'t1',label:'A2'}); assert.equal(cfg.pairings.length,2); assert.equal(cfg.pairings[0].label,'A2');
  removePairing(cfg,0); assert.equal(cfg.pairings.length,1); assert.equal(cfg.pairings[0].token,'t2');
});
test('loadConfig migrates the legacy single-token format to a pairing', () => {
  const p=join(tmpdir(),'c12cfg-'+Date.now()+'.json'); writeFileSync(p,JSON.stringify({token:'legacy',endpoint:'http://x',logPath:'/l'}));
  const cfg=loadConfig(p); assert.equal(cfg.pairings.length,1); assert.equal(cfg.pairings[0].token,'legacy'); assert.equal(cfg.token,undefined);
  unlinkSync(p);
});
