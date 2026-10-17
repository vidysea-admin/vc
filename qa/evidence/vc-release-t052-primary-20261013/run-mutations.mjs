import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const area='D:/vc/qa/evidence/vc-release-t052-primary-20261013', root=area+'/isolation';
const invoke=(name,file)=>{const r=spawnSync('C:/Program Files/nodejs/node.exe',['D:/vc/node_modules/tsx/dist/cli.mjs','--tsconfig',root+'/tsconfig.json',root+'/'+file],{cwd:root,encoding:'utf8',timeout:45000});const output=(r.stdout??'')+(r.stderr??'');writeFileSync(area+'/'+name+'.log',output);console.log(name,'exit',r.status,'pid',r.pid,'error',r.error?.code);return {status:r.status,error:r.error,output};};
const p=root+'/packages/engine/src/scribe/graph.ts',bytes=readFileSync(p),original=bytes.toString();
const needle='collection.updateOne({ _id: rowId, vcWriterAttempt: expectedOwner ?? { $exists: false } }, { $set: fields,';
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(original.split(needle).length-1,2,'both checkpoint and write actual owner selectors present');
const baseline=invoke('driver-baseline','primary-driver.ts');assert.equal(baseline.status,0);assert.match(baseline.output,/PRIMARY_DRIVER_WINNER_PRESERVED/);
try {
 writeFileSync(p,original.replaceAll(needle,'collection.updateOne({ _id: rowId }, { $set: fields,'));
 const mutant=invoke('driver-owner-only-mutant','primary-driver.ts');
 assert.equal(mutant.error,undefined);assert.notEqual(mutant.status,0);assert.match(mutant.output,/ACTUAL_DRIVER_SELECTOR/);assert.match(mutant.output,/B23.5 independent recreated actual-driver winner must survive byte-for-byte/);
 console.log('INTENDED_RED actual driver CAS-only mutant; preceding reads/authorize/absence guards unchanged');
} finally {writeFileSync(p,bytes);assert.equal(hash(readFileSync(p)),hash(bytes));console.log('RESTORED_BYTES',hash(bytes));}
const restored=invoke('driver-restored','primary-driver.ts');assert.equal(restored.status,0);
