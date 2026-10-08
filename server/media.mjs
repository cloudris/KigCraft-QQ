// SPDX-License-Identifier: GPL-3.0-or-later
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import sharp from 'sharp';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {digest,Fault} from './core.mjs';
const maxBytes=16*1024*1024;
export function approvedUrl(raw,kind='qq') {
  const u=new URL(raw); const allowed=kind==='fal'?['fal.media']:['qpic.cn','qq.com','qq.com.cn','gtimg.cn'];
  // Older OneBot events carry HTTP qpic links; request the same image via TLS.
  if(kind==='qq'&&u.protocol==='http:'&&(u.hostname==='qpic.cn'||u.hostname.endsWith('.qpic.cn'))&&!u.port)u.protocol='https:';
  if(u.protocol!=='https:'||u.port||u.username||u.password||!allowed.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw new Fault('图片地址不受支持');
  return u;
}
export function publicIP(ip) {if(isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));}
export async function download(raw,kind='qq',depth=0) {
  if(depth>3)throw new Fault('图片跳转过多'); const u=approvedUrl(raw,kind);
  const records=await lookup(u.hostname,{all:true,family:4}); const ip=records.find(r=>publicIP(r.address))?.address;
  if(!ip)throw new Fault('图片地址不可用');
  return new Promise((resolve,reject)=>{
    const req=https.get(u,{lookup:(_h,o,cb)=>o.all?cb(null,[{address:ip,family:4}]):cb(null,ip,4),timeout:20000},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();download(new URL(res.headers.location,u).href,kind,depth+1).then(resolve,reject);return;}
      if(res.statusCode!==200){res.resume();reject(new Fault('图片下载失败'));return;}
      let size=0;const chunks=[];
      res.on('data',b=>{size+=b.length;if(size>maxBytes){res.destroy();reject(new Fault('图片过大（最多 16 MB）'));}else chunks.push(b);});res.on('error',reject);res.on('end',()=>resolve(Buffer.concat(chunks)));
    });req.on('timeout',()=>req.destroy(new Error('图片下载超时')));req.on('error',reject);
  });
}
export class Media {
  constructor(dir){this.dir=join(dir,'assets');mkdirSync(this.dir,{recursive:true,mode:0o700});}
  async put(bytes,{mask=false}={}){
    if(bytes.length>maxBytes)throw new Fault('图片过大');
    const img=sharp(bytes,{limitInputPixels:24000000,animated:false});const meta=await img.metadata();
    if(!['png','jpeg','webp'].includes(meta.format))throw new Fault('仅支持 PNG、JPEG、WebP');
    const b=await img.rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();
    const id=digest(b)+'.png';writeFileSync(join(this.dir,id),b,{mode:0o600});return id;
  }
  get(id){if(!/^[a-f0-9]{64}\.png$/.test(id))throw new Fault('无效图片',404);return readFileSync(join(this.dir,id));}
  data(id){return 'data:image/png;base64,'+this.get(id).toString('base64');}
}
