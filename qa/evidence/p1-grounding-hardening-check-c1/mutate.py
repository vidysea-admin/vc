import sys
# usage: mutate.py FILE LINE_MARKER OLD NEW  -> replaces OLD with NEW only on the single line that contains LINE_MARKER (CRLF preserved)
p, marker, old, new = sys.argv[1:5]
s = open(p, encoding="utf-8", newline="").read()
lines = s.split("\n")
hits = [i for i, l in enumerate(lines) if marker in l]
if len(hits) != 1:
    print("MUTATION-NOT-APPLIED marker hits=", len(hits)); sys.exit(3)
i = hits[0]
if lines[i].count(old) != 1:
    print("MUTATION-NOT-APPLIED old count=", lines[i].count(old)); sys.exit(4)
lines[i] = lines[i].replace(old, new)
open(p, "w", encoding="utf-8", newline="").write("\n".join(lines))
print("mutation applied at line", i + 1)
