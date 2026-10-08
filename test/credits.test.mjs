import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store,Engine} from '../server/core.mjs';
import {creditPeriod} from '../server/credits.mjs';
import {Worker} from '../server/worker.mjs';
import {config} from '../server/index.mjs';
const boundary=Date.parse('2026-10-11T15:59:00Z');
function setup(overrides={}){
 const dir=mkdtempSync(join(tmpdir(),'kig-credits-'));
 let now=boundary-60000;
 const c={groups:['10','20','30'],publicGroups:['10','20'],users:['99'],creditExemptUsers:['99'],weeklyCredits:8,publicUrl:'https://editor.example.com',linkHours:48,paid:true,budget:1000,reserve:2,maxCalls:500,...overrides};
 const e=new Engine(new Store(dir),c,()=>now);
 return {e,c,dir,setTime:v=>now=v,restore:()=>new Engine(new Store(dir),c,()=>now)};
}
function task(e,user='1',group='10'){const t=e.create({user,group,text:'生成参考图'});t.refs=['ref'];return t;}
function done(e,t,j){j.state='done';t.versions.push({kind:j.kind,asset:'image'});t.status='ready';e.settleCredit(j,'spent');e.save();}

test('global test cap only turns off with explicit false; old configurations remain capped',()=>{
 assert.equal(config({}).budgetLimitEnabled,true);
 assert.equal(config({BUDGET_LIMIT_ENABLED:'true'}).budgetLimitEnabled,true);
 assert.equal(config({BUDGET_LIMIT_ENABLED:'false'}).budgetLimitEnabled,false);
 assert.equal(config({BUDGET_LIMIT_ENABLED:'typo'}).budgetLimitEnabled,true);
});
test('disabled test cap passes both exhausted counters, preserves weekly ledger across restart and deduplicates',()=>{
 const {e,restore}=setup({budgetLimitEnabled:false,budget:8,maxCalls:4});
 e.s.calls=4;e.s.reserved=8;
 for(let i=0;i<8;i++){const t=task(e,'1',i%2?'10':'20');const j=e.enqueue(t,'preview',{},'first');assert.equal(e.enqueue(t,'preview',{},'first').id,j.id);done(e,t,j);}
 assert.equal(e.s.calls,12);assert.equal(e.s.reserved,24);
 const r=restore(),t=task(r);
 assert.equal(r.view(t).budget.enabled,false);assert.equal(r.credits(t).remaining,0);
 assert.throws(()=>r.enqueue(t,'preview',{},'ninth'),/Credit 不足/);
 const owner=task(r,'99');const j=r.enqueue(owner,'preview',{},'owner');done(r,owner,j);
 assert.equal(r.credits(owner).exempt,true);assert.equal(Object.keys(r.s.credits).length,8);
 r.c.budgetLimitEnabled=true;
 assert.throws(()=>r.enqueue(owner,'refine',{},'enabled-again'),/测试额度/);
 assert.equal(r.s.calls,13);
});
test('disabled test cap still enforces paid switch and group permissions',()=>{
 const {e}=setup({budgetLimitEnabled:false,paid:false});e.s.calls=4;e.s.reserved=8;
 assert.throws(()=>e.enqueue(task(e),'preview',{},'off'),/尚未启用/);
 e.c.paid=true;
 assert.throws(()=>e.enqueue(task(e,'1','30'),'preview',{},'restricted'),/不在开放范围/);
 assert.equal(e.s.calls,4);assert.equal(Object.keys(e.s.credits).length,0);
});

