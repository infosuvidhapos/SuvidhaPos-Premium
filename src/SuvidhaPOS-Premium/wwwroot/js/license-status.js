(function(w,d){
'use strict';
let current=null;
const q=id=>d.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=(o,a,b)=>o?.[a]!==undefined?o[a]:o?.[b];
const fmt=v=>{if(!v)return '—';const x=new Date(v+'T00:00:00');return isNaN(x)?String(v):x.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})};
function normalize(s){
  s=s||{};
  return {
    managed:!!val(s,'managed','Managed'),loginAllowed:val(s,'loginAllowed','LoginAllowed')!==false,
    active:!!val(s,'active','Active'),expired:!!val(s,'expired','Expired'),showWarning:!!val(s,'showWarning','ShowWarning'),
    code:val(s,'code','Code')||'UNMANAGED',displayText:val(s,'displayText','DisplayText')||'LICENSE • NOT LINKED',
    message:val(s,'message','Message')||'',validFrom:val(s,'validFrom','ValidFrom'),validTill:val(s,'validTill','ValidTill'),
    daysRemaining:val(s,'daysRemaining','DaysRemaining'),outletCode:val(s,'outletCode','OutletCode'),outletName:val(s,'outletName','OutletName'),
    storeType:val(s,'storeType','StoreType'),plan:val(s,'plan','Plan'),deviceId:val(s,'deviceId','DeviceId')||''
  };
}
function cssClass(s){
  if(!s.managed)return 'license-unmanaged';
  if(!s.loginAllowed||s.expired)return 'license-expired';
  if(s.showWarning)return 'license-warning';
  return 'license-active';
}
w.applyLicenseStatus=function(raw){
  current=normalize(raw);
  const p=q('licensePill');
  if(p){
    p.className='license-pill '+cssClass(current);
    p.textContent=(current.expired?'⛔ ':current.showWarning?'⚠ ':current.managed?'◆ ':'◇ ')+current.displayText;
    p.title=current.message||'License status';
  }
  d.body.dataset.licenseState=current.code.toLowerCase();
  return current;
};
async function fetchStatus(){
  const token=w.suvidhaAuthToken||(()=>{try{return sessionStorage.getItem('suvidha_auth_token')}catch{return null}})();
  const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;
  const url=token?'/api/license/status':'/public/license/status';
  const r=await fetch(url,{headers,credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw new Error('License status unavailable');
  return await r.json();
}
w.refreshLicenseStatus=async function(showLoginWarning){
  try{
    const s=w.applyLicenseStatus(await fetchStatus());
    if(showLoginWarning&&s.managed&&s.loginAllowed&&s.showWarning)w.showLicenseWarning(s);
    if(showLoginWarning&&s.managed&&!s.loginAllowed)w.showLicenseExpired(s);
    return s;
  }catch(e){
    const p=q('licensePill');if(p){p.className='license-pill license-unmanaged';p.textContent='◇ LICENSE STATUS';p.title=e.message}
    return null;
  }
};
function overlay(kind,s){
  d.querySelectorAll('.license-overlay').forEach(x=>x.remove());
  const expired=kind==='expired';
  const days=Number(s.daysRemaining);
  const title=expired?'LICENSE EXPIRED':days===0?'LICENSE EXPIRES TODAY':('LICENSE EXPIRY ALERT');
  const hero=expired?'Access Locked':days===0?'Expires Today':days===1?'1 Day Remaining':days+' Days Remaining';
  const o=d.createElement('div');o.className='license-overlay';
  o.innerHTML='<div class="license-dialog '+(expired?'danger':'warn')+'">'+
    '<div class="license-dialog-icon">'+(expired?'⛔':'⚠')+'</div>'+
    '<div class="license-dialog-kicker">'+title+'</div><h2>'+hero+'</h2>'+
    '<p>'+esc(s.message||'')+'</p>'+
    '<div class="license-facts"><div><span>Plan</span><b>'+esc(s.plan||'Premium')+'</b></div><div><span>Valid Till</span><b>'+esc(fmt(s.validTill))+'</b></div>'+
    '<div><span>Outlet</span><b>'+esc(s.outletName||s.outletCode||'SuvidhaPOS')+'</b></div><div><span>Status</span><b>'+esc(s.code)+'</b></div></div>'+
    '<div class="license-actions">'+
      (expired?'<button class="license-primary" id="licenseCheckBtn">CHECK LICENSE</button><button class="license-secondary" id="licenseExitBtn">EXIT</button>':'<button class="license-primary" id="licenseContinueBtn">CONTINUE</button>')+
    '</div><small>Validity is controlled by the signed SuvidhaPOS server license. Local SQL cannot extend it.</small></div>';
  d.body.appendChild(o);
  q('licenseContinueBtn')?.addEventListener('click',()=>o.remove());
  q('licenseCheckBtn')?.addEventListener('click',async()=>{const b=q('licenseCheckBtn');b.disabled=true;b.textContent='CHECKING...';const st=await w.refreshLicenseStatus(false);if(st&&st.loginAllowed){o.remove();location.reload()}else{b.disabled=false;b.textContent='CHECK LICENSE'}});
  q('licenseExitBtn')?.addEventListener('click',()=>{try{if(w.chrome&&w.chrome.webview)w.chrome.webview.postMessage({type:'exit'});else w.close()}catch{}});
}
w.showLicenseWarning=function(raw){const s=normalize(raw);if(!s.showWarning||!s.loginAllowed)return;overlay('warning',s)};
w.showLicenseExpired=function(raw){const s=normalize(raw);overlay('expired',s)};
w.openLicenseDetails=function(){
  const s=current||{managed:false,code:'UNMANAGED',displayText:'LICENSE • NOT LINKED',message:'Central license server is not linked yet.'};
  d.querySelectorAll('.license-overlay').forEach(x=>x.remove());
  const o=d.createElement('div');o.className='license-overlay';
  o.innerHTML='<div class="license-dialog details"><div class="license-dialog-icon">'+(s.managed?'◆':'◇')+'</div><div class="license-dialog-kicker">SUVIDHAPOS PREMIUM LICENSE</div><h2>'+esc(s.displayText)+'</h2><p>'+esc(s.message||'')+'</p>'+
  '<div class="license-facts"><div><span>License Mode</span><b>'+(s.managed?'SERVER MANAGED':'NOT LINKED')+'</b></div><div><span>Plan</span><b>'+esc(s.plan||'—')+'</b></div>'+
  '<div><span>Valid From</span><b>'+esc(fmt(s.validFrom))+'</b></div><div><span>Valid Till</span><b>'+esc(fmt(s.validTill))+'</b></div>'+
  '<div><span>Outlet Code</span><b>'+esc(s.outletCode||'—')+'</b></div><div><span>Store Type</span><b>'+esc(s.storeType||'—')+'</b></div></div>'+
  '<div class="license-actions"><button class="license-primary" id="licenseDetailsCheck">CHECK LICENSE</button><button class="license-secondary" id="licenseDetailsClose">CLOSE</button></div>'+
  '<small>Validity is never read from the local SQL database.</small></div>';
  d.body.appendChild(o);
  q('licenseDetailsClose')?.addEventListener('click',()=>o.remove());
  q('licenseDetailsCheck')?.addEventListener('click',async()=>{await w.refreshLicenseStatus(false);o.remove();w.openLicenseDetails()});
};
function ready(){w.refreshLicenseStatus(false)}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',ready);else ready();
})(window,document);
