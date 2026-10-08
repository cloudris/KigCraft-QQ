// SPDX-License-Identifier: GPL-3.0-or-later
import sharp from 'sharp';
import {download} from './media.mjs';
const endpoint='openai/gpt-image-2.5/sunburst/edit';
export function queueUrl(raw){const u=new URL(raw);if(u.origin!=='https://queue.fal.run'||u.username||u.password||!u.pathname.startsWith('/openai/'))throw new Error('Unexpected queue URL');return u.href;}
export function buildInput(t,j,media){
  let prompt, ids;
  if(j.kind==='preview'){
    prompt='Create one front-facing anime kigurumi mask / head-shell product reference. Interpret the reference character as a wearable rigid, smooth, painted resin head with large illustrated eyes and styled wig. Preserve identifying hair, eye colors and accessories. Show head and short neck only, centered, unobstructed, neutral pale background, even product studio lighting. Not a real person portrait. No text, logos, measurements or invented branding. This is a conceptual reference, not an engineering drawing. User requirements: '+t.prompt;ids=t.refs;
  } else {
    ids=[j.payload.base,...(j.payload.references||[])];
    prompt=(j.kind==='turnaround'?'Create a four-view concept sheet of the same kigurumi head: front, left profile, back and right profile, consistent identity and proportions. Neutral background. No text or dimensions. This is not a manufacturing blueprint. ':j.kind==='local'?'Edit only the selected white area shown by the second image, preserve all other features and placement. The second image is a location guide, do not reproduce it. ':'Refine this kigurumi head. Preserve identity, framing and all unmentioned areas. An extra annotated image, if supplied, is an instruction guide, not part of the final image. Remove guide marks from the output. ')+j.payload.note;
    if(j.payload.mask)ids.splice(1,0,j.payload.mask);
  }
  return {prompt:prompt.slice(0,3500),image_urls:ids.slice(0,8).map(id=>media.data(id)),image_size:{width:1024,height:1024},quality:'low',num_images:1,output_format:'png',background:'opaque'};
}
export async function compositeLocal(base,generated,mask){
  const {width,height}=await sharp(base).metadata();
  const alpha=await sharp(mask).resize(width,height).ensureAlpha().extractChannel(3).raw().toBuffer();
  // removeAlpha executes late in sharp's pipeline, so finish that step first.
  const rgb=await sharp(generated).resize(width,height).removeAlpha().png().toBuffer();
  const layer=await sharp(rgb).joinChannel(alpha,{raw:{width,height,channels:1}}).png().toBuffer();
  return sharp(base).composite([{input:layer}]).png().toBuffer();
}
export class Worker {
  constructor(engine,media,key,fetcher=fetch,downloader=download){this.e=engine;this.m=media;this.key=key;this.fetch=fetcher;this.download=downloader;this.busy=false;}
  fail(j,t,text){j.state='failed';j.error=text;t.status='failed';this.e.settleCredit(j,'released');this.e.notify(t,`QQ ${t.user}：${text}\n`+this.e.creditText(t));this.e.save();}
  async api(url,body){const r=await this.fetch(queueUrl(url),{method:body?'POST':'GET',headers:{Authorization:'Key '+this.key,'Content-Type':'application/json','X-Fal-No-Retry':'1'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok){const err=new Error('FAL HTTP '+r.status);err.http=r.status;throw err;}return r.json();}
  async tick(){
    if(this.busy||!this.key)return;this.busy=true;
    const j=this.e.s.jobs.find(j=>['queued','running'].includes(j.state));
    try {
      if(!j)return;const t=this.e.s.tasks[j.task];
      if(j.state==='queued'){
        let input;
        try{input=buildInput(t,j,this.m);}catch{this.fail(j,t,'参考图片无法读取，未提交 FAL；本次 Credit 预留已释放。');return;}
        j.state='submitting';t.status='generating';this.e.save();
        let r;
        try {r=await this.api('https://queue.fal.run/'+endpoint,input);if(!r.request_id)throw new Error('Missing request ID');r.status_url=queueUrl(r.status_url);r.response_url=queueUrl(r.response_url);}catch(err){j.state='uncertain';j.error='未能确认 FAL 是否收到请求，已停止自动重试。Credit 保持预留，请管理员核对账单。';t.status='blocked';this.e.notify(t,`QQ ${t.user}：${j.error}\n`+this.e.creditText(t));this.e.save();return;}
        // Persist request identity before any polling or downloading.
        j.requestId=r.request_id;j.statusUrl=queueUrl(r.status_url);j.responseUrl=queueUrl(r.response_url);j.state='running';this.e.save();return;
      }
      const status=await this.api(j.statusUrl);
      if(status.status!=='COMPLETED')return;
      if(status.error){this.fail(j,t,'FAL 未完成生成；没有自动重新提交，本次 Credit 预留已释放。');return;}
      const result=await this.api(j.responseUrl);if(!result.images?.[0]?.url)throw new Error('No image returned');
      let bytes=await this.download(result.images[0].url,'fal');
      if(j.kind==='local')bytes=await compositeLocal(this.m.get(j.payload.base),bytes,this.m.get(j.payload.mask));
      const id=await this.m.put(bytes);
      t.revision++;t.current=id;t.versions.push({asset:id,revision:t.revision,kind:j.kind,created:Date.now()});t.status='ready';j.state='done';j.completed=Date.now();
      this.e.settleCredit(j,'spent');
      const credit=this.e.s.credits[j.credit],charge=credit?`本次消耗 ${credit.units/2} Credit。`:'';
      this.e.notify(t,`QQ ${t.user}：参考图已生成。${charge}打开机器人私信里的编辑页可标注、调整和保存回群。\n`+this.e.creditText(t),id);this.e.save();
    } catch(err){
      // Poll/download failures retry only retrieval of the existing request, never generation.
      if(j){j.error=j.requestId?'暂时无法读取生成结果，稍后继续读取同一请求。':'任务处理失败，请管理员检查。';this.e.save();}
      console.error('[worker]',err.message);
    } finally {this.busy=false;}
  }
}
