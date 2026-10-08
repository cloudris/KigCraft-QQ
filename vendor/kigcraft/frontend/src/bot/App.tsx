// SPDX-License-Identifier: GPL-3.0-or-later
// QQ bridge shell, added 2026-10-05. The editor remains KigCraft upstream.
import {useEffect,useRef,useState} from 'react';
import {EditorWorkspace,type EditorWorkspaceHandle,type EditorRegeneratePayload,type EditorLocalGeneratePayload} from '../features/editor/EditorWorkspace';
import i18n from '../i18n';
import './bot.css';
void i18n.changeLanguage('zh-CN');
type Task={id:string;status:string;revision:number;current?:string;refs:string[];prompt:string;expires:number;paid:boolean;credits:{exempt:boolean;remaining:number|null;limit:number;held:number;resetsAt:number;generationCost:number};budget:{enabled?:boolean;reserved:number;limit:number;calls:number;maxCalls:number};job?:{state:string;error?:string};versions:Array<{asset:string;revision:number;kind:string}>};
const statusLabels:Record<string,string>={collecting:'正在收集参考图',queued:'等待生成',generating:'正在生成',ready:'可以开始精修',blocked:'等待处理',failed:'生成未完成',cancelled:'已取消',expired:'收图已超时'};
const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
export function App(){
  const [access]=useState(()=>{const raw=location.hash.slice(1);const [id,secret]=raw.split('.');if(id&&secret){sessionStorage.setItem('kig-access',raw);history.replaceState(null,'',location.pathname);}return (raw||sessionStorage.getItem('kig-access')||'').split('.');});
  const [id,secret]=access;const [task,setTask]=useState<Task>();const [image,setImage]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const editor=useRef<EditorWorkspaceHandle>(null);const current=useRef('');
  async function api(path='',body?:unknown){const r=await fetch(`/api/tasks/${id}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok){const e=await r.json();throw new Error(e.error);}return r;}
  async function refresh(){if(!id||!secret)return;const t:Task=await(await api()).json();setTask(t);const asset=t.current||t.refs[0];if(asset&&asset!==current.current){const r=await api('/assets/'+asset);const url=URL.createObjectURL(await r.blob());setImage(old=>{if(old)URL.revokeObjectURL(old);return url;});current.current=asset;}}
  useEffect(()=>{refresh().catch(e=>setError(e.message));const timer=setInterval(()=>refresh().catch(e=>setError(e.message)),5000);return()=>clearInterval(timer);},[]);
  const generating=busy||!!task?.job&&['queued','submitting','running','uncertain'].includes(task.job.state);
  const creditNotice=()=>task?.credits.exempt?'你的账号免每周 Credit 限额。':`本次成功后消耗 ${task?.credits.generationCost??1} Credit；本周可用 ${task?.credits.remaining??0} Credit。`;
  async function run(action:string,payload:Record<string,unknown>){if(!task||busy)return;setBusy(true);setError('');try{await api('/'+action,{...payload,operation:crypto.randomUUID(),revision:task.revision});setNotice(action==='save'?'已保存，机器人会把图片发回原群。':'已提交生成。可以关闭页面，稍后用原链接回来查看。');await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function regenerate(p:EditorRegeneratePayload,kind='refine'){
    if(!confirm('这次会调用 FAL 生成 1 张图片。'+creditNotice()+'继续吗？'))return;
    const references:string[]=[];if(p.annotatedImageBlob)references.push(await dataUrl(p.annotatedImageBlob));if(p.extraReference)references.push(await dataUrl(p.extraReference.file));
    await run('generate',{kind,image:await dataUrl(p.editedImageBlob),note:[p.annotationPrompt,p.promptNote,p.extraReference?.description].filter(Boolean).join('\n'),references});
  }
  async function local(p:EditorLocalGeneratePayload){
    if(!confirm('只重新生成涂选区域，会调用 FAL。'+creditNotice()+'继续吗？'))return;
    await run('generate',{kind:'local',image:await dataUrl(p.baseImageBlob),mask:await dataUrl(p.maskImageBlob),note:[p.editNote,...p.uploadedReferences.map(r=>r.description)].join('\n'),references:await Promise.all(p.uploadedReferences.slice(0,3).map(r=>dataUrl(r.file)))});
  }
  return <div className="bot-page"><header className="bot-header"><div><span className="eyebrow">KIGCRAFT × QQ · 独立试用版</span><h1>把想法，调整到位。</h1><p>参考图、标注与精修，在一个页面接着完成。</p></div><span className="status-pill">{task?statusLabels[task.status]||task.status:'从 QQ 开始'}</span></header>
    {!id?<main className="intro"><h2>先在群里 @ 机器人，说「生成参考图」</h2><ol><li>5 分钟内连续发送参考图，不必重复 @。</li><li>发送「发完了」，机器人开始生成。</li><li>打开机器人私信给你的专属链接，在这里精修。</li></ol><p>每次最多 8 张参考图。收图、标注、五官调整和液化不调用付费模型。</p></main>:<>
      <div className="task-strip"><div><strong>{task?.refs.length||0} 张参考图</strong><span> · 第 {task?.revision||0} 版</span></div><div>{task?.credits.exempt?'管理员：免每周 Credit 限额':`本周可用 ${task?.credits.remaining??'…'} / ${task?.credits.limit??8} Credit`}{!!task?.credits.held&&<span> · 已预留 {task.credits.held} Credit</span>}<small>两个群共用额度 · 首次生成 1 / 后续 AI 修改 0.5 · 手动保存免费</small>{task&&<small>下次重置：{new Date(task.credits.resetsAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}（北京时间，每周日 23:59）</small>}{task?.credits.exempt&&<small>{task.budget.enabled===false?<>FAL 累计调用 {task.budget.calls} 次 · 已取消测试总额度限制</>:<>FAL 调用 {task.budget.calls}/{task.budget.maxCalls} · 总预算预留 ${task.budget.reserved}/${task.budget.limit}，并非实际账单</>}</small>}</div></div>
      {error&&<div role="alert" className="banner error">{error} <button onClick={()=>location.reload()}>刷新页面</button></div>}
      {notice&&<div role="status" className="banner">{notice}</div>}
      {task?.job?.error&&<div className="banner">{task.job.error}</div>}
      {task&&!task.paid&&<div className="banner">当前为免费演示模式：可以调整图片和保存，AI 生成尚未启用。</div>}
      {image?<><div className="editor-heading"><h2>精修工作台</h2><span>保存图像会回传 QQ · AI 操作会先确认</span></div><EditorWorkspace key={current.current} ref={editor} candidateIndex={0} imageUrl={image} isRegenerating={generating} showRegenerateActions={Boolean(task?.paid)} regenerateLabel="按标注 AI 精修" secondaryRegenerateLabel="生成四视图" availableTools={task?.paid?['annotation','face','eyes','mouth','liquify','local-generate']:['annotation','face','eyes','mouth','liquify']} onRegenerate={p=>regenerate(p)} onSecondaryRegenerate={p=>regenerate(p,'turnaround')} onLocalGenerate={local} onSave={async p=>{await run('save',{image:await dataUrl(p.imageBlob),recipe:p.recipe});}}/></>:<div className="waiting"><h2>{task?.status==='collecting'?'等待你的参考图':'正在准备工作台'}</h2><p>回到 QQ 发送图片，再说「发完了」。生成完成后这里会自动显示。</p></div>}
      {task?.paid&&task.refs.length>0&&!task.current&&!generating&&<button className="primary" onClick={()=>{if(confirm('开始生成 1 张头壳参考图？'+creditNotice()))void run('generate',{kind:'preview'});}}>生成头壳参考图</button>}
    </>}
    <footer><p>概念参考图不能替代头壳建模或制作图纸。专属链接允许编辑，请勿转发。</p><a href="https://github.com/icyqwq/KigCraft" target="_blank" rel="noreferrer">编辑器源自 KigCraft</a><span> · GPL-3.0-or-later · </span><a href="/source.zip">下载本部署完整源码</a></footer></div>;
}
