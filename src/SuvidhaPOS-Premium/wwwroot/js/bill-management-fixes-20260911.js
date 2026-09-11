(function(w,d){
'use strict';
let billCtx=null,selectedParty=null,partyRows=[];
const oldEditor=w.openBillEditor;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
async function parties(q=''){const r=await api('/api/retail/customer-company?q='+encodeURIComponent(q||''));partyRows=Array.isArray(r)?r:[];return partyRows}
function needsParty(){
 const mode=d.querySelector('#bmPayMode')?.value||'Cash',type=d.querySelector('#bmPayType')?.value||'UPI';
 return mode==='BTC'||(mode==='Credit/UPI'&&type==='Credit')
}
function partyHtml(){return partyRows.map(x=>'<button type="button" class="'+(selectedParty&&selectedParty.PartyType===x.PartyType&&Number(selectedParty.Id)===Number(x.Id)?'selected':'')+'" data-bmp="'+esc(x.PartyType)+'" data-id="'+Number(x.Id)+'"><span><b>'+esc(x.Name)+'</b><small>'+esc(x.PartyType)+' · '+esc(x.Phone||'-')+' · '+esc(x.GstIn||'-')+'</small></span><b>₹'+money(x.Balance||0)+'</b></button>').join('')||'<div class="empty">No customer/company found</div>'}
function wireRows(){const box=d.querySelector('#bmPartyRows');if(!box)return;box.querySelectorAll('button[data-bmp]').forEach(b=>b.onclick=()=>{selectedParty=partyRows.find(x=>String(x.PartyType)===b.dataset.bmp&&Number(x.Id)===Number(b.dataset.id))||null;box.innerHTML=partyHtml();wireRows()})}
async function renderPartyPicker(){
 const host=d.querySelector('#bmPartyBox');if(!host)return;
 if(!needsParty()){host.style.display='none';host.innerHTML='';selectedParty=null;return}
 host.style.display='block';await parties('');
 host.innerHTML='<label>Customer / Company<input id="bmPartySearch" class="input" placeholder="Search name / mobile / GSTIN" autocomplete="off"></label><div id="bmPartyRows" class="btc-payment-party-results">'+partyHtml()+'</div>';
 wireRows();const q=d.querySelector('#bmPartySearch');if(q)q.oninput=async()=>{selectedParty=null;await parties(q.value);const box=d.querySelector('#bmPartyRows');if(box){box.innerHTML=partyHtml();wireRows()}};
}
w.bmPaymentModeUi=async function(){
 const mode=d.querySelector('#bmPayMode')?.value||'Cash';
 const typeWrap=d.querySelector('#bmPayTypeWrap'),multi=d.querySelector('#bmMulti');
 if(typeWrap)typeWrap.style.display=mode==='Credit/UPI'?'grid':'none';
 if(multi)multi.style.display=mode==='Multi Mode'?'block':'none';
 await renderPartyPicker()
};
w.bmPaymentTypeChanged=function(){renderPartyPicker()};
w.openPaymentChange=async function(id,initialMode){
 try{
  selectedParty=null;
  const model=await api('/api/sales/'+Number(id)+'/edit-model'),h=model.header;if(h.Status!=='Completed')return alert('Only completed bills can change payment mode');
  billCtx={id:Number(id),total:Number(h.GrandTotal||0),invoice:h.InvoiceNo,currentMode:h.PaymentMode||'Cash'};
  modal('Payment Mode Change · '+esc(h.InvoiceNo),
   '<div class="alert">Bill Total: <b>₹'+money(h.GrandTotal)+'</b>. Payment change does not change stock.</div><div class="formgrid"><label>New Payment Mode<select id="bmPayMode" class="select" onchange="bmPaymentModeUi()"><option>Cash</option><option>Credit/UPI</option><option>BTC</option><option>Multi Mode</option></select></label><label id="bmPayTypeWrap" style="display:none">Type<select id="bmPayType" class="select" onchange="bmPaymentTypeChanged()"><option>UPI</option><option>Card</option><option>PhonePe</option><option>Paytm</option><option>Credit</option></select></label><label>Reference / UTR<input id="bmPayRef" class="input"></label><label class="full">Reason<input id="bmPayReason" class="input" value="Payment mode correction"></label></div><div id="bmPartyBox" class="btc-payment-party-box" style="display:none"></div><div id="bmMulti" style="display:none"><h4>MULTI MODE SPLIT</h4><div class="formgrid"><label>Cash<input id="bmMCash" class="input" type="number" step=".01" value="0"></label><label>UPI / Card<input id="bmMUpi" class="input" type="number" step=".01" value="0"></label><label>Credit<input id="bmMCredit" class="input" type="number" step=".01" value="'+Number(h.GrandTotal||0)+'"></label></div><small class="muted">BTC is not mixed silently. Use BTC mode so Customer / Company is selected.</small></div>',
   '<button class="btn" onclick="savePaymentChange('+Number(id)+','+Number(h.GrandTotal||0)+')">✓ Save Payment Mode</button>');
  d.querySelector('#bmPayMode').value=initialMode||h.PaymentMode||'Cash';
  const oldType=(model.payments||[])[0]?.PaymentType;if(oldType&&d.querySelector('#bmPayType'))d.querySelector('#bmPayType').value=oldType;
  await w.bmPaymentModeUi();
 }catch(e){alert(e.message||e)}
};
w.savePaymentChange=async function(id,total){
 const mode=d.querySelector('#bmPayMode')?.value||'Cash',type=d.querySelector('#bmPayType')?.value||'UPI',ref=d.querySelector('#bmPayRef')?.value||null,reason=d.querySelector('#bmPayReason')?.value||'Payment mode correction';
 try{
  if(mode==='BTC'){
   if(!selectedParty)return alert('Select Customer / Company for BTC');
   let cid=Number(selectedParty.Id);
   if(String(selectedParty.PartyType).toUpperCase()==='CUSTOMER'){const r=await api('/api/btc/companies/from-customer/'+cid,{method:'POST'});cid=Number(r.id)}
   await api('/api/btc/bill/'+Number(id)+'/payment-mode',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({PaymentMode:'BTC',CompanyId:cid,ReferenceNo:ref,Reason:reason})});
  }else{
   let payments=null,customerId=null,customerName=null;
   if(mode==='Credit/UPI'&&type==='Credit'){
    if(!selectedParty)return alert('Select Customer / Company for Credit');
    customerId=String(selectedParty.PartyType).toUpperCase()==='CUSTOMER'?Number(selectedParty.Id):null;
    customerName=selectedParty.Name||null;
   }
   if(mode==='Multi Mode'){
    payments=[['Cash',d.querySelector('#bmMCash')?.value],['UPI',d.querySelector('#bmMUpi')?.value],['Credit',d.querySelector('#bmMCredit')?.value]].map(x=>({Mode:'Multi Mode',Type:x[0],Amount:Number(x[1]||0),ReferenceNo:ref})).filter(x=>x.Amount>0);
    const sum=payments.reduce((a,x)=>a+x.Amount,0);if(Math.abs(sum-Number(total))>.01)return alert('Multi Mode split ₹'+money(sum)+' must equal Bill Total ₹'+money(total))
   }
   await api('/api/sales/'+Number(id)+'/payment-mode',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({PaymentMode:mode,PaymentType:type,ReferenceNo:ref,Reason:reason,Payments:payments,CustomerId:customerId,CustomerName:customerName})});
  }
  closeModal();toast('Payment mode changed successfully');if(typeof w.bmRefresh==='function')await w.bmRefresh()
 }catch(e){alert(e.message||e)}
};
if(typeof oldEditor==='function'){
 w.openBillEditor=async function(id,action='EDIT'){
  const r=await oldEditor.apply(this,arguments);
  if(String(action).toUpperCase()==='MODIFY'){
   setTimeout(()=>{const foot=d.querySelector('#modal .toolbar:last-child');if(foot&&!foot.querySelector('[data-bm-pay]')){const b=d.createElement('button');b.className='btn secondary';b.dataset.bmPay='1';b.textContent='₹ Payment Mode…';b.onclick=()=>{closeModal();w.openPaymentChange(Number(id))};foot.insertBefore(b,foot.lastElementChild)}},30)
  }
  return r
 }
}
w.bmReprint=async function(id){try{if(typeof w.printInvoice!=='function')throw new Error('Print Master is not loaded');await w.printInvoice(Number(id))}catch(e){alert('Reprint failed: '+(e.message||e))}};
})(window,document);