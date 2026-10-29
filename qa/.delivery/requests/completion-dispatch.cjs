// Local QA orchestration artifact. No product code, network, credentials, or model override.
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const tick = 'C:/Users/Lenovo/.agents/skills/maker/tools/tick.mjs';
const task = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const root = process.cwd();
const source = (path, start = 1, count) => {
  const bytes = fs.readFileSync(path);
  const lines = bytes.toString('utf8').split(/\r?\n/).length;
  return {path, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), ranges: [[start, Math.min(lines, count ? start + count - 1 : lines)]]};
};
const plan = 'docs/features/vc-admin-control/plan.md';
const start = fs.readFileSync(plan, 'utf8').split(/\r?\n/).findIndex(s => s.startsWith('## S12')) + 1;
const sources = [source(plan, start), source(task.brief)];
if (task.planApproval) sources.push(source('qa/verdicts/quest-successor-plan.md', task.planApproval));
const hand = {
  schema_version: 'compact-handoff/1',
  shared_instructions: 'Vidysea approved S12 local completion. Work only in the assigned isolated checkouts, never mutate main D:/vc or its index. You are not alone: preserve peer edits and stay within owned files. Read AGENTS/ARCHITECTURE and pinned maker/checker rules. No new product module/test file/collection, no helpers, no commit/push/deploy, no production DB/provider calls, no secrets printed, no model overrides. Root owns integration/final acceptance; BUILDING has no per-helper checker or full suite. Name exact existing file:function:line before edits. Relevant failures need focused existing-file tests. Preserve T057 cycle2 and historical STALLED evidence; current named recovery is explicit user authorization, not a reset. Return detail in your owned evidence artifact and a concise final handback with paths, commands/results, open items and interface changes. Do not stop after planning if your task is an approved build.',
  sources,
  task: {id: task.id, owner: task.id, purpose: task.purpose, dependencies: task.dependencies || [], acceptance: task.acceptance, checks: task.checks},
  bounds: {max_source_bytes: 65536, max_prompt_bytes: 98304}
};
const prefix = `qa/.delivery/requests/${task.id}`;
fs.writeFileSync(prefix + '-handoff.json', JSON.stringify(hand));
const handoff = JSON.parse(cp.execFileSync(process.execPath, [tick, '--delivery', 'handoff', prefix + '-handoff.json'], {encoding:'utf8'})).handoff;
const now = Date.now(), ms = task.minutes * 60000;
const request = {
  schema_version:'reliable-delivery/1', workflow_id:task.id + '-20261027', root_run_id:task.id + '-20261027', feature:task.id, cycle:2,
  parent_run_id:'T-057-S12-user-approved-recovery', run_id:task.id, session:'vc-completion-20261027', retry_of:null,
  candidate:{files:[plan, task.brief, ...(task.planApproval ? ['qa/verdicts/quest-successor-plan.md'] : [])]},
  identity_files:{policy_id:{path:'C:/Users/Lenovo/.agents/skills/maker/SKILL.md'},protocol_id:{path:'C:/Users/Lenovo/.agents/skills/checker/SKILL.md'},config_id:{path:'qa/adapter.json'},dependency_id:{path:'pnpm-lock.yaml'}},
  budget:{deadline:new Date(now+ms).toISOString(),closeout_ms:Math.min(ms/10,180000),no_progress_ms:ms,estimate_ms:ms,estimate_tokens:null,token_cap:null,estimate_provenance:task.estimate},
  resource_caps:{agent:8},closeout_resources:{agent:1},criteria:[{id:'OWNED',description:'Owned contribution; integrated final acceptance remains with root',check_task_id:task.id}],
  tasks:[{id:task.id,owner:task.id,kind:task.kind || 'integration',depends_on:[],owns:task.owns,resources:{agent:1},timeout_ms:ms,max_output_bytes:1048576,command:['C:/Users/Lenovo/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe','exec','--approve-for-me','--json','-'],handoff}],
  dispatch:{task_id:task.id,attempt_id:'attempt1'}
};
fs.writeFileSync(prefix + '.json', JSON.stringify(request));
fs.writeFileSync(prefix + '.packet.json', cp.execFileSync(process.execPath,[tick,'--delivery','prepare',prefix+'.json'],{encoding:'utf8'}));
console.log(JSON.stringify({task:task.id,packet:prefix+'.packet.json',cwd:root}));
