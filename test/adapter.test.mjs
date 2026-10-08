import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
test('OneBot bridge captures fast unmentioned uploads in order, ignores other users, then releases session',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kig-adapter-'));writeFileSync(join(dir,'package.json'),'{"type":"module"}');writeFileSync(join(dir,'.env'),'INTERNAL_TOKEN=test\nALLOWED_GROUPS=10,20\nALLOWED_USERS=1\nPUBLIC_GROUPS=20\n');
 writeFileSync(join(dir,'connection.js'),'export const sendGroupMsg=async()=>1,sendPrivateMsg=async()=>1,sendGroupImage=async()=>1,sendPrivateImage=async()=>1,getMsg=async()=>({message:[{type:"image",data:{url:"https://gchat.qpic.cn/quoted.png"}}]});');
 writeFileSync(join(dir,'config.js'),'export const getOneBotConfig=()=>({}),getWhitelistUserIds=c=>c.whitelist||[],getBlacklistUserIds=c=>c.blacklist||[];');
 writeFileSync(join(dir,'kigcraft-commands.mjs'),readFileSync(new URL('../server/commands.mjs',import.meta.url)));
 writeFileSync(join(dir,'kigcraft-access.mjs'),readFileSync(new URL('../server/access.mjs',import.meta.url)));
 writeFileSync(join(dir,'bridge.mjs'),readFileSync(new URL('../adapters/onebot-bridge.mjs',import.meta.url),'utf8').replace('__PROJECT_ROOT__',dir.replaceAll('\\','/')));
 const events=[];const prior=global.fetch;global.fetch=async(url,opts)=>({ok:true,json:async()=>{if(String(url).endsWith('/state'))return {sessions:{},outbox:[]};const e=JSON.parse(opts.body);events.push(e);return {consumed:true,sessionUntil:e.text==='发完了'?0:Date.now()+300000};}});
 try{const {handleKigInbound,segments}=await import(pathToFileURL(join(dir,'bridge.mjs')));const api={config:{},logger:{warn:()=>{}}};let n=0;const msg=(text,images=[],mention=false,user=1)=>({message_type:'group',group_id:10,user_id:user,self_id:99,message_id:++n,message:[...(mention?[{type:'at',data:{qq:'99'}}]:[]),{type:'text',data:{text}},...images.map(url=>({type:'image',data:{url}}))]});
 const start=handleKigInbound(api,msg('生成参考图',[],true));const image=handleKigInbound(api,msg('',['https://gchat.qpic.cn/one.png']));const finish=handleKigInbound(api,msg('发完了'));assert.deepEqual(await Promise.all([start,image,finish]),[true,true,true]);assert.deepEqual(events.map(e=>e.text),['生成参考图','','发完了']);assert.equal(events[1].images.length,1);assert.equal(await handleKigInbound(api,msg('普通聊天')),false);assert.equal(await handleKigInbound(api,msg('',['https://gchat.qpic.cn/other.png'],false,2)),false);
 assert.equal(segments({message:'[CQ:at,qq=99]生成参考图[CQ:image,url=https://gchat.qpic.cn/a?x=1&amp;y=2]'}).at(-1).data.url,'https://gchat.qpic.cn/a?x=1&y=2');
 const request='生成Kigurumi头壳参考图，角色《蔚蓝档案》橙光，表情为无表情，注意角色有精灵耳，无需生成帽子和光环';
 assert.equal(await handleKigInbound(api,msg(request)),false);
 assert.equal(await handleKigInbound(api,{...msg(request,[],true),group_id:11}),false);
 assert.equal(await handleKigInbound(api,msg(request,[],true,2)),false);
 assert.equal(await handleKigInbound({...api,config:{blacklist:[1]}},msg(request,[],true)),false);
 assert.equal(await handleKigInbound({...api,config:{whitelist:[2]}},msg(request,[],true)),false);
 assert.equal(await handleKigInbound(api,msg('生成参考图的方法是什么',[],true)),false);
 assert.equal(await handleKigInbound(api,msg(request,[],true)),true);
 assert.equal(events.at(-1).text,request);
 const publicStart={...msg(request,[],true,2),group_id:20};
 assert.equal(await handleKigInbound({...api,config:{blacklist:[2]}},publicStart),false);
 assert.equal(await handleKigInbound(api,publicStart),true);
 assert.equal(events.at(-1).user,'2');assert.equal(events.at(-1).group,'20');
 }finally{global.fetch=prior;}
});
