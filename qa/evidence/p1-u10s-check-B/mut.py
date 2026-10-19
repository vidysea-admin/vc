import sys,re
kind=sys.argv[1]
if kind in("M1","M3"):
    p="src/voice.ts"; s=open(p,encoding="utf8").read()
    if kind=="M1":
        a="""      try {
        words = clamp(redact(c, raw), 2000);
      } catch {
        logEvent("voice_crisis_redact_failed");
      }"""
        assert a in s; s=s.replace(a,"      words = clamp(redact(c, raw), 2000);")
    else:
        a="""    const turnId =
      ownTurn && spokenId !== undefined && !c.crisisTurnIds.has(spokenId) ? spokenId : `v${c.claims.sid.slice(0, 8)}crisis${randomUUID().slice(0, 8)}`;"""
        assert a in s; s=s.replace(a,"    const turnId = c.lastUser?.turnId ?? `v${c.claims.sid.slice(0, 8)}crisis`;")
else:
    p="src/chat.ts"; s=open(p,encoding="utf8").read()
    a="const raw = env[CHAT_FLAG_ENV];"; assert a in s; s=s.replace(a,"const raw = env[CHAT_FLAG_ENV]?.trim();")
open(p,"w",encoding="utf8").write(s)
