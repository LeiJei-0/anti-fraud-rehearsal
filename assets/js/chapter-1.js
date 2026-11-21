"use strict";
(function(){
/* =====================================================================
   0. 通用工具
   ===================================================================== */
var V = document.getElementById("view");
var OVER = document.getElementById("overlay");
var MODAL = document.getElementById("modal");
var STATUS = document.getElementById("statusline");
var btnPause = document.getElementById("btn-pause");
var btnSound = document.getElementById("btn-sound");

function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
  return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]; }); }
function say(msg){ STATUS.textContent = msg; }

/* 全局世代号：任何一次导航、退出、重玩、跳过都会 ++GEN，
   使上一局的计时器与迟到的播放回调全部失效。 */
var GEN = 0;
function later(ms, gen, fn){
  return setTimeout(function(){ if(gen === GEN) fn(); }, ms);
}

/* 顺序时间轴（开场 / 视频 / 结尾），支持暂停、恢复、失效 */
var SEQ = null;
function Seq(items, onDone){
  this.items = items; this.onDone = onDone;
  this.i = 0; this.t = null; this.paused = false; this.dead = false;
  this.gen = GEN; this.remain = 0; this.started = 0;
}
Seq.prototype.play = function(){
  if(this.dead || GEN !== this.gen) return;
  if(this.i >= this.items.length){ this.finish(); return; }
  var it = this.items[this.i];
  this.remain = it.ms; this.started = Date.now();
  var self = this;
  this.t = setTimeout(function(){
    if(self.dead || GEN !== self.gen) return;
    try{ it.fn(); }catch(e){}
    self.i++;
    self.play();
  }, this.remain);
};
Seq.prototype.pause = function(){
  if(this.paused || this.dead) return;
  clearTimeout(this.t);
  var used = Date.now() - this.started;
  this.remain = Math.max(0, this.remain - used);
  this.paused = true;
};
Seq.prototype.resume = function(){
  if(!this.paused || this.dead) return;
  this.paused = false;
  this.started = Date.now();
  var self = this;
  this.t = setTimeout(function(){
    if(self.dead || GEN !== self.gen) return;
    try{ self.items[self.i].fn(); }catch(e){}
    self.i++; self.paused = false; self.play();
  }, this.remain);
};
Seq.prototype.stop = function(){ this.dead = true; clearTimeout(this.t); };
Seq.prototype.finish = function(){
  this.dead = true;
  if(this.onDone && GEN === this.gen) this.onDone();
};
function killSeq(){ if(SEQ){ SEQ.stop(); SEQ = null; } }
function runSeq(items, onDone){ killSeq(); SEQ = new Seq(items, onDone); SEQ.play(); return SEQ; }

/* =====================================================================
   1. 本地生成的提示音（无外部音频文件、无人声素材）
   ===================================================================== */
