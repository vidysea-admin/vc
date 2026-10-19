import sys,json
f,old,new=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(f,encoding='utf8',newline='').read()
n=s.count(old)
if n!=1:
    print("COUNT",n); sys.exit(3)
open(f,'w',encoding='utf8',newline='').write(s.replace(old,new))
print("APPLIED")
