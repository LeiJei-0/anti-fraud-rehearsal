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
/* 镜头预设：把用户坐标 (fx,fy) 居中到 viewBox 中心 (450,310)，
   偏移量 = 中心 - 焦点 × 缩放。下面三个机位与 chapter-1.css 里的
   --a02x/--a02y/--a02s、--a03x/--a03y/--a03s 必须一一对应，
   开场 12 秒运镜收尾时正好落在 CAM.lock，切到 A04 不会跳。 */
function camAt(s, fx, fy){ return "translate(" + (450 - fx*s).toFixed(1) + "px," + (310 - fy*s).toFixed(1) + "px) scale(" + s + ")"; }
var CAM = {
  wide:    camAt(1, 450, 310),     // A01 宿舍全景（引导页与开场起幅共用同一个舞台）
  notify:  camAt(1.55, 545, 215),  // A02 通知亮起、拇指停下（人和手机同框）
  lock:    camAt(2.7, 642, 184),   // A03 肩后靠近同一块屏幕 → A04 停稳
  mid:     camAt(1.25, 520, 258),  // 主线中景：人还在上铺，手机亮着
  help:    camAt(1.5, 505, 250),   // 找人商量
  dim:     camAt(1.45, 560, 245)   // 视频 / 垫付：整体压暗
};
function stageSVG(mode){
  var cam = CAM.wide;
  if(mode === "opening2") cam = CAM.notify;
  else if(mode === "opening3" || mode === "lock") cam = CAM.lock;
  else if(mode === "play") cam = CAM.mid;
  else if(mode === "help") cam = CAM.help;
  else if(mode === "video" || mode === "pay") cam = CAM.dim;

  var lit = (mode === "wide") ? 0 : 1;                                  // 屏幕是否亮着
  var notif = (mode === "opening2" || mode === "opening3" || mode === "lock") ? 1 : 0;
  var lift = (mode === "opening2" || mode === "opening3" || mode === "lock") ? 1 : 0; // 微微挑眉
  var dim = (mode === "video" || mode === "pay") ? .42 : 0;

  return '' +
  '<svg id="stage" viewBox="0 0 900 620" preserveAspectRatio="xMidYMid slice" role="img" ' +
  'aria-label="暖色大学宿舍：周末下午，学生穿白色上衣靠在宿舍上铺的枕头上用手机，上方有床栏，下方是书桌和椅子">' +
  '<defs>' +
    '<linearGradient id="gwall" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#f2e3c9"/><stop offset="1" stop-color="#e0cdaa"/></linearGradient>' +
    '<linearGradient id="gfloor" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#9c7a52"/><stop offset="1" stop-color="#7a5c3c"/></linearGradient>' +
    '<linearGradient id="gsky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#f6e6c0"/><stop offset="1" stop-color="#d8e5ea"/></linearGradient>' +
    '<radialGradient id="glow" cx=".5" cy=".5" r=".6">' +
      '<stop offset="0" stop-color="#ffe9a8" stop-opacity="' + (0.5*lit) + '"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>' +
  '</defs>' +
  '<g id="cam" style="transform:' + cam + ';transform-origin:0 0;transform-box:view-box;' +
     'transition:transform 1.5s cubic-bezier(.36,0,.2,1)">' +

    /* 墙面与地面 */
    '<rect x="0" y="0" width="900" height="470" fill="url(#gwall)"/>' +
    '<rect x="0" y="458" width="900" height="162" fill="url(#gfloor)"/>' +
    '<g stroke="#6f5233" stroke-width="1" opacity=".4">' +
      '<line x1="0" y1="500" x2="900" y2="486"/><line x1="0" y1="548" x2="900" y2="530"/>' +
      '<line x1="0" y1="596" x2="900" y2="576"/></g>' +

    /* 窗与下午的光（周末白天，不出现任何剧情信息） */
    '<g opacity=".95"><rect x="40" y="86" width="200" height="208" fill="url(#gsky)" stroke="#7d6142" stroke-width="7"/>' +
      '<g stroke="#7d6142" stroke-width="4"><line x1="140" y1="86" x2="140" y2="294"/>' +
      '<line x1="40" y1="190" x2="240" y2="190"/></g>' +
      '<circle cx="196" cy="132" r="24" fill="#ffe6ad" opacity=".85"/>' +
      '<path d="M240 82 C 258 150, 254 232, 240 298 L 268 298 C 276 224, 274 152, 266 82 Z" fill="#c8a07a" opacity=".75"/></g>' +
    '<polygon points="244,120 244,286 612,458 706,458" fill="#ffe9bd" opacity=".13"/>' +

    /* 上床下桌：立柱、床架、床垫、被子 */
    '<g><rect x="252" y="122" width="16" height="340" fill="#8a6a45"/>' +
      '<rect x="852" y="122" width="16" height="340" fill="#8a6a45"/>' +
      '<rect x="250" y="300" width="620" height="26" rx="6" fill="#9a7750"/>' +
      '<rect x="258" y="272" width="604" height="30" rx="10" fill="#efe6d4"/>' +
      '<path d="M646 272 C 672 240, 772 234, 858 254 L 858 272 Z" fill="#cbb89a"/>' +
      '<path d="M660 262 C 700 250, 768 248, 852 258" stroke="#b3a184" stroke-width="2.5" fill="none"/>' +
      /* 上床下桌的爬梯，交代「上面是床、下面是桌」 */
      '<g stroke="#8a6a45" stroke-width="8" stroke-linecap="round" fill="none">' +
        '<line x1="792" y1="326" x2="788" y2="466"/><line x1="846" y1="326" x2="848" y2="466"/>' +
        '<line x1="792" y1="366" x2="846" y2="366"/><line x1="791" y1="408" x2="847" y2="408"/>' +
        '<line x1="790" y1="450" x2="848" y2="450"/></g></g>' +

    /* 人：白色上衣，半躺靠在上铺的枕头上，头在左、腿在右 */
    '<g class="person">' +
      '<path d="M330 240 C 330 214, 374 202, 434 210 C 468 215, 470 250, 442 268 L 348 272 C 334 264, 330 252, 330 240 Z" ' +
        'fill="#f8f3e6" stroke="#ded2b8" stroke-width="2"/>' +
      '<path d="M472 240 C 506 234, 556 248, 596 272 L 600 296 L 454 296 C 448 270, 454 248, 472 240 Z" ' +
        'fill="#f4f6f8" stroke="#c6ccd3" stroke-width="2"/>' +
      '<path d="M500 254 C 530 256, 564 266, 592 280 L 594 296 L 520 296 Z" fill="#e4e9ee" opacity=".55"/>' +
      '<path d="M460 228 C 470 232, 478 238, 480 248 L 458 246 Z" fill="#dcae87"/>' +
      '<ellipse cx="452" cy="208" rx="27" ry="29" fill="#e3bd97" stroke="#c99f76" stroke-width="1.6"/>' +
      '<path d="M426 199 C 423 172, 442 160, 459 163 C 478 166, 487 181, 482 201 C 476 184, 462 177, 450 179 C 438 181, 430 189, 426 199 Z" fill="#2b2d33"/>' +
      '<g class="face" fill="#2c2f35"><circle cx="442" cy="209" r="2.8"/><circle cx="466" cy="209" r="2.8"/></g>' +
      '<g class="brow" stroke="#4a4048" stroke-width="2.2" fill="none" stroke-linecap="round" ' +
        'style="transform:translateY(' + (lift ? -2.6 : 0) + 'px);transform-box:fill-box">' +
        '<path d="M435 198 C 439 195, 446 195, 450 198"/><path d="M459 198 C 463 195, 470 195, 474 198"/></g>' +
      '<path d="M447 221 C 454 224, 462 224, 469 221" stroke="#a8735c" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      /* 手臂从肩膀伸到手机下方，袖口单独一块，白色衣袖的浅灰阴影与枕头分开 */
      '<path d="M520 264 C 554 260, 584 242, 604 220 C 616 230, 618 242, 610 252 C 588 274, 556 288, 526 290 Z" ' +
        'fill="#f1f4f7" stroke="#c6ccd3" stroke-width="2"/>' +
      '<path d="M598 216 C 610 212, 622 220, 620 232 L 606 248 C 598 240, 594 226, 598 216 Z" ' +
        'fill="#e6ebf0" stroke="#c6ccd3" stroke-width="1.6"/></g>' +

    /* 上铺床栏（在人的前面，交代空间高低） */
    '<g><rect x="298" y="246" width="404" height="13" rx="6" fill="#a8845c"/>' +
      '<g fill="#94764f"><rect x="330" y="258" width="10" height="44" rx="4"/>' +
      '<rect x="430" y="258" width="10" height="44" rx="4"/><rect x="530" y="258" width="10" height="44" rx="4"/></g></g>' +

    /* 下桌：书桌、椅子、合上的电脑、杯子 */
    '<g><rect x="300" y="418" width="400" height="14" rx="4" fill="#9a7750"/>' +
      '<rect x="306" y="432" width="12" height="42" fill="#7f6042"/><rect x="682" y="432" width="12" height="42" fill="#7f6042"/>' +
      '<rect x="556" y="394" width="88" height="24" rx="3" fill="#3a3f47"/>' +
      '<rect x="562" y="398" width="76" height="16" rx="2" fill="#8fa6b3" opacity=".55"/>' +
      '<rect x="520" y="402" width="18" height="16" rx="3" fill="#a8503c"/>' +
      '<path d="M538 405 C 548 405, 548 415, 538 415" stroke="#a8503c" stroke-width="3" fill="none"/>' +
      '<rect x="428" y="440" width="80" height="12" rx="4" fill="#6d5537"/>' +
      '<rect x="428" y="386" width="12" height="58" rx="5" fill="#6d5537"/>' +
      '<g stroke="#5d4730" stroke-width="5"><line x1="434" y1="452" x2="432" y2="474"/><line x1="504" y1="452" x2="506" y2="474"/></g></g>' +

    /* 手指从手机背后绕过右沿，只在右边露出一点指尖 */
    '<g fill="#d3a67c" stroke="#b98d63" stroke-width="1.4">' +
      '<rect x="662" y="146" width="38" height="15" rx="7.5"/>' +
      '<rect x="664" y="168" width="38" height="15" rx="7.5"/>' +
      '<rect x="662" y="190" width="36" height="15" rx="7.5"/></g>' +

    /* 手机：始终握在手里，通知与 A04 用的是同一条内容 */
    '<circle class="phone-glow" cx="642" cy="184" r="86" fill="url(#glow)" opacity="' + notif + '"/>' +
    '<g class="stage-phone"><g transform="translate(596,96) rotate(-5)">' +
      '<rect x="0" y="0" width="88" height="176" rx="13" fill="#1a1c21" stroke="#4c4f57" stroke-width="2"/>' +
      '<rect class="stage-display" x="5" y="6" width="78" height="164" rx="8" fill="' + (lit ? "#eef2f7" : "#22242a") + '"/>' +
      '<g class="stage-notice" opacity="' + notif + '">' +
        '<rect x="8" y="16" width="72" height="66" rx="6" fill="#ffffff" stroke="#c4cad3" stroke-width="1.2"/>' +
        '<text x="14" y="30" font-size="7" fill="#2f353d" font-family="serif">周末任务招募</text>' +
        '<text x="14" y="42" font-size="5.2" fill="#5c6774" font-family="serif">商品资料整理 · 日结</text>' +
        '<text x="14" y="53" font-size="4.6" fill="#8b93a0" font-family="serif">短信 · 陌生号码</text>' +
        '<rect x="14" y="60" width="54" height="5" rx="2.5" fill="#dfe4ea"/>' +
        '<rect x="14" y="70" width="36" height="5" rx="2.5" fill="#e7ebf0"/></g>' +
      '<g opacity="' + (notif ? 0 : 1) + '" fill="#cfd6de">' +
        '<rect x="12" y="16" width="56" height="6" rx="3"/><rect x="12" y="30" width="40" height="6" rx="3"/>' +
        '<rect x="12" y="44" width="48" height="6" rx="3"/></g>' +
    '</g></g>' +

    /* 手：手掌在手机下沿后面托住，拇指在屏幕前方停在通知下方，
       既不盖文字也不盖按钮。.thumb 外层只给 CSS 动画用，位移仍写在里层。 */
    '<g class="hand" fill="#d8ac83" stroke="#b98d63" stroke-width="1.8">' +
      '<path d="M598 262 C 630 250, 686 252, 704 268 C 710 288, 692 306, 654 308 C 620 308, 600 290, 594 272 Z"/>' +
      '<g class="thumb"><g transform="translate(614,226) rotate(-8)"><rect x="0" y="0" width="15" height="52" rx="7.5"/></g></g></g>' +

    /* 整体压暗（看视频 / 垫付确认时） */
    '<rect x="-900" y="-620" width="2700" height="1860" fill="#140f0a" opacity="' + dim + '" pointer-events="none"/>' +
  '</g></svg>';
}

