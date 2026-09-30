import assert from 'node:assert/strict';
import {ScribeResultSchema} from './schemas-mutant.ts';
const escalation={type:'guard_only',level:'crisis',reason:'guard_crisis',studentId:'s',sessionId:'x',turnIds:['c'],flaggedAt:'2026-10-01T00:00:00.000Z',channel:'record_only',status:'queued',text:'SYNTHETIC_PRIVATE_SENTINEL'};
assert.equal(ScribeResultSchema.safeParse({status:'escalated',escalation}).success,false,'privacy oracle rejects injected personal text');