var Sfx = (function(){
  var ctx = null, master = null, muted = false, alive = 0;
  function ensure(){
    if(ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    try{
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.85;
      master.connect(ctx.destination);
    }catch(e){ ctx = null; }
    return ctx;
  }
  function unlock(){ var c = ensure(); if(c && c.state === "suspended"){ c.resume().catch(function(){}); } }
  function env(node, t0, dur, peak){
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g); g.connect(master);
    return g;
  }
  function beep(f0, f1, dur, type, peak, delay){
    var c = ensure(); if(!c || muted) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f0, t0);
    if(f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(o, t0, dur, peak || 0.14);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  return {
    unlock: unlock,
    isMuted: function(){ return muted; },
    setMuted: function(m){
      muted = m;
      if(master) master.gain.value = m ? 0 : 0.85;
      if(m) this.stopAll();
    },
    /* 亮屏提示音：只在通知出现时响一次 */
    ping: function(gen){ if(gen !== GEN) return; beep(1180, 880, 0.16, "triangle", 0.16); beep(880, 660, 0.2, "sine", 0.1, 0.14); },
    tap: function(){ beep(520, 620, 0.05, "square", 0.05); },
    alert: function(){ beep(300, 180, 0.5, "sawtooth", 0.1); },
    /* 来电铃声：只在等待时循环；接听/挂断/暂停/退出即停 */
    ring: function(gen){
      if(gen !== GEN) return;
      var tok = ++alive;
      (function cycle(){
        if(gen !== GEN || tok !== alive || muted) return;
        beep(1046, 1046, 0.16, "sine", 0.12, 0);
        beep(1318, 1318, 0.16, "sine", 0.11, 0.2);
        beep(1046, 1046, 0.16, "sine", 0.12, 0.44);
        beep(1318, 1318, 0.2, "sine", 0.1, 0.64);
        setTimeout(function(){ if(gen === GEN && tok === alive && !muted) cycle(); }, 1700);
      })();
    },
    stopAll: function(){ alive++; }
  };
})();

/* =====================================================================
   2. 本局状态
   ===================================================================== */
var MAIN = { A04:1, A05:1, A06:1, A10:1 };
var R;
function freshRound(){
  return {
    scene: "select",
    seen: {},          // 看过 / 接收过信息
    visited: {},       // 到过的镜头
    from: null,        // 短分支的来处，用于「返回原画面」
    origin: "A04",     // 最近一个主线画面，分支返回时兜底
    talked: false,     // 找人商量（与「已核实」分开记录）
    helpMode: null,    // null | 'post'（模拟损失之后的事后处理）
    enteredPay: false, // 进入标注演练的确认页 = 跟随
    confirmCount: 0,   // 确认按钮只生效一次
    confirmedPay: false,
    videoFrame: 0,
    verify: { taskList:false, teacherReply:false, videoCheck:false, onlyDialed:false },
    log: [],
    choices: [],  // Only deliberate player decisions, in the order they occurred.
    modal: null,       // 'loss' | 'info'
    payView: "form",   // form | readonly
    sub: "hub",        // A09 子页
    openingStage: "opening1"
  };
}
R = freshRound();

function rec(kind, scene, text){
  R.log.push({ kind: kind, scene: scene, text: text });
}
function mark(scene){ R.seen[scene] = true; R.visited[scene] = true; }

function verifiedItems(){
  var v = R.verify, out = [];
  if(v.taskList) out.push("学校就业平台发布记录：没有「周末任务招募」这项任务");
  if(v.teacherReply) out.push("校园通讯录里原有的王老师号码：老师没有发布这项任务");
  if(v.videoCheck) out.push("同一个原有号码：老师确认没有发过这段视频");
  return out;
}
function pendingItems(){
  var out = [];
  if(!R.verify.taskList) out.push("任务是否由学校渠道发布 · 尚未查");
  if(!R.verify.teacherReply) out.push("对方所称身份是否属实 · 尚未用原有号码确认");
  if(R.seen.A07 && !R.verify.videoCheck) out.push("那段视频是不是老师本人发的 · 尚未确认");
  return out;
}
function endingKey(){
  if(R.confirmedPay) return "loss";
  if(R.enteredPay) return "close";
  if(R.verify.taskList && R.verify.teacherReply) return "verified";
  return "safe";
}
var ENDINGS = {
  loss:     { name:"出现模拟损失" },
  close:    { name:"有惊无险" },
  verified: { name:"及时核实" },
  safe:     { name:"安全离开" }
};

/* =====================================================================
   3. 分层场景（SVG）
   ===================================================================== */
function callerSVG(){
  return '<svg id="vchar" viewBox="0 0 410 240" role="img" aria-label="模拟视频中的陌生人戴着眼镜，穿着米白衬衫。没有声音。"><image href="assets/art/caller.svg" width="410" height="240"/></svg>';
}

/* =====================================================================
   4. 手机内的页面片段
   ===================================================================== */
function statusbar(){return '<div class="statusbar"><span>15:12</span>'+Theatre.symbols+'</div>';}
function phoneShell(inner,title){
  return '<div class="phone" role="group" aria-label="模拟手机" data-page="'+(R.scene==="A04"?"lock":"app")+'"><div class="notch" aria-hidden="true"></div>'+statusbar()+
    '<div class="phone-flow"><div class="screen" id="screen">'+(title?'<div class="appbar"><b>'+esc(title)+'</b></div>':'')+inner+'</div><div class="reply-tray"></div></div><div class="home-indicator" aria-hidden="true"></div></div>';
}
function bubble(who, text, out){
  return '<div class="msg ' + (out ? "out" : "in") + '"><div class="who">' + esc(who) + '</div><p>' + esc(text) + '</p></div>';
}
function notifCard(){
  return '<div class="note"><h4>周末任务招募</h4>' +
    '<div class="kv"><span>说明</span><b>商品资料整理 · 日结</b></div>' +
    '<div class="kv"><span>来源</span><b>短信 · 陌生号码</b></div>' +
    '<div class="kv"><span>时间</span><b>周六 15:12</b></div></div>';
}
function ledgerRow(label, val, cls, note){
  return '<div class="kv"><span>' + esc(label) + (note ? '<span class="r"> · ' + esc(note) + '</span>' : '') +
    '</span><b class="' + (cls||"") + '">' + esc(val) + '</b></div>';
}
/* A09 主屏图块：本地绘制的图案 + 图案下的文字名，整块是一个按钮可用键盘进入。
   没看过 A07 时回看入口不是可用按钮，不伪装成能点的样子。 */
function iconSVG(name){
  var p = {
    gate: '<path d="M4 20h16M6 20v-9h12v9M3 11 12 4l9 7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
          '<path d="M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="2"/>',
    book: '<rect x="4" y="4" width="14" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="M6.5 8h3M6.5 12h3M6.5 16h3" stroke="currentColor" stroke-width="2"/>' +
          '<circle cx="14" cy="10.5" r="2.3" fill="currentColor"/>' +
          '<path d="M10.6 16.5c.8-2.2 6-2.2 6.8 0z" fill="currentColor"/>',
    chat: '<path d="M4 5h16v11h-6l-4 3v-3H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
          '<path d="M7.5 9h9M7.5 12h6" stroke="currentColor" stroke-width="2"/>',
    play: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="M10.5 9.2 15.5 12l-5 2.8z" fill="currentColor"/>'
  }[name] || "";
  return '<svg class="ticon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>';
}
function tiles(list){
  return '<div class="tiles">' + list.map(function(t){
    var inner = iconSVG(t.icon) + '<span class="tl">' + esc(t.label) + '</span><span class="tb">' + esc(t.badge) + '</span>';
    if(t.off) return '<div class="tile off" data-kind="off" aria-disabled="true">' + inner + '</div>';
    return '<button type="button" class="tile" data-kind="' + esc(t.kind) + '" data-act="' + esc(t.act) + '">' + inner + '</button>';
  }).join("") + '</div>';
}
/* A07 弹幕：画面中的人说的话，一条一句，都带说话人标识；不做观众评论样式，也不放任何语音。 */
function videoLines(){
  return [
    { who:"自称辅导员", txt:"喂，是我。" },
    { who:"自称辅导员", txt:"我是你们辅导员。" },
    { who:"自称辅导员", txt:"这个周末任务学校知道。" },
    { who:"自称辅导员", txt:"你先看一下对方的通知。" },
    { who:"自称辅导员", txt:"跟着做完就行。" },
    { who:"自称辅导员", txt:"钱的事不用怕，做完一起退给你。" }
  ];
}
function dmLines(upto){
  var lines = videoLines(), n = Math.max(1, Math.min(upto, lines.length)), out = "";
  for(var i = 0; i < n; i++){
    out += '<p class="dm-line" data-i="' + i + '"><b class="who">' + esc(lines[i].who) + '</b>' +
      '<span>' + esc(lines[i].txt) + '</span></p>';
  }
  return out;
}

/* =====================================================================
   5. 镜头内容
   ===================================================================== */
function currentSpec(){
  switch(R.scene){
    case "A04": return specA04();
    case "A05": return specA05();
    case "A06": return specA06();
    case "A07": return specA07();
    case "A08": return specA08();
    case "A09": return specA09();
    case "A10": return specA10();
    default: return null;
  }
}

function specA04(){
  return {
    stage: "lock",
    cap: { who:"旁白", txt:"手机亮了。陌生号码发来一份按日结算的兼职。",
           cue:"两个选择都可以，慢慢读。什么都不点也会一直停在这里。" },
    phone: phoneShell(
      '<div class="lockface"><div class="lock-day">周六　下午</div><div class="lock-hour">15:12</div>' +
      '<button type="button" class="lock-note note notification-tap" data-act="go:A05" aria-label="查看兼职短信"><span class="lock-meta"><span>信息</span><span>现在</span></span><strong>周末任务招募</strong><span>商品资料整理，按日结算。</span><small>陌生号码</small></button></div>',
      "第一条通知"),
    actions: [
      { label:"先放一放", sub:"不打开，直接看本局结果", cls:"leave", act:"end" },
      { label:"查看", sub:"打开这条通知里的聊天", cls:"stay", act:"go:A05" }
    ],
    aside: [ { label:"找人商量", act:"go:A08" } ]
  };
}

function specA05(){
  return {
    stage: "play",
    cap: { who:"兼职联系人 小周", txt:"你打开了和兼职联系人的聊天，试做那一单的消息还在。",
           cue:"这笔返利是剧情预设的演练数据，不是玩家付的钱，也不影响本局结算。" },
    phone: phoneShell(
      '<div class="thread">' +
        bubble("小周 · 兼职联系人", "同学你好，周末的商品资料整理还缺人，做完就能结。") +
        bubble("我", "我先试了一单。", true) +
        bubble("小周 · 兼职联系人", "这笔试做的报酬已经到账，你可以看一下。") +
      '</div>' +
      '<div class="note"><h4>演练账单 · 预设剧情数据</h4>' +
        ledgerRow("试做报酬（已到账）", "+8.00", "plus", "系统演示") +
        ledgerRow("本局我已付款", "0.00", "", "无任何付款动作") +
      '</div>',
      "任务聊天"),
    actions: [
      { label:"先不继续", sub:"看过消息就结束", cls:"leave", act:"end" },
      { label:"看看下一项", sub:"对方说有新的任务", cls:"stay", act:"go:A06" }
    ],
    extra: [ { label:"这是谁发布的", sub:"对方发来一段视频", act:"go:A07" } ],
    aside: [ { label:"找人商量", act:"go:A08" }, { label:"结束本章", act:"end" } ]
  };
}

function specA06(){
  return {
    stage: "play",
    cap: { who:"兼职联系人 小周", txt:"聊天还开着，小周又发来了下一项任务。",
           cue:"屏幕上写明了下一步要你付款。到这里你仍然只是在看消息。" },
    phone: phoneShell(
      '<div class="thread">' +
        bubble("小周 · 兼职联系人", "这笔试做的报酬已经到账，你可以看一下。") +
        '<div class="note"><b>已到账（演练数据）</b>' + ledgerRow("试做报酬", "+8.00", "plus") + '</div>' +
        bubble("小周 · 兼职联系人", "下一项是连续任务，要先垫付。") +
        bubble("小周 · 兼职联系人", "页面提示整组做完才能结算，中途退出来就不退了。") +
      '</div>' +
      '<div class="note"><h4>对方发来的任务页</h4>' +
        ledgerRow("需先垫付", "380.00", "minus", "联单第 1 组") +
        ledgerRow("做完返还", "456.00", "plus", "对方口头说法") +
        '<div class="hint">这条说明只是接收到的信息，还没有进入确认页。</div></div>',
      "任务聊天"),
    actions: [
      { label:"先不做了", sub:"不进入垫付页面", cls:"leave", act:"end" },
      { label:"看看垫付要求", sub:"打开演练确认页", cls:"stay", act:"go:A10" }
    ],
    extra: [ { label:"学校知道这份兼职吗", sub:"对方发来一段视频", act:"go:A07" } ],
    aside: [ { label:"找人商量", act:"go:A08" }, { label:"结束本章", act:"end" } ]
  };
}

function specA07(){
  var lines = videoLines();
  var shown = Math.max(1, Math.min((R.videoFrame||0) + 1, lines.length));
  var done = R.seen.A07_video_done;
  var body =
    '<div class="media callframe">' + callerSVG() + '</div>' +
    '<div class="dm" id="vlines" role="log" aria-live="polite">' +
      '<div class="dm-note"><span>' + (done ? "他说的话都留在这里，可以再读一遍。" : "画面里的人说的话（没有声音，一句一句出现）") + '</span>' +
      '<span class="dm-count" id="vcount">第 ' + shown + ' 条 / 共 ' + lines.length + ' 条</span></div>' +
      dmLines(shown) +
    '</div>' +
    '<div class="note"><b>这是陌生账号发来的视频邀请</b>' +
      '<div class="kv"><span>显示名称</span><b>王老师（新添加）</b></div>' +
      '<div class="kv"><span>号码</span><b>不是校园通讯录里的号码</b></div>' +
      '<div class="hint">短句是画面中人的自称，不代表身份已经确认。看过这一段只算接收信息。</div></div>';
  if(!done){
    return {
      stage: "video",
      cap: { who:"画面中的人（自称辅导员）", txt: lines[Math.min(shown,lines.length)-1].txt,
             cue:"看完或者跳过之后再选下一步。过程中随时可以暂停，也可以退出。" },
      phone: phoneShell(body, "视频通话"),
      actions: [
        { label:"跳过视频", sub:"直接看这一段的全部短句", cls:"stay", act:"videoSkip" }
      ],
      extra: [ { label:"暂停 / 继续播放", act:"videoPause" } ],
      aside: [ { label:"这局先到这里", act:"end" }, { label:"退出", act:"exit" } ]
    };
  }
  return {
    stage: "video",
    cap: { who:"画面中的人（自称辅导员）", txt:"「我是你们辅导员。这个周末任务学校知道。」",
           cue:"以上是对方的说法。这一段只算你看到了信息，没有跟任何付款动作。" },
    phone: phoneShell(body, "视频通话 · 已结束"),
    actions: [
      { label:"回到任务聊天", sub:"回到看视频之前", cls:"leave", act:"back" },
      { label:"用平时的号码问老师", sub:"从校园通讯录联系", cls:"stay", act:"go:A09" }
    ],
    aside: [ { label:"这局先到这里", act:"end" }, { label:"找人商量", act:"go:A08" } ]
  };
}

function specA08(){
  var sawTask = R.seen.A05 || R.seen.A06;
  var post = R.helpMode === "post";
  var body;
  if(post){
    body = '<div class="thread">' +
      bubble("同学 林嘉", "我看到你上一局的记录了。先别再垫第二笔。") +
      bubble("林嘉", "消息、任务页和演练付款记录都还在手机里，我们一条条对着看。") +
    '</div><div class="note"><b>事后处理（演练内）</b>' +
      '<div class="hint">这里只提供整理记录、回到结尾或退出。原来的结果不会改变。</div></div>';
  } else {
    body = '<div class="thread">' +
      bubble("同学 林嘉 · 通讯录里原有", sawTask ? "把任务名字发我看看。我们先到学校的就业页面找一下，好吗？"
                                                 : "那条通知怎么写的？先别急着回。") +
    '</div>' +
    (sawTask
      ? '<div class="note"><b>你给林嘉看的</b>' + ledgerRow("任务名称", "周末任务招募") + ledgerRow("对方要求", "先垫付 380.00") + '</div>'
      : '<div class="note"><b>你给林嘉看的</b>' + ledgerRow("锁屏预览", "周末任务招募 · 商品资料整理") + '</div>') +
    '<div class="note"><b>林嘉问了一句</b><div class="kv"><span>我们可以从哪里确认这件事？</span><b>学校自己的渠道</b></div></div>';
  }
  var spec = {
    stage: "help",
    cap: { who:"同学 林嘉", txt: post ? "先停下，我们把已经发生的东西整理清楚。"
      : (sawTask ? "我们先到学校的就业页面找一下，好吗？" : "那条通知怎么写的？"),
      cue: post ? "求助记录接在原来的结果之后，不会改写结算。"
                : "找人商量与自己去核实是两件分开记录的事。" },
    phone: phoneShell(body, "通讯录 · 原有联系人"),
    aside: [ { label:"退出", act:"exit" } ]
  };
  if(post){
    spec.actions = [
      { label:"回到结算提示", sub:"保留出现模拟损失的结果", cls:"stay", act:"lossModal" },
      { label:"整理这一局的记录", sub:"只展示已发生的动作", act:"showLog" }
    ];
    spec.extra = [ { label:"从头重玩（清空本局记录）", act:"replay" } ];
  } else {
    spec.actions = [
      { label:"结束本章", sub:"按现在做过的步骤结算", cls:"leave", act:"end" },
      { label:"一起查学校渠道", sub:"打开校园服务与通讯录", cls:"stay", act:"go:A09" }
    ];
    spec.extra = [ { label:"回到刚才", sub:"回到商量之前的画面", cls:"leave", act:"back" } ];
  }
  return spec;
}

function specA09(){
  var hub =
    '<div class="hint">手机主屏。前两个图案是学校自己的入口，第三个是对方发来的聊天；点图案本身还不算核实。</div>' +
    tiles([
      { icon:"gate", label:"校园服务", badge:"校内 · 原有", kind:"campus", act:"sub:jobs" },
      { icon:"book", label:"学校通讯录", badge:"校内 · 原有", kind:"campus", act:"sub:contacts" },
      { icon:"chat", label:"任务聊天", badge:"对方发来", kind:"other", act:"back" },
      R.seen.A07
        ? { icon:"play", label:"回看那段视频", badge:"本局看过", kind:"other", act:"go:A07" }
        : { icon:"play", label:"回看那段视频", badge:"本局没看过", kind:"off", off:true }
    ]);
  var body, title, cap, actions;

  if(R.sub === "jobs"){
    body = '<div class="note"><h4>学校就业平台 · 任务发布记录</h4>' +
      '<div class="listrow"><span>图书馆整理上架（校内）</span><span class="r">已发布</span></div>' +
      '<div class="listrow" style="margin-top:.3rem"><span>实验室数据录入（校内）</span><span class="r">已发布</span></div>' +
      '<div class="listrow" style="margin-top:.3rem"><span>暑期支教招募（校内）</span><span class="r">已发布</span></div>' +
      '</div>' +
      (R.verify.taskList
        ? '<div class="note"><b>搜索结果</b><div class="kv"><span>「周末任务招募」</span><b>没有找到相关发布</b></div>' +
          '<div class="hint">这一项已经记入本局的核实记录。</div></div>'
        : '<div class="note"><b>搜索</b><div class="kv"><span>输入任务名称</span><b>周末任务招募</b></div>' +
          '<div class="hint">还没有查过发布记录。点下面这一条才算查过。</div></div>');
    title = "校园服务 · 就业发布";
    cap = { who:"你在查", txt: R.verify.taskList ? "学校就业平台上没有这项任务的发布记录。"
      : "就业平台列出了学校发过的任务。你可以按对方给的名字搜一次。",
      cue:"查发布记录、联系老师是两项分开的核实。" };
    actions = [
      { label:"返回主屏", act:"sub:hub", cls:"leave" },
      { label: R.verify.taskList ? "已查到：没有这项发布" : "搜索：周末任务招募",
        act: R.verify.taskList ? "noop" : "checkTaskList", cls:"stay" }
    ];
  } else if(R.sub === "contacts"){
    body = '<div class="note"><h4>学校通讯录（原先保存）</h4>' +
      '<div class="listrow"><span>辅导员 王老师</span><span class="r">025-86•• 3•12 · 原有</span></div>' +
      '<div class="listrow" style="margin-top:.3rem"><span>同学 林嘉</span><span class="r">同学 · 原有</span></div>' +
      '<div class="listrow" style="margin-top:.3rem"><span>院系办公室</span><span class="r">值班 · 原有</span></div>' +
      '</div>' +
      '<div class="note"><b>注意</b><div class="hint">视频里那个账号不是这里的联系人，号码也不是同一串。</div></div>';
    title = "学校通讯录";
    cap = { who:"你在查", txt:"用手机里原本就存的号码，而不是对方给的方式。", cue:"这一步只算你打开了通讯录。" };
    actions = [
      { label:"返回主屏", act:"sub:hub", cls:"leave" },
      { label:"拨打 王老师（原有号码）", act:"callTeacher", cls:"stay" }
    ];
  } else if(R.sub === "calling"){
    body = '<div class="note"><h4>正在拨打 · 校园通讯录保存的号码</h4>' +
      '<div class="kv"><span>王老师</span><b>025-86•• 3•12</b></div>' +
      '<div class="kv"><span>状态</span><b>等待接听…</b></div>' +
      '<div class="hint">只有听到老师的答复才算核实完成。这时候挂断会保留待核实。</div></div>';
    title = "通话中（演练）";
    cap = { who:"通话", txt:"铃声响了四声。", cue:"接通之后老师说的话会写在字幕上。" };
    actions = [
      { label:"先挂断", sub:"没听到答复", cls:"leave", act:"hangup" },
      { label:"接听（老师回来了）", cls:"stay", act:"answer" }
    ];
  } else if(R.sub === "reply"){
    var lines = ['<div class="thread">' + bubble("王老师 · 校园通讯录", "喂，我在办公室。") +
      bubble("王老师 · 校园通讯录",
        R.verify.videoCheck
          ? "我没发过这段视频，学校就业平台也没有这项任务。你直接从平台看就好。"
          : "学校就业平台没有发过这项任务。你要是看到别的名头，先跟我说一声。") + '</div>'];
    if(R.seen.A07 && !R.verify.videoCheck){
      lines.push('<div class="note"><b>你还没问的一句</b><div class="kv"><span>那段视频是不是老师本人发的</span><b>待确认</b></div></div>');
    }
    if(R.verify.teacherReply){
      lines.push('<div class="note"><b>已记入本局核实</b><div class="kv"><span>老师答复</span><b>没有发布该任务</b></div>' +
        (R.verify.videoCheck ? '<div class="kv"><span>视频</span><b>老师确认没有发过</b></div>' : '') + '</div>');
    }
    body = lines.join("");
    title = "通话中（演练）· 已接通";
    cap = { who:"辅导员 王老师", txt: R.verify.teacherReply
        ? "学校就业平台没有发过这项任务" + (R.verify.videoCheck ? "，那段视频也不是我发的。" : "。")
        : "喂，我在办公室。",
      cue:"答复来自你原先保存的校园号码，与对方提供的联系方式无关。" };
    actions = [
      { label:"记下答复，返回主屏", act:"sub:hub", cls:"leave" }
    ];
    if(R.seen.A07 && !R.verify.videoCheck){
      actions.push({ label:"问：这段视频是您发的吗", act:"askVideo", cls:"stay" });
    } else {
      actions.push({ label:"老师这边说完了", act:"noop", cls:"stay" });
    }
  } else {
    body = hub;
    title = "手机主屏";
    cap = { who:"你在查", txt:"学校有两个自己的入口：就业发布记录和老师原有的号码。",
      cue:"两项都查到才算完成核实；只点一下、只看视频都不算。" };
    actions = [
      { label:"再看看招聘消息", sub:"回到刚才的画面", cls:"leave", act:"back" },
      { label:"这份兼职先不做", sub:"按现在查到的结算", cls:"stay", act:"end" }
    ];
  }

  return {
    stage: "play",
    cap: cap,
    phone: phoneShell(body, title),
    actions: actions,
    aside: [ { label:"找人商量", act:"go:A08" }, { label:"退出", act:"exit" } ]
  };
}

function specA10(){
  var readonly = R.payView === "readonly" || R.confirmCount > 0;
  var body =
    '<div class="note"><h4>' + (readonly ? "已确认的垫付（演练）" : "确认垫付（演练）") + '</h4>' +
      ledgerRow("款项用途", "联单任务 · 第 1 组") +
      ledgerRow("垫付金额", "380.00", "minus") +
      ledgerRow("收款方", "某商户（虚构）") +
      ledgerRow("本局已确认", readonly ? "1 笔（已发生）" : "0 笔") +
    '</div>' +
    '<div class="note"><b>本局的两条不同记录</b>' +
      ledgerRow("① 试做返利（剧情预设）", "+8.00", "plus", "不是你付的钱") +
      ledgerRow("② 这笔垫付", readonly ? "-380.00" : "0.00", "minus", readonly ? "你确认的动作" : "还没确认") +
    '</div>' +
    (readonly
      ? '<div class="note"><b>回看</b><div class="hint">这一页只展示已经发生的动作，确认按钮已经不再提供。</div></div>'
      : '<div class="note" style="border-color:#b4552f"><b>这一步会记录为「已跟随」</b><div class="hint">现在还没有付款。确认之后才出现模拟损失，随时可以取消。</div></div>');
  var spec = {
    stage: "pay",
    cap: { who:"垫付确认页", txt: readonly ? (R.payView === "readonly" ? "你已经确认过一次，这里是回看。" : "你刚才确认的就是这一页。") : "页面写着：整组做完才能结算。",
      cue: readonly ? "回看不改变原有结果，也不再提供确认按钮。" : "进入这一页算「跟随」，还没付款；随时能取消。" },
    phone: phoneShell(body, readonly ? "垫付记录（回看）" : "确认垫付（演练）"),
    aside: [ { label:"找人商量", act:"go:A08" }, { label:"退出", act:"exit" } ]
  };
  if(readonly){
    spec.actions = [ { label:"返回", sub:"回到结算弹窗", cls:"stay", act:"lossModal" } ];
  } else {
    spec.actions = [
      { label:"取消并结束", sub:"确认之前撤回", cls:"leave", act:"end" },
      { label:"确认垫付（演练）", sub:"只记录这一次动作", cls:"stay", act:"confirmPay" }
    ];
    spec.extra = [ { label:"返回任务", sub:"不进入确认", act:"go:A06" } ];
  }
  return spec;
}

/* =====================================================================
   6. 渲染
   ===================================================================== */
function render(){
  var spec = currentSpec();
  if(R.scene === "select") renderSelect();
  else if(R.scene === "review") renderReview();
  else if(spec) renderScene(spec);
  else { R.scene = "select"; renderSelect(); return; }
  btnPause.hidden = R.scene !== "A07" || !SEQ;
  btnPause.textContent = (SEQ && SEQ.paused) ? "继续对白" : "暂停对白";
  var sc = document.getElementById("screen");
  if(sc){
    sc.scrollTop = 0;
    /* 内容高出可见区时，明确告诉玩家屏内还能继续滚，不是句子被裁掉了 */
    var shell = sc.closest ? sc.closest(".phone") : null;
    if(shell) shell.classList.toggle("scrollable", sc.scrollHeight > sc.clientHeight + 8);
  }
  renderModal();
}

var motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
function renderSelect(){ location.assign("index.html"); }
function renderScene(spec){
  var scene=R.scene, kind=scene==="A10"?"decision":scene==="A07"?"insert":scene==="A04"?"orient":"evidence";
  var names={A04:"一份周末兼职",A05:"试做的回信",A06:"一组连续任务",A07:"屏幕那头的人",A08:"找同学商量",A09:"换条路问一问",A10:"确认之前"};
  V.innerHTML='<div class="pc-set pc-ch1">'+Theatre.scene(names[scene]||"一份周末兼职",esc(spec.cap.txt))+spec.phone+'</div>';
  function btn(a){return '<button type="button" class="act '+(a.cls||'')+'" data-act="'+esc(a.act)+'"'+(a.act==="noop"?' disabled':'')+'>'+esc(a.label)+'</button>'}
  var acts=spec.actions||[],extra=spec.extra||[]; if(scene==="A04")acts=acts.filter(function(a){return a.act!=="go:A05"});
  V.querySelector(".reply-tray").innerHTML='<div id="actions" class="actions" role="group" aria-label="选择回复或行动">'+acts.map(btn).join("")+'</div>'+
    (extra.length?'<div class="actions">'+extra.map(btn).join("")+'</div>':'')+
    '<div class="aside">'+(spec.aside||[]).map(btn).join("")+'</div>';
  Theatre.bind("1-"+kind,"assets/art/ch1.webp");
}
function renderReview(){
  Theatre.stop();
  const k = endingKey();
  const why = {
    loss:"你确认了 380 元的模拟垫付，没有发生真实扣款。",
    close:"到了要垫付 380 元的时候，你停在了确认之前。",
    verified:"你查过学校发布记录，也打给了原有号码。两边的答复都不支持这份兼职。",
    safe:R.seen.A05?"你看过这条消息，决定先不继续，没有垫钱。":"你结束了这次接触，没有垫钱。"
  }[k];
  const notes = verifiedItems().concat(pendingItems());
  if(R.talked) notes.push("你找同学林嘉商量过。商量和独立核实是两件不同的事。");
  Ending.mount(V, {chapter:1, title:"一份周末兼职", picture:"assets/art/ch1.webp",
    result:ENDINGS[k].name, why, loss:k==="loss", actions:R.choices, notes});
}
function starsFor(k){
  var base = {
    safe: ["想继续时，从学校自己的渠道查一次。"],
    verified: ["从原有的号码确认老师身份。", "小额返利不能证明下一笔任务可靠。"],
    close: ["在下一笔付款前停住。", "跟同学或老师说说已经发生了什么。"],
    loss: ["保留任务消息和演练付款记录。", "先停止继续垫付，找信任的人求助。"]
  }[k].slice(0,3);
  if(R.talked && base.length < 3) base.push("拿不准时，先和可信的人商量。");
  if(base.length < 2 && !R.verify.taskList) base.push("任务有没有发布，去学校就业平台搜一次。");
  return base.slice(0,3);
}
/* =====================================================================
   7. 弹窗
   ===================================================================== */
function renderModal(){
  if(R.modal) Theatre.suspend();
  if(!R.modal){ OVER.hidden = true; MODAL.innerHTML = ""; return; }
  OVER.hidden = false;
  if(R.modal === "info"){
    MODAL.innerHTML =
      '<h2 id="modal-title">演练说明与真实求助</h2>' +
      '<p class="safe">这一页不是剧情内容。演练里所有号码、账号、金额、平台和款项都是虚构的，' +
      '页面不联网、不上传，也不要求填写真实敏感信息。</p>' +
      '<div class="eyebrow" style="margin-top:.8rem">真实世界里可以做的事</div>' +
      '<ul>' +
        '<li>涉及已经发生的转账：拨打 <b>110</b>，并尽快联系银行或支付平台。</li>' +
        '<li>需要反诈咨询与劝阻：<b>96110</b>（全国反诈劝阻专线）。</li>' +
        '<li>校园内的事：先找<b>原本的</b>辅导员、院系办公室或学校保卫处，用你手机里存着的号码，不用对方给的联系方式。</li>' +
        '<li>把消息、通话、任务页和付款记录留好，不删除。</li>' +
      '</ul>' +
      '<div class="row"><button type="button" class="btn primary" data-act="closeModal">知道了</button></div>';
    return;
  }
  if(R.modal === "loss"){
    MODAL.innerHTML =
      '<h2 id="modal-title">你确认了演练中的垫付</h2>' +
      '<p class="safe">本局出现模拟损失。<b>没有发生真实扣款。</b>确认按钮一次只记录一条结果，' +
      '再点多少次都不会多记。</p>' +
      '<div class="eyebrow" style="margin-top:.7rem">本局触发的动作</div>' +
      '<div class="note" style="background:#fff;border:1px solid var(--line);border-radius:.35rem;padding:.4rem .6rem">' +
        ledgerRow("确认垫付（演练）", "-380.00", "minus", "联单任务") +
        ledgerRow("试做返利（剧情预设）", "+8.00", "plus", "不是玩家付款") +
        ledgerRow("确认记录条数", String(R.confirmCount) + " 条") +
      '</div>' +
      '<div class="eyebrow" style="margin-top:.7rem">接下来可以做的事</div>' +
      '<ul><li>停止继续垫付，不要再开第二笔。</li>' +
      '<li>保留任务消息、视频和演练付款记录。</li>' +
      '<li>把已经发生的事告诉一个可信的人。</li></ul>' +
      '<div class="row" style="margin-top:.7rem">' +
        '<button type="button" class="btn" data-act="reviewPay">回看这一步</button>' +
        '<button type="button" class="btn" data-act="helpPost">找人求助</button>' +
        '<button type="button" class="btn primary" data-act="toResult">直接查看本局结果</button>' +
        '<button type="button" class="btn ghost" data-act="exit">退出</button>' +
      '</div>' +
      '<p class="privacy">这一步之后可以直接看结算，不需要再等一段尾声动画。</p>';
  }
}

/* =====================================================================
   8. 导航与动作
   ===================================================================== */
/* ---- 导航 ---- */
function go(scene, opts){
  opts = opts || {};
  var prev = R.scene;
  killSeq();
  Sfx.stopAll();
  if(MAIN[prev]) R.origin = prev;
  if(scene !== "A09") R.sub = "hub";
  if(scene !== "A10") R.payView = "form";
  R.scene = scene;
  GEN++;
  if(MAIN[scene]){
    R.from = null;
  } else {
    var f = opts.from || prev;
    // 分支页只记主线来处，避免 A08↔A09 互相回跳、回不到主线
    R.from = MAIN[f] ? f : R.origin;
  }
  after(scene);
  render();
  focusFirst();
}
function after(scene){
  mark(scene);
  if(scene === "A04" && !R.seen._A04log){
    R.seen._A04log = true;
    rec("info","A04","看到第一条兼职通知（锁屏预览「周末任务招募 · 商品资料整理」）");
  }
  if(scene === "A05" && !R.seen._A05log){
    R.seen._A05log = true;
    rec("info","A05","打开任务聊天，看到试做返利 +8.00（演练预设剧情数据，玩家没有付款）");
  }
  if(scene === "A06" && !R.seen._A06log){
    R.seen._A06log = true;
    rec("info","A06","对方提出连续任务要求先垫付 380.00，并称整组做完才能结算");
  }
  if(scene === "A07") startVideo();
  if(scene === "A08"){
    if(!R.talked){ R.talked = true; rec("help","A08","找了通讯录里原有的同学林嘉商量"); }
  }
  if(scene === "A09" && !R.seen._A09log){
    R.seen._A09log = true;
    rec("info","A09","从手机主屏打开校园服务与学校通讯录（都是学校自己的入口，不是对方给的链接）");
  }
  if(scene === "A10" && !R.enteredPay){
    R.enteredPay = true;
    rec("follow","A10","进入标注「演练」的确认垫付页面 · 记为已跟随");
  }
}
function focusFirst(){
  var b = V.querySelector(".actions .act:not([disabled])") || V.querySelector(".btn");
  if(b && document.activeElement !== b){
    { var title=V.querySelector(".lock-day")||V.querySelector(".appbar b"); if(title){ title.setAttribute("tabindex","-1"); title.focus({preventScroll:true}); var phone=title.closest(".phone"); if(phone && matchMedia("(max-width:920px)").matches && (phone.getBoundingClientRect().top<0 || phone.getBoundingClientRect().top>innerHeight*.42)) phone.scrollIntoView({block:"start"}); return; } }
    try{ b.focus({ preventScroll:false }); }catch(e){ b.focus(); }
  }
}

/* 结算：进入时立刻停掉动画、声音与所有定时器，直接写结果，
   把键盘焦点放到结果标题上；没有强制播放的尾声，也没有第二个计时器。 */
function settle(){
  if(R.enteredPay && R.confirmCount === 0 && !R.seen._cancelled){
    R.seen._cancelled = true;
    rec("info","A10","进入过确认垫付页面，最后退回或结束，没有点确认");
  }
  rec("end", null, "结束本章 · 立即按本局记录判定为「" + ENDINGS[endingKey()].name + "」");
  killSeq(); Sfx.stopAll();
  GEN++;
  R.modal = null;
  R.scene = "review";
  render();
  var h = document.getElementById("result-title");
  if(h){ try{ h.focus({ preventScroll:false }); }catch(e){ h.focus(); } }
  say("本局结果已经算好，写在页面最上面。演练中不会发生任何真实交易。");
}
function updateCaption(txt){
  var el = document.getElementById("cap-txt");
  if(el) el.textContent = txt;
}

/* A07：短句逐条出现，没有人声也没有语音合成。
   系统要求减少动态效果时，一次把整段对白静态列出来。 */
function startVideo(){
  var lines = videoLines();
  if(motionPreference.matches){
    R.videoFrame = lines.length - 1;
    R.seen.A07_video_done = true;
    logVideo("看完了这段无人声的视频：短句逐条列出，画面里的人自称辅导员");
    return;
  }
  R.videoFrame = 0;
  R.seen.A07_video_done = false;
  var items = lines.slice(1).map(function(_, i){
    return { ms: 2200, fn: function(){
      if(R.scene !== "A07" || R.seen.A07_video_done) return;
      R.videoFrame = Math.min(i + 1, lines.length - 1);
      paintVideo();
    }};
  });
  items.push({ ms: 800, fn: function(){
    if(R.scene !== "A07") return;
    R.seen.A07_video_done = true;
    logVideo("看完了这段无人声的视频：画面中的人自称辅导员（只算接收信息，不算已核实）");
    render();
    say("短句已经全部留在画面上，可以再读一遍，然后自己决定下一步。");
  }});
  runSeq(items, null);
  paintVideo();
}
function logVideo(text){
  if(!R.seen._A07log){ R.seen._A07log = true; rec("info","A07",text); }
}
/* 只往列表里追加新的一句，不整页重绘，避免读到的句子被滚回顶部。 */
function paintVideo(){
  if(R.scene !== "A07") return;
  var box = document.getElementById("vlines");
  var lines = videoLines();
  var shown = Math.max(1, Math.min((R.videoFrame||0) + 1, lines.length));
  if(!box){ updateCaption(lines[shown-1].txt); return; }
  var have = box.querySelectorAll(".dm-line").length;
  while(have < shown){
    var p = document.createElement("p");
    p.className = "dm-line"; p.setAttribute("data-i", String(have));
    var b = document.createElement("b"); b.className = "who"; b.textContent = lines[have].who;
    var s = document.createElement("span"); s.textContent = lines[have].txt;
    p.appendChild(b); p.appendChild(s); box.appendChild(p);
    have++;
  }
  var c = document.getElementById("vcount");
  if(c) c.textContent = "第 " + shown + " 条 / 共 " + lines.length + " 条";
  updateCaption(lines[shown-1].txt);
}

/* Use receipts of actions, not the menu labels or events from unvisited branches. */
function choiceReceipt(act) {
  const src=R.scene;
  const mainReturn={A04:"回到了兼职通知",A05:"回到了试做任务的聊天",A06:"回到了连续任务的聊天",A10:"回到了垫付确认页"};
  const receipts={
    "go:A05":"打开了兼职短信，查看试做任务",
    "go:A06":src==="A05"?"查看了下一组连续任务":"回到了连续任务的聊天",
    "go:A07":R.seen.A07?"重新打开了自称辅导员的视频":"打开了对方发来的视频",
    "go:A08":"找同学林嘉商量了这件事",
    "go:A09":"打开了学校自己的渠道，准备核实",
    "go:A10":"查看了需要先垫付 380 元的确认页",
    "sub:jobs":"打开了学校就业平台","sub:contacts":"打开了原有校园通讯录",
    back:mainReturn[R.from||"A04"]||"回到了先前的画面",
    callTeacher:"拨打了通讯录里原有的老师号码",hangup:"在取得答复前挂断了电话",
    answer:"接到了老师的答复",askVideo:"向老师核对了那段视频的来源",
    checkTaskList:"在学校就业平台查过任务发布记录",
    confirmPay:"确认了 380 元的模拟垫付",helpPost:"在模拟付款后找同学商量了后续处理",
    reviewPay:"回看了本局的垫付记录",
    end:src==="A10"&&!R.confirmedPay?"在 380 元确认页取消了垫付":src==="A04"?"放下了这条兼职通知":"决定先停下来，结束了这次接触"
  };
  return receipts[act];
}
/* ---- 动作处理 ---- */
function doAct(act, node){
  if(!act) return;
  if(node && /^A[0-9]{2}$/.test(R.scene) && !(act==="confirmPay" && R.confirmCount>0)){
    const step=choiceReceipt(act);
    if(step) R.choices.push(step);
  }
  Sfx.tap();
  if(act === "noop") return; if(act === "fullscreen"){ if(document.fullscreenElement)leaveBrowserFullscreen();else requestCinemaFullscreen(); return; }

  if(act === "start" || act === "openCh1" || act === "replay"){
    requestCinemaFullscreen();
    startChapter(act === "replay");
    return;
  }
  if(act === "chooseChapter"){ exitToSelect(); return; }
  if(act === "toggleSound"){ btnSound.click(); return; }

  if(act === "home"){ exitToSelect(); return; }
  if(act === "select"){ exitToSelect(); return; }
  if(act === "exit"){ exitToSelect(); return; }
  if(act === "info"){ R.modal = "info"; renderModal(); return; }
  if(act === "closeModal"){ R.modal = null; renderModal(); Theatre.resume(); return; }
  if(act === "toResult"){ R.modal = null; settle(); return; }
  if(act === "end"){ settle(); return; }
  if(act === "back"){
    var f = R.from || "A04";
    R.from = null;
    go(f); return;
  }
  if(/^go:/.test(act)){
    var target = act.slice(3);
    if(["A07","A08","A09"].indexOf(target) >= 0){
      go(target, { from: R.scene });
    } else go(target);
    return;
  }
  if(/^sub:/.test(act)){ R.sub = act.slice(4); GEN++; killSeq(); render(); return; }
  if(act === "callTeacher"){
    R.sub = "calling"; GEN++;
    rec("info","A09","用校园通讯录里原有的号码拨打王老师");
    R.verify.onlyDialed = true;
    render();
    Sfx.ring(GEN);
    return;
  }
  if(act === "hangup"){
    Sfx.stopAll();
    R.sub = "contacts";
    if(!R.verify.teacherReply){
      rec("info","A09","只拨号、没有听到答复 · 该事项仍记为待核实");
      say("没有听到答复，这一项保留待核实。");
    }
    GEN++; render(); return;
  }
  if(act === "answer"){
    Sfx.stopAll();
    R.sub = "reply";
    if(!R.verify.teacherReply){
      R.verify.teacherReply = true;
      rec("verify","A09","老师答复：学校就业平台没有发布这项任务（来源为原有校园号码）");
    }
    GEN++; render(); focusFirst();
    say("已接通，答复已记入本局核实记录。");
    return;
  }
  if(act === "askVideo"){
    R.verify.videoCheck = true;
    rec("verify","A09","老师确认没有发过这段视频");
    render();
    say("视频真伪这一项已经确认，记录写在「已经核实」里。");
    return;
  }
  if(act === "checkTaskList"){
    R.verify.taskList = true;
    rec("verify","A09","在学校就业平台搜索「周末任务招募」：没有找到相关发布");
    render();
    say("发布记录已查，结果记入本局核实。");
    return;
  }
  if(act === "videoSkip"){
    if(SEQ){ SEQ.stop(); SEQ = null; }
    R.seen.A07_video_done = true;
    R.videoFrame = videoLines().length - 1;
    logVideo("跳过了视频，只读了账号来源与全部短句（无人声）");
    GEN++; render(); focusFirst();
    say("已跳过，短句全部列出，与看完时一样。");
    return;
  }
  if(act === "videoPause"){
    togglePause(); return;
  }
  if(act === "confirmPay"){
    if(R.confirmCount > 0){
      say("本局已经确认过一次，弹窗和记录都不会重复。");
      renderModal();
      return;
    }
    R.confirmCount++;
    R.confirmedPay = true;
    R.modal = "loss";
    rec("pay","A10","确认了演练中的垫付 380.00 元 · 本局出现模拟损失（没有真实扣款）");
    Sfx.alert();
    render();
    return;
  }
  if(act === "reviewPay"){
    R.payView = "readonly";
    R.modal = null;
    R.scene = "A10";
    GEN++;
    render();
    say("回看模式：只展示已经发生的动作，不再提供确认按钮。");
    return;
  }
  if(act === "lossModal"){ R.modal = "loss"; R.payView = "form"; render(); return; }
  if(act === "helpPost"){
    R.helpMode = "post";
    R.modal = null;
    R.scene = "A08";
    R.from = R.origin || "A10";
    GEN++; killSeq(); Sfx.stopAll();
    R.talked = true;
    mark("A08");
    if(!R.seen._postHelp){ R.seen._postHelp = true; rec("help","A08","模拟损失之后向同学说明，一起整理已经发生的记录"); }
    render(); focusFirst();
    return;
  }
  if(act === "showLog"){
    R.modal = null;
    var rows = R.log.map(function(x){
      return '<li>' + esc((x.scene ? x.scene + " · " : "") + x.text) + '</li>';
    }).join("");
    MODAL.innerHTML = '<h2 id="modal-title">本局记录</h2><ul>' + rows + '</ul>' +
      '<div class="row"><button type="button" class="btn primary" data-act="lossModal">回到结算</button></div>';
    OVER.hidden = false;
    return;
  }
  if(act === "copyStars"){ copyStars(); return; }
}

function exitToSelect(){
  leaveCinemaFullscreen();
  killSeq();
  Sfx.stopAll();
  GEN++;
  R = freshRound();
  R.scene = "select";
  render();
  say("已退出到章节选择。所有声音已停止，上一局记录已清空。");
}
function togglePause(){
  if(!SEQ){ say("当前没有正在播放的镜头，不需要暂停。你可以直接选择下面的操作。"); return; }
  if(SEQ.paused){
    SEQ.resume();
    Sfx.unlock();
    render();
    say("已从原处继续。");
  } else {
    SEQ.pause();
    Sfx.stopAll();
    render();
    say("已暂停，声音已停止，可从原处继续。");
  }
}

/* 开场与浏览器全屏都由开始按钮触发，拒绝全屏时照常播放。 */
var cinemaFullscreenTicket = 0;
var ownsCinemaFullscreen = false;
function requestCinemaFullscreen(){
  var page = document.documentElement;
  if(document.fullscreenElement || !page.requestFullscreen) return;
  var ticket = ++cinemaFullscreenTicket;
  try{
    Promise.resolve(page.requestFullscreen()).then(function(){
      if(document.fullscreenElement !== page) return;
      if(ticket !== cinemaFullscreenTicket){ leaveBrowserFullscreen(); return; }
      ownsCinemaFullscreen = true;
    }).catch(function(){ /* CSS 舞台仍填满网页视口。 */ });
  }catch(e){ /* 浏览器拒绝时仍可进入。 */ }
}
function leaveBrowserFullscreen(){
  if(document.exitFullscreen && document.fullscreenElement === document.documentElement){
    try{ Promise.resolve(document.exitFullscreen()).catch(function(){}); }catch(e){}
  }
}
function leaveCinemaFullscreen(){
  cinemaFullscreenTicket++;
  if(ownsCinemaFullscreen) leaveBrowserFullscreen();
  ownsCinemaFullscreen = false;
}

function startChapter(announceReplay){
  Theatre.stop(); killSeq(); Sfx.stopAll(); R=freshRound(); GEN++;
  go("A04");
  say(announceReplay?"已重新开始。":"已进入大学生的故事。");
}

/* 复制提醒 */
function copyStars(){
  var k = endingKey();
  var txt = "防骗预演 ·《一份周末兼职》本局提醒（" + ENDINGS[k].name + "）\n" +
    starsFor(k).map(function(s){ return "★ " + s; }).join("\n") +
    "\n（反诈演练，无真实交易）";
  var note = document.getElementById("copy-note");
  function done(ok){
    if(note) note.textContent = ok ? "已复制本局提醒，可以直接发给家人或同学。" : "这个浏览器不允许直接复制。请长按选中上面的提醒后复制。";
  }
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(txt).then(function(){ done(true); }, function(){ fallback(); });
  } else fallback();
  function fallback(){
    try{
      var ta = document.createElement("textarea");
      ta.value = txt; ta.setAttribute("readonly","");
      ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      done(ok);
    }catch(e){ done(false); }
  }
}

