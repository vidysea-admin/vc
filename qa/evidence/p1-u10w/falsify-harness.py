import subprocess, sys, re, json, os, time

WT = 'D:/vc/.worktrees/p1-u10w-fals'
OUT = 'D:/vc/.worktrees/p1-u10w/qa/evidence/p1-u10w/falsify'
os.makedirs(OUT, exist_ok=True)
VOICE = WT + '/apps/api/src/voice.ts'
INDEX = WT + '/apps/api/src/index.ts'


def read(p):
    return open(p, encoding='utf8', newline='').read().replace('\r\n', '\n')


def write(p, s):
    open(p, 'w', encoding='utf8', newline='').write(s.replace('\n', '\r\n'))


M = [
    # id, criterion, file, [(old, new)]
    ('W1a', 'W1', VOICE, [('if (err instanceof StudentFencedError) {\n          endIfFenced(c, err);\n          return "fenced";', 'if (err instanceof StudentFencedError || err instanceof FencedWriterDeadlineError) {\n          endIfFenced(c, err);\n          return "fenced";')]),
    ('W1b', 'W1', VOICE, [('logEvent(last instanceof FencedWriterDeadlineError ? failEvent.replace(/_failed$/, "_deadline") : failEvent, last);', 'logEvent(failEvent, last);')]),
    ('W1c', 'W1', VOICE, [('for (let attempt = 1; attempt <= VOICE_CRISIS_WRITE_ATTEMPTS; attempt++) {\n      try {\n        await write();\n        return "ok";', 'for (let attempt = 1; attempt <= 1; attempt++) {\n      try {\n        await write();\n        return "ok";')]),
    ('W2a', 'W2', VOICE, [('          lateWork.add(drained);\n', '')]),
    ('W2b', 'W2', VOICE, [('timer = setTimeout(() => resolve(true), drainTimeoutMs);\n            timer.unref?.();\n          }),\n        ]);\n        if (timer !== undefined) clearTimeout(timer);\n        if (timedOut) logEvent("voice_shutdown_drain_timeout");', 'timer = setTimeout(() => resolve(true), 3_600_000);\n            timer.unref?.();\n          }),\n        ]);\n        if (timer !== undefined) clearTimeout(timer);\n        if (timedOut) logEvent("voice_shutdown_drain_timeout");')]),
    ('W2c', 'W2', VOICE, [('if (timedOut) logEvent("voice_shutdown_drain_timeout");', 'if (timedOut) void 0;')]),
    ('W3a', 'W3', VOICE, [('    if (pending.length === 0) return false;\n    let timer', '    if (pending.length >= 0) return false;\n    let timer')]),
    ('W3b', 'W3', VOICE, [('      logEvent("voice_connect_overlap");\n', '')]),
    ('W3c', 'W3', VOICE, [('      if (c.connecting && !c.connectDone) {', '      if (false as boolean) {')]),
    ('W3d', 'W3', VOICE, [('timer = setTimeout(() => resolve(true), connectOverlapWaitMs);', 'timer = setTimeout(() => resolve(true), 3_600_000);')]),
    ('W4a', 'W4', VOICE, [('turns: [{ turnId, speaker: "student"', 'turns: [{ turnId: turnId + String(Math.random()), speaker: "student"')]),
    ('W5a', 'W5', INDEX, [('voiceEnabledFromEnv(env)) {', 'env.VC_VOICE_ENABLED !== "false") {')]),
    ('W6a', 'W6', INDEX, [('    assertVoiceGoLive({ gatesDir: v?.gatesDir ?? DEFAULT_GATES_DIR, env });', '    assertVoiceGoLive({ gatesDir: v?.gatesDir ?? DEFAULT_GATES_DIR, env: {} });'), ('{ enabled: true, gatesDir: gatesDir ?? DEFAULT_GATES_DIR, env },', '{ enabled: true, gatesDir: gatesDir ?? DEFAULT_GATES_DIR, env: {} },')]),
    ('W6b', 'W6', INDEX, [('    if (!v?.live || !v.crisis) throw new VoiceConfigError("VC_VOICE_ENABLED is true but no Live provider and crisis message were supplied");\n', '')]),
    ('W6c', 'W6', INDEX, [('  // Built before connecting so every voice', '  await client.connect();\n  // Built before connecting so every voice')]),
    ('W6d', 'W6', INDEX, [('    assertVoiceGoLive({ gatesDir: v?.gatesDir ?? DEFAULT_GATES_DIR, env });' + chr(10), '')]),
    ('W7a', 'W7', INDEX, [('...(voice ? { onUpgrade: voice.upgrade } : {}),', '')]),
    ('W7b', 'W7', INDEX, [('withVoiceRoutes(withChatRoutes(withAnonymousRoutes(handler, anonymousHandler), chatHandler), voice?.handler)', 'withVoiceRoutes(withChatRoutes(withAnonymousRoutes(handler, anonymousHandler), chatHandler), undefined)')]),
    ('W7c', 'W7', INDEX, [('wsSecret: wsSecret ?? new TextEncoder().encode(secretRaw ?? ""),', 'wsSecret: wsSecret ?? new TextEncoder().encode(""),')]),
    ('W7d', 'W7', INDEX, [('wsBaseUrl: wsBaseUrl ?? env[VOICE_WS_ENV.baseUrl] ?? "",', 'wsBaseUrl: wsBaseUrl ?? "",')]),
    ('W8a', 'W8', INDEX, [('        await voice?.close();\n        if (liveServer)', '        if (liveServer)'), ('        liveSweep.stop();\n        await client.close();\n      },', '        liveSweep.stop();\n        await client.close();\n        await voice?.close();\n      },')]),
    ('W9a', 'W9', INDEX, [('escalateForTenant: escalateForTenant ?? sharedEscalateForTenant,', 'escalateForTenant: escalateForTenant ?? defaultEscalateForTenant,')]),
    ('W9b', 'W9', INDEX, [('escalateForTenant: sharedEscalateForTenant,', 'escalateForTenant: chatSetup.chat.escalateForTenant ?? ((tenantId, tenantDb) => async () => { void tenantId; void tenantDb; }),')]),
]

