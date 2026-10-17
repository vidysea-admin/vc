import {spawnSync} from 'node:child_process';import {writeFileSync} from 'node:fs';
const area='D:/vc/qa/evidence/vc-release-t052-primary-20261013',root=area+'/isolation';
for(const mode of ['summary','publication']){
 const result=spawnSync('C:/Program Files/nodejs/node.exe',['D:/vc/node_modules/tsx/dist/cli.mjs','--tsconfig',root+'/tsconfig.json',root+'/primary-authority.ts',mode],{cwd:root,encoding:'utf8',timeout:45000});
 const output=(result.stdout??'')+(result.stderr??'');writeFileSync(area+'/'+mode+'-authority-final.log',output);
 console.log(mode,'pid',result.pid,'exit',result.status,'error',result.error?.code);console.log(output.split('\n').filter(l=>/^LOADED|^HELD|^ACTUAL|^INDEPENDENT|^AssertionError/.test(l)).join('\n'));
 if(result.error)throw result.error;
}
