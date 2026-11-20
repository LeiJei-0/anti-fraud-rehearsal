/* Rebuild the three optional cutaways. Node 22+, Chromium, ffmpeg (or Python imageio_ffmpeg).
   CHROME_PATH and FFMPEG_PATH can override the two local executables. */
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';
const wait=n=>new Promise(r=>setTimeout(r,n)), target=fileURLToPath(new URL('../../assets/films/',import.meta.url)),caller=await fs.readFile(new URL('../../assets/art/caller.svg',import.meta.url),'utf8');
const ff=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'painted-inserts-'));const proc=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws,enc;
try{
 let port;for(let i=0;i<120&&!port;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]}catch{await wait(100)}}if(!port)throw Error('Cannot start Chromium');
 const tab=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.j(Error(m.error.message)):p.r(m.result)}};
 function send(method,params={}){return new Promise((r,j)=>{const k=++id;pending.set(k,{r,j,timer:setTimeout(()=>j(Error(method+' timed out')),15000)});ws.send(JSON.stringify({id:k,method,params}))})}
 const evaljs=async expression=>{const v=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(v.exceptionDetails)throw Error(v.exceptionDetails.exception?.description||'JS exception');return v.result.value};
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:new URL('./studio.html',import.meta.url).href});for(let i=0;i<100;i++){if(await evaljs('typeof window.paint==="function"'))break;await wait(60)}
 await evaljs('window.model='+JSON.stringify(caller));await fs.mkdir(target,{recursive:true});
 for(const n of [1,2,3].filter(n=>!process.argv[2]||process.argv.slice(2).includes(String(n)))){
   enc=spawn(ff,['-v','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate','24','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',path.join(target,n+'-insert.mp4')],{stdio:['pipe','ignore','inherit']});const ended=once(enc,'exit');
   for(let f=0;f<108;f++){await evaljs('paint('+n+','+(f/24)+',model)');const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:91});const frame=Buffer.from(shot.data,'base64');if(!enc.stdin.write(frame))await once(enc.stdin,'drain');if(process.env.FRAME_PROOFS && [0,44,92].includes(f))await fs.writeFile(path.join(process.env.FRAME_PROOFS,n+'-insert-'+f+'.jpg'),frame)}
   enc.stdin.end();const [code]=await ended;if(code!==0)throw Error('Encoder '+code);enc=null;console.log(n+'-insert.mp4 (960x540, 24fps, 4.5s)');
 }
}finally{if(enc)enc.kill();ws?.close();proc.kill()}
