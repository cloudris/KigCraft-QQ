// SPDX-License-Identifier: GPL-3.0-or-later
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const file=process.argv[2]||join(homedir(),'restart-bot.sh');
let source=readFileSync(file,'utf8');if(source.includes('# BEGIN KIGCRAFT QQ')){console.log('Already integrated');process.exit();}
if(!source.includes('~/patch-onebot.sh'))throw new Error('Expected existing OneBot patch not found; no changes made');
const backup=file+'.pre-kigcraft.bak';if(!existsSync(backup))copyFileSync(file,backup);
// Existing script checks for the original Chinese success text after each restart.
// Preserve that logic, including its second retry, while applying both patches.
const helper=`# BEGIN KIGCRAFT QQ\npatch_all_bot() {\n  ~/patch-onebot.sh\n  local kig_out\n  kig_out=$(node '${root}/scripts/patch-onebot.mjs') || return 1\n  if [[ "$kig_out" == *KIGCRAFT_PATCHED* ]]; then echo '补丁成功：KigCraft QQ'; fi\n}\nnode '${root}/scripts/patch-onebot.mjs' || exit 1\nsystemctl --user start kigcraft-qq.service || exit 1\n# END KIGCRAFT QQ\n`;
source=source.replaceAll('~/patch-onebot.sh | grep','patch_all_bot | grep');const first=source.indexOf('\ndo_restart\n');if(first<0)throw new Error('Restart anchor not found; no changes made');source=source.slice(0,first)+'\n'+helper+source.slice(first);
writeFileSync(file,source);console.log('Restart script integrated; original backed up');
