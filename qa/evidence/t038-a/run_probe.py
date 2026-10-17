import pathlib,subprocess,os,json,time,hashlib
OUT=pathlib.Path('D:/vc/qa/evidence/t038-a')
ROOT=pathlib.Path('C:/Users/Lenovo/.codex/worktrees/application-draft-core/vc')
dest=OUT/'copy-C3-false-zero';p=dest/'apps/api/tests/server.test.ts'
raw=p.read_bytes()
needle=b'    { value: "a b c d", count: "whitespace-words", min: 3, max: 3, reason: "length_above_maximum" },'
assert raw.count(needle)==1
addition=b'    { value: "a\\u0085b", count: "whitespace-words", min: 2, max: 2, reason: null },\r\n'
env=os.environ.copy();env['VC_TESTLOCK_TIMEOUT_SECS']='900'
cmd=['C:/Program Files/Git/bin/bash.exe','D:/vc/scripts/vc-testlock.sh','C:/Program Files/nodejs/node.exe',str(ROOT/'node_modules/tsx/dist/cli.mjs'),'--test','--test-concurrency=1','--test-timeout=120000','--test-name-pattern=T038 synthetic oracle 7:','apps/api/tests/server.test.ts']
try:
 altered=raw.replace(needle,addition+needle)
 assertion=b'assert.deepEqual(result.packet.fields, item.reason ? {} : { answer: item.value });'
 start=altered.index(b'test("T038 synthetic oracle 7:'); end=altered.index(b'test("T038 synthetic oracle 8:')
 section=altered[start:end]; assert section.count(assertion)==1
 p.write_bytes(altered[:start]+section.replace(assertion,b'assert.deepEqual(result.packet.fields, item.reason ? {} : { answer: item.value }, JSON.stringify(result));')+altered[end:])
 with (OUT/'C3-nel-http.log').open('w',encoding='utf8') as log: result=subprocess.run(cmd,cwd=dest,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=1000)
 (OUT/'C3-nel-http.json').write_text(json.dumps({'command':cmd,'exit':result.returncode,'productSourceUnchanged':hashlib.sha256((dest/'apps/api/src/server.ts').read_bytes()).hexdigest().upper()=='1F1580BEA5630DF5F264C849525DDB07E761B11D308326EC1740F6561D4C6F2E','input':'a U+0085 b','expectedWordCount':2},indent=2))
finally:
 p.write_bytes(raw)
assert p.read_bytes()==raw
print('NEL HTTP probe exit',result.returncode,'copied oracle exact-restored',flush=True)
