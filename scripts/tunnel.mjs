// SPDX-License-Identifier: GPL-3.0-or-later
// Optional temporary HTTPS access. Stable domain + reverse proxy is preferred.
import http from 'node:http';import {spawn} from 'node:child_process';import {writeFileSync,mkdirSync,renameSync} from 'node:fs';import {resolve,join} from 'node:path';
const data=resolve(process.env.DATA_DIR||'./data');mkdirSync(data,{recursive:true,mode:0o700});
const target=Number(process.env.PORT||18940),edge=Number(process.env.EDGE_PORT||18941);
const proxy=http.createServer((req,res)=>{if(req.url.split('?')[0].startsWith('/internal')){res.writeHead(404);res.end();return;}const forward=http.request({hostname:'127.0.0.1',port:target,path:req.url,method:req.method,headers:req.headers},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});forward.on('error',()=>{res.writeHead(502);res.end('Editor unavailable');});req.pipe(forward);});
proxy.listen(edge,'127.0.0.1',()=>{
 const child=spawn(process.env.CLOUDFLARED_BIN||'cloudflared',['tunnel','--url',`http://127.0.0.1:${edge}`,'--no-autoupdate','--protocol','http2'],{stdio:['ignore','pipe','pipe']});let tail='';
 function output(b){const s=b.toString();process.stdout.write(s);tail=(tail+s).slice(-16000);const m=tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(m){writeFileSync(join(data,'public-url.txt.tmp'),m[0],{mode:0o600});renameSync(join(data,'public-url.txt.tmp'),join(data,'public-url.txt'));}}
 child.stdout.on('data',output);child.stderr.on('data',output);child.on('error',err=>{console.error(err.message);process.exit(1);});child.on('exit',code=>process.exit(code||1));process.on('SIGTERM',()=>{child.kill('SIGTERM');proxy.close();});
});
