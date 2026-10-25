// d055dump.js <persistence.test.ts> : copy-only F7a for pin 12. In the D055 prompt test only: (1) a catch before its finally prints the
// body error (identity vs sentinel); (2) the finally's supplied-undo loop prints any rejection; (3) process unhandledRejection hook.
const fs=require("fs");const p=process.argv[2];let t=fs.readFileSync(p,"utf8");const NLs="String.fromCharCode(10)";
const a=t.indexOf("D055 prompt original deadline: actual early");if(a<0){console.log("test missing");process.exit(3);}
const fin=`      } finally {\n        observer.disable(); latest = undefined; context.signal.removeEventListener("abort", abortListener);\n        if (promptTimer`;
const fin2=fin.replace(/\n/g,"\r\n");let useCR=t.indexOf(fin2,a)>=0;const F=useCR?fin2:fin;const i=t.indexOf(F,a);if(i<0){console.log("finally missing");process.exit(4);}
const ins=`      } catch (bodyError) { process.stderr.write("D055BODY " + JSON.stringify({ driver, rejectDriver, isSentinel: bodyError === sentinel, ctor: (bodyError as any)?.constructor?.name, msg: String((bodyError as any)?.message).slice(0, 300) }) + ${NLs}); throw bodyError;\n`;
t=t.slice(0,i)+(useCR?ins.replace(/\n/g,"\r\n"):ins)+t.slice(i);
const loop="for (const undo of suppliedSummaryUndos) await undo();";const j=t.indexOf(loop,a);if(j<0){console.log("loop missing");process.exit(5);}
t=t.slice(0,j)+`for (const [k, undo] of suppliedSummaryUndos.entries()) { try { await undo(); } catch (undoError) { process.stderr.write("D055UNDO " + JSON.stringify({ driver, rejectDriver, k, of: suppliedSummaryUndos.length, isSentinel: undoError === sentinel, msg: String((undoError as any)?.message).slice(0, 200) }) + ${NLs}); throw undoError; } }`+t.slice(j+loop.length);
t=`process.on("unhandledRejection", (r: unknown) => { process.stderr.write("D055UNHANDLED " + String((r as any)?.message) + String.fromCharCode(10)); });\n`+t;
fs.writeFileSync(p,t);console.log("d055 instrumented (CRLF="+useCR+")");
