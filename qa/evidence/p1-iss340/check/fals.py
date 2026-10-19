import sys,re
p='D:/tmp340chk/wt/packages/engine/src/guards/crisis.ts'
mode=sys.argv[1]
s=open(p,encoding='utf8',newline='').read()
if mode=='F1':
    a='  phrase(S_SAB, S_KHATAM, S_KAR, slot(["dunga", "dungi", "doonga", "doongi"], [D_DUNGA, D_LUNGA], "end")),'
    assert a in s; s=s.replace(a,'')
elif mode=='F2':
    a='    .replace(DEVA_NUKTA, "")'
    assert a in s; s=s.replace(a,'    .replace(/(?!)/g, "")')
elif mode=='F3':
    a='  ...ISS340_CONCERN_PATTERNS,'
    assert a in s; s=s.replace(a,'')
elif mode=='F4':
    a='  ...ISS340_CRISIS_PATTERNS,'
    assert a in s; s=s.replace(a,'  ...ISS340_CRISIS_PATTERNS,\n  /खत्म/,')
elif mode=='F5':
    a='  ...ISS340_CRISIS_PATTERNS,'
    assert a in s; s=s.replace(a,'  ...ISS340_CRISIS_PATTERNS,\n  /(?:सब\s*)+(?:सब\s*)+(?:सब\s*)+नहींनहीं/,')
open(p,'w',encoding='utf8',newline='').write(s)
