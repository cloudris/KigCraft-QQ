// SPDX-License-Identifier: GPL-3.0-or-later
import {readFileSync,writeFileSync,copyFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const projectHome=join(homedir(),'.openclaw/npm/projects');
const candidates=process.argv[2]?[resolve(process.argv[2])]:readdirSync(projectHome).filter(n=>n.startsWith('kirigaya-openclaw-onebot-')).map(n=>join(projectHome,n,'node_modules/@kirigaya/openclaw-onebot/dist')).filter(existsSync);
if(!candidates.length)throw new Error('OneBot dist not found; pass it as the first argument');
let changed=false;
for(const dist of candidates){
  const service=join(dist,'service.js'),handler=join(dist,'handlers/process-inbound.js');
  const edits=[{file:service,importLine:'import { startKigBridge } from "./kigcraft-bridge.mjs";\n',anchor:'startScheduler(api);',addition:'\n        startKigBridge(api);',marker:'startKigBridge(api);'},
    {file:handler,importLine:'import { handleKigInbound } from "../kigcraft-bridge.mjs";\n',anchor:'export async function processInboundMessage(api, msg) {',addition:'\n    if (await handleKigInbound(api, msg)) return;',marker:'await handleKigInbound(api, msg)'}];
  // Validate BOTH anchors before modifying this installation.
  for(const e of edits){const s=readFileSync(e.file,'utf8');if(!s.includes(e.marker)&&s.split(e.anchor).length!==2)throw new Error('Unsupported OneBot version: '+e.file);}
  const bridge=readFileSync(join(root,'adapters/onebot-bridge.mjs'),'utf8').replace('__PROJECT_ROOT__',root.replaceAll('\\','/'));
  const commands=readFileSync(join(root,'server/commands.mjs'),'utf8'),commandsPath=join(dist,'kigcraft-commands.mjs');
  if(!existsSync(commandsPath)||readFileSync(commandsPath,'utf8')!==commands){writeFileSync(commandsPath,commands);changed=true;}
  const access=readFileSync(join(root,'server/access.mjs'),'utf8'),accessPath=join(dist,'kigcraft-access.mjs');
  if(!existsSync(accessPath)||readFileSync(accessPath,'utf8')!==access){writeFileSync(accessPath,access);changed=true;}
  const bridgePath=join(dist,'kigcraft-bridge.mjs');if(!existsSync(bridgePath)||readFileSync(bridgePath,'utf8')!==bridge){writeFileSync(bridgePath,bridge);changed=true;}
  for(const e of edits){const old=readFileSync(e.file,'utf8');if(old.includes(e.marker))continue;const backup=e.file+'.pre-kigcraft.bak';if(!existsSync(backup))copyFileSync(e.file,backup);const next=e.importLine+old.replace(e.anchor,e.anchor+e.addition);writeFileSync(e.file,next);try{execFileSync(process.execPath,['--check',e.file]);}catch(err){writeFileSync(e.file,old);throw err;}changed=true;}
}
console.log(changed?'KIGCRAFT_PATCHED':'KIGCRAFT_ALREADY_PATCHED');