/* A07 视频画面：原创绘制的人物正面出镜。他说的话不写在画面里，
   而是由下方 .dm 列表带说话人标识逐条出现——没有声音也能读全。 */
function callerSVG(){
  return '<svg id="vchar" viewBox="0 0 410 250" role="img" ' +
    'aria-label="原创绘制的视频画面：一个自称辅导员的人正面出镜，画面没有声音">' +
    '<defs><linearGradient id="vbg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#4d5f6d"/><stop offset="1" stop-color="#2c3a45"/></linearGradient></defs>' +
    '<rect width="410" height="250" fill="url(#vbg)"/>' +
    '<rect x="24" y="34" width="92" height="112" fill="#cfe0e6" opacity=".3" rx="4"/>' +
    '<g stroke="#22303a" stroke-width="3" opacity=".45"><line x1="70" y1="34" x2="70" y2="146"/>' +
      '<line x1="24" y1="90" x2="116" y2="90"/></g>' +
    '<rect x="250" y="150" width="150" height="12" fill="#8a6b47" opacity=".5" rx="4"/>' +
    '<path d="M148 250 C 146 202, 172 178, 212 176 C 254 178, 280 204, 278 250 Z" fill="#eef1f4" stroke="#c6ccd3" stroke-width="2"/>' +
    '<path d="M196 180 L 212 212 L 228 180 Z" fill="#d5dbe1"/>' +
    '<ellipse class="face" cx="212" cy="122" rx="38" ry="42" fill="#e3bd97" stroke="#c99f76" stroke-width="2"/>' +
    '<path d="M174 112 C 172 82, 198 70, 216 72 C 240 74, 256 90, 252 116 C 244 100, 232 92, 212 92 C 194 92, 182 98, 174 112 Z" fill="#2a2f36"/>' +
    '<g fill="#2c333b"><circle cx="198" cy="122" r="3.6"/><circle cx="228" cy="122" r="3.6"/></g>' +
    '<g stroke="#4a4048" stroke-width="2.4" fill="none" stroke-linecap="round">' +
      '<path d="M190 110 C 195 106, 203 106, 208 110"/><path d="M218 110 C 223 106, 231 106, 236 110"/></g>' +
    '<path d="M201 142 C 209 147, 219 147, 227 142" stroke="#8c5b46" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<rect x="0" y="0" width="410" height="26" fill="rgb(12 10 8 / 72%)"/>' +
    '<text x="10" y="18" fill="#f6ecd8" font-size="13">视频通话 · 陌生账号</text>' +
    '<text x="400" y="18" text-anchor="end" fill="#f6ecd8" font-size="12">原创绘制 · 无人声</text>' +
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
function sceneName(){
  var m = {
    opening:"开场 A01–A03", A04:"A04 · 第一条通知", A05:"A05 · 看到试做返利", A06:"A06 · 连续任务",
    A07:"A07 · 自称辅导员的视频", A08:"A08 · 找同学商量", A09:"A09 · 校园渠道核实",
    A10:"A10 · 垫付确认（演练）", review:"本局复盘"
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
    default: return null;
  }
}

function specA04(){
  return {
    stage: "lock",
    cap: { who:"旁白", txt:"周末下午。你想找一份兼职补贴生活费，屏幕上停着一条通知。",
           cue:"两个选择都可以，慢慢读。什么都不点也会一直停在这里。" },
    phone: phoneShell(
      notifCard() +
      '<div class="note"><b>锁屏预览</b><div class="kv"><span>短信</span><b>收到 1 条</b></div>' +
      '<div class="hint">演练提示：现在还没有打开聊天，也没有任何付款动作。</div></div>',
      "第一条通知"),
    actions: [
      { label:"先放一放", sub:"不打开，直接看本局结果", cls:"leave", act:"end" },
      { label:"查看", sub:"打开这条通知里的聊天", cls:"stay", act:"go:A05" }
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
  document.body.classList.toggle("cinema-active", R.scene === "home" || R.scene === "opening");
  var spec = currentSpec();
  if(R.scene === "home") renderHome();
  else if(R.scene === "select") renderSelect();
  else if(R.scene === "opening") renderOpening();
  else if(R.scene === "review") renderReview();
  else if(spec) renderScene(spec);
  else { R.scene = "select"; renderSelect(); return; }
  btnPause.hidden = !(R.scene === "opening" || R.scene === "A07");
  btnPause.textContent = (SEQ && SEQ.paused) ? "继续" : "暂停";
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
var forceFullMotion = false;

function renderHome(){
  V.innerHTML = '<section id="cinema" class="cinema cinema-guide" aria-label="体验引导">' +
    stageSVG("wide") + '<div class="cinema-ui"><div class="guide-copy">' +
    '<p class="guide-label">反诈演练 · 无真实交易</p>' +
    '<h1>防骗预演</h1><p>周末下午，宿舍里来了一条新消息。</p>' +
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
      '<h3>《一份周末兼职》</h3><span class="who">大学生 · 周末下午在宿舍刷手机，收到一条兼职通知</span>' +
      '<span class="who">主线：试做返利与连续任务 · 短分支：自称辅导员的视频</span>' +
      '<span class="flag">可试玩</span></button>' +
    '<button type="button" class="chapter" disabled aria-disabled="true">' + cover("电") +
      '<h3>《一通晚间来电》</h3><span class="who">中年人 · 晚饭后接到常联系的网友来电</span>' +
      '<span class="who">沿用同一套手机演练模板</span>' +
      '<span class="flag">待开放</span></button>' +
    '<button type="button" class="chapter" disabled aria-disabled="true">' + cover("讲") +
      '<h3>《群里的一场讲座》</h3><span class="who">老年人 · 群里发来的生活活动邀请</span>' +
      '<span class="who">沿用同一套手机演练模板</span>' +
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
  if(s === "opening2") return "拇指停了一下：来了一条短信通知——「周末任务招募 · 商品资料整理」。";
  if(s === "opening3") return "屏幕上的字一点点清楚起来，还是同一条通知。";
  return "周末下午，你靠在宿舍上铺刷手机，下面书桌空着。";
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
  '<div class="card"><div class="eyebrow">本局结果 · 立即结算</div>' +
    '<div class="result"><h2 class="title-xl" id="result-title" tabindex="-1" style="font-size:1.5rem">《一份周末兼职》</h2>' +
    '<span class="pill ' + (k==="verified"?"ok":(k==="loss"?"":"mid")) + '">' + e.name + '</span></div>' +
    '<p class="lede" id="result-why">为什么是这个结果：' + esc(whyLine(k)) + '</p></div>' +

  '<div class="card reveal"><div class="eyebrow">复盘里第一次说明</div>' +
    '<p style="margin:0">' + esc(meta.reveal) + '</p></div>' +

  '<div class="card"><div class="eyebrow">本局实际走过的镜头</div>' +
    '<ul class="timeline">' + t.map(function(x){
      var cls = { pay:"pay", verify:"verify", help:"help", follow:"follow" }[x.kind] || "";
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
function whyLine(k){
  var v = verifiedItems().length, bits = [];
  if(k === "loss"){
    bits.push("你在标注「演练」的确认页点了「确认垫付」，这一步记为一次确认动作（380.00 元，没有发生真实扣款）");
    bits.push(v ? "就算之前已经从校园渠道查到 " + v + " 项，结算顺序里模拟损失仍排在最前" : "之前也没有把该查的两项查完");
  } else if(k === "close"){
    bits.push("你到过垫付确认页，但在点「确认」之前停了下来，本局一条确认动作都没有");
    bits.push(v ? "已经查到的 " + v + " 项写在下面" : "两项校园渠道核实还没有查完，仍标着待核实");
  } else if(k === "verified"){
    bits.push("你没有进入垫付确认页，并且从学校就业发布记录和原有号码两条线都拿到了答复");
    bits.push("两条答复都写进了「已经核实」");
  } else {
    bits.push("你主动停止了这次接触");
    bits.push(v ? "已经查到的 " + v + " 项写在下面" : "两件要确认的事仍然标着「待核实」，没有被算成已核实");
  }
  return bits.join("；") + "。";
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
        '<li>A07 视频分支：<b>无配音、无语音合成</b>。画面为原创绘制，对方说的话以带说话人标识的短句逐条显示，静音也能读全。</li>' +
        '<li>A09 入口图案：全部本地 SVG 绘制，图案下保留文字名。</li>' +
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
    // 不抢走用户在页面别处的焦点，只在本幕切换后可聚焦
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
  if(motionPreference.matches && !forceFullMotion){
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
    go("A04");
    say("已跳过开场，与播完落到同一个画面，只创建这一条通知。");
    return;
  }
  if(act === "pauseSeq"){ togglePause(); return; }
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
  killSeq(); Sfx.stopAll();
  GEN++;
  R = freshRound();
  R.scene = "opening";
  R.openingStage = "opening1";
  var gen = GEN;
  Sfx.unlock();
  runSeq([
    { ms:3000, fn:function(){ showOpeningBeat("opening2"); Sfx.ping(gen); } },
    { ms:3000, fn:function(){ showOpeningBeat("opening3"); } },
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
