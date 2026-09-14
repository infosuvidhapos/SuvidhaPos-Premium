(function(w,d){
'use strict';
const PREFIX='Sidebar.Feature.';
const catalog=[
 ['BILLING','New Billing',['[data-page="billing"]'],['New Billing']],
 ['ITEM_MASTER','Item Master',['[data-page="products"]'],['Item Master','Items & Inventory']],
 ['CATEGORY_MASTER','Category Master',[],['Category Entry','Category Master']],
 ['AI_IMPORT','AI Import',[],['AI Import']],
 ['ITEM_IMPORT','Item Import Master',[],['Item Import','Item Import Master']],
 ['BULK_EDIT','Bulk Edit Update',[],['Bulk Edit Update']],
 ['ITEM_RATE_UPDATE','Item Rate Update',[],['Item Rate Update']],
 ['OPENING_STOCK','Opening Stock Master',[],['Opening Stock','Opening Stock Master']],
 ['STOCK','Stock Management',[],['Stock','Stock Management']],
 ['PURCHASE','Purchase Master',['[data-page="purchase"]'],['Purchases','Purchase Master','Purchase Bill']],
 ['SALES','Sales History',['[data-page="sales"]'],['Sales History']],
 ['BILL_MANAGEMENT','Bill Management Master',['[data-page="billmaster"]'],['Bill Management','Bill Management Master']],
 ['BTC_SETTLEMENT','BTC / Credit Settlement',['#btcSettlementNav'],['BTC Settlement','BTC / Credit Settlement']],
 ['CUSTOMERS','Customer / Company Master',['[data-page="customers"]'],['Customers','Customer / Company']],
 ['SUPPLIERS','Supplier Master',['[data-page="suppliers"]'],['Suppliers']],
 ['EXPIRY','Expiry Center',['[data-page="expiry"]'],['Expiry Center']],
 ['RETURNS','Returns',['[data-page="returns"]'],['Returns']],
 ['EXPENSES','Expense Master',['[data-page="expenses"]'],['Expenses']],
 ['TAX_MASTER','Tax Master',['[data-page="taxmaster"]'],['Tax Master']],
 ['UNIT_MASTER','Unit Master',['[data-page="unitmaster"]'],['Unit Master']],
 ['BARCODE','Barcode Print Master',['[data-page="barcodemaster"]','#barcodeMasterNav'],['Barcode Print Master']],
 ['PRINT_MASTER','Print Master',[],['Print Master']],
 ['REPORTS','Reports',['[data-page="reports"]'],['Reports']],
 ['SETTINGS','Settings / Outlet Master',[],['Settings']],
 ['USERS','User Master',[],['Users']],
 ['DAY_CLOSE','Day Close / Shift End',[],['Day Close','Day Closing']],
 ['DATABASE_BACKUP','Database Backup',[],['Database Backup']]
];
const nestedRoutes={loadCategoryMaster:'CATEGORY_MASTER',loadAIImport:'AI_IMPORT',loadNormalItemImportMaster:'ITEM_IMPORT',openProductBulkEdit:'BULK_EDIT',loadItemRateUpdate:'ITEM_RATE_UPDATE',loadOpeningStockMaster:'OPENING_STOCK',loadStock:'STOCK'};
let state={},loaded=false;
const role=()=>String((w.currentUser||{}).Role||'').toLowerCase();
const admin=()=>['admin','administrator','manager'].includes(role());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function load(){
 try{const rows=await api('/api/app-settings');state={};catalog.forEach(x=>state[x[0]]=true);(rows||[]).forEach(x=>{const k=String(x.Key||x.key||'');if(!k.startsWith(PREFIX))return;state[k.slice(PREFIX.length)]=!/^false|0|off$/i.test(String(x.Value??x.value??'true'))});loaded=true;apply()}catch(_){}
}
function textButtons(){return [...d.querySelectorAll('#sidebar button,#sidebar .nav,#sidebar .plain')]}
function matchesText(el,names){
 const label=el.querySelector?.('span:not(.js-icon)');
 const t=String(label?.textContent||el.textContent||'').replace(/^[^\p{L}\p{N}]+/u,'').replace(/\s+/g,' ').trim().toLowerCase();
 return names.some(n=>t===String(n).toLowerCase())
}
function apply(){
 if(!loaded||d.body.classList.contains('jewel-suite-mode'))return;
 const side=d.getElementById('sidebar');if(!side)return;
 catalog.forEach(([key,,selectors,names])=>{
  const on=state[key]!==false,nodes=new Set();
  selectors.forEach(s=>{try{side.querySelectorAll(s).forEach(x=>nodes.add(x))}catch{}});
  textButtons().filter(x=>matchesText(x,names)).forEach(x=>nodes.add(x));
  nodes.forEach(x=>{if(x.id==='featureControlNav'||/feature control/i.test(x.textContent||''))return;x.style.display=on?'':'none';x.dataset.sidebarFeature=key});
 });
 const root=d.getElementById('app');
 if(root)root.querySelectorAll('button[onclick]').forEach(button=>{
  const code=String(button.getAttribute('onclick')||''),match=Object.entries(nestedRoutes).find(([fn])=>new RegExp('\\b'+fn+'\\s*\\(').test(code));
  if(match){button.style.display=state[match[1]]!==false?'':'none';button.dataset.sidebarFeature=match[1]}
 });
}
w.loadRetailFeatureControl=async function(){
 if(d.body.classList.contains('jewel-suite-mode')&&w.loadJewelleryFeatureControl)return w.loadJewelleryFeatureControl();
 if(typeof setPage==='function')setPage('featurecontrol');if(typeof title!=='undefined')title.textContent='Feature Control';const hp=d.querySelector('header p');if(hp)hp.textContent='Normal billing masters and module switches';
 if(!admin()){app.innerHTML='<div class="content"><div class="alert">Admin / Manager permission required.</div></div>';return}
 if(!loaded)await load();
 app.innerHTML='<div class="content completion-page feature-access-page"><div class="panel completion-hero"><div><span class="completion-kicker">NORMAL BILLING ACCESS</span><h2>Feature Control</h2><p>Enable or disable normal Retail / Canteen masters and modules here. Jewellery controls stay separate.</p></div><span class="tag">'+catalog.length+' OPTIONS</span></div><div class="panel"><div class="feature-grid">'+catalog.map(([key,name])=>'<label class="feature-flag"><span><b>'+esc(name)+'</b></span><input type="checkbox" '+(state[key]!==false?'checked':'')+' onchange="sidebarFeatureToggle(\''+key+'\',this.checked)"></label>').join('')+'</div></div></div>'
};
w.loadPremiumFeatureControl=w.loadRetailFeatureControl;
w.sidebarFeatureToggle=async function(key,on){try{await api('/api/app-settings/'+encodeURIComponent(PREFIX+key),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:on?'true':'false'})});state[key]=!!on;apply();toast((on?'Enabled: ':'Disabled: ')+(catalog.find(x=>x[0]===key)?.[1]||key))}catch(e){alert(e.message||e)}};
const original={};
function gate(key,names){
 names.forEach(name=>{const fn=w[name];if(typeof fn!=='function'||fn.__sidebarFeatureGate===key)return;if(!original[name]||original[name].__sidebarFeatureGate)original[name]=fn;const base=fn;const wrap=function(){if(!d.body.classList.contains('jewel-suite-mode')&&state[key]===false){try{toast((catalog.find(x=>x[0]===key)?.[1]||key)+' is disabled in Feature Control')}catch{};return}return base.apply(this,arguments)};wrap.__sidebarFeatureGate=key;w[name]=wrap})
}
function gates(){
 if(!loaded||d.body.classList.contains('jewel-suite-mode'))return;
 gate('BILLING',['loadBilling']);
 gate('ITEM_MASTER',['loadProducts']);
 gate('CATEGORY_MASTER',['loadCategoryMaster']);
 gate('AI_IMPORT',['loadAIImport']);
 gate('ITEM_IMPORT',['loadNormalItemImportMaster']);
 gate('BULK_EDIT',['openProductBulkEdit']);
 gate('ITEM_RATE_UPDATE',['loadItemRateUpdate']);
 gate('OPENING_STOCK',['loadOpeningStockMaster']);
 gate('STOCK',['loadStock']);
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
}
function pulse(){apply();gates()}
new MutationObserver(()=>pulse()).observe(d.getElementById('sidebar')||d.documentElement,{childList:true,subtree:true});
new MutationObserver(()=>apply()).observe(d.getElementById('app')||d.documentElement,{childList:true,subtree:true});
w.addEventListener('load',()=>setTimeout(()=>{load();setInterval(pulse,2000)},250));
if(d.readyState!=='loading')setTimeout(load,100);
})(window,document);
