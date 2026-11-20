/* Offline film player. Keep a continuous playhead while the phone beneath
   the same shot changes (a reply arrives or a contact is opened). */
window.Theatre = (() => {
  let wanted = new URLSearchParams(location.search).get('play') === '1' || !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let clip, key;
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
  function bind(id,poster){
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
    // Reusing the element retains the decoded frame and playback position.
    if(wanted && !clip.ended&&!document.hidden)clip.play().catch(refresh);
    refresh();
  }
  document.addEventListener('click',e=>{
    if(!e.target.closest('[data-film-pause]')||!clip)return;
    if(!clip.paused&&!clip.ended){wanted=false;clip.pause()}
    else{wanted=true;if(clip.ended)clip.currentTime=0;clip.play().catch(refresh)}
    refresh();
  });
  function stop(){if(clip)clip.pause();clip=null;key=null}
  function suspend(){if(clip)clip.pause()}
  function resume(){if(clip&&wanted&&!clip.ended&&clip.isConnected&&!document.hidden)clip.play().catch(refresh)}
  document.addEventListener('visibilitychange',()=>document.hidden?suspend():resume());
  window.addEventListener('pagehide',stop);
  return {scene,bind,stop,suspend,resume,symbols};
})();
