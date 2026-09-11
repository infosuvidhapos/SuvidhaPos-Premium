(function(w,d){
'use strict';
const S={rows:[],map:{},loaded:false};
const PAGE_KEYS={
 billing:'BILLING',products:'ITEM_MASTER',aiimport:'AI_IMPORT',itemimport:'ITEM_IMPORT',purchase:'PURCHASES',
 sales:'SALES_HISTORY',billmaster:'BILL_MANAGEMENT',btcsettlement:'BTC_SETTLEMENT',customers:'CUSTOMER_COMPANY',
 suppliers:'SUPPLIERS',expiry:'EXPIRY',returns:'RETURNS',expenses:'EXPENSES',taxmaster:'TAX_MASTER',
 unitmaster:'UNIT_MASTER',reports:'REPORTS',barcodemaster:'BARCODE_PRINT'
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function role(){return String((w.currentUser||{}).Role||'').toLowerCase()}
function admin(){return ['admin','administrator','super admin'].includes(role())}
function toastSafe(x){try{toast(x)}catch(_){alert(x)}}
w.suvidhaFeatureEnabled=function(key){key=String(key||'').toUpperCase();return S.map[key]===undefined?true:!!S.map[key]};
w.suvidhaFeatureEnabledByPage=function(page){const key=PAGE_KEYS[String(page||'')];return !key||w.suvidhaFeatureEnabled(key)};
function rebuild(rows){S.rows=Array.isArray(rows)?rows:[];S.map={};S.rows.forEach(x=>S.map[String(x.FeatureKey||'').toUpperCase()]=!!x.IsEnabled);S.loaded=true}
async function load(){try{rebuild(await api('/api/feature-access'));patch();return S.rows}catch(e){console.warn('Feature access unavailable:',e);return S.rows}}
function infer(el){
 if(!el)return '';
 if(el.dataset.featureKey)return el.dataset.featureKey;
 const p=el.dataset.page;if(p&&PAGE_KEYS[p])return PAGE_KEYS[p];
 const t=String(el.textContent||'').trim().toLowerCase();
 const pairs=[
  ['database backup','DATABASE_BACKUP'],['print master','PRINT_MASTER'],['barcode print','BARCODE_PRINT'],
  ['btc / credit settlement','BTC_SETTLEMENT'],['customer / company','CUSTOMER_COMPANY'],
  ['item import','ITEM_IMPORT'],['ai import','AI_IMPORT'],['bill management','BILL_MANAGEMENT']
 ];
 const hit=pairs.find(x=>t.includes(x[0]));return hit?hit[1]:'';
}
function ensureControlNav(){
 const side=d.getElementById('sidebar');if(!side)return;
 let n=d.getElementById('featureAccessNav')||d.getElementById('featureControlNav');
 if(n){n.id='featureAccessNav';n.innerHTML=n.classList.contains('nav')?'⚙ <span>Feature Control</span>':'⚙ Feature Control';n.onclick=()=>w.loadFeatureAccessControl();n.style.display='';return}
 const bottom=side.querySelector('.sidebottom');
 if(bottom){n=d.createElement('button');n.id='featureAccessNav';n.className='plain';n.innerHTML='⚙ Feature Control';n.onclick=()=>w.loadFeatureAccessControl();bottom.appendChild(n)}
}
function patch(){
 ensureControlNav();
 d.querySelectorAll('#sidebar [data-page],#sidebar [data-feature-key]').forEach(el=>{
  const key=infer(el);if(!key)return;el.dataset.featureKey=key;el.style.display=w.suvidhaFeatureEnabled(key)?'':'none';
 });
 d.querySelectorAll('[data-feature-key]').forEach(el=>{const key=el.dataset.featureKey;if(key&&el.id!=='featureAccessNav')el.classList.toggle('feature-disabled',!w.suvidhaFeatureEnabled(key))});
}
d.addEventListener('click',e=>{
 const el=e.target.closest&&e.target.closest('[data-feature-key]');if(!el)return;
 const key=el.dataset.featureKey;if(key&&!w.suvidhaFeatureEnabled(key)){
  e.preventDefault();e.stopImmediatePropagation();toastSafe('This feature is disabled in Feature Control: '+key);
 }
},true);
function groupHtml(scope){
 const rows=S.rows.filter(x=>String(x.Scope||'Shared')===scope);
 return '<div class="feature-access-group"><div class="feature-access-head"><h3>'+esc(scope)+'</h3><span>'+rows.filter(x=>x.IsEnabled).length+' / '+rows.length+' enabled</span></div><div class="feature-access-grid">'+rows.map(x=>
  '<label class="feature-access-row"><span><b>'+esc(x.DisplayName)+'</b><small>'+esc(x.FeatureKey)+'</small></span><input type="checkbox" '+(x.IsEnabled?'checked':'')+' onchange="suvidhaToggleFeatureAccess(\''+esc(x.FeatureKey)+'\',this.checked,this)"></label>'
 ).join('')+'</div></div>';
}
w.loadFeatureAccessControl=async function(){
 if(!admin()){try{setPage('settings')}catch{};app.innerHTML='<div class="content"><div class="alert">Admin / Super Admin permission required.</div></div>';return}
 await load();try{setPage('featurecontrol')}catch{};if(typeof title!=='undefined')title.textContent='Feature Control';const hp=d.querySelector('header p');if(hp)hp.textContent='Enable or disable actual SuvidhaPOS masters and modules';
 app.innerHTML='<div class="content feature-access-page"><div class="panel feature-access-hero"><div><span>MASTER ACCESS</span><h2>Feature Control</h2><p>Disable a master/module without deleting its data. Disabled items disappear from navigation and cannot be opened.</p></div><b>ADMIN</b></div>'+['Normal','Shared','Jewellery'].map(groupHtml).join('')+'</div>';
};
w.loadPremiumFeatureControl=w.loadFeatureAccessControl;
w.suvidhaToggleFeatureAccess=async function(key,on,input){
 try{await api('/api/feature-access/'+encodeURIComponent(key),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({IsEnabled:!!on})});S.map[String(key).toUpperCase()]=!!on;toastSafe((on?'Enabled: ':'Disabled: ')+key);patch()}
 catch(e){if(input)input.checked=!on;alert(e.message||e)}
};
const obs=new MutationObserver(()=>patch());obs.observe(d.documentElement,{childList:true,subtree:true});
w.addEventListener('load',()=>setTimeout(load,350),{once:true});if(d.readyState==='complete')setTimeout(load,350);
})(window,document);