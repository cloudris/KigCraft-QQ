import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import sharp from 'sharp';
import {createService,config} from '../server/index.mjs';import {token} from '../server/core.mjs';
test('HTTP task auth, optimistic revisions, free saves and idempotence',async t=>{
 const c=config({INTERNAL_TOKEN:token(),DATA_DIR:mkdtempSync(join(tmpdir(),'kig-http-')),ALLOWED_GROUPS:'10'});const svc=createService(c);await new Promise(r=>svc.server.listen(0,'127.0.0.1',r));t.after(()=>svc.server.close());const base='http://127.0.0.1:'+svc.server.address().port;c.publicUrl=base;
 const task=svc.engine.create({group:'10',user:'1',text:''});const secret=svc.engine.s.outbox[1].text.split('.').at(-1);svc.engine.save();const url=base+'/api/tasks/'+task.id;
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(base+'/internal/state')).status,401);
 const png=await sharp({create:{width:100,height:100,channels:3,background:'green'}}).png().toBuffer();const headers={Authorization:'Bearer '+secret,'Content-Type':'application/json'};
 const payload={image:'data:image/png;base64,'+png.toString('base64'),revision:0,operation:'save-operation-1'};
 assert.equal((await fetch(url+'/save',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:JSON.stringify(payload)})).status,403);
 assert.equal((await fetch(url+'/save',{method:'POST',headers,body:JSON.stringify(payload)})).status,200);
 assert.equal((await fetch(url+'/save',{method:'POST',headers,body:JSON.stringify(payload)})).status,200);assert.equal(task.revision,1);assert.equal(svc.engine.s.calls,0);
 assert.equal(svc.engine.credits(task).remaining,8);assert.equal(Object.keys(svc.engine.s.credits).length,0);assert.match(svc.engine.s.outbox.at(-1).text,/手动保存不扣 Credit/);
 assert.equal((await fetch(url+'/save',{method:'POST',headers,body:JSON.stringify({...payload,operation:'stale-operation'})})).status,409);
 assert.equal((await fetch(url+'/assets/'+task.current,{headers})).status,200);assert.equal((await fetch(url+'/assets/'+'a'.repeat(64)+'.png',{headers})).status,403);
 const response=await fetch(url+'/generate',{method:'POST',headers,body:JSON.stringify({kind:'refine',revision:1,operation:'generate-1'})});assert.equal(response.status,403);assert.equal(svc.engine.s.calls,0);
});

test('concurrent API requests enforce shared QQ Credits server-side; caller cannot claim exemption',async t=>{
 const c=config({INTERNAL_TOKEN:token(),DATA_DIR:mkdtempSync(join(tmpdir(),'kig-http-credit-')),ALLOWED_GROUPS:'10,20',ALLOWED_USERS:'99',PUBLIC_GROUPS:'10,20',CREDIT_EXEMPT_USERS:'99',WEEKLY_CREDITS:'1',PAID_ENABLED:'true',FAL_KEY:'test-only',BUDGET_USD:'100',MAX_PAID_CALLS:'50'});
 const svc=createService(c);await new Promise(r=>svc.server.listen(0,'127.0.0.1',r));t.after(()=>svc.server.close());const base='http://127.0.0.1:'+svc.server.address().port;c.publicUrl=base;
 const requests=['10','20'].map(group=>{const task=svc.engine.create({group,user:'1',text:'生成参考图'});task.refs=['fake'];const secret=svc.engine.s.outbox.at(-1).text.split('.').at(-1);return {task,url:base+'/api/tasks/'+task.id,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},payload:{kind:'preview',revision:0,operation:'credit-operation',user:'99',exempt:true}};});
 const submit=r=>fetch(r.url+'/generate',{method:'POST',headers:r.headers,body:JSON.stringify(r.payload)});
 const responses=await Promise.all(requests.map(submit));assert.deepEqual(responses.map(r=>r.status).sort(),[200,403]);assert.equal(svc.engine.s.calls,1);
 const winner=requests[responses.findIndex(r=>r.status===200)];assert.equal((await submit(winner)).status,200);assert.equal(svc.engine.s.calls,1);
 const view=await(await fetch(winner.url,{headers:winner.headers})).json();assert.equal(view.credits.exempt,false);assert.equal(view.credits.remaining,0);assert.equal(view.credits.held,1);
 // An old editor link cannot keep spending after access is removed.
 c.publicGroups=[];assert.equal((await fetch(winner.url,{headers:winner.headers})).status,403);
});
