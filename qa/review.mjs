// Desktop acceptance, Node 22+, Chrome/Chromium. No network or npm dependencies.
// node qa/review.mjs <evidence-directory>  (set CHROME_PATH if needed)
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.argv[2]||'desktop-review');
const startURL=(f)=>new URL(f,pathToFileURL(root).href).href;
const profiles=path.resolve(os.tmpdir());
const profile=await fs.mkdtemp(path.join(profiles,'rehearsal-review-'));
const candidates=[process.env.CHROME_PATH,...(process.platform==='win32'?[
  path.join(process.env.ProgramFiles||'C:/Program Files','Google/Chrome/Application/chrome.exe'),
  path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')
]:process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'])].filter(Boolean);
const chrome=(await Promise.all(candidates.map(f=>fs.access(f).then(()=>f).catch(()=>null)))).find(Boolean);
if(!chrome)throw Error('Set CHROME_PATH to an installed Chrome/Chromium executable.');
const child=spawn(chrome,['--headless=new','--disable-gpu','--mute-audio','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const exited=new Promise(resolve=>child.once('exit',resolve));
let sock,cmd,shot,current='launch',fail;
const checks=[],issues=[],clips={},screenSizes=[[1366,768],[1920,1080]];
const check=(label,value,detail=null)=>{if(!value)throw Error(label+(detail===null?'':': '+JSON.stringify(detail)));checks.push({step:current,check:label,...(detail===null?{}:{detail})});};
try{
 await fs.mkdir(out,{recursive:true});
 let port;for(let i=0;i<120&&!port;i++){if(child.exitCode!==null)throw Error('Chromium exited: '+child.exitCode);try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]}catch{await sleep(100)}}
 if(!port)throw Error('Chromium debugging port unavailable');
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const tab=targets.find(t=>t.type==='page');sock=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{sock.onopen=resolve;sock.onerror=reject});
 const pending=new Map();let seq=0;
 sock.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const [r,j,t]=pending.get(m.id);clearTimeout(t);pending.delete(m.id);m.error?j(Error(m.error.message)):r(m.result);}
 else if(m.method==='Runtime.exceptionThrown'){issues.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)}
 else if(m.method==='Network.requestWillBeSent'&&/^https?:/i.test(m.params.request.url))issues.push(m.params.request.url);
 else if(m.method==='Network.loadingFailed'&&!m.params.canceled&&m.params.errorText!=='net::ERR_ABORTED')issues.push(m.params.type+': '+m.params.errorText);};
 cmd=(method,params={})=>new Promise((r,j)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);j(Error('CDP timeout: '+method))},10000);pending.set(id,[r,j,t]);sock.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const x=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(x.exceptionDetails)throw Error(x.exceptionDetails.exception?.description||x.exceptionDetails.text);return x.result.value};
 const wait=async(expr)=>{let t=Date.now();while(Date.now()-t<7500){if(await ev(expr))return;await sleep(45)}throw Error('Timed out waiting for '+expr)};
 const q=s=>'document.querySelector('+JSON.stringify(s)+')';
 const visible=s=>'!!'+q(s)+'?.checkVisibility()';
 const go=async f=>{let u=startURL(f);await cmd('Page.navigate',{url:u});await wait('location.href==='+JSON.stringify(u)+'&&document.readyState==="complete"')};
 const click=async s=>{await wait(visible(s));const xy=await ev('(()=>{const e='+q(s)+';e.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});let r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,t=document.elementFromPoint(x,y); return {x,y,hit:!!t&&e.contains(t),block:t?.outerHTML.slice(0,110)}})()');if(!xy.hit)throw Error('Pointer obstructed: '+s+' '+JSON.stringify(xy));
 for(const type of ['mousePressed','mouseReleased'])await cmd('Input.dispatchMouseEvent',{type,x:xy.x,y:xy.y,button:'left',clickCount:1});};
 shot=async f=>{const r=await cmd('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,f+'.png'),Buffer.from(r.data,'base64'))};
 const action=async(n,key)=>{if(key==='pay')await sleep(400);await click('[data-'+(n===1?'act':'do')+'="'+key+'"]');};
 const roleNames=['','青年人','中年人','老年人'];
 const V='video[data-scene-film]';
 const episode=n=>n===1?'demo-chapter-1.html?play=1':'chapter.html?c='+n+'&play=1';
 const media=async(n,phase)=>{const e=q(V);
   await wait(visible(V)+'&&'+e+'.readyState>=2&&'+e+'.videoWidth>0');
   const meta=await ev('(()=>{let v='+e+';return {file:new URL(v.currentSrc).pathname.split("/").pop(),width:v.videoWidth,height:v.videoHeight,seconds:v.duration,time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames}})()');
   check('chapter-specific decoded '+phase+' film',meta.file===n+'-'+phase+'.mp4'&&meta.seconds>=1,meta);clips[meta.file]=[meta.width,meta.height,meta.seconds];return meta};
 const enter=async n=>{await go(episode(n));await wait(visible(V));};
 const routes=[
 [1,'放下兼职通知',['end'],'安全离开'],
 [1,'听老师回复与搜索记录',['go:A05','go:A06','go:A08','go:A09','sub:jobs','checkTaskList','sub:hub','sub:contacts','callTeacher','answer','sub:hub','end'],'及时核实'],
 [1,'仅拨号不能完成核实',['go:A05','go:A06','go:A08','go:A09','sub:contacts','callTeacher','hangup','sub:hub','end'],'安全离开'],
 [1,'从家人核实返回招聘主线',['go:A05','go:A06','go:A08','go:A09','back','go:A10','end'],'有惊无险'],
 [1,'看过辅导员视频后模拟付款、再只读回看',['go:A05','go:A07','videoSkip','back','go:A06','go:A10','confirmPay','reviewPay','lossModal','toResult'],'出现模拟损失'],
 [2,'挂断',['hang','end'],'安全离开'],
 [3,'暂不打开群聊',['end'],'安全离开'],
 ...[[2,['go:05','go:06','go:07']],[2,['go:06','go:08']],[3,['go:05','go:06']],[3,['go:05','go:08']]].map(([n,r])=>[n,'两项独立查询 '+r.at(-1),[...r,'help','verify','check:0','check:1','end'],'及时核实']),
 ...[[2,['go:06','go:07'],'charge'],[2,['go:06','go:07'],'ship'],[2,['go:06','go:08'],'deposit'],[3,['go:05','go:06','go:07'],'bundle'],[3,['go:05','go:08'],'service']].map(([n,r,tx])=>[n,'模拟交付 '+tx,[...r,'tx:'+tx,'pay'],'出现模拟损失']),
 [2,'取消充值',['go:06','go:07','tx:charge','end'],'有惊无险'],
 [3,'交费前找人再商量',['go:05','go:08','tx:service','help','backHelp','end'],'有惊无险'],
 [2,'资料不足时暂缓',['go:05','verify','end'],'安全离开']
 ];
 await cmd('Network.enable');await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Page.bringToFront');await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await cmd('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 for(const [w,h] of screenSizes){
   await cmd('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
   for(let n=1;n<=3;n++){
    current=w+' role '+roleNames[n];await go('index.html');await wait(visible('#start'));
    check('no dorm teaser on cover',!(await ev('document.body.innerText.includes("宿舍里来了一条新消息")')));
    if(n===1)await shot('cover-'+w);await click('#start');await wait(visible('#roles'));
    const a='[data-role="'+n+'"]';check('identity '+roleNames[n],(await ev(q(a)+'.innerText')).includes(roleNames[n]));
    if(n===1)await shot('roles-'+w);
    await click(a);await media(n,'orient');await wait('!'+q(V)+'.paused&&'+q(V)+'.currentTime>0.1');
    const v=q(V); const tick=await ev(v+'.getVideoPlaybackQuality().totalVideoFrames');await wait(v+'.getVideoPlaybackQuality().totalVideoFrames>'+tick+'+2');check('film advances decoded frames',true);
    await click('[data-film-pause]');await wait(v+'.paused');const t=await ev(v+'.currentTime');await sleep(250);check('pause freezes playhead',Math.abs((await ev(v+'.currentTime'))-t)<.025);
    await click('[data-film-pause]');await wait('!'+v+'.paused');
    const geom=await ev('(()=>{const v='+v+'.getBoundingClientRect(),p=document.querySelector(".phone").getBoundingClientRect();return {vl:v.left,vr:v.right,vw:v.width,vh:v.height,pl:p.left,pr:p.right,pw:p.width,ph:p.height,sw:document.documentElement.scrollWidth,cw:innerWidth}})()');
    check('film left, portrait handset on right, no horizontal scrolling',geom.vr<=geom.pl+2&&geom.vw>geom.pw&&geom.ph>geom.pw&&geom.pr<=w+1&&geom.sw<=w+1,geom);
    check('no large/cast size switch',!(await ev('[...document.querySelectorAll("button")].some(x=>x.checkVisibility()&&/^(大字|投屏|标准字|投屏字)$/.test(x.textContent.trim()))')));
    check('no visible shot ID on stage',!(await ev('/[ABC]0[0-9]/.test(document.body.innerText)')));
    await shot('role-'+n+'-'+w);
    if(n===1){await click('#btn-exit')}else{await click('#exit');await click('#exitbox [value="stay"]');check('cancel exit stays in chapter',await ev(visible(V)));await click('#exit');await click('#exitbox [value="leave"]')};await wait(visible('#start'));check('exit returns home',true);
   }
   for(const [n,label,sequence,result] of routes){
    current=w+' chapter '+n+' '+label;await enter(n);
    for(const key of sequence){await action(n,key);
     if((n===1&&key==='go:A09')||(n!==1&&key==='verify'))await media(n,'evidence');
     if((n===1&&key==='go:A07')||(n!==1&&key==='go:08'))await media(n,'insert');if(key==='go:A10'||key.startsWith('tx:'))await media(n,'decision');}
    await wait(visible('#result-title'));const shown=await ev(q(n===1?'.pill':'#result-title')+'.textContent.trim()');
    check('ending '+result,shown===result,shown);
    const book='[data-ending="open"]', back='[data-ending="back"]';
    check('film result first; journal is opt-in',await ev(visible(book)+'&&!('+visible('#journal-title')+')'));
    check('cause is displayed immediately',await ev(q('#result-why')+'.textContent.trim().length>4'));
    if(result==='出现模拟损失')check('no real charge reassurance on cover',await ev('/没有.{0,5}真实.{0,4}扣款|不会.{0,5}真实.{0,4}扣款|未发生真实/.test(document.body.innerText)'));
    if(w===1366 && ((n===1&&label==='从家人核实返回招聘主线')||(n===2&&label==='挂断')||(n===3&&label==='暂不打开群聊')))await shot('ending-'+n);
    await click(book);await wait(visible('#journal-title'));
    const entries=await ev('[...document.querySelectorAll(".journal-steps li")].map(x=>x.innerText.trim())');
    check('read-only journal has recorded actions',entries.length>0 && await ev('document.activeElement.id==="journal-title" && !document.querySelector(".journal-steps button,.journal-steps input")'));
    if(n===2&&label==='挂断')check('hanging up never fabricates an accepted call or transaction',entries.some(x=>x.includes('挂断'))&&!entries.some(x=>/充值|接听|押金/.test(x)));
    if(n===3&&label==='暂不打开群聊')check('unopened invitation does not fabricate lecture or payment',!entries.some(x=>/服务费|已付款|支付套餐/.test(x)));
    if(w===1366 && n===1&&label==='从家人核实返回招聘主线')await shot('journal-1');
    await click(back);await wait(visible(book));check('back preserves original result',await ev(q('#result-title')+'.textContent.includes('+JSON.stringify(result)+')'));
    if(result==='出现模拟损失'&&n>1){await action(n,'aftercare');check('loss supports help',await ev(visible('#aftercare')))}
    if(label==='放下兼职通知'||label==='挂断'||label==='暂不打开群聊'){
     await click('a[href="pact.html"]');await wait(visible('#print'));check('card opens from chapter',await ev('document.querySelectorAll("input").length===2'));await click('.actions a');await wait(visible('#start'));check('card return',true);}
   }
 }
 current='resource audit';check('all twelve local narrative films decoded',Object.keys(clips).length===12,Object.keys(clips));
 check('no JS exceptions, external requests or missing resources',issues.length===0,issues);
} catch(e){fail=e.message;console.error(current,fail);try{await shot?.('failure')}catch{}process.exitCode=1}
finally{
 await fs.writeFile(path.join(out,'review.json'),JSON.stringify({pass:!fail,failedStep:fail?current:null,error:fail||null,widths:screenSizes,checks,clips,issues},null,2));
 if(sock?.readyState===1){await cmd?.('Browser.close').catch(()=>{});sock.close();}
 const done=await Promise.race([exited.then(()=>true),sleep(1500).then(()=>false)]);if(!done){child.kill();await Promise.race([exited,sleep(1500)])}
 // Only remove the uniquely created disposable browser profile, never an existing Chrome profile.
 if(path.dirname(profile)===profiles&&path.basename(profile).startsWith('rehearsal-review-'))await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
 console.log((fail?'FAILED':'PASSED')+': '+checks.length+' checks; '+Object.keys(clips).length+' decoded clips. Report: '+path.join(out,'review.json'));
}
