import subprocess, os, sys, json, datetime
S="D:/vc/.worktrees/p1-u10w-chkB-wiring"
E="D:/vc/.worktrees/p1-u10w/qa/evidence/p1-u10w-B-c1/wiring"
env=dict(os.environ, TMPDIR=S+"/.chk-tmp", TMP=S+"/.chk-tmp", TEMP=S+"/.chk-tmp", VC_TESTLOCK_TIMEOUT_SECS="7200", MSYS_NO_PATHCONV="1")
IDX="apps/api/src/index.ts"; VOI="apps/api/src/voice.ts"
M=[
 ("W5-F1",VOI,'  if (raw === "true") return true;\n  throw new VoiceConfigError(`${VOICE_FLAG_ENV} must be "true" or "false" (got a different value)`);','  return true;'),
 ("W6-F1a",IDX,'    assertVoiceGoLive({ gatesDir: v?.gatesDir ?? DEFAULT_GATES_DIR, env });\n','' ),
 ("W6-F1b",IDX,'  const { client, db } = connectFromEnv(env, clientFactory);\n  counterRef.writer = createMongoAnonymousCounter(anonymousCountersCollection(db), http?.anonymous?.now);\n','  const { client, db } = connectFromEnv(env, clientFactory);\n  counterRef.writer = createMongoAnonymousCounter(anonymousCountersCollection(db), http?.anonymous?.now);\n  await client.connect();\n'),
 ("W6-F1c",VOI,'  assertGoLive(route.gatesDir, "voice", route.now, route.approver);\n','' ),
 ("W7-F1",IDX,'...(voice ? { onUpgrade: voice.upgrade } : {}),','...{},'),
 ("W7-F2",IDX,'escalateForTenant: escalateForTenant ?? sharedEscalateForTenant,','escalateForTenant: escalateForTenant ?? (() => async () => undefined),'),
 ("W8-F1",IDX,'        await voice?.close();\n        if (liveServer) await new Promise<void>((resolve) => liveServer.close(() => resolve()));\n        liveSweep.stop();\n        await client.close();','        if (liveServer) await new Promise<void>((resolve) => liveServer.close(() => resolve()));\n        liveSweep.stop();\n        await client.close();\n        await voice?.close();'),
 ("W8-F1b",IDX,'        await voice?.close();\n        if (liveServer) await new Promise<void>((resolve) => liveServer.close(() => resolve()));\n        liveSweep.stop();\n        await client.close();','        await client.close();\n        await voice?.close();\n        if (liveServer) await new Promise<void>((resolve) => liveServer.close(() => resolve()));\n        liveSweep.stop();'),
 ("W8-F2",IDX,'        await voice?.close();\n        if (liveServer)','        if (liveServer)'),
 ("W9-F1",IDX,'escalateForTenant: escalateForTenant ?? sharedEscalateForTenant,','escalateForTenant,'),
]
only=sys.argv[1:] 
for mid,f,old,new in M:
    if only and mid not in only: continue
    p=f"{S}/{f}"
    src=open(p,encoding="utf8",newline="").read()
    crlf="\r\n" in src
    o=old.replace("\n","\r\n") if crlf else old
    n=new.replace("\n","\r\n") if crlf else new
    if src.count(o)!=1:
        print(mid,"OLD TEXT NOT UNIQUE/FOUND",src.count(o)); continue
    open(p,"w",encoding="utf8",newline="").write(src.replace(o,n))
    open(f"{E}/mutant-{mid}.edit.txt","w",encoding="utf8").write(f"file: {f}\n--- OLD ---\n{old}\n--- NEW ---\n{new}\n")
    t0=datetime.datetime.now().astimezone().isoformat()
    log=f"{E}/mutant-{mid}.log"
    with open(log,"w") as lf:
        r=subprocess.run(["C:/Program Files/Git/bin/bash.exe","D:/vc/scripts/vc-testlock.sh","pnpm","-C",S+"/apps/api","exec","tsx","--test","--test-reporter=tap","--test-force-exit","tests/voice-wiring.test.ts"],stdout=lf,stderr=subprocess.STDOUT,env=env)
    subprocess.run(["git","-C",S,"checkout","--","f"[:0]+f])
    st=subprocess.run(["git","-C",S,"status","--short","--","apps/api/src"],capture_output=True,text=True).stdout.strip()
    txt=open(log,encoding="utf8",errors="replace").read()
    import re
    c={k:(re.search(r"^# %s (\d+)"%k,txt,re.M) or [None,"?"])[1] for k in ("tests","pass","fail")}
    fails=re.findall(r"^not ok \d+ - (.*)$",txt,re.M)
    print(mid,t0,"exit",r.returncode,c,"tree_clean=",st=="" ,"RED:",fails,flush=True)
