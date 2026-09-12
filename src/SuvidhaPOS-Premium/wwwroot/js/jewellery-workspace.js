/* Jewellery-only navigation access. Normal billing keeps its existing controls. */
(function(w,d){
'use strict';
const PREFIX='Jewellery.Sidebar.';
const isJewellery=()=>d.body.classList.contains('jewel-suite-mode');
const isManager=()=>['admin','administrator','manager'].includes(String(w.currentUser?.Role||'').toLowerCase());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const locked=new Set(['FEATURE_CONTROL','SIGN_OUT']);
let settings={},loaded=false,loading=null,entries=[];
function label(button){
 const span=button.querySelector('span:not(.js-icon):not(#jsReportsChevron)');
 return String(span?span.textContent:button.textContent).replace(/^[^\p{L}\p{N}]+/u,'').replace(/\s+/g,' ').trim();
}
function route(button){
 const match=String(button.getAttribute('onclick')||'').match(/^\s*(?:window\.)?(\w+)\s*\(\s*(?:['"]([^'"]*)['"])?/);
 return match?{fn:match[1],arg:match[2]}:null;
}
function allowed(entry){return locked.has(entry.key)||(settings[entry.key]!==false&&(entry.group!=='REPORTS'||settings.REPORTS!==false))}
function warn(){if(w.toast)w.toast('This option is disabled in Jewellery Feature Control')}
function apply(){
 if(!isJewellery())return;
 entries.forEach(entry=>{
  const off=!allowed(entry);
  if(entry.node.dataset.jewelDisabled!==String(off))entry.node.dataset.jewelDisabled=String(off);
 });
}
function collect(){
 if(!isJewellery())return;
 const side=d.getElementById('sidebar');if(!side)return;
 let group='OVERVIEW';const next=[];
 side.querySelectorAll('.js-section,.js-nav,.js-side-user button').forEach(node=>{
  if(node.classList.contains('js-section')){
   group=label(node).toUpperCase();
   if(!node.matches('button.js-section-toggle'))return;
  }
  const name=label(node);if(!name)return;
  const key=name.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
  const entry={key,name,group:node.closest('.js-side-user')?'SYSTEM':group,node,route:route(node)};
  node.dataset.jewelFeature=key;next.push(entry);
 });
 entries=next;
 installRouteGuards();apply();
}
function routeEntries(fn,args){
 if(fn==='loadProducts'||fn==='loadJewelleryStock')return entries.filter(e=>e.key==='STOCK');
 if(fn==='loadReports'||fn==='loadJewelReports'||fn==='toggleJewelReports')return entries.filter(e=>e.key==='REPORTS');
 return entries.filter(e=>e.route?.fn===fn&&(e.route.arg===undefined||e.route.arg===String(args[0])));
}
function installRouteGuards(){
 if(!isJewellery())return;
 const names=new Set(entries.map(e=>e.route?.fn).filter(Boolean));
 ['loadProducts','loadJewelleryStock','loadReports','loadJewelReports'].forEach(name=>names.add(name));
 names.forEach(name=>{
  if(['logout','loadJewelleryFeatureControl','toggleJewelReports'].includes(name))return;
  const base=w[name];if(typeof base!=='function'||base.__jewelleryAccess)return;
  const guarded=function(){
   if(isJewellery()){
    const options=routeEntries(name,arguments);
    if(options.length&&!options.some(allowed)){warn();return}
   }
   return base.apply(this,arguments);
  };
  guarded.__jewelleryAccess=true;w[name]=guarded;
 });
}
async function loadSettings(){
 if(loaded)return;
 if(loading)return loading;
 loading=(async()=>{
  const rows=await api('/api/app-settings'),values={};
  (rows||[]).forEach(row=>{
   const key=String(row.Key??row.key??'');
   if(key.startsWith(PREFIX))values[key.slice(PREFIX.length)]=!/^(false|0|off)$/i.test(String(row.Value??row.value??'true'));
  });
  settings=values;loaded=true;apply();
 })();
 try{await loading}finally{loading=null}
}
w.loadJewelleryFeatureControl=async function(){
 if(!isJewellery())return;
 setPage('featurecontrol');title.textContent='Feature Control';
 const subtitle=d.querySelector('header p');if(subtitle)subtitle.textContent='Jewellery sidebar options';
 const app=d.getElementById('app');
 if(!isManager()){app.innerHTML='<div class="content"><div class="alert">Admin / Manager permission required.</div></div>';return}
 collect();
 try{await loadSettings()}catch(error){app.innerHTML='<div class="content"><div class="alert">'+esc(error.message||'Unable to load Feature Control')+'</div></div>';return}
 const groups=[...new Set(entries.map(e=>e.group))];
 app.innerHTML='<div class="content jewellery-feature-page"><div class="panel"><h2>Feature Control</h2><p>Choose which jewellery sidebar options are available.</p></div>'+groups.map(group=>
  '<section class="panel jewellery-feature-section"><h3>'+esc(group)+'</h3><div class="feature-grid">'+entries.filter(e=>e.group===group).map(entry=>
   '<label class="feature-flag"><span>'+esc(entry.name)+'</span><input type="checkbox" data-jewel-toggle="'+entry.key+'" aria-label="'+esc(entry.name)+'" '+(locked.has(entry.key)||settings[entry.key]!==false?'checked ':'')+(locked.has(entry.key)?'disabled title="Always available"':'')+'></label>'
  ).join('')+'</div></section>'
 ).join('')+'</div>';
 app.querySelectorAll('[data-jewel-toggle]').forEach(input=>input.addEventListener('change',()=>save(input)));
};
async function save(input){
 if(!isJewellery()||!isManager()||locked.has(input.dataset.jewelToggle))return;
 const key=input.dataset.jewelToggle,on=input.checked;
 input.disabled=true;
 try{
  await api('/api/app-settings/'+encodeURIComponent(PREFIX+key),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:String(on)})});
  settings[key]=on;apply();
 }catch(error){input.checked=settings[key]!==false;if(w.alert)w.alert(error.message||error)}
 finally{input.disabled=false}
}
// Capture clicks before inline handlers; a quick-search refresh cannot enable a disabled entry.
d.addEventListener('click',event=>{
 if(!isJewellery())return;
 const button=event.target.closest?.('#sidebar [data-jewel-feature]');if(!button)return;
 const entry=entries.find(e=>e.node===button);
 if(entry&&!allowed(entry)){event.preventDefault();event.stopImmediatePropagation();warn()}
},true);
function activate(){
 if(!isJewellery())return;
 collect();
 if(w.currentUser)loadSettings().catch(()=>{});
}
const sidebar=d.getElementById('sidebar');
if(sidebar)new MutationObserver(collect).observe(sidebar,{childList:true,subtree:true});
new MutationObserver(activate).observe(d.body,{attributes:true,attributeFilter:['class']});
// Legacy modules load asynchronously; wrap only the functions they replace.
d.addEventListener('load',event=>{if(event.target.tagName==='SCRIPT'&&isJewellery())collect()},true);
w.addEventListener('suvidha:outlet-synced',activate);
w.addEventListener('load',activate);
activate();
})(window,document);
