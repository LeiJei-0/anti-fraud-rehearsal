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
  var ctx = null, master = null, noise = null, muted = false, alive = 0;
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
  function noiseLoop(kind, peak, gen){
    var c = ensure(); if(!c || muted) return;
    if(!noise){
      noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      var d = noise.getChannelData(0);
      for(var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    }
    var src = c.createBufferSource();
    src.buffer = noise; src.loop = true;
    var f = c.createBiquadFilter();
    f.type = kind === "tv" ? "lowpass" : "bandpass";
    f.frequency.value = kind === "tv" ? 620 : 1400;
    var g = c.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(peak, c.currentTime + 0.4);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    var tok = ++alive;
    (function guard(){
      if(gen !== GEN || tok !== alive || muted){
        try{ g.gain.linearRampToValueAtTime(0, c.currentTime + 0.12); src.stop(c.currentTime + 0.2); }catch(e){}
        return;
      }
      setTimeout(guard, 250);
    })();
  }
  return {
    unlock: unlock,
    isMuted: function(){ return muted; },
    setMuted: function(m){
      muted = m;
      if(master) master.gain.value = m ? 0 : 0.85;
      if(m) this.stopAll();
    },
    /* 亮屏提示音：只响一次 */
    ping: function(gen){ if(gen !== GEN) return; beep(1180, 880, 0.16, "triangle", 0.16); beep(880, 660, 0.2, "sine", 0.1, 0.14); },
    tick: function(gen){ if(gen !== GEN) return; beep(2400, 1500, 0.06, "triangle", 0.05); },
    tap: function(){ beep(520, 620, 0.05, "square", 0.05); },
    soft: function(){ beep(320, 240, 0.22, "sine", 0.09); },
    alert: function(){ beep(300, 180, 0.5, "sawtooth", 0.1); },
    tv: function(gen){ noiseLoop("tv", 0.022, gen); },
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
    modal: null,       // 'loss' | 'info'
    payView: "form",   // form | readonly
    sub: "hub",        // A09 子页
    openingStage: "opening1",
    endingSkipped: false
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
  loss:     { name:"出现模拟损失", cue:"你确认了演练中的垫付", tone:"bad" },
  close:    { name:"有惊无险", cue:"你在确认前停下", tone:"mid" },
  verified: { name:"及时核实", cue:"你用校园渠道取得了答复", tone:"ok" },
  safe:     { name:"安全离开", cue:"你停止了这次接触", tone:"mid" }
};

/* =====================================================================
   3. 分层场景（SVG）
   ===================================================================== */
/* 镜头预设：把用户坐标 (fx,fy) 居中到 viewBox 中心 (450,310)，
   偏移量 = 中心 - 焦点 × 缩放 */
function camAt(s, fx, fy){ return "translate(" + (450 - fx*s).toFixed(1) + "px," + (310 - fy*s).toFixed(1) + "px) scale(" + s + ")"; }
var CAM = {
  wide:    camAt(1, 450, 310),
  table:   camAt(2.15, 712, 426),   // A02 茶几上的手机亮起
  pickup:  camAt(2.5, 716, 424),    // A03 手拿起手机
  mid:     camAt(1.32, 448, 380),   // 主线中景：人物 + 沙发 + 茶几
  close:   camAt(1.5, 330, 356),    // 求助：两个人物
  dim:     camAt(1.28, 404, 356)    // 看视频 / 垫付：人物压暗
};
function stageSVG(mode){
  var cam = CAM.wide;
  if(mode === "opening2") cam = CAM.table;
  else if(mode === "opening3") cam = CAM.pickup;
  else if(mode === "play") cam = CAM.mid;
  else if(mode === "help") cam = CAM.close;
  else if(mode === "video") cam = CAM.dim;
  else if(mode === "pay") cam = CAM.dim;
  else if(mode === "end-safe") cam = CAM.table;
  else if(mode === "end-verified") cam = CAM.close;
  else if(mode === "end-close") cam = CAM.pickup;
  else if(mode === "end-loss") cam = CAM.mid;

  var lit = (mode === "opening2" || mode === "opening3") ? 1 : (mode === "play" || mode === "help" ? .85 : 0);
  var notif = (mode === "opening2" || mode === "opening3") ? 1 : 0;
  var hand = (mode === "opening3" || mode === "end-close") ? 1 : 0;
  var mate = (mode === "help") ? 1 : 0;
  var dim = (mode === "video" || mode === "pay" || mode === "end-loss") ? .45 : 0;
  var tv = (mode === "end-loss") ? .1 : .8;

  return '' +
  '<svg id="stage" viewBox="0 0 900 620" preserveAspectRatio="xMidYMid slice" role="img" ' +
  'aria-label="现代中式客厅：学生坐在沙发上看电视，茶几上有翻开的课表和一部手机">' +
  '<defs>' +
    '<linearGradient id="gwall" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#efe4cf"/><stop offset="1" stop-color="#ddceae"/></linearGradient>' +
    '<linearGradient id="gfloor" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8b6b45"/><stop offset="1" stop-color="#6d5133"/></linearGradient>' +
    '<radialGradient id="gtv" cx=".5" cy=".5" r=".75">' +
      '<stop offset="0" stop-color="#cfe6f2" stop-opacity=".95"/><stop offset="1" stop-color="#5c7f92" stop-opacity=".25"/></radialGradient>' +
    '<radialGradient id="glow" cx=".5" cy=".5" r=".6">' +
      '<stop offset="0" stop-color="#ffe9a8" stop-opacity="' + (0.55*(mode === 'wide' ? 1 : lit)) + '"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>' +
  '</defs>' +
  '<g id="cam" style="transform:' + cam + ';transform-origin:0 0;transform-box:view-box;' +
     'transition:transform 1.5s cubic-bezier(.36,0,.2,1)">' +

    /* 墙、地面 */
    '<rect x="0" y="0" width="900" height="430" fill="url(#gwall)"/>' +
    '<rect x="0" y="418" width="900" height="202" fill="url(#gfloor)"/>' +
    '<g stroke="#7d5f3d" stroke-width="1" opacity=".45">' +
      '<line x1="0" y1="470" x2="900" y2="452"/><line x1="0" y1="520" x2="900" y2="492"/>' +
      '<line x1="0" y1="575" x2="900" y2="540"/></g>' +

    /* 中式格栅窗 */
    '<g opacity=".9"><rect x="46" y="60" width="188" height="210" fill="#cfe0e4" stroke="#6e5335" stroke-width="7"/>' +
    '<g stroke="#6e5335" stroke-width="4">' +
      '<line x1="109" y1="60" x2="109" y2="270"/><line x1="172" y1="60" x2="172" y2="270"/>' +
      '<line x1="46" y1="130" x2="234" y2="130"/><line x1="46" y1="200" x2="234" y2="200"/></g>' +
    '<rect x="46" y="60" width="188" height="210" fill="none" stroke="#a98b5e" stroke-width="2"/></g>' +

    /* 挂轴 + 兰草 */
    '<g><rect x="300" y="42" width="112" height="212" fill="#f7f1e2" stroke="#b8a681" stroke-width="2"/>' +
    '<rect x="296" y="36" width="120" height="12" fill="#6e5335" rx="3"/>' +
    '<rect x="296" y="248" width="120" height="12" fill="#6e5335" rx="3"/>' +
    '<g stroke="#3f5f4c" stroke-width="3" fill="none" stroke-linecap="round">' +
      '<path d="M342 214 C 336 176, 348 148, 366 122"/><path d="M342 214 C 350 182, 340 158, 322 136"/>' +
      '<path d="M344 212 C 356 196, 376 190, 392 192"/></g>' +
    '<circle cx="384" cy="70" r="12" fill="#9d2f26" opacity=".85"/></g>' +

    /* 电视与矮柜 */
    '<g><rect x="470" y="252" width="360" height="96" fill="#7a5a38" rx="6"/>' +
      '<rect x="486" y="270" width="150" height="60" fill="#6a4c2e" rx="4"/>' +
      '<rect x="660" y="270" width="150" height="60" fill="#6a4c2e" rx="4"/>' +
      '<rect x="536" y="106" width="252" height="148" fill="#15171b" rx="7"/>' +
      '<rect x="546" y="115" width="232" height="130" fill="url(#gtv)" opacity="' + tv + '">' +
        '<animate attributeName="opacity" values="' + tv + ';' + (tv*0.82) + ';' + tv + ';' + (tv*0.9) + ';' + tv +
        '" dur="3.4s" repeatCount="indefinite"/></rect>' +
      '<g opacity="' + (tv*0.7) + '"><rect x="574" y="150" width="176" height="10" fill="#eef6fa" rx="5"/>' +
        '<rect x="574" y="176" width="120" height="10" fill="#eef6fa" rx="5"/></g>' +
      '<rect x="646" y="254" width="32" height="10" fill="#2a2b30"/></g>' +

    /* 沙发 */
    '<g><rect x="196" y="326" width="330" height="126" fill="#4b5f6b" rx="18"/>' +
      '<rect x="176" y="368" width="370" height="92" fill="#5b7280" rx="18"/>' +
      '<rect x="196" y="336" width="120" height="56" fill="#6d8794" rx="12" opacity=".7"/>' +
      '<rect x="320" y="336" width="120" height="56" fill="#617c8a" rx="12" opacity=".7"/>' +
      '<rect x="188" y="452" width="22" height="26" fill="#3b2a1b" rx="4"/>' +
      '<rect x="512" y="452" width="22" height="26" fill="#3b2a1b" rx="4"/></g>' +

    /* 人物剪影（坐着，膝旁课表） */
    '<g class="person" fill="#2b2f38">' +
      '<ellipse cx="404" cy="288" rx="30" ry="32"/>' +
      '<path d="M362 400 C 358 342, 372 320, 404 318 C 438 320, 452 344, 450 400 Z"/>' +
      '<path d="M444 350 C 470 356, 482 378, 480 402 L 452 404 Z" opacity=".95"/>' +
      '<rect x="356" y="396" width="106" height="26" rx="12" fill="#232730"/>' +
      '<path d="M348 300 C 336 274, 352 254, 372 258 C 368 272, 372 288, 380 300 Z" fill="#20242b"/></g>' +
    /* 课表 */
    '<g><rect x="452" y="404" width="76" height="52" fill="#f6f0df" stroke="#c3b48f" stroke-width="2" transform="rotate(-7 490 430)"/>' +
      '<g stroke="#a99a76" stroke-width="2" transform="rotate(-7 490 430)">' +
        '<line x1="460" y1="418" x2="520" y2="418"/><line x1="460" y1="430" x2="520" y2="430"/>' +
        '<line x1="460" y1="442" x2="506" y2="442"/></g></g>' +

    /* 同学（求助时出现） */
    '<g class="mate" opacity="' + mate + '" fill="#3a4750">' +
      '<ellipse cx="248" cy="300" rx="27" ry="29"/>' +
      '<path d="M210 404 C 208 350, 220 330, 248 328 C 278 330, 290 352, 288 404 Z"/>' +
      '<rect x="206" y="400" width="88" height="24" rx="11"/></g>' +

    /* 茶几 + 手机 */
    '<g><rect x="588" y="392" width="272" height="26" fill="#8a6640" rx="7"/>' +
      '<rect x="606" y="418" width="18" height="86" fill="#6f5131"/>' +
      '<rect x="824" y="418" width="18" height="86" fill="#6f5131"/>' +
      '<ellipse cx="742" cy="404" rx="132" ry="16" fill="#a37d4f" opacity=".55"/>' +
      /* 手机 */
      '<circle class="phone-glow" opacity="' + lit + '" cx="712" cy="378" r="86" fill="url(#glow)"/>' +
      '<g class="stage-phone"><g transform="translate(668,338) rotate(-4)">' +
        '<rect x="0" y="0" width="88" height="176" rx="14" fill="#1a1c21" stroke="#4c4f57" stroke-width="2"/>' +
        '<rect class="stage-display" x="5" y="6" width="78" height="164" rx="9" fill="' + (lit ? "#eef2f7" : "#22242a") + '"/>' +
        '<g class="stage-notice" opacity="' + (lit ? 1 : 0) + '"><rect x="12" y="14" width="64" height="7" rx="3.5" fill="#b9c0cb" opacity=".85"/>' +
               '<rect x="10" y="28" width="68" height="52" rx="6" fill="#ffffff" stroke="#c4cad3"/>' +
               '<text x="15" y="41" font-size="8.5" fill="#2f353d" font-family="serif">周末任务招募</text>' +
               '<text x="15" y="52" font-size="6.4" fill="#5c6774" font-family="serif">商品资料整理 · 日结</text>' +
               '<text x="15" y="62" font-size="5.6" fill="#8b93a0" font-family="serif">短信 · 陌生号码 · 15:12</text>' +
               '<rect x="10" y="86" width="68" height="9" rx="4.5" fill="#dfe4ea"/>' +
               '<rect x="10" y="99" width="46" height="9" rx="4.5" fill="#e7ebf0"/></g>' +
      '</g></g></g>' +

    /* 手（拿起手机 / 结尾放下） */
    '<g class="hand" opacity="' + hand + '" fill="#d8ac83" stroke="#b98d63" stroke-width="2">' +
      '<path d="M900 560 C 830 520, 790 470, 762 420 C 750 398, 762 384, 778 396 C 792 408, 806 428, 820 448 ' +
      'C 850 492, 880 520, 900 534 Z"/>' +
      '<g transform="translate(750,379) rotate(-10)">' +
        '<rect x="0" y="0" width="17" height="58" rx="8"/>' +
        '<rect x="16" y="-6" width="16" height="60" rx="8"/>' +
        '<rect x="32" y="0" width="15" height="56" rx="8"/>' +
        '<rect x="46" y="10" width="14" height="46" rx="7"/></g></g>' +

    /* 绿植 */
    '<g><rect x="828" y="330" width="46" height="62" fill="#9c5b34" rx="5"/>' +
      '<g stroke="#3f6b52" stroke-width="6" fill="none" stroke-linecap="round">' +
        '<path d="M851 330 C 838 300, 842 274, 858 254"/><path d="M851 330 C 866 306, 884 296, 896 296"/>' +
        '<path d="M851 330 C 836 316, 818 314, 806 320"/></g></g>' +

    /* 整体压暗（看视频 / 垫付时） */
    '<rect x="-900" y="-620" width="2700" height="1860" fill="#140f0a" opacity="' + dim + '" pointer-events="none"/>' +
  '</g></svg>';
}

/* 视频分支用：原创角色静帧（无实拍、无人声，素材待补） */
function frameSVG(i){
  var shots = [
    { bg1:"#4a5f6e", bg2:"#2b3a45", zoom:1,    x:0,   y:0,  label:"中景 · 办公室里的人" },
    { bg1:"#54687a", bg2:"#2f3f4a", zoom:1.25, x:-40, y:-25, label:"近景 · 对方开口" },
    { bg1:"#3f505c", bg2:"#26333c", zoom:1.05, x:20,  y:-10, label:"特写 · 屏幕上的转账说法" },
    { bg1:"#4d5f6b", bg2:"#2a3740", zoom:1.15, x:-15, y:5,   label:"中景 · 对方催促" }
  ];
  var s = shots[i % 4];
  return '<svg viewBox="0 0 410 300" role="img" aria-label="原创角色静帧：画面中的人自称辅导员">' +
    '<defs><linearGradient id="vbg' + i + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + s.bg1 + '"/><stop offset="1" stop-color="' + s.bg2 + '"/></linearGradient></defs>' +
    '<rect width="410" height="300" fill="url(#vbg' + i + ')"/>' +
    '<g transform="translate(' + s.x + ',' + s.y + ') scale(' + s.zoom + ')" style="transform-origin:205px 170px">' +
      '<rect x="26" y="40" width="96" height="120" fill="#cfe0e6" opacity=".35" rx="4"/>' +
      '<g stroke="#22303a" stroke-width="3" opacity=".5"><line x1="74" y1="40" x2="74" y2="160"/><line x1="26" y1="100" x2="122" y2="100"/></g>' +
      '<rect x="250" y="150" width="150" height="12" fill="#8a6b47" opacity=".6" rx="4"/>' +
      '<ellipse cx="212" cy="128" rx="40" ry="44" fill="#e0c3a0"/>' +
      '<path d="M172 118 C 170 88, 196 78, 214 80 C 236 82, 254 96, 252 122 C 244 108, 232 100, 212 100 C 194 100, 180 106, 172 118 Z" fill="#242a31"/>' +
      '<g fill="#2c333b"><circle cx="198" cy="128" r="4"/><circle cx="228" cy="128" r="4"/></g>' +
      '<path d="M200 148 C 208 154, 220 154, 228 148" stroke="#8c5b46" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M148 300 C 146 226, 172 196, 212 194 C 254 196, 280 226, 278 300 Z" fill="#9fb4c4"/>' +
      '<path d="M212 194 L 196 236 L 212 300 L 228 236 Z" fill="#8aa2b3" opacity=".8"/>' +
      '<rect x="150" y="252" width="128" height="34" fill="#7c5c3c" opacity=".55" rx="4"/>' +
    '</g>' +
    '<rect x="0" y="0" width="410" height="26" fill="rgba(12,10,8,.72)"/>' +
    '<text x="10" y="19" fill="#f6ecd8" font-size="14">视频通话 · 陌生账号</text>' +
    '<text x="400" y="19" text-anchor="end" fill="#f6ecd8" font-size="12">' + esc(s.label) + '</text>' +
    '<rect x="0" y="274" width="410" height="26" fill="rgba(12,10,8,.72)"/>' +
    '<text x="10" y="292" fill="#f6ecd8" font-size="12">原创角色静帧 ' + (i+1) + '/4 · 人声配音待补 · 字幕可独立阅读</text>' +
  '</svg>';
}

/* =====================================================================
   4. 手机内的页面片段
   ===================================================================== */
function statusbar(t){
  return '<div class="statusbar"><span>' + (t || "周六 15:12") + '</span><span>演练网络 · 无真实连接</span></div>';
}
function phoneShell(inner, title){
  return '<div class="phone" role="group" aria-label="模拟手机">' +
    '<div class="notch"></div>' + statusbar() +
    '<div class="screen" id="screen">' + (title ? '<div class="appbar"><b>' + title + '</b><span class="tag">演练</span></div>' : '') + inner + '</div></div>';
}
function bubble(who, text, out){
  return '<div class="msg ' + (out ? "out" : "in") + '"><div class="who">' + esc(who) + '</div><p>' + esc(text) + '</p></div>';
}
function notifCard(){
  return '<div class="note"><h4>周末任务招募 · 商品资料整理</h4>' +
    '<div class="kv"><span>来源</span><b>陌生号码 · 短信</b></div>' +
    '<div class="kv"><span>说明</span><b>日结 · 线上可做</b></div>' +
    '<div class="kv"><span>时间</span><b>周六 15:12</b></div></div>';
}
function ledgerRow(label, val, cls, note){
  return '<div class="kv"><span>' + esc(label) + (note ? '<span class="r"> · ' + esc(note) + '</span>' : '') +
    '</span><b class="' + (cls||"") + '">' + esc(val) + '</b></div>';
}
function tiles(list){
  return '<div class="tiles">' + list.map(function(t){
    return '<button type="button" class="tile ' + (t.cls||"a") + '" data-act="' + esc(t.act) + '">' + esc(t.label) + '</button>';
  }).join("") + '</div>';
}

/* =====================================================================
   5. 镜头内容
   ===================================================================== */
function sceneName(){
  var m = {
    opening:"开场 A01–A03", A04:"A04 · 第一条通知", A05:"A05 · 看到试做返利", A06:"A06 · 连续任务",
    A07:"A07 · 自称辅导员的视频", A08:"A08 · 找同学商量", A09:"A09 · 校园渠道核实",
    A10:"A10 · 垫付确认（演练）", ending:"结尾", review:"本局复盘"
  };
  return m[R.scene] || "演练";
}
function currentSpec(){
  switch(R.scene){
    case "A04": return specA04();
    case "A05": return specA05();
    case "A06": return specA06();
    case "A07": return specA07();
    case "A08": return specA08();
    case "A09": return specA09();
    case "A10": return specA10();
    case "ending": return specEnding();
    default: return null;
  }
}

function specA04(){
  return {
    stage: "opening3",
    cap: { who:"旁白", txt:"周末下午。你正想找一份兼职补贴生活费，手机里来了一条通知。",
           cue:"两个选择都可以，慢慢读。随时能退出。" },
    phone: phoneShell(
      notifCard() +
      '<div class="note"><b>锁屏预览</b><div class="kv"><span>短信</span><b>收到 1 条</b></div>' +
      '<div class="hint">演练提示：现在还没有打开聊天，也没有任何付款动作。</div></div>',
      "第一条通知"),
    actions: [
      { label:"先放一放", sub:"不打开，结束这次接触", cls:"leave", act:"end" },
      { label:"打开看看", sub:"进入任务聊天", cls:"stay", act:"go:A05" }
    ],
    aside: [ { label:"找人商量", act:"go:A08" }, { label:"结束本章", act:"end" } ]
  };
}

function specA05(){
  return {
    stage: "play",
    cap: { who:"兼职联系人 小周", txt:"这笔试做的报酬已经到账，你可以看一下。",
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
    cap: { who:"兼职联系人 小周", txt:"下一项是连续任务，要先垫付。页面提示整组做完才能结算。",
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
  var done = R.seen.A07_video_done;
  var vi = Math.max(0, Math.min(R.videoFrame || 0, 3));
  var body =
    '<div class="media"><div id="vframe">' + frameSVG(vi) + '</div>' +
      '<div class="subline" id="vsub">' + esc(videoLines()[vi]) + '</div>' +
      '<div class="bar"><span id="vtime">00:' + ("0" + (3*(vi+1))).slice(-2) + ' / 00:11</span>' +
      '<span class="track"><i id="vbar" style="width:' + (25*(vi+1)) + '%"></i></span>' +
      '<span>' + (done ? "播放结束" : "静帧分镜") + '</span></div></div>' +
    '<div class="note"><b>这是陌生账号发来的视频邀请</b>' +
      '<div class="kv"><span>显示名称</span><b>王老师（新添加）</b></div>' +
      '<div class="kv"><span>号码</span><b>不是校园通讯录里的号码</b></div>' +
      '<div class="hint">字幕是画面中人的自称，不代表身份已经确认。人声配音与实拍素材待补。</div></div>';
  if(!done){
    return {
      stage: "video",
      cap: { who:"自称辅导员的人", txt: videoLines()[R.videoFrame || 0],
             cue:"看完或跳过之后再选下一步。视频播放中也可以暂停或退出。" },
      phone: phoneShell(body, "视频通话"),
      actions: [
        { label:"跳过视频", sub:"直接看这一步能做什么", cls:"stay", act:"videoSkip" }
      ],
      extra: [ { label:"暂停 / 继续播放", act:"videoPause" } ],
      aside: [ { label:"这局先到这里", act:"end" }, { label:"退出", act:"exit" } ]
    };
  }
  return {
    stage: "video",
    cap: { who:"字幕（该账号自称）", txt:"「我是你们辅导员。这个周末任务学校知道，你先看一下对方的通知。」",
           cue:"以上是对方的说法。这一段只算你看到了信息，没有跟进任何付款。" },
    phone: phoneShell(body, "视频通话 · 已结束"),
    actions: [
      { label:"回到任务聊天", sub:"回到看视频之前", cls:"leave", act:"back" },
      { label:"用平时的号码问老师", sub:"从校园通讯录联系", cls:"stay", act:"go:A09" }
    ],
    aside: [ { label:"这局先到这里", act:"end" }, { label:"找人商量", act:"go:A08" } ]
  };
}
function videoLines(){
  return [
    "喂，是我。你那个周末任务我看到了。",
    "我是你们辅导员。这个周末任务学校知道。",
    "你先看一下对方的通知，跟着做完就行。",
    "钱的事不用怕，做完一起退给你。"
  ];
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
      { label:"回到结尾", sub:"保留出现模拟损失的结果", cls:"stay", act:"lossModal" },
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
    '<div class="hint">手机主屏。下面两个都是学校自己的入口，不是对方给的链接。</div>' +
    tiles([
      { label:"校园服务", cls:"b", act:"sub:jobs" },
      { label:"学校通讯录", cls:"a", act:"sub:contacts" },
      { label:"任务聊天", cls:"c", act:"back" },
      { label:"回看那段视频", cls:"d", act: R.seen.A07 ? "go:A07" : "noop" }
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

function specEnding(){
  var k = endingKey();
  var e = ENDING_META[k];
  return {
    stage: e.stage,
    cap: { who:"结尾", txt: e.lines[e.line || 0], cue: R.endingSkipped ? "已跳过结尾动画，进入复盘。" : "结尾可以暂停、跳过或退出。" },
    phone: phoneShell(e.phone, "本局结果"),
    actions: [
      { label:"跳过结尾", sub:"直接进入复盘", cls:"stay", act:"toReview" }
    ],
    aside: [ { label:"暂停 / 继续", act:"pauseSeq" }, { label:"退出", act:"exit" } ]
  };
}
var ENDING_META = {
  safe: { stage:"end-safe", line:0, lines:[
      "手机返回主屏，客厅的电视还开着。",
      "你把课表翻回原处，这条通知没有再点开。",
      "你停止了这次接触。任务来源仍待核实。"],
    phone:'<div class="note"><b>本局做过的关键动作</b><div class="hint">没有进入垫付确认页，也没有完成核实。</div></div>' },
  verified: { stage:"end-verified", line:0, lines:[
      "手机里留着校园渠道的答复。",
      "你给同学林嘉回了一条消息。",
      "你用学校的联系方式核实了任务。"],
    phone:'<div class="note"><b>已核实</b><div class="hint">答复来自校园通讯录里原有的号码与学校就业平台。</div></div>' },
  close: { stage:"end-close", line:0, lines:[
      "垫付页面收起来了。",
      "手把手机放回桌面，屏幕还亮着。",
      "你看过垫付要求，在确认前停下。"],
    phone:'<div class="note"><b>停下在哪一步</b><div class="hint">进入了标注演练的确认页，没有点确认。</div></div>' },
  loss: { stage:"end-loss", line:0, lines:[
      "确认之后，任务页还挂在屏幕上。",
      "你打开了和同学、老师的对话。",
      "本局出现模拟损失。没有发生真实扣款。"],
    phone:'<div class="note"><b>保留下来的记录</b><div class="hint">任务消息、视频、垫付确认都记在本局里。</div></div>' }
};

/* =====================================================================
   6. 渲染
   ===================================================================== */
function render(){
  document.body.classList.toggle("cinema-active", R.scene === "home" || R.scene === "opening");
  var spec = currentSpec();
  if(R.scene === "home") renderHome();
  else if(R.scene === "select") renderSelect();
  else if(R.scene === "opening") renderOpening();
  else if(R.scene === "review") renderReview();
  else if(spec) renderScene(spec);
  else { R.scene = "select"; renderSelect(); return; }
  btnPause.hidden = !(R.scene === "opening" || R.scene === "A07" || R.scene === "ending");
  btnPause.textContent = (SEQ && SEQ.paused) ? "继续" : "暂停";
  var sc = document.getElementById("screen");
  if(sc) sc.scrollTop = 0;
  renderModal();
}

var motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
var forceFullMotion = false;

function renderHome(){
  V.innerHTML = '<section id="cinema" class="cinema cinema-guide" aria-label="体验引导">' +
    stageSVG("wide") + '<div class="cinema-ui"><div class="guide-copy">' +
    '<p class="guide-label">反诈演练 · 无真实交易</p>' +
    '<h1>防骗预演</h1><p>一个普通的周末，一条新消息。</p>' +
    '<div class="guide-actions"><button type="button" class="btn primary" data-act="start">开始体验</button>' +
    '<button type="button" class="btn cinema-secondary" data-act="chooseChapter">选章节</button></div>' +
    '<div class="guide-links"><button type="button" class="cinema-text" data-act="toggleSound" data-cinema-sound>声音：开</button>' +
    '<button type="button" class="cinema-text" data-act="toggleMotion" aria-pressed="false" hidden>完整动画</button>' +
    '<button type="button" class="cinema-text" data-act="info">演练说明</button></div></div></div></section>';
  paintGuideMotion();
  paintCinemaSound();
}

function paintGuideMotion(){
  var button = V.querySelector('[data-act="toggleMotion"]');
  button.hidden = !motionPreference.matches;
  button.setAttribute('aria-pressed', String(forceFullMotion));
  var stage = V.querySelector('#stage');
  if(motionPreference.matches && !forceFullMotion) stage.pauseAnimations();
  else stage.unpauseAnimations();
}

function renderSelect(){
  var cover = function(txt){
    return '<svg class="ch-cover" viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect width="300" height="90" fill="#ded0b3"/><rect x="14" y="16" width="86" height="58" rx="6" fill="#8d6b45"/>' +
      '<rect x="22" y="24" width="70" height="42" rx="4" fill="#f3ead6"/>' +
      '<circle cx="200" cy="46" r="24" fill="#4b5f6b"/><rect x="176" y="60" width="48" height="24" rx="10" fill="#3c4c56"/>' +
      '<text x="252" y="56" font-size="34" fill="#9d2f26">' + txt + '</text></svg>';
  };
  V.innerHTML =
  '<div class="card"><div class="eyebrow">选择案件 · 演练中只显示生活化的标题</div>' +
    '<h2 class="title-xl" style="font-size:1.5rem">选择一章开始</h2>' +
    '<p class="lede">开场和演练画面只给当事人此刻能看到的信息，具体骗术名称留到复盘揭示。</p></div>' +
  '<div class="card"><div class="chapters">' +
    '<button type="button" class="chapter" data-act="openCh1">' + cover("兼") +
      '<h3>《一份周末兼职》</h3><span class="who">大学生 · 周末想补贴生活费，收到一条兼职通知</span>' +
      '<span class="who">主线：试做返利与连续任务 · 短分支：自称辅导员的视频</span>' +
      '<span class="flag">可试玩</span></button>' +
    '<button type="button" class="chapter" disabled aria-disabled="true">' + cover("电") +
      '<h3>《一通晚间来电》</h3><span class="who">中年人 · 晚饭后接到常联系的网友来电</span>' +
      '<span class="who">沿用同一套客厅与手机模板</span>' +
      '<span class="flag">待开放</span></button>' +
    '<button type="button" class="chapter" disabled aria-disabled="true">' + cover("讲") +
      '<h3>《群里的一场讲座》</h3><span class="who">老年人 · 群里发来的生活活动邀请</span>' +
      '<span class="who">沿用同一套客厅与手机模板</span>' +
      '<span class="flag">待开放</span></button>' +
  '</div>' +
  '<div class="row" style="margin-top:.8rem">' +
    '<button type="button" class="btn" data-act="home">返回首页</button>' +
    '<button type="button" class="btn ghost" data-act="info">真实求助信息</button>' +
  '</div>' +
  '<p class="privacy">第一章样片：A01–A10 全部镜头、四种结算与复盘。第二、三章尚未制作。</p></div>';
}

function renderOpening(){
  var film = document.getElementById("cinema");
  if(!film){
    V.innerHTML = '<section id="cinema" class="cinema" aria-label="开场动画">' + stageSVG("wide") + '<div class="cinema-ui"></div></section>';
    film = document.getElementById("cinema");
  }
  if(!film.classList.contains("cinema-playing")){
    film.setAttribute("aria-label", "开场动画");
    film.classList.remove("cinema-guide");
    film.querySelector(".cinema-ui").innerHTML =
      '<span class="watermark">演练 · 开场 A01–A03</span>' +
      '<p class="film-caption" id="cap-txt" aria-live="polite">' + openingLine() + '</p>' +
      '<div class="film-controls" aria-label="开场控制">' +
      '<button type="button" class="btn cinema-secondary" data-act="pauseSeq">暂停</button>' +
      '<button type="button" class="btn cinema-secondary" data-act="toggleSound" data-cinema-sound>声音：开</button>' +
      '<button type="button" class="btn cinema-secondary" data-act="skipOpening">跳过开场</button>' +
      '<button type="button" class="btn cinema-secondary" data-act="exit">退出到选章</button></div>';
    film.classList.toggle("cinema-motion-on", forceFullMotion);
    film.classList.add("cinema-playing");
    film.querySelector('[data-act="pauseSeq"]').focus({ preventScroll:true });
  }
  var isPaused = Boolean(SEQ && SEQ.paused);
  film.classList.toggle("cinema-paused", isPaused);
  var stage = film.querySelector('svg');
  if(isPaused || (motionPreference.matches && !forceFullMotion)) stage.pauseAnimations();
  else stage.unpauseAnimations();
  film.querySelector('[data-act="pauseSeq"]').textContent = isPaused ? "继续" : "暂停";
  paintCinemaSound();
}

function showOpeningBeat(beat){
  R.openingStage = beat;
  V.querySelector('.cinema').dataset.beat = beat;
  updateCaption(openingLine());
}

function paintCinemaSound(){
  var button = V.querySelector('[data-cinema-sound]');
  if(button) button.textContent = btnSound.textContent;
}

function openingLine(){
  var s = R.openingStage || "opening1";
  if(s === "opening2") return "手机亮了一下。短信提示音响过一次：「周末任务招募 · 商品资料整理」。";
  if(s === "opening3") return "你伸手拿起手机，镜头推近，锁屏上还是同一条通知。";
  return "周末下午的客厅。电视开着，你坐在沙发上，膝旁是翻开的课表。";
}

function renderScene(spec){
  var acts = spec.actions || [];
  var extra = spec.extra || [];
  var n = 0;
  function btn(a){
    n++;
    return '<button type="button" class="act ' + (a.cls||"") + '" data-act="' + esc(a.act) + '"' +
      (a.act === "noop" ? ' disabled aria-disabled="true"' : '') + '>' +
      '<span>' + n + '. ' + esc(a.label) + '</span>' +
      (a.sub ? '<span class="sub">' + esc(a.sub) + '</span>' : '') + '</button>';
  }
  V.innerHTML =
  '<div class="card" style="padding:.5rem .8rem;box-shadow:none;background:transparent;border:0">' +
    '<span class="eyebrow" style="margin:0">第一章《一份周末兼职》 · ' + esc(sceneName()) + ' · 反诈演练，无真实交易</span></div>' +
  '<div class="layout">' +
    '<div class="stage-wrap" id="stage-wrap">' + stageSVG(spec.stage) +
      '<span class="watermark">演练 · ' + esc(sceneName()) + '</span>' +
      (SEQ && SEQ.paused ? '<span class="paused-flag">已暂停</span>' : '') + '</div>' +
    '<div class="rightcol">' +
      spec.phone +
      '<div class="actions ' + (acts.length === 1 ? "one" : "") + '" id="actions" role="group" aria-label="本幕操作">' +
        acts.map(btn).join("") + '</div>' +
      (extra.length ? '<div class="actions one">' + extra.map(btn).join("") + '</div>' : '') +
      '<div class="aside">' + (spec.aside || []).map(function(a){
          return '<button type="button" class="btn" data-act="' + esc(a.act) + '">' + esc(a.label) + '</button>';
        }).join("") + '</div>' +
    '</div>' +
    '<div class="caption" id="caption" role="region" aria-live="polite">' +
      '<div class="who">' + esc(spec.cap.who) + '</div>' +
      '<div class="txt" id="cap-txt">' + esc(spec.cap.txt) + '</div>' +
      '<div class="cue">' + esc(spec.cap.cue) + '</div></div>' +
  '</div>';
}

function renderReview(){
  var k = endingKey(), e = ENDINGS[k], meta = REVIEW_TEXT[k];
  var done = verifiedItems(), todo = pendingItems();
  var stars = starsFor(k);
  var alts = altBranches();
  var t = (R.log.length ? R.log : [{kind:"info", text:"（本局没有留下操作记录）"}]);
  V.innerHTML =
  '<div class="card"><div class="eyebrow">结束 · 本局复盘</div>' +
    '<div class="result"><h2 class="title-xl" style="font-size:1.5rem">《一份周末兼职》</h2>' +
    '<span class="pill ' + (k==="verified"?"ok":(k==="loss"?"":"mid")) + '">本局结果 · ' + e.name + '</span></div>' +
    '<p class="lede">' + e.cue + '。</p></div>' +

  '<div class="card reveal"><div class="eyebrow">复盘里第一次说明</div>' +
    '<p style="margin:0">' + esc(meta.reveal) + '</p></div>' +

  '<div class="card"><div class="eyebrow">本局实际走过的镜头</div>' +
    '<ul class="timeline">' + t.map(function(x){
      var cls = x.kind === "pay" ? "pay" : (x.kind === "verify" ? "verify" : (x.kind === "help" ? "help" : ""));
      var label = { info:"接收信息", follow:"已跟随", help:"找人商量", verify:"核实", pay:"确认动作", end:"结束" }[x.kind] || x.kind;
      return '<li class="' + cls + '"><span class="k">' + esc(label) + (x.scene ? " · " + esc(x.scene) : "") + '</span>' +
        esc(x.text) + '</li>';
    }).join("") + '</ul></div>' +

  '<div class="card"><div class="grid2">' +
    '<div><div class="eyebrow">已经核实</div><ul class="checklist">' +
      (done.length ? done.map(function(x){ return '<li class="done">' + esc(x) + '</li>'; }).join("")
                   : '<li class="todo">本局没有完成校园渠道核实</li>') + '</ul></div>' +
    '<div><div class="eyebrow">仍待核实</div><ul class="checklist">' +
      (todo.length ? todo.map(function(x){ return '<li class="todo">' + esc(x) + '</li>'; }).join("")
                   : '<li class="done">两条线都查过了</li>') + '</ul></div>' +
  '</div>' +
  '<p class="privacy">「找人商量」和「已核实」分开记录：本局' + (R.talked ? "找过同学商量" : "没有找可信的人商量") +
  '；' + (done.length ? "从校园渠道取得 " + done.length + " 项答复" : "没有取得校园答复") + '。</p></div>' +

  '<div class="card"><div class="eyebrow">本局提醒星 · 每颗对应一个能记住的动作</div>' +
    '<ul class="stars" id="stars">' + stars.map(function(s){
      return '<li><span class="s">★</span>' + esc(s) + '</li>'; }).join("") + '</ul></div>' +

  '<div class="card"><div class="eyebrow">另一个可尝试的分支</div>' +
    '<div class="alt">' + (alts.length
      ? "这一局没有走到的镜头：" + alts.map(esc).join("；") + "。它们只作为可选分支列出，本局结算不使用里面的结论。"
      : "这一局把主要镜头都走了一遍。") + '</div></div>' +

  '<div class="card"><div class="eyebrow">继续</div>' +
    '<div class="row">' +
      '<button type="button" class="btn primary" data-act="copyStars">复制本局提醒</button>' +
      '<button type="button" class="btn" data-act="replay">从头重玩本章</button>' +
      '<button type="button" class="btn" data-act="select">选择其他章</button>' +
      '<button type="button" class="btn ghost" data-act="home">返回首页</button>' +
    '</div>' +
    '<p class="privacy" id="copy-note">复制只在当前网页内进行，不会联网。真实求助信息见顶栏「真实求助」。</p></div>';
}
var REVIEW_TEXT = {
  safe: { reveal:"这一局对应的是「刷单返利」手法的前半段：先用一条看起来像校内兼职的通知接触人。" +
    "你停在打开之前或只看了消息，没有进入标注演练的确认页。" },
  verified: { reveal:"这一局涉及两种手法：用小额返利建立信任的「刷单返利」，以及冒充师长的身份冒充。" +
    "你在跟着要求走之前，用了学校自己的渠道取得答复。" },
  close: { reveal:"这一局你走到了「联单垫付」的确认页。要求先垫钱、整组做完才结算，是刷单返利里让金额加码的一步。" +
    "你在点确认之前停住了。" },
  loss: { reveal:"这一局你确认了演练中的垫付。刷单返利在真实案件里通常是：小额返利到账 → 联单要求加码 → 以「不做完不退」为理由继续收钱。" +
    "本局没有出现真实扣款，损失只是演练记录。" }
};
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
function altBranches(){
  var out = [];
  if(!R.seen.A07) out.push("自称辅导员的视频（A07）· 从任务聊天里问「这是谁发布的」进入");
  if(!R.seen.A08) out.push("找同学商量（A08）· 任何一幕点「找人商量」");
  if(!R.seen.A09) out.push("校园渠道核实（A09）· 从「一起查学校渠道」或「用平时的号码问老师」进入");
  if(!R.seen.A10) out.push("垫付确认页（A10）· 在连续任务那一步点「看看垫付要求」");
  return out;
}

/* =====================================================================
   7. 弹窗
   ===================================================================== */
function renderModal(){
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
      '<div class="eyebrow">本样片的素材状态</div>' +
      '<ul>' +
        '<li>提示音、亮屏反馈：本地实时生成，无外部音频文件。</li>' +
        '<li>人声配音与实拍视频：<b>待补</b>。视频分支目前使用原创角色静帧 + 字幕。</li>' +
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
        '<button type="button" class="btn primary" data-act="toEnding">继续到结尾</button>' +
        '<button type="button" class="btn ghost" data-act="exit">退出</button>' +
      '</div>';
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
    // 不抢走用户在页面别处的焦点，只在本幕切换后可聚焦
    try{ b.focus({ preventScroll:false }); }catch(e){ b.focus(); }
  }
}

function settle(){
  if(R.enteredPay && R.confirmCount === 0 && !R.seen._cancelled){
    R.seen._cancelled = true;
    rec("info","A10","进入过确认垫付页面，最后退回或结束，没有点确认");
  }
  var k = endingKey();
  killSeq(); Sfx.stopAll();
  GEN++;
  R.modal = null;
  R.scene = "ending";
  rec("end", null, "结束本章 · 按本局记录判定为「" + ENDINGS[k].name + "」");
  playEnding();
}
function playEnding(){
  var k = endingKey(), meta = ENDING_META[k];
  meta.line = 0;
  R.endingSkipped = false;
  render();
  updateCaption(meta.lines[0]);
  var items = [
    { ms: 2600, fn: function(){ meta.line = 1; updateCaption(meta.lines[1]); } },
    { ms: 2600, fn: function(){ meta.line = 2; updateCaption(meta.lines[2]); } },
    { ms: 2400, fn: function(){ SEQ = null; toReview(); } }
  ];
  runSeq(items, null);
  if(k === "loss") Sfx.alert();
}
function updateCaption(txt){
  var el = document.getElementById("cap-txt");
  if(el) el.textContent = txt;
}
function toReview(){
  killSeq(); Sfx.stopAll();
  GEN++;
  R.scene = "review";
  R.modal = null;
  render();
  focusFirst();
  say("已进入本局复盘。");
}

function startVideo(){
  R.videoFrame = 0;
  R.seen.A07_video_done = false;
  var items = videoLines().slice(1).map(function(_, i){
    return { ms: 3400, fn: function(){
      if(R.scene !== "A07" || R.seen.A07_video_done) return;
      R.videoFrame = Math.min(i + 1, 3);
      paintVideo();
    }};
  });
  items.push({ ms: 600, fn: function(){
    if(R.scene !== "A07") return;
    R.seen.A07_video_done = true;
    if(!R.seen._A07log){ R.seen._A07log = true; rec("info","A07","看了陌生账号发来的视频：画面中的人自称辅导员（只算接收信息，不算跟随）"); }
    R.videoFrame = 3;
    render();
    say("视频播放结束，字幕与选择仍然保留，等你自己推进。");
  }});
  runSeq(items, null);
  paintVideo();
}
function paintVideo(){
  var f = document.getElementById("vframe"), s = document.getElementById("vsub"),
      bar = document.getElementById("vbar"), t = document.getElementById("vtime");
  var i = Math.max(0, Math.min(R.videoFrame || 0, 3));
  if(f) f.innerHTML = frameSVG(i);
  if(s) s.textContent = videoLines()[i];
  if(bar) bar.style.width = (25*(i+1)) + "%";
  if(t) t.textContent = "00:" + ("0" + (3*(i+1))).slice(-2) + " / 00:11";
  if(R.scene === "A07") updateCaption(videoLines()[i]);
}

/* ---- 动作处理 ---- */
function doAct(act, node){
  if(!act) return;
  Sfx.tap();
  if(act === "noop") return;

  if(act === "start" || act === "openCh1" || act === "replay"){
    if(R.scene === "opening") return;
    requestCinemaFullscreen();
    startChapter(act === "replay");
    return;
  }
  if(act === "chooseChapter"){ go("select"); return; }
  if(act === "toggleMotion" && R.scene === "home"){
    forceFullMotion = !forceFullMotion;
    paintGuideMotion();
    return;
  }
  if(act === "toggleSound"){ btnSound.click(); return; }

  if(act === "home"){ R.modal = null; killSeq(); Sfx.stopAll(); R.scene = "home"; GEN++; render(); return; }
  if(act === "select"){ exitToSelect(); return; }
  if(act === "exit"){ exitToSelect(); return; }
  if(act === "info"){ R.modal = "info"; renderModal(); return; }
  if(act === "closeModal"){ R.modal = null; renderModal(); return; }
  if(act === "skipOpening" && R.scene === "opening"){
    R.openingStage = "opening3";
    R.endingSkipped = false;
    go("A04");
    say("已跳过开场，与播完落到同一个画面，只创建这一条通知。");
    return;
  }
  if(act === "pauseSeq"){ togglePause(); return; }
  if(act === "toEnding"){ R.modal = null; render(); settle(); return; }
  if(act === "toReview"){
    if(SEQ){ SEQ.stop(); SEQ = null; }
    R.endingSkipped = true;
    toReview(); return;
  }
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
    R.videoFrame = 3;
    if(!R.seen._A07log){ R.seen._A07log = true; rec("info","A07","跳过了视频，只看了账号来源信息（陌生账号）"); }
    GEN++; render(); focusFirst();
    say("已跳过视频，选择项与播完时相同。");
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
    if(R.scene === "opening") Sfx.tv(GEN);
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
  killSeq(); Sfx.stopAll();
  GEN++;
  R = freshRound();
  R.scene = "opening";
  R.openingStage = "opening1";
  var gen = GEN;
  Sfx.unlock();
  Sfx.tv(gen);
  runSeq([
    { ms:3000, fn:function(){ showOpeningBeat("opening2"); Sfx.ping(gen); } },
    { ms:3000, fn:function(){ showOpeningBeat("opening3"); Sfx.tick(gen); } },
    { ms:6000, fn:function(){ if(R.scene === "opening") go("A04"); } }
  ], null);
  render();
  say(announceReplay ? "已重开一局，上一局记录已清空。" : "新的一局开始，所有交互均为演练。");
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
    if(b){ ev.preventDefault(); b.click(); }
  } else if(ev.key === "m" || ev.key === "M"){
    btnSound.click();
  }
});
document.querySelectorAll(".seg [data-mode]").forEach(function(b){
  b.addEventListener("click", function(){
    document.querySelectorAll(".seg [data-mode]").forEach(function(x){ x.setAttribute("aria-pressed","false"); });
    b.setAttribute("aria-pressed","true");
    var m = b.getAttribute("data-mode");
    document.documentElement.className = "mode-" + m;
    say("阅读方式：" + ({comfort:"舒适", large:"大字", cast:"投屏"})[m]);
  });
});
btnSound.addEventListener("click", function(){
  var on = btnSound.getAttribute("data-on") === "true";
  btnSound.setAttribute("data-on", on ? "false" : "true");
  btnSound.textContent = on ? "声音：关（静音）" : "声音：开";
  Sfx.setMuted(on);
  if(!on) Sfx.unlock();
  paintCinemaSound();
});
btnPause.addEventListener("click", function(){ togglePause(); });
document.getElementById("btn-exit").addEventListener("click", function(){ exitToSelect(); });
document.getElementById("btn-info").addEventListener("click", function(){ R.modal = "info"; renderModal(); });

/* 首次交互解锁音频 */
["pointerdown","keydown"].forEach(function(t){
  window.addEventListener(t, function once(){ Sfx.unlock(); window.removeEventListener(t, once); }, { once:true });
});
window.addEventListener("pagehide", function(){ killSeq(); Sfx.stopAll(); });

R.scene = "home";
render();
say("防骗预演 · 第一章样片。双击即可离线打开，演练中不会发生任何真实交易。");
})();
