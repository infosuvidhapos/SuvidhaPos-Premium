(function(w,d){
'use strict';
var PRINT_KEY='Print.ActionMode',allowed=['DIRECT','PDF','PREVIEW'],currentMode='DIRECT',modeLoaded=true,injectBusy=false,lastNormalRoot=null,lastJewelRoot=null;
function q(s){return d.querySelector(s)}
function qa(s){return Array.prototype.slice.call(d.querySelectorAll(s))}
function notice(m){try{toast(m)}catch(_){}}
async function readMode(){
 // Every new bill starts in Direct Print as requested. The operator can switch
 // this bill to Save As PDF or Print & Preview using the radio buttons.
 currentMode='DIRECT';modeLoaded=true;syncRadios();return currentMode;
}
async function saveMode(mode,show){
 mode=String(mode||'DIRECT').toUpperCase();if(allowed.indexOf(mode)<0)mode='DIRECT';currentMode=mode;modeLoaded=true;syncRadios();
 try{await api('/api/app-settings/'+encodeURIComponent(PRINT_KEY),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:mode})});if(show)notice('Bill print mode: '+(mode==='DIRECT'?'Direct Print':mode==='PDF'?'Save As PDF':'Print & Preview'))}catch(e){if(show)notice('Print mode selected for this bill')}
 return mode;
}
w.billingSetPrintMode=function(mode){return saveMode(mode,true)};
function checked(mode){return currentMode===mode?' checked':''}
function printBox(){return '<div class="billing-print-actions" id="billingPrintActions"><b>Bill Print</b><label><input type="radio" name="billingPrintAction" value="DIRECT"'+checked('DIRECT')+' onchange="billingSetPrintMode(this.value)"> Direct Print</label><label><input type="radio" name="billingPrintAction" value="PDF"'+checked('PDF')+' onchange="billingSetPrintMode(this.value)"> Save As PDF</label><label><input type="radio" name="billingPrintAction" value="PREVIEW"'+checked('PREVIEW')+' onchange="billingSetPrintMode(this.value)"> Print &amp; Preview</label></div>'}
function syncRadios(){qa('input[name="billingPrintAction"]').forEach(function(x){x.checked=x.value===currentMode})}
function ensureStyle(){if(q('#billingActionFixCss'))return;var s=d.createElement('style');s.id='billingActionFixCss';s.textContent='.billing-print-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--line,#d7dce2);border-radius:10px;background:var(--panel,#fff);margin:10px 0}.billing-print-actions>b{margin-right:4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px}.billing-print-actions label{display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border:1px solid var(--line,#d7dce2);border-radius:8px;cursor:pointer;font-size:11px}.billing-print-actions label:has(input:checked){border-color:#2f80ed;box-shadow:0 0 0 1px #2f80ed55 inset}.billing-print-actions input{accent-color:#2f80ed}.cb-row-remove{margin-left:5px;border:1px solid #d85757;background:transparent;color:#d85757;border-radius:6px;cursor:pointer;font-weight:800}.cb-iconbtn.remove{border-color:#d85757!important;color:#d85757!important}.js-clear-items{margin-left:8px;border:1px solid #c94c4c!important;color:#b43c3c!important;background:transparent!important}@media(max-width:800px){.billing-print-actions{align-items:stretch}.billing-print-actions label{flex:1;min-width:140px}}';d.head.appendChild(s)}
function clearDraftFields(){
 var search=q('#cbSearch'),name=q('#cbItemName'),qty=q('#cbQty'),rate=q('#cbRate'),mrp=q('#cbMrp'),uom=q('#cbUom'),avl=q('#cbAvl'),suggest=q('#cbSuggest');
 if(search)search.value='';if(name)name.value='';if(qty)qty.value='1';if(rate)rate.value='0';if(mrp)mrp.value='0';if(uom)uom.innerHTML='<option value="">—</option>';if(avl)avl.textContent='0.000';if(suggest){suggest.innerHTML='';suggest.style.display='none'};
 setTimeout(function(){if(search)search.focus()},0);
}
function clearNormal(){
 var hasCart=typeof state!=='undefined'&&state.cart&&state.cart.length>0;
 if(hasCart&&!confirm('Clear all items from this bill?'))return;
 if(typeof w.cbReset==='function')w.cbReset();else if(hasCart)state.cart.length=0;
 clearDraftFields();notice(hasCart?'Bill item list cleared':'Selected item cleared');
}
w.cbClearBillList=clearNormal;
w.cbRemoveBillRow=function(i){if(typeof state==='undefined'||!state.cart||!state.cart[i])return;try{w.cbSelectRow(i)}catch(_){};if(typeof w.cbRemoveSelected==='function')w.cbRemoveSelected()};
function startNewBill(root,isJewel){
 if(isJewel){if(lastJewelRoot===root)return;lastJewelRoot=root}else{if(lastNormalRoot===root)return;lastNormalRoot=root}
 currentMode='DIRECT';modeLoaded=true;syncRadios();
 // Persist the requested default without blocking billing.
 saveMode('DIRECT',false);
}
function patchNormal(){
 var root=q('.counter-billing');if(!root)return;startNewBill(root,false);
 var top=q('.counter-billing .cb-iconbtn.remove');if(top){top.onclick=function(ev){ev.preventDefault();ev.stopPropagation();clearNormal()};top.title='Clear selected item / complete bill list'}
 qa('#cbRows tr').forEach(function(tr,i){if(tr.querySelector('.empty'))return;var td=tr.lastElementChild;if(!td||td.querySelector('.cb-row-remove'))return;var b=d.createElement('button');b.type='button';b.className='cb-row-remove';b.textContent='×';b.title='Remove this item';b.onclick=function(ev){ev.preventDefault();ev.stopPropagation();w.cbRemoveBillRow(i)};td.appendChild(b)});
 if(!root.querySelector('#billingPrintActions')){var anchor=root.querySelector('.cb-actions')||root.querySelector('.cb-countbar');if(anchor)anchor.insertAdjacentHTML('beforebegin',printBox())}
 syncRadios();
}
w.jewelClearBillItems=function(){var s=w.__jewelSuiteState;if(!s||!s.cart||!s.cart.length)return notice('Bill list already empty');if(!confirm('Clear all jewellery items from this bill?'))return;s.cart.length=0;if(typeof w.jewelSuiteRenderBill==='function')w.jewelSuiteRenderBill()};
function patchJewellery(){
 var root=q('.js-invoice-page');if(!root)return;startNewBill(root,true);
 var head=root.querySelector('.js-sale-card .js-card-head');if(head&&!head.querySelector('.js-clear-items')){var b=d.createElement('button');b.type='button';b.className='js-clear-items';b.textContent='× Clear';b.title='Clear complete jewellery item list';b.onclick=function(ev){ev.preventDefault();w.jewelClearBillItems()};head.appendChild(b)}
 if(!root.querySelector('#billingPrintActions')){var tabs=root.querySelector('.js-bill-tabs');if(tabs)tabs.insertAdjacentHTML('afterend',printBox())}
 syncRadios();
}
function patch(){if(injectBusy)return;injectBusy=true;requestAnimationFrame(function(){injectBusy=false;ensureStyle();patchNormal();patchJewellery();syncRadios()})}
new MutationObserver(patch).observe(q('#app')||d.body,{childList:true,subtree:true});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',function(){readMode();patch()});else{readMode();patch()}

