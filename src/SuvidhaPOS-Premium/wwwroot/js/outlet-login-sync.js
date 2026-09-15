(function(w,d){
  'use strict';
  var busy=false,authSeen=false,supportOutletCode='';

  function installSidebarTextGuard(){
    if(w.__suvidhaSidebarTextGuard)return;
    try{
      var proto=w.Node&&w.Node.prototype,desc=proto&&Object.getOwnPropertyDescriptor(proto,'textContent');
      if(!desc||typeof desc.get!=='function'||typeof desc.set!=='function'||!desc.configurable)return;
      Object.defineProperty(proto,'textContent',{
        configurable:desc.configurable,enumerable:desc.enumerable,get:desc.get,
        set:function(value){
          try{
            if(this&&this.nodeType===1&&this.closest&&this.closest('#sidebar')){
              var next=value==null?'':String(value);if(desc.get.call(this)===next)return;
            }
          }catch(_){}
          return desc.set.call(this,value);
        }
      });
      w.__suvidhaSidebarTextGuard=true;
    }catch(err){console.error('Sidebar text guard install failed',err)}
  }
  installSidebarTextGuard();

  function byId(id){return d.getElementById(id)}
  function target(){return byId('loginOutlet')}
  function canonicalType(v){
    v=String(v||'').trim();
    if(/^(Gold & Diamond Jewellery|Silver Jewellery)$/i.test(v))return 'Jewellery Shop';
    return v||'Retail Shop';
  }
  function read(x,a,b){return x&&x[a]!==undefined?x[a]:(x&&x[b]!==undefined?x[b]:undefined)}
  function isJewellery(type){return canonicalType(type)==='Jewellery Shop'}
  function apply(x){
    x=x||{};
    var previous=w.suvidhaOutlet||{};
    var name=String(read(x,'OutletName','outletName')||previous.OutletName||'Main Outlet').trim()||'Main Outlet';
    var type=canonicalType(read(x,'StoreType','storeType')||previous.StoreType);
    var code=String(read(x,'OutletCode','outletCode')||previous.OutletCode||supportOutletCode||'').trim().toUpperCase();
    var validity=read(x,'ValidTill','validTill')||read(x,'ValidUntilUtc','validUntilUtc')||previous.ValidTill||null;
    if(code)supportOutletCode=code;

    var e=target();
    if(e){
      e.textContent=name+' · '+type;
      e.dataset.outletName=name;e.dataset.storeType=type;e.title='Outlet: '+name+' / '+type;
    }
    var badge=byId('loginStoreBadge');
    if(badge)badge.hidden=!isJewellery(type);
    var aboutType=byId('aboutStoreType');if(aboutType)aboutType.textContent=type;
    var pill=byId('outletPill');if(pill)pill.textContent=name;
    d.body.dataset.storeType=type.replace(/[^a-z0-9]+/gi,'-').toLowerCase();

    w.suvidhaOutlet={
      OutletName:name,OutletCode:code||null,StoreType:type,
      IsJewellery:isJewellery(type)||!!read(x,'IsJewellery','isJewellery'),
      IsUom:!isJewellery(type),ValidTill:validity,
      UpdatedAt:read(x,'UpdatedAt','updatedAt')||previous.UpdatedAt||null
    };
    try{localStorage.setItem('suvidha_outlet_display',JSON.stringify(w.suvidhaOutlet))}catch(_){}
    try{w.dispatchEvent(new CustomEvent('suvidha:outlet-synced',{detail:w.suvidhaOutlet}))}catch(_){}
    return w.suvidhaOutlet;
  }
  function restore(){try{var raw=localStorage.getItem('suvidha_outlet_display');if(raw)apply(JSON.parse(raw))}catch(_){}}

  async function json(url){
    var r=await fetch(url+(url.indexOf('?')>=0?'&':'?')+'_='+Date.now(),{
      cache:'no-store',headers:{'Accept':'application/json','Cache-Control':'no-cache','Pragma':'no-cache'}
    });
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r.json();
  }
  async function refresh(force){
    if(busy&&!force)return w.suvidhaOutlet||null;
    busy=true;
    try{
      var results=await Promise.all([
        json('/public/specialization').catch(function(){return null}),
        json('/public/license/status').catch(function(){return null})
      ]);
      var spec=results[0]||{},lic=results[1]||{};
      var merged=Object.assign({},spec);
      var licType=read(lic,'StoreType','storeType');if(licType)merged.StoreType=licType;
      var licName=read(lic,'OutletName','outletName');if(licName&&!read(merged,'OutletName','outletName'))merged.OutletName=licName;
      merged.OutletCode=read(lic,'OutletCode','outletCode')||read(spec,'OutletCode','outletCode');
      merged.ValidTill=read(lic,'ValidTill','validTill')||read(lic,'ValidUntilUtc','validUntilUtc');
      if(!results[0]&&!results[1])throw new Error('LOCAL_STATUS_UNAVAILABLE');
      return apply(merged);
    }catch(err){
      if(!w.suvidhaOutlet){var e=target();if(e)e.textContent='Outlet information unavailable'}
      console.error('Outlet login sync failed',err);return null;
    }finally{busy=false}
  }
  w.refreshLoginOutlet=refresh;

  async function refreshLatestFromWebsite(){
    var btn=byId('loginOutletRefresh');
    if(btn){btn.classList.remove('synced');btn.classList.add('syncing');btn.disabled=true;btn.textContent='↻'}
    try{
      if(typeof w.pullLatestOutletOwnership==='function')await w.pullLatestOutletOwnership('login-refresh',false);
      else if(typeof w.backgroundOutletSync==='function')w.backgroundOutletSync('PULL','login-refresh',false);
      await refresh(true);
      if(btn){btn.classList.remove('syncing');btn.classList.add('synced');btn.textContent='✓';setTimeout(function(){btn.classList.remove('synced');btn.textContent='↻'},1200)}
      return true;
    }catch(_){
      try{w.dispatchEvent(new CustomEvent('suvidha:sync-offline'))}catch(__){}
      if(btn){btn.classList.remove('syncing');btn.textContent='↻'}
      return false;
    }finally{if(btn)btn.disabled=false}
  }
  w.refreshLatestLoginOutlet=refreshLatestFromWebsite;

  w.addEventListener('suvidha:outlet-changed',function(){refresh(true)});
  w.addEventListener('suvidha:outlet-saved',function(){setTimeout(function(){refresh(false)},0)});
  w.addEventListener('suvidha:login-success',function(){setTimeout(function(){refresh(false)},0)});

  async function refreshSupportOutletCode(){
    try{
      var x=await json('/public/license/status');
      var code=String(read(x,'OutletCode','outletCode')||'').trim().toUpperCase();
      if(code){supportOutletCode=code;try{sessionStorage.setItem('suvidha_support_outlet_code',code)}catch(_){}}
    }catch(_){}
    return supportOutletCode;
  }
  try{supportOutletCode=sessionStorage.getItem('suvidha_support_outlet_code')||''}catch(_){}
  function supportUrl(code){return 'https://suvidhapremium.suvidhapos.in/support/whatsapp?outletCode='+encodeURIComponent(code||'')}
  async function openCentralSupport(){
    var pop=null;try{pop=w.open('about:blank','_blank')}catch(_){}
    var code=supportOutletCode||String((w.suvidhaOutlet&&w.suvidhaOutlet.OutletCode)||'');
    if(!code)code=await refreshSupportOutletCode();
    if(!code){
      try{if(pop)pop.close()}catch(_){}
      var box=byId('loginError');if(box)box.textContent='Support information is unavailable. Please try again.';
      return false;
    }
    var url=supportUrl(code);
    try{if(pop){pop.location.replace(url);return true}}catch(_){}
    try{w.open(url,'_blank');return true}catch(_){return false}
  }
  w.openSuvidhaContactSupport=openCentralSupport;

  d.addEventListener('click',function(ev){
    var t=ev.target&&ev.target.closest?ev.target.closest('#licenseRenewBtn,#supportBtn,#forgotPasswordBtn'):null;
    if(!t)return;
    ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
    openCentralSupport();
  },true);

  var lastLoginKick=0;
  function kickOwnershipSync(){
    var now=Date.now();if(now-lastLoginKick<15000)return;lastLoginKick=now;
    setTimeout(function(){
      try{if(typeof w.backgroundOutletSync==='function')w.backgroundOutletSync('PULL','login-attempt',false)}catch(_){}
      refreshSupportOutletCode();
    },0);
  }
  d.addEventListener('focusin',function(ev){if(ev.target&&/^(loginUser|loginPass)$/.test(ev.target.id||''))kickOwnershipSync()},true);
  d.addEventListener('pointerdown',function(ev){
    var t=ev.target&&ev.target.closest?ev.target.closest('#loginSubmitBtn,#loginUser,#loginPass'):null;if(t)kickOwnershipSync();
  },true);
  d.addEventListener('keydown',function(ev){if(ev.key==='Enter'&&ev.target&&/^(loginUser|loginPass)$/.test(ev.target.id||''))kickOwnershipSync()},true);

  function loadRuntimeFixes(){
    if(d.getElementById('runtimeFixes6124')||d.querySelector('script[src*="/js/runtime-fixes-6124.js"]'))return;
    var s=d.createElement('script');s.id='runtimeFixes6124';s.src='/js/runtime-fixes-6124.js?v=6124';s.async=false;d.head.appendChild(s);
  }
  function watchLoginTransition(){
    authSeen=d.body.getAttribute('data-authenticated')==='true';
    new MutationObserver(function(){
      var on=d.body.getAttribute('data-authenticated')==='true';
      if(on&&!authSeen)setTimeout(function(){refresh(false);refreshSupportOutletCode()},0);
      authSeen=on;
    }).observe(d.body,{attributes:true,attributeFilter:['data-authenticated']});
  }
  function start(){
    restore();
    setTimeout(function(){refresh(false);refreshSupportOutletCode()},0);
    var btn=byId('loginOutletRefresh');if(btn)btn.addEventListener('click',refreshLatestFromWebsite);
    watchLoginTransition();
    if(d.readyState==='complete')loadRuntimeFixes();else w.addEventListener('load',loadRuntimeFixes,{once:true});
  }
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',start);else start();
})(window,document);
