(function(w,d){
  'use strict';
  var lastKey='';
  var timer=null;
  var busy=false;

  function target(){ return d.getElementById('loginOutlet'); }

  async function refresh(force){
    if(busy && !force) return;
    busy=true;
    try{
      var url='/public/specialization?_='+Date.now();
      var r=await fetch(url,{cache:'no-store',headers:{'Accept':'application/json','Cache-Control':'no-cache'}});
      if(!r.ok) throw new Error('HTTP '+r.status);
      var x=await r.json();
      var name=(x.OutletName||'Main Outlet').trim();
      var type=(x.StoreType||'Retail Shop').trim();
      var key=name+'|'+type+'|'+(x.UpdatedAt||'');
      var e=target();
      if(e && (force || key!==lastKey)){
        e.textContent=name+' · '+type;
        e.dataset.outletName=name;
        e.dataset.storeType=type;
        e.title='Outlet Master: '+name+' / '+type;
      }
      lastKey=key;

      var pill=d.getElementById('outletPill');
      if(pill) pill.textContent=name;
      w.suvidhaOutlet={OutletName:name,StoreType:type,IsJewellery:!!x.IsJewellery,IsUom:!!x.IsUom,UpdatedAt:x.UpdatedAt||null};
      w.dispatchEvent(new CustomEvent('suvidha:outlet-synced',{detail:w.suvidhaOutlet}));
    }catch(err){
      var e=target();
      if(e && !lastKey) e.textContent='Outlet Master unavailable';
      console.error('Outlet login sync failed',err);
    }finally{ busy=false; }
  }

  w.refreshLoginOutlet=refresh;
  w.addEventListener('suvidha:outlet-changed',function(){ refresh(true); });
  w.addEventListener('focus',function(){ refresh(false); });
  d.addEventListener('visibilitychange',function(){ if(!d.hidden) refresh(false); });

  function start(){
    refresh(true);
    if(timer) clearInterval(timer);
    timer=setInterval(function(){
      var login=d.getElementById('loginScreen');
      if(login && getComputedStyle(login).display!=='none') refresh(false);
    },3000);
  }
  if(d.readyState==='loading') d.addEventListener('DOMContentLoaded',start); else start();
})(window,document);
