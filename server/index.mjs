// SPDX-License-Identifier: GPL-3.0-or-later
import http from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store,Engine,Fault,equal,isStart,keyOf} from './core.mjs';
import {Media,download} from './media.mjs';
import {Worker} from './worker.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ids=value=>(value||'').split(',').map(x=>x.trim()).filter(Boolean);
export function config(env=process.env){return {host:env.HOST||'127.0.0.1',port:Number(env.PORT||18940),publicUrl:(env.PUBLIC_URL||'http://127.0.0.1:18940').replace(/\/$/,''),internal:env.INTERNAL_TOKEN||'',groups:ids(env.ALLOWED_GROUPS),users:ids(env.ALLOWED_USERS),publicGroups:ids(env.PUBLIC_GROUPS),creditExemptUsers:ids(env.CREDIT_EXEMPT_USERS),weeklyCredits:Number(env.WEEKLY_CREDITS||8),linkHours:Math.min(Number(env.LINK_HOURS||48),168),paid:env.PAID_ENABLED==='true',budgetLimitEnabled:env.BUDGET_LIMIT_ENABLED!=='false',budget:Number(env.BUDGET_USD||8),reserve:Number(env.RESERVE_USD||2),maxCalls:Number(env.MAX_PAID_CALLS||4),data:resolve(env.DATA_DIR||join(root,'data')),fal:env.FAL_KEY||''};}
export function createService(c){
  if(c.internal.length<32)throw new Error('INTERNAL_TOKEN must have at least 32 characters');
  if(![c.budget,c.reserve,c.maxCalls,c.linkHours].every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid limits');
  if(!Number.isSafeInteger(c.weeklyCredits*2)||c.weeklyCredits<=0)throw new Error('Invalid weekly Credits');
  if(c.paid&&!c.fal)throw new Error('FAL_KEY required for paid mode');
  const store=new Store(c.data),engine=new Engine(store,c),media=new Media(c.data),worker=new Worker(engine,media,c.fal);
  let serial=Promise.resolve();const transact=fn=>{const p=serial.then(fn);serial=p.catch(()=>{});return p;};
  async function body(req){let n=0;const chunks=[];for await(const b of req){n+=b.length;if(n>24*1024*1024)throw new Fault('请求过大',413);chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new Fault('无效请求');}}
  const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  async function asset(b){if(typeof b!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b))throw new Fault('无效图片');return media.put(Buffer.from(b.split(',')[1],'base64'));}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob:; worker-src 'self' blob:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    try {
      const u=new URL(req.url,'http://local'),path=u.pathname;
      if(path==='/health'&&req.method==='GET')return json(res,{ok:true});
      if(path.startsWith('/internal/')){
        if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!equal(req.headers.authorization,'Bearer '+c.internal))throw new Fault('未授权',401);
        if(path==='/internal/state'&&req.method==='GET'){engine.expire();return json(res,{sessions:engine.s.sessions,groups:c.groups,users:c.users,publicGroups:c.publicGroups,creditExemptUsers:c.creditExemptUsers,weeklyCredits:c.weeklyCredits,budgetLimitEnabled:c.budgetLimitEnabled!==false,outbox:engine.s.outbox.slice(0,10)});}
        if(path.startsWith('/internal/asset/')&&req.method==='GET'){res.setHeader('Content-Type','image/png');return res.end(media.get(path.split('/').at(-1)));}
        if(path==='/internal/ack'&&req.method==='POST'){const b=await body(req);await transact(()=>{engine.s.outbox=engine.s.outbox.filter(x=>x.id!==b.id);engine.save();});return json(res,{ok:true});}
        if(path==='/internal/event'&&req.method==='POST'){
          const e=await body(req);if(!/^\d+$/.test(String(e.group))||!/^\d+$/.test(String(e.user))||typeof e.text!=='string'||!e.messageId)throw new Fault('无效消息');
          const result=await transact(async()=>{
            engine.expire();if(!engine.allowed(e)||!(e.mentioned&&isStart(e.text)||engine.s.sessions[keyOf(e)]))return {consumed:false};
            if(engine.s.seen[`${e.group}:${e.user}:${e.messageId}`])return {consumed:true};
            const ids=[];for(const url of (e.images||[]).slice(0,8)){try{ids.push(await media.put(await download(url)));}catch{ /* Never let a bad attachment reach the model. */ }}
            const r=engine.event(e,ids);if((e.images||[]).length&&!ids.length&&r.task){engine.notify(engine.s.tasks[r.task],'图片下载失败，请重发原图（PNG/JPEG/WebP，16 MB 以内）。');engine.save();}return {...r,sessionUntil:engine.s.sessions[keyOf(e)]?.until||0};
          });return json(res,result);
        }
        throw new Fault('接口不存在',404);
      }
      if(path.startsWith('/api/')){
        const match=path.match(/^\/api\/tasks\/([a-f0-9-]{36})(?:\/(.*))?$/);if(!match)throw new Fault('接口不存在',404);
        const t=engine.authorize(match[1],String(req.headers.authorization||'').replace(/^Bearer /,'')),action=match[2]||'';
        let publicOrigin=new URL(c.publicUrl).origin;try{const v=readFileSync(join(c.data,'public-url.txt'),'utf8').trim();if(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(v))publicOrigin=v;}catch{}
        if(req.headers.origin&&req.headers.origin!==publicOrigin)throw new Fault('来源不匹配',403);
        if(req.method==='GET'&&action==='')return json(res,engine.view(t));
        if(req.method==='GET'&&action.startsWith('assets/')){
          const id=action.slice(7),all=[...t.refs,...t.versions.map(v=>v.asset)];if(!all.includes(id))throw new Fault('无权访问图片',403);
          res.setHeader('Content-Type','image/png');return res.end(media.get(id));
        }
        if(req.method==='POST'&&['save','generate'].includes(action)){
          const b=await body(req);const result=await transact(async()=>{
            if(typeof b.operation!=='string'||!/^[-a-zA-Z0-9:]{8,100}$/.test(b.operation))throw new Fault('缺少操作标识');
            if(t.operations[b.operation])return {ok:true,duplicate:true};
            if(b.revision!==t.revision)throw new Fault('页面版本已更新，请刷新后再试',409);
            if(engine.s.jobs.some(j=>j.task===t.id&&['queued','submitting','running','uncertain'].includes(j.state)))throw new Fault('请等待当前生成结束',409);
            const base=b.image?await asset(b.image):t.current;
            if(action==='save'){
              if(!base)throw new Fault('没有可保存的图片');t.revision++;t.current=base;t.versions.push({asset:base,revision:t.revision,kind:'manual',created:Date.now()});t.operations[b.operation]='saved';t.status='ready';
              t.lastRecipe=b.recipe;engine.notify(t,`QQ ${t.user}：网页精修已保存，本次手动保存不扣 Credit。\n`+engine.creditText(t),base);engine.save();return {ok:true};
            }
            if(!['preview','refine','local','turnaround'].includes(b.kind))throw new Fault('无效生成类型');
            if(b.kind==='preview'&&!t.refs.length)throw new Fault('请先通过 QQ 发送参考图');
            if(b.kind!=='preview'&&!base)throw new Fault('没有基础图片');
            const refs=[];for(const r of (b.references||[]).slice(0,6))refs.push(await asset(r));
            const mask=b.kind==='local'?await asset(b.mask):undefined;
            const note=String(b.note||'').slice(0,1500);if(b.kind==='local'&&!note.trim())throw new Fault('请描述局部修改要求');
            if(mask){const sharp=(await import('sharp')).default;const a=await sharp(media.get(mask)).ensureAlpha().extractChannel(3).stats();if(a.channels[0].max===0)throw new Fault('请先涂选局部修改区域');}
            const j=engine.enqueue(t,b.kind,{base,mask,references:refs,note},b.operation);return {ok:true,job:j.id};
          });return json(res,result);
        }
        throw new Fault('接口不存在',404);
      }
      if(req.method!=='GET')throw new Fault('接口不存在',404);
      if(path==='/source.zip'){const source=join(root,'source.zip');if(!existsSync(source))throw new Fault('源码包尚未构建',404);res.setHeader('Content-Type','application/zip');return res.end(readFileSync(source));}
      const web=join(root,'vendor/kigcraft/frontend/dist');const target=resolve(web,'.'+decodeURIComponent(path==='/'?'/index.html':path));
      if(target!==web&&!target.startsWith(web+'/')&&!target.startsWith(web+'\\'))throw new Fault('无效路径',403);
      if(!existsSync(target)||!statSync(target).isFile())throw new Fault('页面不存在',404);
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.onnx':'application/octet-stream','.tflite':'application/octet-stream'};
      res.setHeader('Content-Type',mime[extname(target)]||'application/octet-stream');res.end(readFileSync(target));
    } catch(err){json(res,{error:err instanceof Fault?err.message:'处理失败，请稍后重试'},err.status||500);if(!(err instanceof Fault))console.error('[http]',err.message);}
  });
  return {server,engine,media,worker};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const c=config(),s=createService(c);s.server.listen(c.port,c.host,()=>console.log(`KigCraft QQ listening on ${c.host}:${c.port}; paid=${c.paid}`));
  const timer=setInterval(()=>void s.worker.tick(),5000);timer.unref();
  process.on('SIGTERM',()=>{clearInterval(timer);s.server.close(()=>process.exit());});
}
