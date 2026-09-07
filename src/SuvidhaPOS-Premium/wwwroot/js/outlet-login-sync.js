(function(w,d){
  'use strict';
  var timer=null,busy=false;
  function target(){return d.getElementById('loginOutlet')}
  function canonicalType(v){
    v=String(v||'').trim();
    if(/^(Gold & Diamond Jewellery|Silver Jewellery)$/i.test(v))return 'Jewellery Shop';
    return v||'Retail Shop';
  }
  function apply(x){
    var name=String(x&&x.OutletName||'Main Outlet').trim()||'Main Outlet';
    var type=canonicalType(x&&x.StoreType);
    var e=target();
    if(e){
      e.textContent=name+' · '+type;
      e.dataset.outletName=name;
      e.dataset.storeType=type;
      e.title='Outlet Master: '+name+' / '+type;
    }
    var pill=d.getElementById('outletPill');if(pill)pill.textContent=name;
    w.suvidhaOutlet={OutletName:name,StoreType:type,IsJewellery:type==='Jewellery Shop'||!!(x&&x.IsJewellery),IsUom:type!=='Jewellery Shop',UpdatedAt:x&&x.UpdatedAt||null};
    try{localStorage.setItem('suvidha_outlet_display',JSON.stringify(w.suvidhaOutlet))}catch{}
    try{w.dispatchEvent(new CustomEvent('suvidha:outlet-synced',{detail:w.suvidhaOutlet}))}catch{}
    return w.suvidhaOutlet;
  }
  function restore(){
    try{var raw=localStorage.getItem('suvidha_outlet_display');if(raw)apply(JSON.parse(raw))}catch{}
  }
  async function refresh(force){
    if(busy&&!force)return w.suvidhaOutlet||null;
    busy=true;
    try{
      var r=await fetch('/public/specialization?_='+Date.now(),{cache:'no-store',headers:{'Accept':'application/json','Cache-Control':'no-cache','Pragma':'no-cache'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      return apply(await r.json());
    }catch(err){
      if(!w.suvidhaOutlet){
        var e=target();if(e)e.textContent='Outlet Master unavailable';
      }
      console.error('Outlet login sync failed',err);
      return null;
    }finally{busy=false}
  }
  w.refreshLoginOutlet=refresh;
  w.addEventListener('suvidha:outlet-changed',()=>refresh(true));
  w.addEventListener('suvidha:outlet-saved',()=>refresh(true));
  w.addEventListener('focus',()=>refresh(false));
  d.addEventListener('visibilitychange',()=>{if(!d.hidden)refresh(false)});
  function start(){
    restore();refresh(true);
    if(timer)clearInterval(timer);
    timer=setInterval(()=>{
      var login=d.getElementById('loginScreen');
      if(login&&getComputedStyle(login).display!=='none')refresh(false);
    },2000);
    var login=d.getElementById('loginScreen');
    if(login){
      new MutationObserver(()=>{if(getComputedStyle(login).display!=='none')refresh(true)})
        .observe(login,{attributes:true,attributeFilter:['style','class']});
    }
  }
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',start);else start();
})(window,document);