only = set(sys.argv[1:])
results = []
for mid, crit, path, edits in M:
    if only and mid not in only:
        continue
    orig = read(path)
    s = orig
    ok = True
    for a, b in edits:
        if s.count(a) != 1:
            print('EDIT NOT APPLICABLE', mid, repr(a[:60]), s.count(a))
            ok = False
            break
        s = s.replace(a, b)
    if not ok:
        results.append((mid, crit, 'NOT-APPLIED', ''))
        continue
    write(path, s)
    try:
        cmd = ['C:/Program Files/Git/usr/bin/bash.exe', 'D:/vc/scripts/vc-testlock.sh', 'pnpm', '-C', WT + '/apps/api', 'exec', 'tsx', '--test', '--test-force-exit', '--test-timeout=12000', 'tests/voice-wiring.test.ts']
        env = dict(os.environ, VC_TESTLOCK_TIMEOUT_SECS='7200')
        r = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=900, encoding='utf8', errors='replace')
        out = r.stdout + r.stderr
    except subprocess.TimeoutExpired as e:
        out = 'TIMEOUT'
    finally:
        write(path, orig)
    open(f'{OUT}/falsify-{mid}.log', 'w', encoding='utf8').write(out)
    m_pass = re.search(r'ℹ pass (\d+)', out)
    m_fail = re.search(r'ℹ fail (\d+)', out)
    first = re.search(r'✖ (W\d[^\n(]{0,110})', out)
    results.append((mid, crit, f"pass={m_pass.group(1) if m_pass else '?'} fail={m_fail.group(1) if m_fail else '?'}", first.group(1) if first else ''))
    print(results[-1], flush=True)
json.dump(results, open(f'{OUT}/falsify-summary.json', 'w'), indent=1)
