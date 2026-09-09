(function(w,d){
  'use strict';

  var current=null;

  function q(id){return d.getElementById(id)}
  function val(o,a,b){return o&&((o[a]!==undefined&&o[a]!==null)?o[a]:o[b])}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
  function fmt(v){
    if(!v)return '—';
    var dt=new Date(String(v).length===10?String(v)+'T00:00:00':v);
    if(isNaN(dt.getTime()))return String(v);
    return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  }

  function normalize(s){
    s=s||{};
    return {
      managed:!!val(s,'managed','Managed'),
      loginAllowed:!!val(s,'loginAllowed','LoginAllowed'),
      active:!!val(s,'active','Active'),
      expired:!!val(s,'expired','Expired'),
      showWarning:!!val(s,'showWarning','ShowWarning'),
      code:String(val(s,'code','Code')||'NOT_ACTIVATED'),
      displayText:String(val(s,'displayText','DisplayText')||'LICENSE • ACTIVATE'),
      message:String(val(s,'message','Message')||''),
      validFrom:val(s,'validFrom','ValidFrom'),
      validTill:val(s,'validTill','ValidTill'),
      daysRemaining:val(s,'daysRemaining','DaysRemaining'),
      outletCode:val(s,'outletCode','OutletCode'),
      outletName:val(s,'outletName','OutletName'),
      storeType:val(s,'storeType','StoreType'),
      plan:val(s,'plan','Plan'),
      deviceId:val(s,'deviceId','DeviceId')
    };
  }

  function cssClass(s){
    if(!s.managed||s.code==='NOT_ACTIVATED')return 'license-unmanaged';
    if(!s.loginAllowed||s.expired)return 'license-expired';
    if(s.showWarning)return 'license-warning';
    return 'license-active';
  }

  w.applyLicenseStatus=function(raw){
    current=normalize(raw);
    var p=q('licensePill');
    if(p){
      p.className='license-pill '+cssClass(current);
      p.textContent=(current.active?'◆ ':'◇ ')+current.displayText;
      p.title=current.message||'License status';
    }
    if(d.body)d.body.dataset.licenseState=current.code.toLowerCase();
    return current;
  };

  async function fetchStatus(){
    var token='';try{token=sessionStorage.getItem('authToken')||localStorage.getItem('authToken')||''}catch(e){}
    var url=token?'/api/license/status':'/public/license/status';
    var headers={'Accept':'application/json','Cache-Control':'no-cache','Pragma':'no-cache'};
    if(token)headers.Authorization='Bearer '+token;
    var r=await fetch(url,{headers:headers,credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw new Error('License status unavailable');
    return await r.json();
  }

  async function postLocal(url,body){
    var r=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache'},
      credentials:'same-origin',
      cache:'no-store',
      body:JSON.stringify(body||{})
    });
    var data=null;
    try{data=await r.json()}catch(e){}
    if(!r.ok){
      var err=new Error((data&&(data.message||data.Message))||('HTTP '+r.status));
      err.payload=data;
      err.httpStatus=r.status;
      throw err;
    }
    return data||{};
  }

  async function checkCentral(){
    var data=await postLocal('/api/license/check',{});
    var status=data.status||data.Status||data;
    return w.applyLicenseStatus(status);
  }

  w.activateCentralLicense=async function(outletCode,activationCode){
    var data=await postLocal('/api/license/activate',{
      outletCode:String(outletCode||'').trim(),
      activationCode:String(activationCode||'').trim()
    });
    var status=data.status||data.Status||data;
    return w.applyLicenseStatus(status);
  };

  w.checkCentralLicense=async function(){
    return await checkCentral();
  };

  w.refreshLicenseStatus=async function(showLoginWarning){
    try{
      var s=w.applyLicenseStatus(await fetchStatus());
      if(showLoginWarning&&(!s.managed||s.code==='NOT_ACTIVATED'))w.showLicenseActivation(s);
      else if(showLoginWarning&&s.managed&&s.loginAllowed&&s.showWarning)w.showLicenseWarning(s);
      else if(showLoginWarning&&s.managed&&!s.loginAllowed)w.showLicenseExpired(s);
      return s;
    }catch(e){
      var p=q('licensePill');
      if(p){p.className='license-pill license-unmanaged';p.textContent='◇ LICENSE STATUS';p.title=e.message}
      return current;
    }
  };

  function removeOverlays(){d.querySelectorAll('.license-overlay').forEach(function(x){x.remove()})}

  function facts(s){
    return '<div class="license-facts">'+
      '<div><span>Plan</span><b>'+esc(s.plan||'Premium')+'</b></div>'+
      '<div><span>Valid Till</span><b>'+esc(fmt(s.validTill))+'</b></div>'+
      '<div><span>Outlet</span><b>'+esc(s.outletName||s.outletCode||'SuvidhaPOS')+'</b></div>'+
      '<div><span>Status</span><b>'+esc(s.code)+'</b></div>'+
    '</div>';
  }

  function warningOverlay(expired,s){
    removeOverlays();
    var days=s.daysRemaining;
    var title=expired?'LICENSE EXPIRED':days===0?'LICENSE EXPIRES TODAY':'LICENSE EXPIRY ALERT';
    var hero=expired?'Renewal required':days===0?'License expires today':('Only '+days+' day'+(Number(days)===1?'':'s')+' remaining');
    var o=d.createElement('div');o.className='license-overlay';
    o.innerHTML='<div class="license-dialog '+(expired?'danger':'warn')+'">'+
      '<div class="license-dialog-icon">'+(expired?'⛔':'⚠')+'</div>'+
      '<div class="license-dialog-kicker">'+title+'</div><h2>'+esc(hero)+'</h2>'+
      '<p>'+esc(s.message||'')+'</p>'+facts(s)+
      '<div class="license-message" id="licenseOnlineMessage"></div>'+
      '<div class="license-actions">'+
        (expired?'<button class="license-primary" id="licenseCheckBtn">CHECK LICENSE</button><button class="license-secondary" id="licenseExitBtn">EXIT</button>':
        '<button class="license-primary" id="licenseContinueBtn">CONTINUE</button><button class="license-secondary" id="licenseWarningCheckBtn">CHECK NOW</button>')+
      '</div><small>Validity and Store Type are controlled only by the signed SuvidhaPOS Central license.</small></div>';
    d.body.appendChild(o);

    q('licenseContinueBtn')&&q('licenseContinueBtn').addEventListener('click',function(){o.remove()});
    q('licenseExitBtn')&&q('licenseExitBtn').addEventListener('click',function(){try{if(w.chrome&&w.chrome.webview)w.chrome.webview.postMessage({type:'exit'});else w.close()}catch(e){}});

    async function doCheck(btn){
      if(!btn)return;
      btn.disabled=true;btn.textContent='CHECKING...';
      var msg=q('licenseOnlineMessage');if(msg){msg.textContent='Connecting to SuvidhaPOS Central...';msg.className='license-message'}
      try{
        var st=await checkCentral();
        if(msg){msg.textContent=st.message||'License synchronized.';msg.className='license-message ok'}
        if(st.loginAllowed){o.remove();w.setTimeout(function(){location.reload()},250);return}
        if(st.code==='NOT_ACTIVATED'){o.remove();w.showLicenseActivation(st);return}
        btn.disabled=false;btn.textContent='CHECK LICENSE';
      }catch(e){
        if(msg){msg.textContent=e.message;msg.className='license-message error'}
        btn.disabled=false;btn.textContent='CHECK LICENSE';
      }
    }

    q('licenseCheckBtn')&&q('licenseCheckBtn').addEventListener('click',function(){doCheck(q('licenseCheckBtn'))});
    q('licenseWarningCheckBtn')&&q('licenseWarningCheckBtn').addEventListener('click',function(){doCheck(q('licenseWarningCheckBtn'))});
  }

  w.showLicenseWarning=function(raw){
    var s=normalize(raw);
    if(!s.showWarning||!s.loginAllowed)return;
    warningOverlay(false,s);
  };

  w.showLicenseExpired=function(raw){
    var s=normalize(raw);
    if(!s.managed||s.code==='NOT_ACTIVATED'){w.showLicenseActivation(s);return}
    warningOverlay(true,s);
  };

  w.showLicenseActivation=function(raw){
    var s=normalize(raw);
    removeOverlays();
    var o=d.createElement('div');o.className='license-overlay';
    o.innerHTML='<div class="license-dialog">'+
      '<div class="license-dialog-icon">🔐</div>'+
      '<div class="license-dialog-kicker">SUVIDHAPOS CENTRAL ACTIVATION</div>'+
      '<h2>Activate this POS</h2>'+
      '<p>Central Admin me outlet create karne par mila Outlet Code aur one-time Activation Code yahan enter karein.</p>'+
      '<div class="license-activate-form">'+
        '<label>Outlet Code<input id="licenseOutletCode" autocomplete="off" placeholder="OUT-000001" value="'+esc(s.outletCode||'')+'"></label>'+
        '<label>Activation Code<input id="licenseActivationCode" type="password" autocomplete="off" placeholder="Activation Code"></label>'+
      '</div>'+
      '<div class="license-message" id="licenseActivationMessage"></div>'+
      '<div class="license-actions"><button class="license-primary" id="licenseActivateBtn">ACTIVATE</button><button class="license-secondary" id="licenseActivationExitBtn">EXIT</button></div>'+
      '<small>Device: '+esc(s.deviceId||'This computer')+'<br>Activation binds this outlet to this computer.</small>'+
    '</div>';
    d.body.appendChild(o);

    var outlet=q('licenseOutletCode'),code=q('licenseActivationCode'),btn=q('licenseActivateBtn'),msg=q('licenseActivationMessage');
    try{outlet&&outlet.focus()}catch(e){}

    async function activate(){
      var oc=outlet?outlet.value.trim():'';
      var ac=code?code.value.trim():'';
      if(!oc||!ac){
        if(msg){msg.textContent='Outlet Code aur Activation Code dono required hain.';msg.className='license-message error'}
        return;
      }
      btn.disabled=true;btn.textContent='ACTIVATING...';
      if(msg){msg.textContent='Connecting to SuvidhaPOS Central...';msg.className='license-message'}
      try{
        var st=await w.activateCentralLicense(oc,ac);
        if(msg){msg.textContent=st.message||'Activation successful.';msg.className='license-message ok'}
        if(st.loginAllowed){w.setTimeout(function(){o.remove();location.reload()},500);return}
        btn.disabled=false;btn.textContent='ACTIVATE';
      }catch(e){
        if(msg){msg.textContent=e.message;msg.className='license-message error'}
        btn.disabled=false;btn.textContent='ACTIVATE';
      }
    }

    btn.addEventListener('click',activate);
    code&&code.addEventListener('keydown',function(e){if(e.key==='Enter')activate()});
    q('licenseActivationExitBtn').addEventListener('click',function(){try{if(w.chrome&&w.chrome.webview)w.chrome.webview.postMessage({type:'exit'});else o.remove()}catch(e){o.remove()}});
  };

  w.openLicenseDetails=function(){
    var s=current||{managed:false,code:'NOT_ACTIVATED',displayText:'LICENSE • ACTIVATE',message:'Central license is not activated.'};
    if(!s.managed||s.code==='NOT_ACTIVATED'){w.showLicenseActivation(s);return}

    removeOverlays();
    var o=d.createElement('div');o.className='license-overlay';
    o.innerHTML='<div class="license-dialog details"><div class="license-dialog-icon">◆</div>'+
      '<div class="license-dialog-kicker">SUVIDHAPOS PREMIUM LICENSE</div><h2>'+esc(s.displayText)+'</h2><p>'+esc(s.message||'')+'</p>'+
      facts(s)+
      '<div class="license-message" id="licenseDetailsMessage"></div>'+
      '<div class="license-actions"><button class="license-primary" id="licenseDetailsCheck">CHECK LICENSE</button><button class="license-secondary" id="licenseDetailsClose">CLOSE</button></div>'+
      '<small>Central: suvidhapremium.suvidhapos.in</small></div>';
    d.body.appendChild(o);

    q('licenseDetailsClose').addEventListener('click',function(){o.remove()});
    q('licenseDetailsCheck').addEventListener('click',async function(){
      var b=q('licenseDetailsCheck'),m=q('licenseDetailsMessage');b.disabled=true;b.textContent='CHECKING...';
      try{
        var st=await checkCentral();
        if(m){m.textContent=st.message||'License synchronized.';m.className='license-message ok'}
        current=st;
        if(st.loginAllowed){w.setTimeout(function(){o.remove();w.openLicenseDetails()},400);return}
        b.disabled=false;b.textContent='CHECK LICENSE';
      }catch(e){
        if(m){m.textContent=e.message;m.className='license-message error'}
        b.disabled=false;b.textContent='CHECK LICENSE';
      }
    });
  };

  function ready(){w.refreshLicenseStatus(false)}
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',ready);else ready();
})(window,document);
