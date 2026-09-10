(function(w,d){
'use strict';
var PRINT_KEY='Print.ActionMode',allowed=['DIRECT','PDF','PREVIEW'],currentMode='DIRECT',modeLoaded=false,injectBusy=false;
function q(s){return d.querySelector(s)}
function qa(s){return Array.prototype.slice.call(d.querySelectorAll(s))}
function notice(m){try{toast(m)}catch(_){}}
async function readMode(){
 try{
  var x=await api('/api/app-settings/'+encodeURIComponent(PRINT_KEY));
  var v=String((x&&((x.Value!=null?x.Value:x.value)))||'').trim().toUpperCase();
  currentMode=allowed.indexOf(v)>=0?v:'DIRECT';
  if(!v||allowed.indexOf(v)<0)await saveMode('DIRECT',false);
 }catch(_){currentMode='DIRECT'}
 modeLoaded=true;syncRadios();return currentMode;
}
async function saveMode(mode,show){
 mode=String(mode||'DIRECT').toUpperCase();if(allowed.indexOf(mode)<0)mode='DIRECT';currentMode=mode;modeLoaded=true;syncRadios();
 try{await api('/api/app-settings/'+encodeURIComponent(PRINT_KEY),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:mode})});if(show)notice('Bill print mode saved')}catch(e){if(show)alert(e.message||'Print mode save failed')}
 return mode;
}
w.billingSetPrintMode=function(mode){return saveMode(mode,true)};
function checked(mode){return currentMode===mode?' checked':''}
function printBox(){return '<div class="billing-print-actions" id="billingPrintActions"><b>Bill Print</b><label><input type="radio" name="billingPrintAction" value="DIRECT"'+checked('DIRECT')+' onchange="billingSetPrintMode(this.value)"> Direct Print</label><label><input type="radio" name="billingPrintAction" value="PDF"'+checked('PDF')+' onchange="billingSetPrintMode(this.value)"> Save As PDF</label><label><input type="radio" name="billingPrintAction" value="PREVIEW"'+checked('PREVIEW')+' onchange="billingSetPrintMode(this.value)"> Print &amp; Preview</label></div>'}
function syncRadios(){qa('input[name="billingPrintAction"]').forEach(function(x){x.checked=x.value===currentMode})}
function ensureStyle(){if(q('#billingActionFixCss'))return;var s=d.createElement('style');s.id='billingActionFixCss';s.textContent='.billing-print-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--line,#d7dce2);border-radius:10px;background:var(--panel,#fff);margin:10px 0}.billing-print-actions>b{margin-right:4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px}.billing-print-actions label{display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border:1px solid var(--line,#d7dce2);border-radius:8px;cursor:pointer;font-size:11px}.billing-print-actions input{accent-color:#2f80ed}.cb-row-remove{margin-left:5px;border:1px solid #d85757;background:transparent;color:#d85757;border-radius:6px;cursor:pointer;font-weight:800}.cb-iconbtn.remove{border-color:#d85757!important;color:#d85757!important}.js-clear-items{margin-left:8px;border:1px solid #c94c4c!important;color:#b43c3c!important;background:transparent!important}@media(max-width:800px){.billing-print-actions{align-items:stretch}.billing-print-actions label{flex:1;min-width:140px}}';d.head.appendChild(s)}
function clearNormal(){
 if(typeof state==='undefined'||!state.cart||!state.cart.length)return notice('Bill list already empty');
 if(!confirm('Clear all items from this bill?'))return;
 if(typeof w.cbReset==='function')w.cbReset();
 else{state.cart.length=0;notice('Bill list cleared')}
}
w.cbClearBillList=clearNormal;
w.cbRemoveBillRow=function(i){if(typeof state==='undefined'||!state.cart||!state.cart[i])return;try{w.cbSelectRow(i)}catch(_){};if(typeof w.cbRemoveSelected==='function')w.cbRemoveSelected()};
function patchNormal(){
 var root=q('.counter-billing');if(!root)return;
 var top=q('.counter-billing .cb-iconbtn.remove');if(top){top.onclick=function(ev){ev.preventDefault();ev.stopPropagation();clearNormal()};top.title='Clear complete bill item list'}
 qa('#cbRows tr').forEach(function(tr,i){if(tr.querySelector('.empty'))return;var td=tr.lastElementChild;if(!td||td.querySelector('.cb-row-remove'))return;var b=d.createElement('button');b.type='button';b.className='cb-row-remove';b.textContent='×';b.title='Remove this item';b.onclick=function(ev){ev.preventDefault();ev.stopPropagation();w.cbRemoveBillRow(i)};td.appendChild(b)});
 if(!root.querySelector('#billingPrintActions')){var anchor=root.querySelector('.cb-actions')||root.querySelector('.cb-countbar');if(anchor)anchor.insertAdjacentHTML('beforebegin',printBox())}
}
w.jewelClearBillItems=function(){var s=w.__jewelSuiteState;if(!s||!s.cart||!s.cart.length)return notice('Bill list already empty');if(!confirm('Clear all jewellery items from this bill?'))return;s.cart.length=0;if(typeof w.jewelSuiteRenderBill==='function')w.jewelSuiteRenderBill()};
function patchJewellery(){
 var root=q('.js-invoice-page');if(!root)return;
 var head=root.querySelector('.js-sale-card .js-card-head');if(head&&!head.querySelector('.js-clear-items')){var b=d.createElement('button');b.type='button';b.className='js-clear-items';b.textContent='× Clear';b.title='Clear complete jewellery item list';b.onclick=function(ev){ev.preventDefault();w.jewelClearBillItems()};head.appendChild(b)}
 if(!root.querySelector('#billingPrintActions')){var tabs=root.querySelector('.js-bill-tabs');if(tabs)tabs.insertAdjacentHTML('afterend',printBox())}
}
function patch(){if(injectBusy)return;injectBusy=true;requestAnimationFrame(function(){injectBusy=false;ensureStyle();patchNormal();patchJewellery();syncRadios()})}
new MutationObserver(patch).observe(q('#app')||d.body,{childList:true,subtree:true});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',function(){readMode();patch()});else{readMode();patch()}

/* Global bill printing: exactly DIRECT / PDF / PREVIEW. DIRECT is default when no setting exists. */
w.premiumPrintHtml=async function(html,name){
 var mode=modeLoaded?currentMode:await readMode();
 if(w.desktopPrintHtml&&w.desktopPrintHtml(html,mode,name||'SuvidhaPOS-Bill'))return true;
 var pw=w.open('','_blank','width=1000,height=820');if(!pw)return notice('Popup blocked');pw.document.write(html);pw.document.close();
 pw.addEventListener('load',function(){setTimeout(function(){pw.print()},100)},{once:true});return true;
};
})(window,document);
