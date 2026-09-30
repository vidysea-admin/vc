import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
const root='D:/vc/.worktrees/t046-canonical';
for(const p of ['packages/engine','apps/api','apps/web','mcp/student-profile','mcp/university-kb']){
 const require=createRequire(root+'/'+p+'/package.json');
 for(const name of ['db','engine','schemas','providers','observability']){try{const path=realpathSync(require.resolve('@vc/'+name)); console.log(p,name,path); if(!path.toLowerCase().startsWith(root.toLowerCase().replaceAll('/','\\')+'\\')) throw Error('WRONG CHECKOUT');}catch(e){if(e.code!=='MODULE_NOT_FOUND') throw e;}}
}
