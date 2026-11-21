(() => {
  "use strict";
  const B=new URLSearchParams(location.search).get("c")!=="3", W=B?"B":"C", n=B?2:3;
  const title=B?"一通晚间来电":"群里的一场讲座", place=B?"家中客厅，晚饭后":"家中客厅，周日上午";
  const asset="assets/art/ch"+n+".webp", clock=B?"19:42":"09:16";
  const $=id=>document.getElementById(id), app=$("app"), box=$("exitbox");
  document.title=title+"｜防骗预演"; document.body.style.setProperty("--anchor","68% 73%");
  let view="ready",cur="04",origin="04",verifyOrigin="04",source="main",amountKey="",entered=false,paid=false,helped=false,readSize=0,muted=false,reviewed=new Set(),seen=new Set(),actions=[],previewed=new Set(),checks=new Set(),hanged=false;
  let lastAct=0;
  let ctx=null,ring=0,tones=new Set();
  function audio(){if(muted)return;try{ctx ||= new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==="suspended")ctx.resume().catch(()=>{});}catch{}}
  function note(freq,duration=.14,delay=0){if(muted||!ctx||ctx.state!=="running")return;const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+delay;osc.type="sine";osc.frequency.value=freq;gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(.045,t+.025);gain.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(gain);gain.connect(ctx.destination);tones.add(osc);osc.onended=()=>{tones.delete(osc);osc.disconnect();gain.disconnect()};osc.start(t);osc.stop(t+duration+.03)}
  function silence(){clearInterval(ring);ring=0;for(const osc of tones){try{osc.stop()}catch{}}tones.clear()}
  function toneRing(){note(440,.20);note(554,.25,.25)}
  function incoming(){if(muted||ring||box.open||document.hidden||app.querySelector(".is-asleep"))return;toneRing();ring=setInterval(toneRing,2100)}
  function log(s){actions.push(s)}
  function full(){try{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.()?.catch(()=>{});else document.exitFullscreen?.()?.catch(()=>{})}catch{}}
  function focusStep(id){const el=$(id);if(!el)return;el.focus({preventScroll:true});if(innerWidth<=650){scrollTo(0,0)}else if(view==="result"){scrollTo(0,0)}}
  const a=(label,k)=>({label,k}), goA=(label,s)=>a(label,"go:"+s), end=(txt)=>a(txt,"end"), ask=a("找人商量","help"), bbl=(s,t)=>'<div class="bubble"><span class="label">'+s+'</span><p>'+t+'</p></div>';
  const receipt=(rows)=>'<dl class="receipt">'+rows.map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join("")+'</dl>';
  const home=B?"阿岚":"邻里生活群", vName=B?{main:"平台和收款方",side:"回收预约"}:{main:"商品宣传",side:"鉴宝报价"};
  const transactions={
    charge:["充值","向页面收款户充值","1,000 元","页面收款户"],ship:["财物交付","向指定收件方交付相机","旧相机 1 台","页面所示收件方"],
    deposit:["回收预约","支付预约押金","200 元","预约服务商"],bundle:["健康套餐","支付保健食品套餐费用","680 元","讲座销售方"],service:["鉴宝服务","支付鉴宝服务费","180 元","直播服务方"]
  };
  function ill(type){
    const art={
      camera:'<path d="M95 49h27l6-10h32l8 10h24v44H95z" fill="#354442"/><circle cx="148" cy="69" r="21" fill="#b3b4a2"/><circle cx="148" cy="69" r="15" fill="#5c726f"/><circle cx="148" cy="69" r="8" fill="#2a393a"/><path d="M100 58h22m-19-13h11" stroke="#d7ccb1" stroke-width="4"/>',
      pack:'<path d="m112 29 55 4 14 8-55-4z" fill="#e7debf"/><path d="m112 29 14 8v58l-14-10z" fill="#a8af95"/><path d="m126 37 55 4v56l-55-2z" fill="#eee6ce" stroke="#7b8b78"/><path d="m126 62 55 3v16l-55-3z" fill="#718771"/><path d="m137 47 29 2m-29 5 19 1" stroke="#909284" stroke-width="2"/>',
      money:'<g transform="rotate(-9 145 62)"><rect x="88" y="41" width="116" height="51" fill="#aab49d" stroke="#606f60"/><rect x="94" y="46" width="104" height="41" fill="none" stroke="#778c78"/><ellipse cx="146" cy="66" rx="15" ry="14" fill="none" stroke="#718371" stroke-width="2"/><path d="M98 54h20m56 24h19m-18-23h16M98 78h17" stroke="#849582" stroke-width="3"/></g>',
      book:'<path d="m92 42 70-5 27 40-69 10z" fill="#ede5d5" stroke="#7f7b69"/><path d="m101 48 49-4m-43 12 51-5m-43 13 47-4" stroke="#a6a28d" stroke-width="2"/><path d="m170 34 4 2-35 40-7 5 2-8z" fill="#965341"/>'
    };
    return '<div class="still" aria-hidden="true"><svg viewBox="0 0 300 112"><path d="M0 83q124-11 300-4v33H0" fill="#d2cbb8"/><ellipse cx="150" cy="91" rx="63" ry="5" fill="#beb7a5"/><g class="pulse">'+art[type]+'</g></svg></div>';
  }
  function spec(){
    let heading="",caption="",name="",content="",opts=[],extras=[ask];const main=source==="main";const check=a("从自己的渠道核对","verify");
    switch(cur){
      case "04":
        heading=B?"屏幕亮了":"一条群消息";caption=B?"来电显示的是常联系的昵称。你可以接，也可以先让铃声停下来。":"熟悉的群里有人发来邀请。今天去不去，由你决定。";name=B?"阿岚":"邻里生活群";
        content=B?'<div class="caller" aria-hidden="true">岚</div><p>来电中……</p>':bbl("邻居吴姨","今天上午有场健康讲座，想来听听吗？");
        opts=B?[goA("接听","05"),a("挂断","hang"),goA("看看旧消息","06")]:[goA("打开群聊","05"),end("稍后再看")];break;
      case "hang":
        heading="通话已结束";caption="屋子又安静下来。你还可以回头看看，过去几周聊过些什么。";name="通话记录";content='<p>阿岚　｜　通话已结束</p>';opts=[end("结束这次接触"),goA("看看旧消息","06")];break;
      case "05":
        heading=B?"一句日常问候":"群里的邀约";caption=B?"你们认识了几个星期，平时聊过散步、天气，还有修相机的事。":"吴姨转来一张活动通知，说听讲座还可以领一份小礼物。";name=B?"与阿岚通话":"邻里生活群";
        content=B?bbl("阿岚","吃过饭了吗？前两天说的理财页面，要不要先看看？"):bbl("吴姨","今天讲日常健康，来听还可以领鸡蛋。")+bbl("吴姨","我把讲座发群里了。");
        opts=B?[goA("看看你发的页面","06"),check,a("先挂断","hang")]:[goA("听听讲座","06"),goA("看看另一条旧纸币消息","08"),end("今天先不看")];break;
      case "06":
        heading=B?"旧消息，新话题":"听听讲师怎么说";caption=B?"过去的问候是真的留在手机里。这张图里跳动的数字，又能说明什么？":"桌边的礼品袋还没打开，屏幕已经切到了一个商品包装。";name=B?"和阿岚的聊天":"健康讲座";
        content=B?'<div class="sms"><small>10月18日</small>天凉了，散步记得加件衣服。</div><div class="sms"><small>10月27日</small>上次说的相机修好了吗？</div><div class="sms"><small>11月03日</small>周末有空聊聊。</div>'+bbl("今天 · 阿岚","这是页面上显示的收益记录。")+bbl("阿岚","你想看看参与条件吗？"):ill("pack")+bbl("讲师的宣传","我们把它当成能改善慢性病的产品来介绍。")+'<p>包装正面：保健食品（演练道具）。</p>';
        opts=B?[goA("看看参与条件","07"),goA("另看旧相机回收邀请","08"),end("先不参与")]:[goA("看包装和价格","07"),check,goA("关掉讲座","05")];break;
      case "07":
        heading=B?"钱将交给谁":"把包装翻过来";caption=B?"页面上的名字和收钱的人并排放着。对方还提到，也可以寄出闲置相机。":"群里说可以帮你留一份。你把总价和包装上的字放在一起看。";name=B?"参与条件":"商品资料";
        content=ill(B?"book":"pack")+receipt(B?[["页面名称","云桥体验页（虚构）"],["用途","账户充值"],["收款方","页面收款户"]]:[["品类","保健食品"],["内容","三盒套餐"],["销售方","讲座销售方"],["总价","680 元（演练）"]]);
        opts=B?[check,a("打开充值确认","tx:charge"),a("查看相机交付确认","tx:ship"),goA("回到聊天","06")]:[check,a("打开套餐购买确认","tx:bundle"),goA("先回群聊","05")];break;
      case "08":
        heading=B?"旧相机的另一条邀约":"桌角的旧纸币";caption=B?"相机收纳盒还在桌边。这次打开的是另一场回收直播。":"群里还有一条旧纸币鉴定直播。口头的报价与付费说明分列在屏幕上。";name=B?"旧物回收直播":"旧纸币鉴定直播";
        content=ill(B?"camera":"money")+bbl("主播",B?"我们可以安排上门。预约前要先确认一笔服务费用。":"这张旧纸币，有人愿意出高价。需要先办理鉴定服务。")+receipt(B?[["口头说明","可上门回收"],["书面条件","先交预约押金 200 元"]]:[["口头说明","高价回收"],["书面条件","鉴定服务费 180 元"]]);
        opts=[check,a(B?"打开预约确认":"打开服务费确认","tx:"+(B?"deposit":"service")),goA("关闭直播",B?"06":"05")];break;
      case "09":
        heading="让家人也看一眼";caption="你把手机转向身边的人。商量过并不代表已经核实，接下来仍然由你决定。";name="一起商量";
        content=bbl("家人",seen.has("07")||seen.has("08")?"咱们把这两行放在一起：对方怎么说，钱实际要交给谁？":B?"要不要先看看你们之前都聊了什么？":"你想先看看群里原本写的是什么吗？");
        opts=[a("回到刚才","backHelp"),goA(B?"看看旧消息":"一起看群消息",B?"06":"05")];if(seen.has("07")||seen.has("08")||(!B&&seen.has("06")))opts.push(check);opts.push(end("今天先放一放"));extras=[];break;
      case "10": {
        heading="用自己的渠道核对";caption=B?"从自己保存的入口查，不用来电者发来的页面。":"讲座的说法、主播的承诺，都可以拿出来单独问。";name=vName[source];
        const available=main?(B?seen.has("07"):seen.has("06")):seen.has("08");
        const labels=B?(main?["核对平台名称","核对实际收款方"]:["查看经营者","读预约服务条款"]):(main?["核对商品包装","看原就诊渠道答复"]:["查看经营者","读书面付费条件"]);
        const replies=B?(main?["所称机构的公开资料中，找不到这个平台。","实际收款人和所称机构对不上。"]:["提供预约服务的是页面运营方。","押金购买的是预约，没有写入收购承诺。"]):(main?["包装上写的是保健食品。","仅凭商品宣传，不能判断它能治疗疾病。"]:["主播所在的是鉴定服务方。","付费页写的是服务费用，没有书面的收购价格。"]);
        content='<p>'+(!available?'对照前还需要看原始资料。':(main&&!B?'从平时就诊机构的原有联系渠道，出示包装、查看演练答复。':'把演练资料与独立查询的记录逐项对照。'))+'</p>';
        if(available)labels.forEach((t,i)=>{const id=source+i;if(checks.has(id))content+=bbl(t,replies[i]);else opts.push(a(t,"check:"+i))});
        else opts.push(goA("查看缺少的资料",main?"07":"08"));
        if(previewed.has(main?"side":"main"))opts.push(a("改查"+vName[main?"side":"main"],"switch"));
        opts.push(end("暂缓，查看本局结果"),a("返回刚才的画面","backVerify"));extras=[];break}
      case "11": {
        const [s,use,v,to]=transactions[amountKey];heading="确认之前";caption="这个页面只做演练。你可以取消，也可以找人再看一遍。";name=s+"确认";
        content=receipt([["演练动作",use],["将交付",v],["交给",to]])+"<p>这里不会发生真实扣款或交付。</p>";
        opts=[end("取消并结束"),a("确认"+s+"（演练）","pay"),check,goA("返回",source==="side"?"08":"07")];break}
    }
    return {heading,caption,name,content,opts,extras};
  }
  function btn(o,i){return '<button class="choice'+(i===0?' primary':'')+'" data-do="'+o.k+'"><b aria-hidden="true">'+String(i+1).padStart(2,"0")+'</b><span>'+o.label+'</span></button>'}
  function desk(){
    const s=spec();view="play";
    const phase=cur==="11"?"decision":cur==="08"?"insert":["04","hang","05"].includes(cur)?"orient":"evidence";
    const call=B&&cur==="04",lock=!B&&cur==="04";
    app.innerHTML='<div class="pc-set">'+Theatre.scene(s.heading,s.caption)+
      '<section class="phone" data-page="'+(call?'call':lock?'lock':'app')+'" aria-label="模拟手机"><div class="notch" aria-hidden="true"></div><div class="statusbar"><span>'+clock+'</span>'+Theatre.symbols+'</div><div class="phone-flow"><div class="screen"><h2 id="step" tabindex="-1">'+s.name+'</h2>'+
      (lock?'<div class="lock-day">星期日　上午</div><div class="lock-hour">'+clock+'</div>':'')+(lock?'<button class="notification-tap lock-note" data-do="go:05" aria-label="打开邻里群消息"><span class="lock-meta"><span>邻里生活群</span><span>现在</span></span><strong>邻居吴姨</strong><span>今天上午有场健康讲座，想来听听吗？</span></button>':s.content)+'</div><div class="decide">'+(lock?s.opts.filter(x=>x.k!=="go:05"):s.opts).map(btn).join("")+(s.extras.length?'<div class="backhelp">'+s.extras.map(x=>'<button data-do="'+x.k+'">'+x.label+'</button>').join("")+'</div>':"")+
      '</div></div><div class="home-indicator" aria-hidden="true"></div></section></div>';
    Theatre.bind(n+"-"+phase,asset,call&&!hanged?incoming:undefined);if(lock){const h=app.querySelector(".lock-day");h.tabIndex=-1;h.focus({preventScroll:true})}else focusStep("step");
  }
  function go(i){
    silence();cur=i;seen.add(i);
    if(i==="07"||i==="06"||i==="05"){source="main";if(i==="07"||(!B&&i==="06"))previewed.add(source)}
    if(i==="08"){source="side";previewed.add(source)}
    if(i==="11"){entered=true;source=(amountKey==="deposit"||amountKey==="service")?"side":"main"}
    desk();
  }
  function finish(){
    Theatre.stop();
    silence();view="result";const line=reviewed.size?Array.from(reviewed).map(k=>vName[k]).join("、"):"";
    const result=paid?"出现模拟损失":entered?"有惊无险":line?"及时核实":"安全离开";
    const why=paid?"你在演练中确认了"+transactions[amountKey][0]+"（"+transactions[amountKey][2]+"），没有发生真实扣款或交付。":entered?"你看到了"+transactions[amountKey][0]+"确认页，最后没有点确认。":line?"你通过独立渠道核对了"+line+"，随后暂缓了行动。":"你结束了这次接触，没有交付钱物。对方的说法仍待核实。";
    const tips=source==="side"&&seen.has("08")?(B?"直播里说的是上门收购，但书面条款收的是预约押金。愿意上门不等于保证收购。":"主播口头说会高价回收，付费页写的却是鉴定服务。报价和购买的内容是两件事。"):B?(seen.has("07")?"参与页列出的是平台名称，交钱时面对的却是「页面收款户」。应分别核对这两个对象。":seen.has("06")?"你看到了旧聊天和一张收益记录；聊天的时间长短不能证明这张图里的收益是真的。":"来电显示的是熟悉的昵称。仅凭这个名字，还不能确认对方这一次要谈什么。"):(seen.has("06")?"讲师声称能改善慢性病，包装写的却是保健食品。两种说法需要分别确认。":"你看到的是邻里群的邀请；认识发消息的人，并不等于已经了解活动内容。");
    const notes=[tips];
    if(helped)notes.push("你和家人商量过。");
    if(line)notes.push("已经完成独立核对："+line+"。");
    else if(checks.size)notes.push("你查过部分资料，两项对照还没有做完。");
    Ending.mount(app,{chapter:n,title,picture:asset,result,why,loss:paid,actions,notes});
  }
  function choiceReceipt(k){
    const places={"04":B?"来电画面":"邻里群通知",hang:"通话记录","05":B?"通话":"邻里群聊","06":B?"旧消息":"讲座","07":B?"参与条件":"商品包装","08":B?"回收直播":"鉴宝直播","11":"确认页"};
    if(k.startsWith("tx:"))return "查看了"+transactions[k.slice(3)][0]+"确认页";
    if(k==="pay")return "确认了模拟"+transactions[amountKey][0]+"（"+transactions[amountKey][2]+"）";
    if(k==="end")return cur==="11"?"在确认前取消了"+transactions[amountKey][0]:cur==="04"&&!B?"决定这次先不打开邀请":"决定先停下来，结束了这次接触";
    if(k==="hang")return "挂断了来电";
    if(k==="help")return "把手机给家人看，一起商量了这件事";
    if(k==="verify")return "打开了自己原有的渠道，准备核对";
    if(k==="backHelp"||k==="backVerify")return "回到了"+(places[k==="backHelp"?origin:verifyOrigin]||"先前的画面");
    if(k==="switch")return "改为查看"+vName[source==="main"?"side":"main"]+"的资料";
    if(k.startsWith("check:")){
      const checksHere=B?(source==="main"?["查过了所称平台的名称","核对了实际收款方"]:["查看了预约服务的经营者","读过了预约服务条款"]):
        (source==="main"?["核对了包装上的商品类别","查看了原就诊渠道的答复"]:["查看了鉴定服务的经营者","读过了书面付费条件"]);
      return checksHere[Number(k.slice(6))];
    }
    if(k==="go:05")return B?"接听了阿岚的电话":cur==="04"?"打开了邻里群的讲座邀请":"回到了邻里群聊";
    if(k==="go:06")return B?"打开了和阿岚的旧聊天记录":"打开了健康讲座";
    if(k==="go:07")return B?"查看了参与条件和收款方":"查看了商品的包装和价格";
    if(k==="go:08")return B?"打开了旧相机回收直播":"打开了旧纸币鉴定直播";
  }
  function act(k){
    if(k==="replay"){location.reload();return}if(view!=="play")return;
    const receipt=choiceReceipt(k);if(receipt)log(receipt);if(k.startsWith("go:")){go(k.slice(3));return}
    if(k==="end"){finish();return}if(k==="hang"){hanged=true;go("hang");return}
    if(k==="help"){origin=cur==="10"?verifyOrigin:cur;helped=true;go("09");return}
    if(k==="verify"){verifyOrigin=cur==="09"?origin:cur;go("10");return}
    if(k==="backHelp"){go(origin);return}if(k==="backVerify"){go(verifyOrigin);return}
    if(k==="switch"){source=source==="side"?"main":"side";desk();return}
    if(k.startsWith("check:")){checks.add(source+k.slice(6));if(checks.has(source+"0")&&checks.has(source+"1"))reviewed.add(source);desk();return}
    if(k.startsWith("tx:")){amountKey=k.slice(3);go("11");return}if(k==="pay"&&!paid){paid=true;finish()}
  }
  app.addEventListener("click",e=>{const b=e.target.closest("button[data-do]");if(!b)return;
    // A physical double click must not carry a decision into the next scene.
    if(e.detail>1)return;audio();const k=b.dataset.do;if(k==="pay"&&performance.now()-lastAct<350)return;
    lastAct=performance.now();act(k)});
  $("mute").onclick=()=>{muted=!muted;$("mute").setAttribute("aria-pressed",String(muted));$("mute").textContent=muted?"开声音":"静音";if(muted)silence();else {audio();if(B&&!box.open&&view==="play"&&cur==="04"&&!hanged)incoming()}};
  $("full").onclick=full;document.addEventListener("fullscreenchange",()=>{$("full").textContent=document.fullscreenElement?"退全屏":"全屏"});
  function askExit(){Theatre.suspend();silence();box.returnValue="";box.showModal()}
  $("exit").onclick=askExit;box.addEventListener("close",()=>{if(box.returnValue==="leave"){location.href="index.html";return}Theatre.resume();if(view==="play"&&cur==="04"&&B&&!hanged)incoming()});
  document.addEventListener("visibilitychange",()=>{if(document.hidden){silence()}else if(view==="play"&&cur==="04"&&B&&!hanged&&!box.open)incoming()});
  window.addEventListener("pagehide",()=>{silence()});go("04");
})();