/* =====================================================================
   9. 绑定
   ===================================================================== */
document.addEventListener("click", function(ev){
  var node = ev.target.closest ? ev.target.closest("[data-act]") : null;
  if(!node) return;
  doAct(node.getAttribute("data-act"), node);
});
document.addEventListener("keydown", function(ev){
  if(ev.altKey || ev.ctrlKey || ev.metaKey) return;
  if(/^[1-4]$/.test(ev.key)){
    var list = V.querySelectorAll(".actions .act:not([disabled])");
    var b = list[parseInt(ev.key,10)-1];
    if(b && b.getClientRects().length){ ev.preventDefault(); b.click(); }
  } else if(ev.key === "m" || ev.key === "M"){
    btnSound.click();
  }
});
btnSound.addEventListener("click", function(){
  var on = btnSound.getAttribute("data-on") === "true";
  btnSound.setAttribute("data-on", on ? "false" : "true");
  btnSound.textContent = on ? "声音：关（静音）" : "声音：开";
  Sfx.setMuted(on);
  if(!on) Sfx.unlock();
});
btnPause.addEventListener("click", function(){ togglePause(); });
document.getElementById("btn-exit").addEventListener("click", function(){ exitToSelect(); });
document.getElementById("btn-info").addEventListener("click", function(){ R.modal = "info"; renderModal(); Theatre.suspend(); });

/* 首次交互解锁音频 */
["pointerdown","keydown"].forEach(function(t){
  window.addEventListener(t, function once(){ Sfx.unlock(); window.removeEventListener(t, once); }, { once:true });
});
window.addEventListener("pagehide", function(){ killSeq(); Sfx.stopAll(); });

R.scene = "home";
if(new URLSearchParams(location.search).get("play") === "1"){ startChapter(false); } else { location.replace("index.html"); }
say("防骗预演 · 第一章样片。双击即可离线打开，演练中不会发生任何真实交易。");
})();