test('Sunday 23:59 Beijing boundary is exact, including the first minute and server timezone independence',()=>{
 const before=creditPeriod(boundary-1),at=creditPeriod(boundary),after=creditPeriod(boundary+59999);
 assert.equal(before.resetsAt,boundary);assert.equal(at.start,boundary);assert.equal(after.key,at.key);
 assert.equal(at.resetsAt,boundary+7*86400000);
 assert.equal(creditPeriod(Date.parse('2026-10-12T00:00:00+08:00')).key,at.key);
});
test('public groups open all members while private pilot group and outside groups remain restricted',()=>{
 const {e}=setup();assert(e.allowed({user:'123',group:'10'}));assert(e.allowed({user:'123',group:'20'}));
 assert(!e.allowed({user:'123',group:'30'}));assert(e.allowed({user:'99',group:'30'}));assert(!e.allowed({user:'99',group:'40'}));
 assert(!e.event({group:'10',user:'123',text:'普通聊天',mentioned:false,messageId:'ordinary'}).consumed);
});
test('one QQ shares 8 Credits across groups; pending jobs reserve atomically and other QQs are independent',()=>{
 const {e}=setup();for(let i=0;i<8;i++){const t=task(e,'1',i%2?'10':'20');e.enqueue(t,'preview',{},'op');}
 const extra=task(e,'1','20');assert.equal(e.credits(extra).remaining,0);assert.equal(e.credits(extra).held,8);
 assert.throws(()=>e.enqueue(extra,'preview',{},'op'),/Credit 不足/);assert.equal(e.s.calls,8);
 const other=task(e,'2','20');assert.equal(e.credits(other).remaining,8);e.enqueue(other,'preview',{},'op');
});
test('first head costs 1 and every later AI kind costs 0.5, including regeneration; repeated operation is free',()=>{
 const {e}=setup(),t=task(e);const first=e.enqueue(t,'preview',{},'first');
 assert.equal(e.credits(t).remaining,7);assert.equal(e.enqueue(t,'preview',{},'first').id,first.id);assert.equal(e.s.calls,1);
 done(e,t,first);
 for(const [i,kind] of ['refine','local','turnaround','preview'].entries()){const j=e.enqueue(t,kind,{},'edit'+i);assert.equal(e.s.credits[j.credit].units,1);done(e,t,j);}
 assert.equal(e.credits(t).remaining,5);assert.equal(e.credits(t).spent,3);
 assert.equal(e.credits(task(e)).generationCost,1);
});
test('manual image before first AI cannot reduce first-generation charge; half Credit can only fund later editing',()=>{
 const {e}=setup({weeklyCredits:1.5}),t=task(e);t.versions.push({kind:'manual'});
 const j=e.enqueue(t,'refine',{},'first');assert.equal(e.s.credits[j.credit].units,2);done(e,t,j);
 assert.throws(()=>e.enqueue(task(e),'preview',{},'new-head'),/Credit 不足/);
 const edit=e.enqueue(t,'local',{},'edit');done(e,t,edit);assert.equal(e.credits(t).remaining,0);
});
test('owner exemption does not bypass FAL budget and does not mint balance for other users',()=>{
 const {e}=setup({budget:2,maxCalls:1}),t=task(e,'99');const j=e.enqueue(t,'preview',{},'first');done(e,t,j);
 assert(e.credits(t).exempt);assert.equal(e.credits(t).remaining,null);assert.equal(Object.keys(e.s.credits).length,0);
 assert.throws(()=>e.enqueue(t,'refine',{},'edit'),/测试额度/);assert.equal(e.credits(task(e,'1')).remaining,8);
});
test('weekly ledger survives restart; uncertain submission keeps reservation and never replays',()=>{
 const {e,restore}=setup(),t=task(e),j=e.enqueue(t,'preview',{},'first');j.state='submitting';e.save();
 const restored=restore(),rt=restored.s.tasks[t.id];assert.equal(restored.s.jobs[0].state,'uncertain');assert.equal(restored.credits(rt).remaining,7);
 assert.equal(restored.enqueue(rt,'preview',{},'first').id,j.id);assert.equal(restored.s.calls,1);
});
test('new period refreshes to 8; late completion or refund cannot alter new-week balance',()=>{
 const {e,setTime,restore}=setup(),t=task(e),j=e.enqueue(t,'preview',{},'first');setTime(boundary);
 assert.equal(e.credits(t).remaining,8);done(e,t,j);assert.equal(e.credits(t).remaining,8);
 const newJob=e.enqueue(t,'refine',{},'next');assert.equal(e.credits(t).remaining,7.5);
 e.settleCredit(j,'released');assert.equal(e.credits(t).remaining,7.5);
 e.settleCredit(newJob,'released');e.settleCredit(newJob,'released');e.save();assert.equal(restore().credits(t).remaining,8);
});
test('legacy state migrates without retroactive charges and existing heads use edit price',()=>{
 const {e,dir,restore}=setup(),t=task(e);t.versions.push({kind:'preview'});e.save();
 const s=JSON.parse(readFileSync(join(dir,'state.json')));delete s.credits;writeFileSync(join(dir,'state.json'),JSON.stringify(s));
 const r=restore();assert.equal(r.credits(r.s.tasks[t.id]).remaining,8);assert.equal(r.credits(r.s.tasks[t.id]).generationCost,0.5);
});
test('success charges once and sends remaining Credits; completed failure releases the user reservation',async()=>{
 const {e}=setup(),t=task(e),j=e.enqueue(t,'preview',{},'first');
 j.state='running';j.requestId='req';j.statusUrl='https://queue.fal.run/openai/status';j.responseUrl='https://queue.fal.run/openai/result';
 let requests=0;const fetcher=async()=>({ok:true,json:async()=>++requests===1?{status:'COMPLETED'}:{images:[{url:'https://v3.fal.media/example.png'}]}});
 const w=new Worker(e,{put:async()=>'result'},'fake',fetcher,async()=>Buffer.from('fake'));
 await w.tick();await w.tick();assert.equal(j.state,'done');assert.equal(e.credits(t).spent,1);assert.equal(e.credits(t).held,0);
 assert.match(e.s.outbox.at(-1).text,/本次消耗 1 Credit/);assert.match(e.s.outbox.at(-1).text,/剩余 7\/8 Credit/);
 const edit=e.enqueue(t,'refine',{},'edit');edit.state='running';edit.requestId='req2';edit.statusUrl=j.statusUrl;
 const bad=new Worker(e,{},'fake',async()=>({ok:true,json:async()=>({status:'COMPLETED',error:'rejected'})}));await bad.tick();
 assert.equal(edit.state,'failed');assert.equal(e.credits(t).remaining,7);assert.match(e.s.outbox.at(-1).text,/预留已释放/);
});
test('input failure releases Credits without a FAL request; budget-blocked enqueue never reserves Credits',async()=>{
 const {e}=setup(),t=task(e),j=e.enqueue(t,'preview',{},'first');let requests=0;
 const w=new Worker(e,{data:()=>{throw new Error('missing')}},'fake',async()=>{requests++;});await w.tick();
 assert.equal(requests,0);assert.equal(j.state,'failed');assert.equal(e.credits(t).remaining,8);
 const locked=setup({maxCalls:1}),lt=task(locked.e);locked.e.s.calls=1;
 assert.throws(()=>locked.e.enqueue(lt,'preview',{},'blocked'),/测试额度/);assert.equal(Object.keys(locked.e.s.credits).length,0);
});
