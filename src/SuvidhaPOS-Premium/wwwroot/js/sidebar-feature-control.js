(function(w,d){
'use strict';
const PREFIX='Sidebar.Feature.';
const catalog=[
 ['BILLING','New Billing / Jewellery Billing',['[data-page="billing"]'],['New Billing','Jewellery Billing']],
 ['ITEM_MASTER','Item Master',['[data-page="products"]'],['Item Master','Item Entry','Items & Inventory']],
 ['STOCK','Stock / Inventory',[],['Stock']],
 ['PURCHASE','Purchases',['[data-page="purchase"]'],['Purchases','Purchase Bill']],
 ['SALES','Sales History',['[data-page="sales"]'],['Sales History']],
 ['BILL_MANAGEMENT','Bill Management',['[data-page="billmaster"]'],['Bill Management','Bill Management Master']],
 ['BTC_SETTLEMENT','BTC / Credit Settlement',['#btcSettlementNav'],['BTC Settlement','BTC / Credit Settlement']],
 ['CUSTOMERS','Customer / Company',['[data-page="customers"]'],['Customers','Customer / Company']],
 ['SUPPLIERS','Suppliers',['[data-page="suppliers"]'],['Suppliers']],
 ['EXPIRY','Expiry Center',['[data-page="expiry"]'],['Expiry Center']],
 ['RETURNS','Returns',['[data-page="returns"]'],['Returns']],
 ['EXPENSES','Expenses',['[data-page="expenses"]'],['Expenses']],
 ['TAX_MASTER','Tax Master',['[data-page="taxmaster"]'],['Tax Master']],
 ['UNIT_MASTER','Unit Master',['[data-page="unitmaster"]'],['Unit Master']],
 ['REPORTS','Reports',['[data-page="reports"]'],['Reports']],
 ['SETTINGS','Settings',[],['Settings']],
 ['DAY_CLOSE','Day Close / Shift End',[],['Day Close','Day Closing']],
 ['USERS','Users',[],['Users']],
 ['BARCODE','Barcode Print Master',['[data-page="barcodemaster"]','#barcodeMasterNav'],['Barcode Print Master']],
 ['PRINT_MASTER','Print Master',[],['Print Master']],
 ['DATABASE_BACKUP','Database Backup',[],['Database Backup']],
 ['GIRVI','Girvi Loans',[],['Girvi Loans']],
 ['CRDR','Cr/Dr Ledger',[],['Cr/Dr Ledger']],
 ['SAVING','Saving Schemes',[],['Saving Schemes']],
 ['JEWELLERY_ITEM_MASTER','Jewellery Item Master',[],['Jewellery Item Master']]
];
let state={},loaded=false;
const role=()=>String((w.currentUser||{}).Role||'').toLowerCase();
const admin=()=>['admin','administrator','manager'].includes(role());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function load(){
 try{const rows=await api('/api/app-settings');state={};catalog.forEach(x=>state[x[0]]=true);(rows||[]).forEach(x=>{const k=String(x.Key||x.key||'');if(!k.startsWith(PREFIX))return;state[k.slice(PREFIX.length)]=!/^false|0|off$/i.test(String(x.Value??x.value??'true'))});loaded=true;apply()}catch(_){}
}
function textButtons(){return [...d.querySelectorAll('#sidebar button,#sidebar .nav,#sidebar .plain')]}
function matchesText(el,names){const t=String(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();return names.some(n=>t===String(n).toLowerCase()||t.startsWith(String(n).toLowerCase()+' '))}
function apply(){
 if(!loaded)return;
 const side=d.getElementById('sidebar');if(!side)return;
 catalog.forEach(([key,,selectors,names])=>{
  const on=state[key]!==false,nodes=new Set();
  selectors.forEach(s=>{try{side.querySelectorAll(s).forEach(x=>nodes.add(x))}catch{}});
  textButtons().filter(x=>matchesText(x,names)).forEach(x=>nodes.add(x));
  nodes.forEach(x=>{if(x.id==='featureControlNav'||/feature control/i.test(x.textContent||''))return;x.style.display=on?'':'none';x.dataset.sidebarFeature=key});
 });
}
w.loadPremiumFeatureControl=async function(){
 if(typeof setPage==='function')setPage('featurecontrol');if(typeof title!=='undefined')title.textContent='Feature Control';const hp=d.querySelector('header p');if(hp)hp.textContent='Sidebar masters and modules access';
 if(!admin()){app.innerHTML='<div class="content"><div class="alert">Admin / Manager permission required.</div></div>';return}
 if(!loaded)await load();
 const relevant=catalog.filter(([key,,selectors,names])=>{if(['GIRVI','CRDR','SAVING','STOCK','JEWELLERY_ITEM_MASTER'].includes(key))return d.body.classList.contains('jewel-suite-mode')||textButtons().some(x=>matchesText(x,names));return true});
 app.innerHTML='<div class="content completion-page feature-access-page"><div class="panel completion-hero"><div><span class="completion-kicker">SIDEBAR ACCESS</span><h2>Feature Control</h2><p>Only real sidebar masters/modules are shown here. Validity, website sync and internal technical flags are not user switches.</p></div><span class="tag">ADMIN</span></div><div class="panel"><div class="feature-grid">'+relevant.map(([key,name])=>'<label class="feature-flag"><span><b>'+esc(name)+'</b><small>'+esc(key.replaceAll('_',' '))+'</small></span><input type="checkbox" '+(state[key]!==false?'checked':'')+' onchange="sidebarFeatureToggle(\''+key+'\',this.checked)"></label>').join('')+'</div></div></div>'
};
w.sidebarFeatureToggle=async function(key,on){try{await api('/api/app-settings/'+encodeURIComponent(PREFIX+key),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:on?'true':'false'})});state[key]=!!on;apply();toast((on?'Enabled: ':'Disabled: ')+(catalog.find(x=>x[0]===key)?.[1]||key))}catch(e){alert(e.message||e)}};
const original={};
function gate(key,names){
 names.forEach(name=>{const fn=w[name];if(typeof fn!=='function'||fn.__sidebarFeatureGate===key)return;if(!original[name]||original[name].__sidebarFeatureGate)original[name]=fn;const base=fn;const wrap=function(){if(state[key]===false){try{toast((catalog.find(x=>x[0]===key)?.[1]||key)+' is disabled in Feature Control')}catch{};return}return base.apply(this,arguments)};wrap.__sidebarFeatureGate=key;w[name]=wrap})
}
function gates(){
 if(!loaded)return;
 gate('BILLING',['loadBilling']);
 gate('PURCHASE',['loadPurchase']);
 gate('SALES',['loadSales']);
 gate('BILL_MANAGEMENT',['loadBillMaster']);
 gate('BTC_SETTLEMENT',['loadBtcSettlement']);
 gate('CUSTOMERS',['loadCustomers']);
 gate('SUPPLIERS',['loadSuppliers']);
 gate('EXPIRY',['loadExpiry']);
 gate('RETURNS',['loadReturns']);
 gate('EXPENSES',['loadExpenses']);
 gate('TAX_MASTER',['loadTaxMaster','loadTaxmaster']);
 gate('UNIT_MASTER',['loadUnitMaster','loadUnitmaster']);
 gate('REPORTS',['loadReports']);
 gate('SETTINGS',['loadSettings']);
 gate('USERS',['loadUsers']);
 gate('BARCODE',['loadBarcodePrintMaster']);
 gate('PRINT_MASTER',['loadPrintSettings']);
 gate('DATABASE_BACKUP',['loadBackupMaster']);
 gate('DAY_CLOSE',['loadDayClosing']);
 gate('JEWELLERY_ITEM_MASTER',['loadJewelleryItemMaster']);
 const product=w.loadProducts;
 if(typeof product==='function'&&!product.__sidebarProductGate){
   const wrapped=function(){const key=d.body.classList.contains('jewel-suite-mode')?'STOCK':'ITEM_MASTER';if(state[key]===false){try{toast((catalog.find(x=>x[0]===key)?.[1]||key)+' is disabled in Feature Control')}catch{};return}return product.apply(this,arguments)};wrapped.__sidebarProductGate=true;w.loadProducts=wrapped;
 }
}
function pulse(){apply();gates()}
new MutationObserver(()=>pulse()).observe(d.getElementById('sidebar')||d.documentElement,{childList:true,subtree:true});
w.addEventListener('load',()=>setTimeout(()=>{load();setInterval(pulse,2000)},250));
if(d.readyState!=='loading')setTimeout(load,100);
})(window,document);