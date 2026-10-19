import sys
f, old, new, occ = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
s = open(f, encoding='utf8', newline='').read()
idx = -1
for _ in range(occ):
    idx = s.find(old, idx + 1)
    if idx < 0:
        print("MUTATION-TARGET-NOT-FOUND"); sys.exit(2)
s = s[:idx] + new + s[idx+len(old):]
open(f, 'w', encoding='utf8', newline='').write(s)
print("mutated", f, "occurrence", occ)
