(function(w,d){
  'use strict';
  var busy=false,authSeen=false;
  function target(){return d.getElementById('loginOutlet')}
  function canonicalType(v){
    v=String(v||'').trim();
    if(/^(Gold & Diamond Jewellery|Silver Jewellery)$/i.test(v))return 'Jewellery Shop';
    return v||'Retail Shop';
  }
  function read(x,a,b){return x&&x[a]!==undefined?x[a]:(x&&x[b]!==undefined?x[b]:undefined)}
  function apply(x){
    var name=String(read(x,'OutletName','outletName')||'Main Outlet').trim()||'Main Outlet';
    var type=canonicalType(read(x,'StoreType','storeType'));
    var e=target();
    if(e){e.textContent=name+' · '+type;e.dataset.outletName=name;e.dataset.storeType=type;e.title='Outlet Master: '+name+' / '+type}
    var pill=d.getElementById('outletPill');if(pill)pill.textContent=name;
    w.suvidhaOutlet={OutletName:name,StoreType:type,IsJewellery:type==='Jewellery Shop'||!!read(x,'IsJewellery','isJewellery'),IsUom:type!=='Jewellery Shop',UpdatedAt:read(x,'UpdatedAt','updatedAt')||null};
    try{localStorage.setItem('suvidha_outlet_display',JSON.stringify(w.suvidhaOutlet))}catch(e){}
    try{w.dispatchEvent(new CustomEvent('suvidha:outlet-synced',{detail:w.suvidhaOutlet}))}catch(e){}
    return w.suvidhaOutlet;
  }
  function restore(){try{var raw=localStorage.getItem('suvidha_outlet_display');if(raw)apply(JSON.parse(raw))}catch(e){}}
  async function refresh(force){
    if(busy&&!force)return w.suvidhaOutlet||null;
    busy=true;
    try{
      var r=await fetch('/public/specialization?_='+Date.now(),{cache:'no-store',headers:{'Accept':'application/json','Cache-Control':'no-cache','Pragma':'no-cache'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      return apply(await r.json());
    }catch(err){
      if(!w.suvidhaOutlet){var e=target();if(e)e.textContent='Outlet Master unavailable'}
      console.error('Outlet login sync failed',err);return null;
    }finally{busy=false}
  }
  w.refreshLoginOutlet=refresh;
  w.addEventListener('suvidha:outlet-changed',function(){refresh(true)});
  w.addEventListener('suvidha:outlet-saved',function(){setTimeout(function(){refresh(false)},0)});
  w.addEventListener('suvidha:login-success',function(){setTimeout(function(){refresh(false)},0)});

  function loadRuntimeFixes(){
    if(d.getElementById('runtimeFixes6124'))return;
    var s=d.createElement('script');s.id='runtimeFixes6124';s.src='/js/runtime-fixes-6124.js?v=6124';s.async=false;d.head.appendChild(s);
  }
  function watchLoginTransition(){
    authSeen=d.body.getAttribute('data-authenticated')==='true';
    new MutationObserver(function(){
      var on=d.body.getAttribute('data-authenticated')==='true';
      if(on&&!authSeen)setTimeout(function(){refresh(false)},0);
      authSeen=on;
    }).observe(d.body,{attributes:true,attributeFilter:['data-authenticated']});
  }
  function start(){
    restore();setTimeout(function(){refresh(false)},0);
    watchLoginTransition();
    // Intentionally no 30-second / 5-minute / focus / visibility polling.
    // Login and billing remain fully local between explicit synchronization events.
    if(d.readyState==='complete')loadRuntimeFixes();else w.addEventListener('load',loadRuntimeFixes,{once:true});
  }
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',start);else start();
})(window,document);
