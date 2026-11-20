/* Each chapter supplies a snapshot of this round. Turning a page never calls the game engine. */
window.Ending = (() => {
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount(parent, opts) {
    const s = {...opts, actions:[...opts.actions], notes:[...opts.notes]};
    const replay = s.chapter === 1 ? 'data-act="replay"' : 'data-do="replay"';
    const tag = ['','第一章','第二章','第三章'][s.chapter]+'　／　'+escape(s.title);
    const caption = ['','周六午后 · 大学宿舍','晚饭后 · 家中餐桌','周日早晨 · 窗边茶桌'][s.chapter];
    const still = '<img class="end-picture" draggable="false" src="'+escape(s.picture)+'" alt="">';
    const aftercare = s.loss ? '<button type="button" class="end-soft" data-do="aftercare" aria-expanded="false" aria-controls="aftercare">我现在可以怎么做</button>' : '';
    const journalSteps = s.actions.map((t,i)=>'<li><span class="journal-no" aria-hidden="true">'+String(i+1).padStart(2,'0')+'</span><span>'+escape(t)+'</span></li>').join('');
    parent.innerHTML = '<div class="ending-shell" data-chapter="'+s.chapter+'">'+
      '<section class="end-film" data-ending-page="film" aria-labelledby="result-title">'+still+'<div class="end-shade"></div>'+
      '<div class="end-caption"><p class="end-label">'+tag+'</p><h1 id="result-title" class="pill" tabindex="-1">'+escape(s.result)+'</h1>'+
      '<p id="result-why">'+escape(s.why)+'</p><div class="end-buttons"><button type="button" class="end-primary" data-ending="open" aria-controls="journal-page">回看我的选择</button>'+aftercare+'</div>'+
      (s.loss?'<p id="aftercare" hidden>先停止追加付款，留好聊天和付款记录，找信任的人一起联系原来的银行或支付渠道。</p>':'')+'</div></section>'+
      '<section class="end-journal" data-ending-page="journal" id="journal-page" aria-labelledby="journal-title" hidden><header class="journal-head"><h2 id="journal-title" tabindex="-1">我的演练手记</h2><span>'+tag+'</span></header>'+
      '<div class="journal-spread"><div class="journal-memory"><figure>'+still+'<figcaption>'+caption+'</figcaption></figure><h3>'+escape(s.result)+'</h3><p>'+escape(s.why)+'</p>'+
      '<button type="button" class="end-back" data-ending="back">返回结算画面</button></div>'+
      '<div class="journal-record"><h3>这一局，我做了什么</h3><ol class="journal-steps">'+journalSteps+'</ol>'+
      (s.notes.length?'<div class="journal-notes"><h4>留下的线索</h4>'+s.notes.map(t=>'<p>'+escape(t)+'</p>').join('')+'</div>':'')+
      (s.chapter===1?'<button type="button" class="end-back" data-act="copyStars">复制本局提醒</button><p class="journal-copy-status" id="copy-note" role="status"></p>':'')+
      '</div></div></section>'+
      '<nav class="end-nav" aria-label="接下来"><a href="pact.html">带走家庭约定卡</a><button type="button" '+replay+'>重新体验本章</button><a href="index.html?roles=1">选择其他身份</a></nav></div>';
    const shell = parent.querySelector('.ending-shell'), film=shell.querySelector('.end-film'), journal=shell.querySelector('.end-journal');
    function page(book) {
      journal.hidden=!book;film.hidden=book;
      window.scrollTo(0,0);
      shell.querySelector(book?'#journal-title':'[data-ending="open"]').focus({preventScroll:true});
    }
    shell.addEventListener('click', e=>{
      const b=e.target.closest('button');if(!b) return;
      if(b.dataset.ending==='open') page(true);
      if(b.dataset.ending==='back') page(false);
      if(b.dataset.do==='aftercare'){
        const help=shell.querySelector('#aftercare');help.hidden=!help.hidden;b.setAttribute('aria-expanded',String(!help.hidden));
      }
    });
    shell.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!journal.hidden){e.preventDefault();page(false);}
    });
    window.scrollTo(0,0);
    shell.querySelector('#result-title').focus({preventScroll:true});
  }
  return {mount};
})();
