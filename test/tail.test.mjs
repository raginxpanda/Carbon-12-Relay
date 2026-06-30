import { test } from 'node:test'; import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync, unlinkSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { extractLines, tailFile } from '../src/tail.mjs';
const delay=(ms)=>new Promise(r=>setTimeout(r,ms));
test('extractLines splits complete lines, keeps remainder, strips CR', () => {
  assert.deepEqual(extractLines('a\nb\nc'), { lines:['a','b'], rest:'c' });
  assert.deepEqual(extractLines('x\r\ny\r\n'), { lines:['x','y'], rest:'' });
});
test('tailFile emits appended lines + handles existing content', async () => {
  const tmp=join(tmpdir(),'c12tail-'+Date.now()+'.log'); writeFileSync(tmp,'first\n');
  const got=[]; const stop=tailFile(tmp,(l)=>got.push(l),{fromStart:true,pollMs:20});
  await delay(60); appendFileSync(tmp,'second\nthird\n'); await delay(80); stop();
  unlinkSync(tmp);
  assert.ok(got.includes('first')&&got.includes('second')&&got.includes('third'), 'got '+JSON.stringify(got));
});
