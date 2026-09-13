(function(w,d){
'use strict';
const S=w.S;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>{const x=new Date();return new Date(x-x.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const stockQty=n=>Math.round((n+Number.EPSILON)*1000)/1000;
const baseRate=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
const read=id=>d.getElementById(id)?.value||'';
const TEMP='SuvidhaPOS.BarcodePurchase.Temp.v1';
let history=[],saving=false,scanQueue=Promise.resolve(),session=0;
function page(title,subtitle){setPage('purchase');d.getElementById('title').textContent=title;const p=d.querySelector('header p');if(p)p.textContent=subtitle}
async function catalog(){[S.items,S.suppliers]=await Promise.all([api('/api/products?size=1000'),api('/api/suppliers')]);if(!S.spec)S.spec=await api('/api/specialization')}
const requiresExpiry=()=>/pharmacy|medical/i.test(S.spec?.StoreType||S.spec?.storeType||'')||S.spec?.RequireExpiry===true||S.spec?.requireExpiry===true;
const requiresBatch=()=>/pharmacy|medical/i.test(S.spec?.StoreType||S.spec?.storeType||'')||S.spec?.RequireBatch===true||S.spec?.requireBatch===true;
function headerActions(){return `<button class="btn" onclick="openUomPurchase()">＋ New Purchase <small>F2</small></button><button class="btn secondary" onclick="openPurchaseImport()">⇩ Import Excel Bill</button><button class="btn secondary" onclick="openBarcodePurchase()">▥ Barcode Purchase</button>`}
w.loadRetailPurchases=async function(){
 session++;page('Purchases','Purchase inward · stock · supplier balances');
 app.innerHTML='<div class="content retail-purchase"><div class="panel empty" role="status">Loading purchases…</div></div>';
 try{await catalog();history=await api('/api/purchases');const total=history.reduce((a,x)=>a+Number(x.GrandTotal||0),0),paid=history.reduce((a,x)=>a+Number(x.PaidAmount||0),0);
 app.innerHTML=`<div class="content retail-purchase purchase-page"><div class="rp-heading"><div><span class="rp-eyebrow">STOCK & SUPPLIERS</span><h2>Purchase inward</h2><p>Add a bill, scan items or import your supplier's Excel.</p></div><div class="rp-actions">${headerActions()}</div></div>
 <div class="rp-stats"><div><span>Recent bills</span><b>${history.length}</b></div><div><span>Purchase value</span><b>₹${money(total)}</b></div><div><span>Paid</span><b>₹${money(paid)}</b></div><div><span>Balance payable</span><b>₹${money(total-paid)}</b></div></div>
 <div class="rp-import-banner"><div><b>Import a purchase bill in one step</b><p>Preview items, duplicates and tax before stock is posted. Existing item masters stay protected.</p></div><button class="btn secondary" onclick="openPurchaseImport()">Choose Excel file ↗</button></div>
 <div class="panel rp-history"><div class="panelhead"><div><h3>Recent purchases</h3><small class="muted">Showing the most recent ${history.length} bills</small></div><input class="input" aria-label="Search purchase history" placeholder="Invoice or supplier…" oninput="filterPurchaseHistory(this.value)"></div><div class="tablewrap"><table class="table"><thead><tr><th>Invoice / Date</th><th>Supplier</th><th>Taxable value</th><th>GST</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody id="rpHistoryRows">${historyRows(history)}</tbody></table></div></div></div>`;
 }catch(e){app.innerHTML=`<div class="content retail-purchase"><div class="panel rp-error" role="alert">${esc(e.message)}<button class="btn secondary" onclick="loadPurchase()">Retry</button></div></div>`}
};
function historyRows(rows){return rows.map(x=>`<tr><td><b>${esc(x.InvoiceNo)}</b><small>${esc(String(x.PurchaseDate||'').slice(0,10))}</small></td><td>${esc(x.SupplierName)}</td><td>₹${money(x.SubTotal)}</td><td>₹${money(x.Tax)}</td><td><b>₹${money(x.GrandTotal)}</b></td><td>₹${money(x.PaidAmount)}</td><td>₹${money(Number(x.GrandTotal||0)-Number(x.PaidAmount||0))}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No purchases found. Add a bill or import Excel to begin.</td></tr>'}
w.filterPurchaseHistory=q=>{const term=String(q).toLowerCase();d.getElementById('rpHistoryRows').innerHTML=historyRows(history.filter(x=>[x.InvoiceNo,x.SupplierName,x.PurchaseDate].join(' ').toLowerCase().includes(term)))};
function supplierOptions(){return '<option value="">Walk-in Supplier</option>'+S.suppliers.map(x=>`<option value="${x.Id}">${esc(x.Name)}</option>`).join('')}
function suggestions(){return S.items.map(x=>`<option value="${esc(x.Barcode||x.Name)}">${esc(x.Name)} · ${esc(x.Sku||'')}</option><option value="${esc(x.Name)}">${esc(x.Barcode||'')}</option>`).join('')}
w.openUomPurchase=()=>w.openBarcodePurchase('standard');
w.openBarcodePurchase=async function(mode='barcode'){
 closeModal();const active=++session;await catalog();if(active!==session)return;S.purchaseMode=mode;S.barPurLines=[];S.purchaseRequestId=crypto.randomUUID();S.purchaseAttempt=null;saving=false;
 page(mode==='standard'?'New Purchase':'Barcode Purchase','Add items and review totals before saving stock');
 app.innerHTML=`<div class="content retail-purchase barcode-purchase-full"><div class="rp-heading"><div><span class="rp-eyebrow">PURCHASE ENTRY</span><h2>${mode==='standard'?'New purchase':'Barcode purchase'}</h2><p>Purchase cost and retail discount are shown separately.</p></div><button class="btn secondary" onclick="leavePurchaseEntry()">← Purchases</button></div>
 <div class="panel rp-bill-head"><label>Invoice no.<input id="bpi" class="input" maxlength="100" placeholder="Supplier bill number" oninput="purchaseDraftChanged()"></label><label>Bill date<input id="bpdate" class="input" type="date" value="${today()}" onchange="purchaseDraftChanged()"></label><label>Supplier<select id="bpsup" class="select" onchange="purchaseDraftChanged()">${supplierOptions()}</select></label><div class="rp-draft-actions"><button class="btn secondary" onclick="barcodePurchaseTempSave()">Temp Save</button><button class="btn secondary" onclick="barcodePurchaseTempLoad()">Get Temp Data</button></div></div>
 <div class="panel rp-entry-items"><div class="rp-scan-row"><label>BARCODE / SKU / ITEM NAME<input id="bpScan" class="input" list="bpItemSuggestions" autocomplete="off" placeholder="Scan or type an item, then press Enter"><datalist id="bpItemSuggestions">${suggestions()}</datalist></label><button class="btn" onclick="barcodePurchaseScan()">＋ Add item</button><button class="btn secondary" onclick="openPurchaseImport()">Import Excel Bill</button></div>
 <div class="rp-table-hint"><span>Prices are per selected unit · change the unit for box/strip purchase</span><span>F4 Search · F10 Save</span></div><div id="bpLines"></div></div>
 <div class="rp-payment-area"><div class="panel rp-payment"><label>Bill discount ₹<input id="bpdisc" class="input" type="number" min="0" step=".01" value="0" oninput="purchaseDraftChanged();renderPurchaseTotals()"></label><label>Paid amount ₹<input id="bppaid" class="input" type="number" min="0" step=".01" value="0" oninput="purchaseDraftChanged();renderPurchaseTotals()"></label><label>Payment<select id="bpm" class="select" onchange="purchaseDraftChanged()"><option>Credit</option><option>Cash</option><option>UPI</option><option>Card</option></select></label><label class="rp-note">Notes<input id="bpnotes" class="input" maxlength="1000" placeholder="Optional reference or note" oninput="purchaseDraftChanged()"></label></div><div id="bpTotals" class="panel rp-totals" aria-live="polite"></div></div>
 <div class="rp-savebar"><span id="bpSaveStatus">Draft · stock changes only after save</span><div><button class="btn secondary" onclick="barcodePurchaseTempSave()">Save draft</button><button id="bpSave" class="btn green" onclick="saveBarcodePurchase()">Save purchase <small>F10</small></button></div></div></div>`;
 renderBarcodePurchaseLines();
 d.querySelector('.barcode-purchase-full').addEventListener('keydown',e=>{if(e.key==='F10'){e.preventDefault();saveBarcodePurchase()}else if(e.key==='F4'){e.preventDefault();d.getElementById('bpScan').focus()}else if(e.key==='Enter'&&e.target.id==='bpScan'){e.preventDefault();barcodePurchaseScan()}});
 d.getElementById('bpScan').focus();
 try{if(JSON.parse(localStorage.getItem(TEMP)||'null')?.Attempt)await barcodePurchaseTempLoad()}catch{}
};
w.leavePurchaseEntry=function(){if(saving)return toast('Wait for the save result.');if(S.purchaseAttempt)barcodePurchaseTempSave();if(S.barPurLines?.length&&!confirm('Leave this purchase? Use Save draft to keep it on this PC.'))return;loadPurchase()};
w.purchaseDraftChanged=function(){if(S.purchaseAttempt)return;const e=d.getElementById('bpSaveStatus');if(e)e.textContent='Draft · stock changes only after save'};
w.barcodePurchaseScan=function(){
 if(saving||S.purchaseAttempt)return scanQueue;
 const input=d.getElementById('bpScan'),q=String(input?.value||'').trim(),active=session;if(!q)return scanQueue;if(input)input.value='';
 scanQueue=scanQueue.catch(()=>{}).then(async()=>{
  if(active!==session)return;const key=q.toLowerCase();const exact=x=>[x.Barcode,x.Sku,x.Name].some(v=>String(v||'').trim().toLowerCase()===key);
  let matches=S.items.filter(exact);
  if(!matches.length){const found=await api('/api/products?q='+encodeURIComponent(q)+'&size=100');matches=found.filter(exact);if(matches.length===1&&!S.items.some(x=>x.Id===matches[0].Id))S.items.push(matches[0])}
  if(active!==session)return;if(matches.length!==1){toast(matches.length?'Multiple items match. Use the exact barcode or name.':'Item not found: '+q);return}
  const p=matches[0],u=await w.suvidhaUom.load(p.Id),options=w.suvidhaUom.choices(p,u);if(active!==session)return;
  const def=S.purchaseMode==='standard'?options.slice().sort((a,b)=>b.factor-a.factor)[0]:options.find(x=>x.factor===1)||options[0];
  // Repeated scans increment the still-empty batch row; differing batches can be added with Duplicate line.
  const existing=S.barPurLines.find(x=>x.ProductId===p.Id&&!x.BatchNo&&!x.ExpiryDate&&x.Unit===def.unit);
  if(existing)existing.Qty+=1;else S.barPurLines.push({ProductId:p.Id,Name:p.Name,Barcode:p.Barcode||'',Uom:u,Options:options,Unit:def.unit,Factor:def.factor,Qty:1,FreeQuantity:0,Cost:def.purchase,Mrp:def.mrp,SalePrice:def.sale,DiscountPer:Number(p.Dis_Rate||0),DiscountChanged:false,GstRate:Number(p.GstRate||0),TaxMode:'INCLUSIVE',BatchNo:'',ExpiryDate:''});
  purchaseDraftChanged();renderBarcodePurchaseLines();input?.focus();
 }).catch(e=>toast(e.message));return scanQueue;
};
w.barcodePurchaseUom=function(i,unit){if(saving||S.purchaseAttempt)return;const x=S.barPurLines[i],o=x?.Options.find(a=>a.unit===unit);if(!o)return;x.Unit=o.unit;x.Factor=o.factor;x.Cost=o.purchase;x.Mrp=o.mrp;x.SalePrice=x.DiscountChanged?round(x.Mrp*(1-x.DiscountPer/100)):o.sale;purchaseDraftChanged();renderBarcodePurchaseLines()};
w.barcodePurchaseSet=function(i,k,v){
 if(saving||S.purchaseAttempt)return;
 const x=S.barPurLines[i];if(!x)return;const numeric=['Qty','FreeQuantity','Cost','SalePrice','Mrp','DiscountPer','GstRate'];x[k]=numeric.includes(k)?(v===''?NaN:Number(v)):v;
 if(k==='Mrp'||k==='DiscountPer'){x.DiscountChanged=true;if(Number.isFinite(x.Mrp)&&Number.isFinite(x.DiscountPer))x.SalePrice=round(x.Mrp*(1-x.DiscountPer/100));const e=d.querySelector(`[data-sale="${i}"]`);if(e)e.textContent='₹'+money(x.SalePrice)}
 purchaseDraftChanged();const a=d.querySelector(`[data-amount="${i}"]`);if(a)a.textContent='₹'+money(lineTotals(x).total);renderPurchaseTotals();
};
w.purchaseRemoveLine=i=>{if(saving||S.purchaseAttempt)return;S.barPurLines.splice(i,1);purchaseDraftChanged();renderBarcodePurchaseLines()};
w.purchaseDuplicateLine=i=>{if(saving||S.purchaseAttempt)return;const x=S.barPurLines[i];S.barPurLines.splice(i+1,0,{...x,Qty:1,FreeQuantity:0,BatchNo:'',ExpiryDate:''});purchaseDraftChanged();renderBarcodePurchaseLines()};
function numeric(i,k,value,step='.01'){return `<input class="input" aria-label="${esc(k)} row ${i+1}" type="number" min="${k==='Qty'?'.001':'0'}" ${['DiscountPer','GstRate'].includes(k)?'max="100"':''} step="${step}" data-no-tax-enhance="1" value="${Number.isFinite(value)?value:''}" oninput="barcodePurchaseSet(${i},'${k}',this.value)">`}
function lineTotals(x){const raw=round(Number(x.Qty)*Number(x.Cost)),tax=x.TaxMode==='EXCLUSIVE'?round(raw*x.GstRate/100):round(raw-raw/(1+x.GstRate/100));return {sub:round(x.TaxMode==='EXCLUSIVE'?raw:raw-tax),tax,total:round(x.TaxMode==='EXCLUSIVE'?raw+tax:raw)}}
w.renderBarcodePurchaseLines=function(){
 const box=d.getElementById('bpLines');if(!box)return;
 box.innerHTML=`<div class="rp-lines-table"><table class="table"><thead><tr><th>Item / Batch</th><th>Unit</th><th>Qty / Free</th><th>Purchase ₹</th><th>MRP ₹</th><th>Discount % / Sale</th><th>GST % / Tax detail</th><th>Line total</th><th></th></tr></thead><tbody>${(S.barPurLines||[]).map((x,i)=>`<tr><td class="rp-item-cell"><b>${esc(x.Name)}</b><small>${esc(x.Barcode||'No barcode')} · code ${x.ProductId}</small><div class="rp-batch-fields"><input class="input" aria-label="Batch row ${i+1}" placeholder="Batch ${requiresBatch()?'*':'(optional)'}" maxlength="100" value="${esc(x.BatchNo)}" oninput="barcodePurchaseSet(${i},'BatchNo',this.value)"><input class="input" aria-label="Expiry row ${i+1}" type="date" title="${requiresExpiry()?'Expiry required':'Expiry optional'}" value="${esc(x.ExpiryDate)}" onchange="barcodePurchaseSet(${i},'ExpiryDate',this.value)"></div></td>
 <td><select class="select" aria-label="Unit row ${i+1}" onchange="barcodePurchaseUom(${i},this.value)">${x.Options.map(o=>`<option value="${esc(o.unit)}" ${o.unit===x.Unit?'selected':''}>${esc(o.unit)}${o.factor>1?' ×'+o.factor:''}</option>`).join('')}</select><small>${x.Factor} ${esc(x.Uom.BaseUnit)}</small></td><td>${numeric(i,'Qty',x.Qty,'.001')}<label class="rp-free">Free ${numeric(i,'FreeQuantity',x.FreeQuantity,'.001')}</label></td><td>${numeric(i,'Cost',x.Cost)}</td><td>${numeric(i,'Mrp',x.Mrp)}</td><td>${numeric(i,'DiscountPer',x.DiscountPer)}<small data-sale="${i}">₹${money(x.SalePrice)}</small></td><td>${numeric(i,'GstRate',x.GstRate)}<select class="select rp-tax-mode" data-no-tax-enhance="1" aria-label="Tax detail row ${i+1}" onchange="barcodePurchaseSet(${i},'TaxMode',this.value)"><option value="INCLUSIVE" ${x.TaxMode==='INCLUSIVE'?'selected':''}>Inclusive</option><option value="EXCLUSIVE" ${x.TaxMode==='EXCLUSIVE'?'selected':''}>Exclusive</option></select></td><td class="rp-line-total"><b data-amount="${i}">₹${money(lineTotals(x).total)}</b></td><td><button class="btn small secondary" title="Add a separate batch for this item" aria-label="Duplicate line ${i+1}" onclick="purchaseDuplicateLine(${i})">＋</button><button class="btn small danger" aria-label="Remove line ${i+1}" onclick="purchaseRemoveLine(${i})">×</button></td></tr>`).join('')||'<tr><td colspan="9" class="rp-empty"><b>Add your first item</b><p>Scan a barcode, search by name or import an Excel bill.</p></td></tr>'}</tbody></table></div>`;
 renderPurchaseTotals();
};
w.renderPurchaseTotals=function(){
 const e=d.getElementById('bpTotals');if(!e)return;const rows=S.barPurLines||[];let sub=0,tax=0,total=0;for(const x of rows){const a=lineTotals(x);sub+=a.sub;tax+=a.tax;total+=a.total}total=round(total-Number(read('bpdisc')));const paid=Number(read('bppaid'));
 e.innerHTML=`<div><span>${rows.length} line${rows.length===1?'':'s'} · taxable value</span><b>₹${money(sub)}</b></div><div><span>GST <small>(included where Inclusive)</small></span><b>₹${money(tax)}</b></div><div><span>Bill discount</span><b>− ₹${money(Number(read('bpdisc')))}</b></div><div class="rp-grand"><span>Bill total</span><b>₹${money(total)}</b></div><div><span>Balance payable</span><b>₹${money(total-paid)}</b></div>`;
};
function snapshot(){return {Version:2,RequestId:S.purchaseRequestId,Attempt:S.purchaseAttempt,InvoiceNo:read('bpi'),PurchaseDate:read('bpdate'),SupplierId:Number(read('bpsup'))||null,Discount:Number(read('bpdisc')),PaidAmount:Number(read('bppaid')),PaymentMode:read('bpm'),Notes:read('bpnotes'),Lines:(S.barPurLines||[]).map(x=>{const {Uom,Options,...row}=x;return row})}}
w.barcodePurchaseTempSave=function(){try{localStorage.setItem(TEMP,JSON.stringify(snapshot()));toast('Purchase draft saved on this PC')}catch(e){alert('Draft could not be saved: '+e.message)}};
w.barcodePurchaseTempLoad=async function(){
 if(saving||S.purchaseAttempt)return toast('Retry the unconfirmed purchase before loading another draft.');
 try{const raw=localStorage.getItem(TEMP);if(!raw)return toast('No saved purchase draft');if(S.barPurLines.length&&!confirm('Replace the current unsaved draft with the saved draft?'))return;const draft=JSON.parse(raw),restored=[];
 for(const z of draft.Lines||[]){let p=S.items.find(x=>x.Id===z.ProductId);if(!p)p=await api('/api/products/'+z.ProductId);if(!p?.Id||p.IsActive===false)throw new Error('An item in this draft is unavailable. The current draft has been kept.');const u=await w.suvidhaUom.load(p.Id,true),options=w.suvidhaUom.choices(p,u),o=options.find(v=>v.unit===z.Unit&&v.factor===z.Factor);if(!o)throw new Error('Unit conversion changed for '+p.Name+'. Review this item before restoring.');restored.push({...z,Name:p.Name,Barcode:p.Barcode||'',Uom:u,Options:options,DiscountPer:Number(z.DiscountPer??p.Dis_Rate??0),DiscountChanged:z.DiscountChanged??false,TaxMode:z.TaxMode||'EXCLUSIVE'})}
 S.barPurLines=restored;S.purchaseRequestId=draft.RequestId||crypto.randomUUID();S.purchaseAttempt=draft.Attempt||null;
 for(const [id,v] of Object.entries({bpi:draft.InvoiceNo,bpdate:draft.PurchaseDate||today(),bpsup:draft.SupplierId||'',bpdisc:draft.Discount||0,bppaid:draft.PaidAmount||0,bpm:draft.PaymentMode||'Credit',bpnotes:draft.Notes||''}))d.getElementById(id).value=v;
 renderBarcodePurchaseLines();freezeEntry(!!S.purchaseAttempt);if(S.purchaseAttempt)d.getElementById('bpSaveStatus').textContent='Previous save unconfirmed · retry the unchanged purchase';toast('Saved draft restored');
 }catch(e){alert(e.message)}
};
function freezeEntry(on){d.querySelectorAll('.rp-bill-head input,.rp-bill-head select,.rp-draft-actions button[onclick="barcodePurchaseTempLoad()"],.rp-entry-items input,.rp-entry-items select,.rp-entry-items button,.rp-payment input,.rp-payment select').forEach(e=>e.disabled=on)}
w.saveBarcodePurchase=async function(){
 if(saving)return;await scanQueue;if(saving)return;const lines=S.barPurLines||[];if(!lines.length)return toast('Add purchase items');
 const invalid=lines.find(x=>['Qty','FreeQuantity','Cost','Mrp','SalePrice','DiscountPer','GstRate','Factor'].some(k=>!Number.isFinite(x[k])||x[k]<0)||x.Qty<=0||x.Factor<1||x.DiscountPer>100||x.GstRate>100);
 if(invalid)return alert('Check quantity, prices, GST and discount for '+invalid.Name);
 if(lines.some(x=>[x.Qty,x.FreeQuantity,x.Qty*x.Factor,x.FreeQuantity*x.Factor].some(q=>Math.abs(q-stockQty(q))>1e-9)))return alert('Quantity and converted stock support up to 3 decimal places.');
 if(requiresBatch()&&lines.some(x=>!x.BatchNo.trim()))return alert('Batch number is required for this outlet.');
 if(requiresExpiry()&&lines.some(x=>!x.ExpiryDate))return alert('Expiry date is required for this outlet.');
 if(!read('bpdate'))return alert('Enter the purchase date.');
 const sid=Number(read('bpsup'))||null,sup=S.suppliers.find(x=>x.Id===sid);
 const body={RequestId:S.purchaseRequestId,InvoiceNo:read('bpi').trim()||null,PurchaseDate:read('bpdate'),SupplierId:sid,SupplierName:sup?.Name||'Walk-in Supplier',PaymentMode:read('bpm'),PaidAmount:Number(read('bppaid')),Discount:Number(read('bpdisc')),Notes:read('bpnotes'),Lines:lines.map(x=>({ProductId:x.ProductId,Qty:stockQty(x.Qty*x.Factor),FreeQuantity:stockQty(x.FreeQuantity*x.Factor),Cost:baseRate(x.Cost/x.Factor),SalePrice:baseRate(x.SalePrice/x.Factor),Mrp:baseRate(x.Mrp/x.Factor),MrpPerPurchasedUnit:x.Mrp,DiscountPer:x.DiscountChanged?x.DiscountPer:null,TaxRate:x.GstRate,TaxMode:x.TaxMode,BatchNo:x.BatchNo||null,ManufactureDate:null,ExpiryDate:x.ExpiryDate||null,UnitPurchased:x.Unit,PurchasedQty:x.Qty,TotalBaseQty:stockQty(x.Qty*x.Factor),RatePerPurchasedUnit:x.Cost}))};
 if(!Number.isFinite(body.PaidAmount)||!Number.isFinite(body.Discount)||body.PaidAmount<0||body.Discount<0)return alert('Enter a valid payment and bill discount.');
 const savedSession=session,savedRequest=S.purchaseRequestId,savedPage=d.querySelector('.barcode-purchase-full');saving=true;freezeEntry(true);const button=d.getElementById('bpSave');if(button){button.disabled=true;button.textContent='Saving…'}S.purchaseAttempt=S.purchaseAttempt||JSON.stringify(body);barcodePurchaseTempSave();
 try{const result=await api('/api/purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:S.purchaseAttempt});try{if(JSON.parse(localStorage.getItem(TEMP)||'null')?.RequestId===savedRequest)localStorage.removeItem(TEMP)}catch{}toast(result.alreadyImported?'Purchase already saved; stock was not added again.':'Purchase saved · stock updated');if(savedSession===session&&savedPage?.isConnected){S.barPurLines=[];S.purchaseAttempt=null;await loadPurchase()}}
 catch(e){if(savedSession!==session||!savedPage?.isConnected){toast('Purchase save not confirmed. Restore the saved draft to retry.');return}if(e.status&&e.status<500){S.purchaseAttempt=null;freezeEntry(false);barcodePurchaseTempSave()}const status=d.getElementById('bpSaveStatus');if(status)status.textContent='Save not confirmed. Retry keeps the same request.';alert(e.message)}finally{saving=false;if(button?.isConnected){button.disabled=false;button.textContent='Save purchase · F10'}}
};
w.saveUomPurchase=w.saveBarcodePurchase;
w.barcodePurchaseDownloadSample=()=>download('/api/purchase-import/template','SuvidhaPOS-Purchase-Import-Sample.xlsx');
w.barcodePurchaseDownloadBillSample=()=>download('/api/purchase-import/bill-template','SuvidhaPOS-Purchase-Bill-Sample.xlsx');
function download(url,name){const a=d.createElement('a');a.href=url;a.download=name;a.click()}
d.addEventListener('keydown',e=>{if(e.key==='F2'&&d.querySelector('.purchase-page')&&!d.querySelector('.modal.open')){e.preventDefault();openUomPurchase()}});
})(window,document);
