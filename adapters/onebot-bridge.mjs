// SPDX-License-Identifier: GPL-3.0-or-later
// Installed next to the existing OneBot connection.js; no second QQ connection.
import {readFileSync} from 'node:fs';
import {sendGroupMsg,sendPrivateMsg,sendGroupImage,sendPrivateImage,getMsg} from './connection.js';
import {getOneBotConfig,getWhitelistUserIds,getBlacklistUserIds} from './config.js';
import {isStart} from './kigcraft-commands.mjs';
import {allowed} from './kigcraft-access.mjs';
const settings=Object.fromEntries(readFileSync('__PROJECT_ROOT__/.env','utf8').split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const n=x.indexOf('=');return[x.slice(0,n),x.slice(n+1).replace(/^['"]|['"]$/g,'')];}));
const origin='http://127.0.0.1:'+(settings.PORT||'18940');
const ids=v=>(v||'').split(',').map(x=>x.trim()).filter(Boolean);
const access={groups:ids(settings.ALLOWED_GROUPS),users:ids(settings.ALLOWED_USERS),publicGroups:ids(settings.PUBLIC_GROUPS)};
const sessions=new Map(),chains=new Map();let timer,apiRef,pumping=false;
async function request(path,body){const r=await fetch(origin+'/internal/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+settings.INTERNAL_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(190000)});if(!r.ok)throw new Error('KigCraft service '+r.status);return r;}
export function segments(msg){
  if(Array.isArray(msg.message))return msg.message;
  const raw=String(msg.message||msg.raw_message||'');const result=[];let cursor=0;
  for(const m of raw.matchAll(/\[CQ:(\w+)((?:,[^\]]*)?)\]/g)){if(m.index>cursor)result.push({type:'text',data:{text:raw.slice(cursor,m.index)}});const data={};for(const p of m[2].slice(1).split(',')){const n=p.indexOf('=');if(n>0)data[p.slice(0,n)]=p.slice(n+1).replace(/&#44;/g,',').replace(/&#91;/g,'[').replace(/&#93;/g,']').replace(/&amp;/g,'&');}result.push({type:m[1],data});cursor=m.index+m[0].length;}if(cursor<raw.length)result.push({type:'text',data:{text:raw.slice(cursor)}});return result;
}
export function startKigBridge(api){apiRef=api;if(timer)return;timer=setInterval(()=>void pump(),3000);timer.unref();void pump();}
async function pump(){
  if(pumping||!apiRef)return;pumping=true;
  try{
    const state=await(await request('state')).json();
    for(const [k,v] of Object.entries(state.sessions))sessions.set(k,v.until);
    for(const [k,until] of sessions)if(until<Date.now())sessions.delete(k);
    for(const item of state.outbox){
      const getConfig=()=>getOneBotConfig(apiRef);let result;
      if(item.asset){const data=Buffer.from(await(await request('asset/'+item.asset)).arrayBuffer()).toString('base64');const msg=JSON.stringify([{type:'text',data:{text:item.text}},{type:'image',data:{file:'base64://'+data}}]);result=item.group?await sendGroupImage(Number(item.group),msg,apiRef.logger,getConfig):await sendPrivateImage(Number(item.user),msg,apiRef.logger,getConfig);}
      else result=item.group?await sendGroupMsg(Number(item.group),item.text,getConfig):await sendPrivateMsg(Number(item.user),item.text,getConfig);
      if(result===undefined||result===null)break;
      await request('ack',{id:item.id});
    }
  }catch{ /* Keep durable outbox pending; do not log private editor links. */ }finally{pumping=false;}
}
export async function handleKigInbound(api,msg){
  startKigBridge(api);
  if(msg.message_type!=='group'||String(msg.user_id)===String(msg.self_id)||!allowed(access,{group:msg.group_id,user:msg.user_id}))return false;
  const whitelist=getWhitelistUserIds(api.config),blacklist=getBlacklistUserIds(api.config);
  if(whitelist.length&&!whitelist.includes(Number(msg.user_id))||blacklist.includes(Number(msg.user_id)))return false;
  const seg=segments(msg),text=seg.filter(s=>s.type==='text').map(s=>s.data.text||'').join('').trim();
  const mentioned=seg.some(s=>s.type==='at'&&String(s.data.qq)===String(msg.self_id));
  const start=mentioned&&isStart(text);
  const key=`${msg.group_id}:${msg.user_id}`;if(!start&&!(sessions.get(key)>Date.now()))return false;
  // Reserve locally immediately so fast mobile uploads cannot overtake start.
  if(start&&!(sessions.get(key)>Date.now()))sessions.set(key,Date.now()+300000);
  const previous=chains.get(key)||Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
    let images=seg.filter(s=>s.type==='image').map(s=>s.data.url||(/^https:/.test(s.data.file||'')?s.data.file:'')).filter(Boolean);
    const reply=seg.find(s=>s.type==='reply');
    if(reply&&!images.length){try{const quoted=await getMsg(reply.data.id);images=segments(quoted?.data||quoted||{}).filter(s=>s.type==='image').map(s=>s.data.url||'').filter(Boolean);}catch{}}
    try{const r=await(await request('event',{group:String(msg.group_id),user:String(msg.user_id),messageId:String(msg.message_id),mentioned,text,images})).json();if(r.sessionUntil)sessions.set(key,r.sessionUntil);else sessions.delete(key);void pump();}
    catch{api.logger?.warn?.('[kigcraft] task service unavailable; message was not sent to AI');}
  });chains.set(key,next);await next;if(chains.get(key)===next)chains.delete(key);return true;
}
