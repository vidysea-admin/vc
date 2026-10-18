import sys, io
# usage: mutate.py <file> <n> <old1> <new1> [<old2> <new2> ...]
f = sys.argv[1]
s = open(f, newline="", encoding="utf-8").read()
args = sys.argv[2:]
for i in range(0, len(args), 2):
    old, new = args[i], args[i+1]
    c = s.count(old)
    if c != 1:
        print(f"MUTATION-FAILED: pattern count {c}: {old[:80]}"); sys.exit(3)
    s = s.replace(old, new)
open(f, "w", newline="", encoding="utf-8").write(s)
print("mutated", len(args)//2, "edit(s)")
