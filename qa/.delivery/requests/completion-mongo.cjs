// Isolated local QA runtime. Never consumes .env or an external Mongo URI.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { MongoMemoryServer } = require('D:/vc/qa/.delivery/mongo-runtime/node_modules/mongodb-memory-server');
const root = 'D:/vc/.worktrees/vc-completion';
const data = path.resolve(root, 'qa/.delivery/completion-mongo-data');
if (!data.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)) throw Error('QA path escaped workspace');
fs.mkdirSync(data, {recursive:true});
const binary = 'C:/Program Files/MongoDB/Server/7.0/bin/mongod.exe';
const version = cp.execFileSync(binary, ['--version'], {encoding:'utf8'}).match(/db version v([0-9.]+)/)?.[1];
if (!version) throw Error('Unknown local Mongo binary version');
(async () => {
  const mongo = await MongoMemoryServer.create({binary:{systemBinary:binary,version},instance:{ip:'127.0.0.1',dbName:'virtual_counsellor',dbPath:data,port:0}});
  const uri = mongo.getUri('virtual_counsellor');
  const parsed = new URL(uri);
  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/virtual_counsellor' || parsed.username || parsed.password) {
    await mongo.stop({doCleanup:false}); throw Error('Refusing non-isolated runtime');
  }
  const runtime = {uri,host:'127.0.0.1',port:Number(parsed.port),database:'virtual_counsellor',ownerPid:process.pid,dataPath:data,synthetic:true};
  fs.writeFileSync(path.join(root,'qa/.delivery/completion-mongo.json'),JSON.stringify(runtime,null,2));
  console.log(JSON.stringify({status:'ready',host:runtime.host,port:runtime.port,database:runtime.database,ownerPid:runtime.ownerPid,synthetic:true}));
  const hold = setInterval(() => {}, 10000);
  const stop = async () => { clearInterval(hold); await mongo.stop({doCleanup:false}); process.exit(0); };
  process.once('SIGINT',stop); process.once('SIGTERM',stop);
})().catch(error => { console.error(error.name + ': local Mongo startup failed'); process.exitCode=1; });
