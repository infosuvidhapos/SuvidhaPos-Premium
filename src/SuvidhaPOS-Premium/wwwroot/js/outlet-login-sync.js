(function(w,d){
  'use strict';
  var busy=false,authSeen=false,supportOutletCode='';

  // 6.12.5 LOGIN FREEZE FIX
  // premium-completion watches #sidebar and normalizes two labels. Chromium fires a
  // childList mutation even when textContent is assigned the same value, which can
  // create an endless MutationObserver microtask loop and make the rendered login
  // screen unable to accept clicks/typing. Make same-value sidebar text writes a no-op.
  function installSidebarTextGuard(){
    if(w.__suvidhaSidebarTextGuard)return;
    try{
      var proto=w.Node&&w.Node.prototype;
      var desc=proto&&Object.getOwnPropertyDescriptor(proto,'textContent');
      if(!desc||typeof desc.get!=='function'||typeof desc.set!=='function'||!desc.configurable)return;
      Object.defineProperty(proto,'textContent',{
        configurable:desc.configurable,enumerable:desc.enumerable,get:desc.get,
        set:function(value){
          try{
            if(this&&this.nodeType===1&&this.closest&&this.closest('#sidebar')){
              var next=value==null?'':String(value);
              if(desc.get.call(this)===next)return;
            }
          }catch(_){ }
          return desc.set.call(this,value);
        }
      });
      w.__suvidhaSidebarTextGuard=true;
    }catch(err){console.error('Sidebar text guard install failed',err)}
  }
  installSidebarTextGuard();

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
    var code=String(read(x,'OutletCode','outletCode')||supportOutletCode||'').trim().toUpperCase();
    if(code)supportOutletCode=code;
    var e=target();
    if(e){e.textContent=name+' · '+type;e.dataset.outletName=name;e.dataset.storeType=type;e.title='Outlet Master: '+name+' / '+type}
    var pill=d.getElementById('outletPill');if(pill)pill.textContent=name;
    w.suvidhaOutlet={OutletName:name,OutletCode:code||null,StoreType:type,IsJewellery:type==='Jewellery Shop'||!!read(x,'IsJewellery','isJewellery'),IsUom:type!=='Jewellery Shop',ValidTill:read(x,'ValidTill','validTill')||null,UpdatedAt:read(x,'UpdatedAt','updatedAt')||null};
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

  async function refreshSupportOutletCode(){
    try{
      var r=await fetch('/public/license/status?_='+Date.now(),{cache:'no-store',headers:{'Accept':'application/json','Cache-Control':'no-cache'}});
      if(!r.ok)return supportOutletCode;
      var x=await r.json();
      var code=String(read(x,'OutletCode','outletCode')||'').trim().toUpperCase();
      if(code){supportOutletCode=code;try{sessionStorage.setItem('suvidha_support_outlet_code',code)}catch(_){}}
    }catch(_){ }
    return supportOutletCode;
  }
  try{supportOutletCode=sessionStorage.getItem('suvidha_support_outlet_code')||''}catch(_){ }

  function supportUrl(code){
    return 'http://suvidhapremium.suvidhapos.in/support/whatsapp?outletCode='+encodeURIComponent(code||'');
  }
  async function openCentralSupport(){
    var pop=null;
    try{pop=w.open('about:blank','_blank')}catch(_){ }
    var code=supportOutletCode||String((w.suvidhaOutlet&&w.suvidhaOutlet.OutletCode)||'');
    if(!code)code=await refreshSupportOutletCode();
    if(!code){
      try{if(pop)pop.close()}catch(_){ }
      var box=d.getElementById('loginError');if(box)box.textContent='Outlet Code not loaded. Please retry Contact Support.';
      return false;
    }
    var url=supportUrl(code);
    try{if(pop){pop.location.replace(url);return true}}catch(_){ }
    try{w.open(url,'_blank');return true}catch(_){return false}
  }
  w.openSuvidhaContactSupport=openCentralSupport;

  function normalizeSupportUi(root){
    try{
      var scope=root&&root.querySelectorAll?root:d;
      var buttons=scope.querySelectorAll?scope.querySelectorAll('#licenseRenewBtn'):[];
      for(var i=0;i<buttons.length;i++)if(buttons[i].textContent.indexOf('Contact Support')<0)buttons[i].textContent='💬 Contact Support';
    }catch(_){ }
  }
  d.addEventListener('click',function(ev){
    var t=ev.target&&ev.target.closest?ev.target.closest('#licenseRenewBtn,#supportBtn,#forgotPasswordBtn'):null;
    if(!t)return;
    ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
    openCentralSupport();
  },true);

  // Website StoreType/Validity remains authoritative. Re-check in background as soon
  // as the operator starts interacting with login, but never block the local login UI.
  var lastLoginKick=0;
  function kickOwnershipSync(){
    var now=Date.now();if(now-lastLoginKick<15000)return;lastLoginKick=now;
    setTimeout(function(){
      try{if(typeof w.backgroundOutletSync==='function')w.backgroundOutletSync('PULL','login-attempt',false)}catch(_){ }
      refreshSupportOutletCode();
    },0);
  }
  d.addEventListener('focusin',function(ev){if(ev.target&&/^(loginUser|loginPass)$/.test(ev.target.id||''))kickOwnershipSync()},true);
  d.addEventListener('pointerdown',function(ev){var t=ev.target&&ev.target.closest?ev.target.closest('#loginSubmitBtn,#loginUser,#loginPass'):null;if(t)kickOwnershipSync()},true);
  d.addEventListener('keydown',function(ev){if(ev.key==='Enter'&&ev.target&&/^(loginUser|loginPass)$/.test(ev.target.id||''))kickOwnershipSync()},true);

  function loadRuntimeFixes(){
    // index.html already loads this file. Do not execute it twice.
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
    restore();setTimeout(function(){refresh(false);refreshSupportOutletCode()},0);
    watchLoginTransition();normalizeSupportUi(d);
    new MutationObserver(function(ms){for(var i=0;i<ms.length;i++)if(ms[i].addedNodes&&ms[i].addedNodes.length){normalizeSupportUi(d);break}}).observe(d.body,{childList:true,subtree:true});
    // Intentionally no 30-second / 5-minute / focus / visibility polling.
    // Login and billing remain fully local between explicit synchronization events.
    if(d.readyState==='complete')loadRuntimeFixes();else w.addEventListener('load',loadRuntimeFixes,{once:true});
  }
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',start);else start();
})(window,document);