/* Global bill printing: exactly DIRECT / PDF / PREVIEW. DIRECT is the default for every new bill. */
w.premiumPrintHtml=async function(html,name){
 var mode=modeLoaded?currentMode:await readMode();
 if(w.desktopPrintHtml&&w.desktopPrintHtml(html,mode,name||'SuvidhaPOS-Bill'))return true;
 var pw=w.open('','_blank','width=1000,height=820');if(!pw)return notice('Popup blocked');pw.document.write(html);pw.document.close();
 if(mode==='PREVIEW')return true;
 pw.addEventListener('load',function(){setTimeout(function(){pw.print()},100)},{once:true});return true;
};
})(window,document);

/* Runtime 6.13.0: load the scoped billing alignment, Hold/Unhold and BTC receipt flow
   after the legacy billing/BTC scripts are ready. Kept here so older installed index.html
   shells still receive the fixes without changing their normal page boot order. */
(function(w,d){
'use strict';
function addCss(href,id){if(d.getElementById(id))return;var l=d.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;d.head.appendChild(l)}
function addScript(src,id){return new Promise(function(resolve,reject){if(d.getElementById(id))return resolve();var s=d.createElement('script');s.id=id;s.src=src;s.onload=resolve;s.onerror=function(){reject(new Error('Could not load '+src))};d.body.appendChild(s)})}
async function loadRuntime(){
 addCss('/css/billing-layout-fix.css?v=6141review12','billingLayoutFix6130');
 addCss('/css/btc-payment-receipt-flow.css?v=6141review12','btcReceiptFlowCss6130');
 addCss('/css/retail-expansion.css?v=6141review12','retailExpansionCss6140');
 addCss('/css/audit-report-thermal.css?v=6141review12','auditReportThermalCss6140');
 try{
  await addScript('/js/btc-payment-receipt-flow.js?v=6141review12','btcReceiptFlowJs6130');
  await addScript('/js/btc-payment-receipt-input-fix.js?v=6141review12','btcReceiptInputFixJs6130');
  await addScript('/js/billing-hold.js?v=6141review12','billingHoldJs6130');
  await addScript('/js/india-locations.js?v=6141review12','indiaLocationsJs6140');
  await addScript('/js/retail-masters-ui.js?v=6141review12','retailMastersUiJs6140');
  await addScript('/js/audit-report-thermal.js?v=6141review12','auditReportThermalJs6140');
 }catch(e){console.error('Suvidha retail/BTC runtime 6.14.0:',e)}
}
if(d.readyState==='complete')loadRuntime();else w.addEventListener('load',loadRuntime,{once:true});
})(window,document);
