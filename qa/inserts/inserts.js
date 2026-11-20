/* Fixed-time, local-only cinema inserts. Each shot can be rendered at any t. */
const W=960,H=540,plate=document.querySelector('#plate');
const R=(a,b,t)=>Math.max(0,Math.min(1,(t-a)/(b-a))), ease=x=>x*x*(3-2*x);
const grad=(id,pairs)=>'<linearGradient id="'+id+'" x2="0.72" y2="1">'+pairs.map(([o,c])=>'<stop offset="'+o+'" stop-color="'+c+'"/>').join('')+'</linearGradient>';
const defs=grad('wood',[[0,'#4e3c32'],[.5,'#866953'],[1,'#45392f']])+grad('chrome',[[0,'#6d7e79'],[.19,'#d9d6bf'],[.35,'#919e91'],[.55,'#ced2bd'],[1,'#63746e']])+grad('brass',[[0,'#d0bb83'],[.35,'#a68a53'],[1,'#5a493b']])+grad('glass',[[0,'#2c484d'],[.4,'#71928e'],[.65,'#344a4a'],[1,'#152c32']])+grad('paper',[[0,'#ddd2ad'],[.5,'#b1b396'],[1,'#b7a783']])+grad('skin',[[0,'#ecc8a5'],[.45,'#cba488'],[1,'#996f58']])+
'<pattern id="grain" width="7" height="9" patternUnits="userSpaceOnUse"><path d="M0 1h2m2 4h1m2 2h1" stroke="#473f32" stroke-opacity=".25"/></pattern><pattern id="hide" width="7" height="7" patternUnits="userSpaceOnUse"><path d="m0 4 3-2 3 2" fill="none" stroke="#939181" stroke-opacity=".32"/></pattern>';
function dial(cx,cy,r,k){return '<g transform="translate('+cx+' '+cy+') rotate('+k+')"><circle r="'+r+'" fill="url(#chrome)" stroke="#354039" stroke-width="3"/>'+Array.from({length:38},(_,i)=>'<path transform="rotate('+i*360/38+')" d="M0 -'+(r-3)+'v'+(i%3?5:10)+'" stroke="#4c5751" stroke-width="1.8"/>').join('')+'<path d="M0 -6v-13" stroke="#a95338" stroke-width="3"/></g>'}
function camera(t){
  const rot=ease(R(.4,2.7,t))*58-ease(R(3.1,4.1,t))*9, shift=42*(1-ease(R(0,1.25,t)));
  const blades=Array.from({length:8},(_,i)=>'<path transform="rotate('+(i*45+rot/2)+' 463 291)" d="M462 183q73 6 100 71l-75 31-24-23 34-42z" stroke="#506160" fill="#283735"/>').join('');
  const sweep=110+520*ease(R(.4,4.3,t));
  return '<rect width="960" height="540" fill="url(#wood)"/>'+Array.from({length:30},(_,i)=>'<path d="M0 '+i*21+'q410 -35 960 -4" fill="none" stroke="#b09a79" opacity=".13"/>').join('')+'<g transform="rotate(-8 480 280) translate('+shift+' 0)"><path d="M179 200q-98-15-102 47t48 49q17-6 3-34m588 5q105-20 160 32" fill="none" stroke="#29261e" stroke-width="12"/><rect x="160" y="161" width="570" height="236" rx="22" fill="#262f2e" stroke="#171e1c" stroke-width="7"/><rect x="169" y="186" width="552" height="188" rx="15" fill="url(#hide)"/><path d="M160 197v-55q0-18 19-18h169l35-36h132l36 34h155q24 0 24 23v51z" fill="url(#chrome)" stroke="#3d4b46" stroke-width="4"/><rect x="201" y="140" width="61" height="37" rx="4" fill="#293a3b" stroke="#8e998d" stroke-width="5"/><path d="m207 167 36-24h12l-38 25z" fill="#869a94"/>'+dial(650,134,28,rot)+'<circle cx="463" cy="291" r="129" fill="#222d2c" stroke="#a8ad9f" stroke-width="7"/>'+dial(463,291,117,rot)+'<circle cx="463" cy="291" r="97" fill="url(#glass)" stroke="#47524e" stroke-width="10"/><svg x="367" y="195" width="192" height="192" viewBox="367 195 192 192" style="overflow:hidden"><g clip-path="url(#lens)">'+blades+'<ellipse cx="456" cy="254" rx="39" ry="15" fill="#bfd4bf" opacity=".38"/></g></svg><path d="M186 364v19h174m213 0h126v-18" stroke="#b5b2a1" stroke-width="4" fill="none"/></g><path d="M'+sweep+' 0h65L'+(sweep-220)+' 540h-65z" fill="#ffe8aa" opacity=".06"/>';
}
function noteArt(){
const guilloche=(cx,cy,sx,sy)=>Array.from({length:10},(_,k)=>{let d='';for(let i=0;i<=380;i++){const a=i/380*2*Math.PI, r=1+.12*Math.sin(17*a+k*.58)+.04*Math.cos(25*a-k*.71);d+=(i?'L':'M')+(cx+sx*r*Math.cos(a)).toFixed(2)+' '+(cy+sy*r*Math.sin(a)).toFixed(2)}return '<path d="'+d+'z" fill="none" stroke="#667766" stroke-width=".85"/>'}).join('');
return '<rect x="148" y="148" width="656" height="287" rx="4" fill="url(#paper)" stroke="#787762" stroke-width="3"/><rect x="160" y="160" width="632" height="263" fill="none" stroke="#6f8070" stroke-width="4"/><rect x="168" y="168" width="616" height="247" fill="none" stroke="#8a8871"/>'+guilloche(285,292,84,86)+guilloche(652,286,70,82)+guilloche(467,293,56,51)+Array.from({length:23},(_,i)=>'<path d="M176 '+(184+i*9)+'q93 18 185 -1t198 0 216 0" fill="none" opacity=".33" stroke="#687e6f" stroke-width=".8"/>').join('')+'<path d="m491 151-8 104 7 70-9 103" stroke="#8d8470" opacity=".45" fill="none"/>'}
const paper=noteArt();
// Project the room light onto the object, then break it up with transparent
// pigment and dry brush marks. Texture is fixed in object space between frames.
const insertPigment=(() => {
 let seed=6197;const r=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
 let marks='';
 for(let i=0;i<1750;i++){
   const x=(r()*985-12).toFixed(1), y=(r()*570-15).toFixed(1),len=(3+r()*19).toFixed(1);
   marks+='<path d="M'+x+' '+y+'q'+len+' -4 '+len+' -5" stroke="'+(i%3===0?'#4c4333':'#fff4c9')+'" stroke-width="'+(.6+r()*1.7).toFixed(1)+'" stroke-opacity="'+(.025+r()*.047).toFixed(3)+'"/>';
 }
 return '<g fill="none">'+marks+'</g>';
})();
function roomLight(n){
 const lamp=n===2;
 return '<defs><linearGradient id="roomLight" x1="0" y1="0" x2="1" y2=".83"><stop stop-color="'+(lamp?'#fac579':'#fff3bc')+'" stop-opacity=".48"/><stop offset=".58" stop-color="#debd85" stop-opacity=".04"/><stop offset="1" stop-color="'+(lamp?'#102f37':'#3e574e')+'" stop-opacity=".44"/></linearGradient><filter id="roughen" x="-1%" y="-1%" width="102%" height="102%"><feTurbulence type="fractalNoise" baseFrequency=".065 .12" numOctaves="2" seed="7" result="f"/><feDisplacementMap in="SourceGraphic" in2="f" scale="2.4"/></filter></defs>';
}
function bank(t){const p=ease(R(.15,2.9,t)),x=232+340*p+8*Math.sin(t*1.3),y=208+55*Math.sin(p*2.8)+24*p;return '<rect width="960" height="540" fill="#ae987b"/><path d="M0 60 530 0 138 540H0z" fill="#e6d4a9"/><g transform="rotate(-5 480 280)">'+paper+'</g><g transform="translate('+x+' '+y+') rotate(-22)"><path d="m0 90 8 204" stroke="#473c31" stroke-width="31" stroke-linecap="round"/><path d="m0 93 7 183" stroke="url(#brass)" stroke-width="18" stroke-linecap="round"/></g><clipPath id="magnify"><circle cx="'+x+'" cy="'+y+'" r="88"/></clipPath><g clip-path="url(#magnify)"><g transform="translate('+x+' '+y+') scale(1.48) translate('+(-x)+' '+(-y)+') rotate(-5 480 280)">'+paper+'</g><circle cx="'+x+'" cy="'+y+'" r="89" fill="#d4e3ca" opacity=".14"/></g><circle cx="'+x+'" cy="'+y+'" r="93" fill="none" stroke="#5c5140" stroke-width="10"/><circle cx="'+x+'" cy="'+y+'" r="92" fill="none" stroke="url(#brass)" stroke-width="6"/><path d="M'+(x-58)+' '+(y-48)+'q20-31 54-32" stroke="#fff2d1" stroke-width="7" stroke-linecap="round" opacity=".52" fill="none"/>'}
window.paint=(chapter,t,caller)=>{
 if(chapter===1){
   const s=caller.indexOf('<path d="M166 89'),e=caller.indexOf('<rect width="410" height="240" fill="url(#grain)');
   const talk=(.5+.5*Math.sin(t*11))*(1-ease(R(3,3.7,t))), nod=2.4*Math.sin(t*2.1)*Math.min(1,t*3),blink=1-Math.max(0,1-Math.abs(t-1.7)*10);
   let head=caller.slice(s,e).replace(/<path d="M191 122[^>]+\/>/,'<path d="M191 122q14 '+(-2-talk*3)+' 28-5 q-12 '+(4+talk*8)+' -28 5z" fill="#795443"/>').replace('<g fill="#343c32">','<g transform="translate(0 '+(93*(1-blink))+') scale(1 '+blink+')" fill="#343c32">');
   const img=caller.slice(0,s)+'<g transform="rotate('+nod+' 210 159)">'+head+'</g>'+caller.slice(e);
   plate.innerHTML=img.replace('viewBox="0 0 410 240"','viewBox="0 0 410 240" preserveAspectRatio="xMidYMid slice"');return;
 }
 plate.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><defs>'+defs+'<clipPath id="lens"><circle cx="463" cy="291" r="91"/></clipPath></defs>'+roomLight(chapter)+'<g filter="url(#roughen)">'+(chapter===2?camera(t):bank(t))+'</g><rect width="960" height="540" fill="url(#roomLight)"/>'+insertPigment+'<rect width="960" height="540" fill="url(#grain)" opacity=".28"/></svg>';
};
