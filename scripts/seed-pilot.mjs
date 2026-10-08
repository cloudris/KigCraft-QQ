// SPDX-License-Identifier: GPL-3.0-or-later
// Opt-in, one paid smoke-test job. Run with service STOPPED and --paid.
import {readFileSync,writeFileSync} from 'node:fs';import sharp from 'sharp';
import {config,createService} from '../server/index.mjs';
const c=config();if(process.argv[2]!=='--paid'||!c.paid||c.users.length!==1)throw new Error('Requires --paid, PAID_ENABLED=true and exactly one pilot user');
let running=false;try{running=(await fetch(`http://127.0.0.1:${c.port}/health`,{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(running)throw new Error('Stop the task service before seeding to avoid concurrent state writers');
const s=createService(c);if(s.engine.s.calls)throw new Error('Pilot is only permitted before the first paid call');
const svg=readFileSync(new URL('./demo.mjs',import.meta.url),'utf8').split('const svg='+String.fromCharCode(96))[1]?.split(String.fromCharCode(96)+';')[0];if(!svg)throw new Error('Demo fixture unavailable');
const t=s.engine.create({group:'',user:c.users[0],text:'生成参考图 原创绿色眼睛、深色短发角色，请转为树脂头壳产品参考图'});
const link=s.engine.s.outbox.find(x=>x.task===t.id&&x.text.includes('/#'));s.engine.s.outbox=s.engine.s.outbox.filter(x=>x.task!==t.id);
link.text='KigCraft QQ 试运行：这是专属编辑页，测试图生成后会在此显示。'+link.text;s.engine.s.outbox.push(link);
t.refs=[await s.media.put(await sharp(Buffer.from(svg)).png().toBuffer())];delete s.engine.s.sessions[':'+t.user];
s.engine.enqueue(t,'preview',{},'pilot-initial');writeFileSync('data/pilot-task.txt',t.id);console.log('One pilot job queued. Reserved $2 of $8; no API call until worker starts.');
