/* Offline film player. Keep a continuous playhead while the phone beneath
   the same shot changes (a reply arrives or a contact is opened). */
window.Theatre = (() => {
  let wanted = new URLSearchParams(location.search).get('play') === '1' || !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let clip, key;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const shown = new Set();
  const effects = new Set();
  let wakeFrame = 0, pendingWake = null, suspended = false, opened = false;

  function motion(node, frames, options){
    if(reduced.matches || !node) return;
    const effect = node.animate(frames, options);
    effects.add(effect);
    if(suspended || document.hidden || !wanted) effect.pause();
    effect.finished.then(()=>effects.delete(effect),()=>effects.delete(effect));
  }
  const arrive = [
    {opacity:0, transform:'translateY(6px)', visibility:'hidden'},
    {opacity:0, transform:'translateY(6px)', visibility:'visible', offset:.01},
    {opacity:1, transform:'translateY(0)', visibility:'visible'}
  ];
  function clearPresentation(){
    cancelAnimationFrame(wakeFrame);
    pendingWake = null;
    for(const effect of effects) effect.cancel();
    effects.clear();
  }
  function lightScreen(animate){
    if(!pendingWake) return;
    const {phone, onWake} = pendingWake;
    cancelAnimationFrame(wakeFrame);
    pendingWake = null;
    phone.classList.remove('is-asleep');
    if(document.activeElement===phone){
      const title=phone.querySelector('.lock-day, #step, .appbar b');
      if(title){title.tabIndex=-1;title.focus({preventScroll:true})}
    }
    if(animate){
      motion(phone, [0,-2,2,-1,1,0].map(x=>({transform:'translateX('+x+'px)'})),
        {duration:250,easing:'ease-out'});
      const glass=document.createElement('span');
      glass.className='wake-glass';glass.ariaHidden='true';phone.appendChild(glass);
      const fade=glass.animate([{opacity:1},{opacity:0}],{duration:170,easing:'ease-out'});
      fade.finished.then(()=>glass.remove(),()=>glass.remove());
      motion(phone.querySelector('.notification-tap, .caller'), [{opacity:.25},{opacity:1}],
        {duration:220,easing:'ease-out'});
    }
    onWake?.();
  }
  function present(phone,onWake){
    clearPresentation();
    if(!opened && ['lock','call'].includes(phone.dataset.page)){
      opened = true;
      if(reduced.matches || !wanted){onWake?.();return}
      phone.classList.add('is-asleep');
      phone.tabIndex=-1;
      phone.focus({preventScroll:true});
      pendingWake = {phone,onWake};
      // Use the film playhead for the cue. Unlock the handset even if media
      // fails to decode or autoplay is unavailable.
      let last = performance.now(), elapsed = 0;
      function tick(now){
        if(!pendingWake) return;
        if(!suspended && !document.hidden){
          elapsed += Math.min(100,now-last);
          if(clip.currentTime >= .72 || elapsed >= 1700 || clip.error){
            lightScreen(true);return;
          }
        }
        last = now;
        wakeFrame = requestAnimationFrame(tick);
      }
      wakeFrame = requestAnimationFrame(tick);
      return;
    }
    if(onWake) onWake();
    let delay = 0;
    for(const message of phone.querySelectorAll('.screen .msg, .screen .bubble')){
      const text = message.textContent;
      if(shown.has(text)) continue;
      shown.add(text);
      if(wanted) motion(message, arrive, {duration:200,delay,fill:'backwards',easing:'ease-out'});
      delay += 740;
    }
    if(delay>740 && wanted){
      const receipt=phone.querySelector('.thread + .note');
      motion(receipt,arrive,{duration:180,delay:delay-500,fill:'backwards',easing:'ease-out'});
    }
  }
  const symbols='<svg aria-hidden="true" viewBox="0 0 48 14" width="48" height="14"><g fill="currentColor"><path d="M0 12V9h3v3zm4 0V7h3v5zm4 0V4h3v8zm4 0V1h3v11z"/><path d="M18 4q6-6 12 0l-1.6 1.8q-4.4-4.1-8.8 0zm3 3q3-3 6 0l-3 3.8z"/></g><g stroke="currentColor" fill="none"><rect x="33" y="3" width="13" height="8" rx="2"/></g><path fill="currentColor" d="M35 5h9v4h-9zm12 0h1v4h-1z"/></svg>';
  function scene(title, line){
    return '<section class="story-panel" aria-label="剧情动画"><div class="cinema-frame"><div class="picture-slot"></div></div><div class="picture-caption"><div><h1>'+title+'</h1><p id="cap-txt" aria-live="polite">'+line+'</p></div><button type="button" data-film-pause aria-label="暂停动画">暂停动画</button></div></section>';
  }
  function refresh(){
    const b=document.querySelector('[data-film-pause]');
    if(!b||!clip)return;
    const label=clip.ended?'重播动画':clip.paused?'播放动画':'暂停动画';
    b.textContent=label;b.setAttribute('aria-label',label);
  }
  function bind(id,poster,onWake){
    const slot=document.querySelector('.picture-slot');
    if(!slot)return;
    const same=key===id && clip;
    if(!same){
      if(clip)clip.pause();
      clip=document.createElement('video');key=id;
      clip.src='assets/films/'+id+'.mp4';clip.poster=poster;clip.playsInline=true;clip.muted=true;
      clip.preload='auto';clip.dataset.sceneFilm='';clip.setAttribute('aria-label','当前剧情的无声动画');
      ['play','pause','ended','canplay'].forEach(e=>clip.addEventListener(e,refresh));
    }
    slot.appendChild(clip);
    present(document.querySelector('.pc-set .phone'),onWake);
    // Reusing the element retains the decoded frame and playback position.
    if(wanted && !suspended && !clip.ended&&!document.hidden)clip.play().catch(refresh);
    refresh();
  }
  document.addEventListener('click',e=>{
    if(!e.target.closest('[data-film-pause]')||!clip)return;
    if(!clip.paused&&!clip.ended){
      wanted=false;clip.pause();
      lightScreen(false);
      for(const effect of effects) effect.pause();
    } else {
      wanted=true;if(clip.ended)clip.currentTime=0;resume();
    }
    refresh();
  });
  function stop(){clearPresentation();shown.clear();opened=false;suspended=false;if(clip)clip.pause();clip=null;key=null}
  function pauseMedia(){clip?.pause();for(const effect of effects) effect.pause()}
  function suspend(){suspended=true;pauseMedia()}
  function playMedia(){
    if(!wanted || suspended || document.hidden) return;
    if(clip&&!clip.ended&&clip.isConnected)clip.play().catch(refresh);
    for(const effect of effects)effect.play();
  }
  function resume(){suspended=false;playMedia()}
  document.addEventListener('visibilitychange',()=>document.hidden?pauseMedia():playMedia());
  reduced.addEventListener('change',()=>{
    if(reduced.matches){lightScreen(false);for(const effect of effects) effect.finish()}
  });
  window.addEventListener('pagehide',stop);
  return {scene,bind,stop,suspend,resume,symbols};
})();
