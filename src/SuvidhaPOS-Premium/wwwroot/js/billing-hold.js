(function(w,d){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
let lastRoot=null,lastCountAt=0,holdRows=[];
function notice(m){try{toast(m)}catch(_){}}
function root(){return d.querySelector('.counter-billing')}
function selectedMode(){return root()?.querySelector('.cb-pay button.selected')?.dataset?.mode||'Cash'}
function totalsFromCart(){
 const cart=(typeof state!=='undefined'&&state.cart)||[];let gross=0;
 cart.forEach(x=>{const a=Number(x.Qty||0)*Number(x.Rate||0),g=Math.max(0,Number(x.Gst||0)),inc=String(x.TaxMode||'EXCLUSIVE').toUpperCase()==='INCLUSIVE';gross+=inc?a:a+(g? a*g/100:0)});
 const typ=d.querySelector('#cbDiscountType')?.value||'RUPEES',val=Math.max(0,Number(d.querySelector('#cbDiscountValue')?.value)||0),disc=typ==='PERCENT'?gross*Math.min(100,val)/100:Math.min(gross,val);
 return Math.max(0,gross-disc);
}
function btcDraft(){
 const bar=d.querySelector('#btcBillingCompany');if(!bar)return null;
 const sig=String(bar.dataset.signature||'').split('|');const companyId=Number(sig[0]||0);
 return companyId>0?{companyId,reference:sig.length>6?sig.slice(6).join('|'):''}:null;
}
function makeDraft(){
 const cart=(typeof state!=='undefined'&&state.cart)||[];
 return {
  version:1,
  savedAt:new Date().toISOString(),
  cart:JSON.parse(JSON.stringify(cart)),
  customer:{mobile:d.querySelector('#cbMobile')?.value||'',name:d.querySelector('#cbCustomer')?.value||'Walk-in Customer',gst:d.querySelector('#cbGstNo')?.value||'',remarks:d.querySelector('#cbRemarks')?.value||'',state:d.querySelector('#cbState')?.value||''},
  discount:{type:d.querySelector('#cbDiscountType')?.value||'RUPEES',value:Number(d.querySelector('#cbDiscountValue')?.value)||0},
  payment:{mode:selectedMode(),tender:d.querySelector('#cbTender')?.textContent||''},
  btc:btcDraft()
 };
}
async function fetchHolds(){holdRows=await api('/api/billing/holds').catch(()=>[]);return Array.isArray(holdRows)?holdRows:[]}
function holdListHtml(rows){
 if(!rows.length)return '<div class="hold-empty">No held bills. You can keep up to 10 bills on hold.</div>';
 return rows.map((x,i)=>`<div class="hold-row"><div class="hold-slot">${i+1}</div><div class="hold-info"><b>${esc(x.HoldNo||('HOLD-'+x.Id))}</b><span>${new Date(x.HeldAt).toLocaleString('en-IN')} · ${esc(x.CustomerName||'Walk-in Customer')}</span><small>${Number(x.ItemCount||0)} item(s) · ₹${money(x.GrandTotal)}${x.CustomerMobile?' · '+esc(x.CustomerMobile):''}</small></div><div class="hold-actions"><button class="btn green small" onclick="cbUnholdBill(${Number(x.Id)})">↩ Unhold</button><button class="btn danger small" onclick="cbDeleteHeldBill(${Number(x.Id)})">× Delete</button></div></div>`).join('');
}
async function refreshBadge(force){
 if(!root())return;const now=Date.now();if(!force&&now-lastCountAt<3000)return;lastCountAt=now;const rows=await fetchHolds();const badge=d.querySelector('#cbHoldCount');if(badge)badge.textContent=String(rows.length);
}
function patchBilling(){
 const r=root();if(!r)return;
 const btn=r.querySelector('.cb-actions .hold');
 if(btn&&btn.dataset.holdBillPatched!=='1'){
  btn.dataset.holdBillPatched='1';btn.onclick=function(ev){ev?.preventDefault();w.cbOpenHoldBills()};btn.classList.add('holdbill');btn.innerHTML='🧾⏱️ Hold Bill <span id="cbHoldCount" class="hold-count">0</span>';btn.title='Hold / Unhold bill (maximum 10)';
 }
 const f3=[...r.querySelectorAll('.cb-shortcuts span')].find(x=>/F3\s+Customer/i.test(x.textContent||''));if(f3&&f3.textContent!=='F3 Hold Bill')f3.textContent='F3 Hold Bill';
 const mobileLabel=[...r.querySelectorAll('.cb-customer .cb-label')].find(x=>/Mobile\s*\(F3\)/i.test(x.textContent||''));if(mobileLabel&&mobileLabel.textContent!=='Mobile')mobileLabel.textContent='Mobile';
 if(r!==lastRoot){lastRoot=r;lastCountAt=0;refreshBadge(true)}
}
w.cbOpenHoldBills=async function(){
 if(!root())return;const rows=await fetchHolds(),cart=(typeof state!=='undefined'&&state.cart)||[],total=totalsFromCart();
 modal('🧾⏱️ Hold Bill / Unhold',`<div class="hold-manager"><div class="hold-summary"><div><span>Current Bill</span><b>${cart.length} item(s)</b><small>₹${money(total)}</small></div><div><span>Held Bills</span><b>${rows.length} / 10</b><small>${10-rows.length} slot(s) free</small></div></div><div class="hold-list" id="holdBillList">${holdListHtml(rows)}</div></div>`,`<button class="btn green" ${cart.length?'':'disabled'} onclick="cbHoldCurrentBill()">🧾⏱️ Hold Current Bill</button><button class="btn secondary" onclick="closeModal()">Close</button>`);
};
w.cbHoldCurrentBill=async function(){
 const cart=(typeof state!=='undefined'&&state.cart)||[];if(!cart.length)return notice('Add at least one item before holding the bill');
 const draft=makeDraft(),body={DraftJson:JSON.stringify(draft),CustomerName:draft.customer.name,CustomerMobile:draft.customer.mobile||null,ItemCount:cart.length,GrandTotal:totalsFromCart()};
 try{
  const r=await api('/api/billing/holds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  closeModal();
  if(typeof w.cbReset==='function')w.cbReset();
  const m=d.querySelector('#cbMobile'),n=d.querySelector('#cbCustomer'),g=d.querySelector('#cbGstNo'),rm=d.querySelector('#cbRemarks');if(m)m.value='';if(n)n.value='Walk-in Customer';if(g)g.value='';if(rm)rm.value='';
  try{if(typeof w.cbPaySelect==='function')w.cbPaySelect('Cash')}catch(_){}
  notice((r.holdNo||'Bill')+' held successfully');lastCountAt=0;refreshBadge(true);
 }catch(e){alert(e.message||e)}
};
w.cbUnholdBill=async function(id){
 try{
  const rows=holdRows.length?holdRows:await fetchHolds(),row=rows.find(x=>Number(x.Id)===Number(id));if(!row)return notice('Held bill not found');
  const current=(typeof state!=='undefined'&&state.cart)||[];if(current.length&&!confirm('Current bill has items. Replace it with this held bill?'))return;
  const draft=JSON.parse(row.DraftJson||'{}');if(!Array.isArray(draft.cart)||!draft.cart.length)return notice('Held bill is empty');
  if(typeof w.cbReset==='function')w.cbReset();
  state.cart=JSON.parse(JSON.stringify(draft.cart));
  const c=draft.customer||{};const set=(sel,v)=>{const el=d.querySelector(sel);if(el)el.value=v??''};set('#cbMobile',c.mobile||'');set('#cbCustomer',c.name||'Walk-in Customer');set('#cbGstNo',c.gst||'');set('#cbRemarks',c.remarks||'');if(c.state)set('#cbState',c.state);
  const di=draft.discount||{};set('#cbDiscountType',di.type||'RUPEES');set('#cbDiscountValue',Number(di.value)||0);
  if(typeof w.cbSelectRow==='function')w.cbSelectRow(-1);
  const mode=draft.payment?.mode||'Cash';
  if(mode==='BTC'&&draft.btc?.companyId&&typeof w.openBtcCompanySelect==='function'){
   await w.openBtcCompanySelect();const ref=d.querySelector('#btcBillingRef');if(ref)ref.value=draft.btc.reference||'';if(typeof w.btcChooseCompany==='function')w.btcChooseCompany(Number(draft.btc.companyId));
  }else if(mode==='Credit/UPI'&&typeof w.cbPaySelect==='function')w.cbPaySelect('Credit/UPI','UPI');
  else if(mode==='Multi Mode'){if(typeof w.cbPaySelect==='function')w.cbPaySelect('Cash');notice('Bill unheld. Re-select Multi Mode payment before saving.');}
  else if(typeof w.cbPaySelect==='function')w.cbPaySelect(mode);
  await api('/api/billing/holds/'+Number(id),{method:'DELETE'});closeModal();notice((row.HoldNo||'Bill')+' unheld');lastCountAt=0;refreshBadge(true);d.querySelector('#cbSearch')?.focus();
 }catch(e){alert(e.message||e)}
};
w.cbDeleteHeldBill=async function(id){if(!confirm('Delete this held bill?'))return;try{await api('/api/billing/holds/'+Number(id),{method:'DELETE'});const rows=await fetchHolds(),box=d.querySelector('#holdBillList');if(box)box.innerHTML=holdListHtml(rows);const badge=d.querySelector('#cbHoldCount');if(badge)badge.textContent=String(rows.length);notice('Held bill deleted')}catch(e){alert(e.message||e)}};
d.addEventListener('keydown',function(e){if(e.key==='F3'&&root()){e.preventDefault();e.stopImmediatePropagation();w.cbOpenHoldBills()}},true);
new MutationObserver(()=>requestAnimationFrame(patchBilling)).observe(d.querySelector('#app')||d.body,{childList:true,subtree:true});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',patchBilling);else patchBilling();
})(window,document);
