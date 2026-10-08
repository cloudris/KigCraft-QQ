// SPDX-License-Identifier: GPL-3.0-or-later
import {randomBytes, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync, renameSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {isStart, parseStart} from './commands.mjs';
import {allowed} from './access.mjs';
import {creditBalance,creditSummary,generationCreditCost} from './credits.mjs';
export {isStart} from './commands.mjs';
export const token = () => randomBytes(32).toString('hex');
export const digest = v => createHash('sha256').update(v).digest('hex');
export function equal(a, b) { const x=Buffer.from(a||''), y=Buffer.from(b||''); return x.length===y.length && timingSafeEqual(x,y); }
export const keyOf = e => `${e.group}:${e.user}`;
export const IMAGE_RESULT_FOOTER='本功能基于开源项目 KigCraft（GitHub：icyqwq/KigCraft）开发。\n图片由 AI 生成，仅供设计参考，不能替代建模或制作图纸。';
export class Fault extends Error { constructor(message, status=400) {super(message); this.status=status;} }
export class Store {
  constructor(dir) {
    this.dir=resolve(dir); mkdirSync(this.dir,{recursive:true,mode:0o700}); this.file=join(this.dir,'state.json');
    try {this.s=JSON.parse(readFileSync(this.file,'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e; this.s={tasks:{},sessions:{},seen:{},outbox:[],jobs:[],reserved:0,calls:0};}
    this.s.credits??={}; // Existing installations start with a fresh Credit ledger.
    // Submission may already have reached FAL: never replay it after a crash.
    for(const j of this.s.jobs) if(j.state==='submitting') {j.state='uncertain'; j.error='提交结果不明，请管理员核对 FAL 记录；不会自动重试。';}
    this.save();
  }
  save() {writeFileSync(this.file+'.tmp', JSON.stringify(this.s), {mode:0o600}); renameSync(this.file+'.tmp',this.file);}
}
export class Engine {
  constructor(store, config, now=Date.now) {this.store=store; this.s=store.s; this.c=config; this.now=now;}
  save(){this.store.save();}
  allowed(e){return allowed(this.c,e);}
  credits(t){return {...creditBalance(this.s.credits,t.user,this.c,this.now()),generationCost:generationCreditCost(t)};}
  creditText(t){return creditSummary(this.credits(t));}
  settleCredit(j,state){const row=this.s.credits[j.credit];if(row?.state==='held'){row.state=state;row.settled=this.now();}}
  expire(){let changed=false;for(const [k,v] of Object.entries(this.s.sessions)) if(v.until<this.now()){delete this.s.sessions[k];const t=this.s.tasks[v.id];if(t?.status==='collecting'){t.status='expired';this.notify(t,'5 分钟收图时间已结束，没有自动生成。需要继续时请重新 @Bot 发送“生成参考图”。');}changed=true;}if(changed)this.save();}
  notify(t,text,asset,privateMessage=false){
    if(asset&&!privateMessage&&t.group){
      const generated=t.versions?.some(v=>['preview','refine','local','turnaround'].includes(v.kind));
      text+='\n\n'+(generated?IMAGE_RESULT_FOOTER:IMAGE_RESULT_FOOTER.split('\n')[0]);
    }
    this.s.outbox.push({id:randomUUID(),task:t.id,user:t.user,group:privateMessage?'':t.group,text,asset,created:this.now()});
  }
  create(e) {
    const secret=token(), id=randomUUID();
    const t={id,group:String(e.group),user:String(e.user),created:this.now(),expires:this.now()+this.c.linkHours*3600000,tokenHash:digest(secret),refs:[],prompt:(parseStart(e.text)?.prompt ?? e.text.trim()).slice(0,1500),revision:0,versions:[],status:'collecting',operations:{}};
    this.s.tasks[id]=t; this.s.sessions[keyOf(e)]={id,until:this.now()+300000};
    this.notify(t,'收图已开始：5 分钟内发送最多 8 张图片，无需继续 @。发“发完了”开始生成，发“取消生成”退出。图片将交给 FAL 生成，完成前不会调用付费模型。\n首次生成 1 Credit，之后每次 AI 修改 0.5 Credit；手动调整保存免费。\n'+this.creditText(t));
    // Bearer capability goes privately to the owner, never to the whole group.
    let publicUrl=this.c.publicUrl;
    try {const v=readFileSync(join(this.store.dir,'public-url.txt'),'utf8').trim();if(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(v))publicUrl=v;}catch{}
    this.notify(t,`你的专属编辑页（${this.c.linkHours} 小时内有效，请勿转发）：${publicUrl}/#${id}.${secret}`,undefined,true);
    return t;
  }
  event(e, assets=[]) {
    this.expire(); if(!this.allowed(e)) return {consumed:false};
    const eventKey=`${e.group}:${e.user}:${e.messageId}`;
    if(this.s.seen[eventKey]) return {consumed:true,duplicate:true};
    let session=this.s.sessions[keyOf(e)], t=session&&this.s.tasks[session.id];
    if(e.mentioned&&isStart(e.text)) {
      if(!t) t=this.create(e); else this.notify(t,'当前仍在收图，发送“发完了”或“取消生成”。');
    } else if(!t) return {consumed:false};
    this.s.seen[eventKey]=this.now();
    for(const [k,v] of Object.entries(this.s.seen)) if(v<this.now()-86400000) delete this.s.seen[k];
    if(e.text.trim()==='取消生成') {delete this.s.sessions[keyOf(e)];t.status='cancelled';this.notify(t,'已取消收图，没有调用付费模型。');}
    else {
      for(const a of assets) if(!t.refs.includes(a)&&t.refs.length<8)t.refs.push(a);
      if(assets.length)this.notify(t,`已收到 ${t.refs.length}/8 张参考图。`);
      if(e.text.trim()==='发完了') {
        if(!t.refs.length)this.notify(t,'还没有收到图片，请先发送参考图。');
        else {delete this.s.sessions[keyOf(e)]; try {this.enqueue(t,'preview',{},`initial:${t.id}`);} catch(err){t.status='blocked';this.notify(t,err.message+' 可在私信编辑页查看状态。');}}
      } else if(!isStart(e.text)&&e.text.trim())t.prompt=(t.prompt+'\n'+e.text.trim()).slice(0,1500);
    }
    this.save();return {consumed:true,task:t.id};
  }
  authorize(id,secret){const t=this.s.tasks[id];if(!t||t.expires<this.now()||!equal(t.tokenHash,digest(secret||'')))throw new Fault('链接无效或已过期',401);if(!this.allowed(t))throw new Fault('此任务所在群或账号已不在开放范围',403);return t;}
  enqueue(t,kind,payload,operation) {
    if(!this.allowed(t))throw new Fault('此群或账号不在开放范围',403);
    if(t.operations[operation])return this.s.jobs.find(j=>j.id===t.operations[operation]);
    if(this.s.jobs.some(j=>j.task===t.id&&['queued','submitting','running','uncertain'].includes(j.state)))throw new Fault('此任务仍有生成在进行或等待管理员核对',409);
    if(!this.c.paid)throw new Fault('付费生成尚未启用；编辑和收图仍可测试',403);
    const balance=this.credits(t),cost=generationCreditCost(t);
    if(!balance.exempt&&balance.remaining<cost)throw new Fault(`Credit 不足，本次需要 ${cost} Credit。${this.creditText(t)}`,403);
    if(this.c.budgetLimitEnabled!==false&&(this.s.calls>=this.c.maxCalls||this.s.reserved+this.c.reserve>this.c.budget))throw new Fault('本轮测试额度已用完，已停止付费生成',403);
    const job={id:randomUUID(),task:t.id,kind,payload,baseRevision:t.revision,state:'queued',created:this.now(),reserved:this.c.reserve};
    if(!balance.exempt){job.credit=job.id;this.s.credits[job.id]={user:t.user,period:balance.key,units:cost*2,state:'held',created:this.now()};}
    this.s.reserved+=this.c.reserve;this.s.calls++;this.s.jobs.push(job);t.operations[operation]=job.id;t.status='queued';
    this.notify(t,'已加入生成队列，每次只生成 1 张；失败或断线不会自动重复扣费。'+(balance.exempt?'':`本次预留 ${cost} Credit，成功后扣除。`)+'\n'+this.creditText(t));this.save();return job;
  }
  view(t){return {id:t.id,prompt:t.prompt,status:t.status,revision:t.revision,current:t.current,refs:t.refs,versions:t.versions,expires:t.expires,paid:this.c.paid,credits:this.credits(t),budget:{enabled:this.c.budgetLimitEnabled!==false,reserved:this.s.reserved,limit:this.c.budget,calls:this.s.calls,maxCalls:this.c.maxCalls},job:this.s.jobs.filter(j=>j.task===t.id).map(j=>({id:j.id,state:j.state,error:j.error})).at(-1)};}
}
