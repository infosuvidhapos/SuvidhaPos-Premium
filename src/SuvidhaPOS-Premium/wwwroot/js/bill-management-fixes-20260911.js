(function(w,d){
'use strict';
let billCtx=null,selectedParty=null,partyRows=[];
const oldEditor=w.openBillEditor,oldSaveEdit=w.saveBillEdit;
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
let modifyParty=null,modifyParties=[];
async function renderModifyParty(){
 const mode=d.querySelector('#bmModifyPayMode')?.value||'KEEP',type=d.querySelector('#bmModifyPayType')?.value||'UPI',host=d.querySelector('#bmModifyPartyBox');
 if(!host)return;
 const need=mode==='BTC'||(mode==='Credit/UPI'&&type==='Credit');
 if(!need){host.style.display='none';host.innerHTML='';modifyParty=null;return}
 host.style.display='block';modifyParties=await parties('');
 const draw=()=>{host.innerHTML='<label>Customer / Company<input id="bmModifyPartySearch" class="input" placeholder="Search name / mobile / GSTIN"></label><div class="btc-payment-party-results">'+(modifyParties.map(x=>'<button type="button" class="'+(modifyParty&&modifyParty.PartyType===x.PartyType&&Number(modifyParty.Id)===Number(x.Id)?'selected':'')+'" data-mparty="'+esc(x.PartyType)+'" data-mid="'+Number(x.Id)+'"><span><b>'+esc(x.Name)+'</b><small>'+esc(x.PartyType)+' · '+esc(x.Phone||'-')+'</small></span><b>₹'+money(x.Balance||0)+'</b></button>').join('')||'<div class="empty">No customer/company found</div>')+'</div>';host.querySelectorAll('button[data-mparty]').forEach(b=>b.onclick=()=>{modifyParty=modifyParties.find(x=>String(x.PartyType)===b.dataset.mparty&&Number(x.Id)===Number(b.dataset.mid))||null;draw()});const q=host.querySelector('#bmModifyPartySearch');if(q)q.oninput=async()=>{modifyParty=null;modifyParties=await parties(q.value);draw()}}
 draw()
}
w.bmModifyPayUi=function(){const mode=d.querySelector('#bmModifyPayMode')?.value||'KEEP',tw=d.querySelector('#bmModifyPayTypeWrap');if(tw)tw.style.display=mode==='Credit/UPI'?'grid':'none';renderModifyParty()};
w.bmModifyPayTypeChanged=function(){renderModifyParty()};
async function applyModifyPayment(id){
 const mode=d.querySelector('#bmModifyPayMode')?.value||'KEEP';if(mode==='KEEP')return;
 const type=d.querySelector('#bmModifyPayType')?.value||'UPI',ref=d.querySelector('#bmModifyPayRef')?.value||null;
 if(mode==='BTC'){
  if(!modifyParty)throw new Error('Select Customer / Company for BTC');
  let cid=Number(modifyParty.Id);
  if(String(modifyParty.PartyType).toUpperCase()==='CUSTOMER'){const r=await api('/api/btc/companies/from-customer/'+cid,{method:'POST'});cid=Number(r.id)}
  await api('/api/btc/bill/'+Number(id)+'/payment-mode',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({PaymentMode:'BTC',CompanyId:cid,ReferenceNo:ref,Reason:'Changed during bill modification'})});
  return
 }
 let customerId=null,customerName=null;
 if(mode==='Credit/UPI'&&type==='Credit'){
  if(!modifyParty)throw new Error('Select Customer / Company for Credit');
  customerId=String(modifyParty.PartyType).toUpperCase()==='CUSTOMER'?Number(modifyParty.Id):null;customerName=modifyParty.Name||null
 }
 await api('/api/sales/'+Number(id)+'/payment-mode',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({PaymentMode:mode,PaymentType:type,ReferenceNo:ref,Reason:'Changed during bill modification',Payments:null,CustomerId:customerId,CustomerName:customerName})})
}
if(typeof oldEditor==='function'){
 w.openBillEditor=async function(id,action='EDIT'){
  modifyParty=null;modifyParties=[];
  const r=await oldEditor.apply(this,arguments);
  if(String(action).toUpperCase()==='MODIFY'){
   setTimeout(()=>{
    const modalBox=d.querySelector('#modal .modalbox'),foot=d.querySelector('#modal .toolbar:last-child');if(!modalBox||!foot)return;
    if(!d.querySelector('#bmModifyPayPanel')){
      const panel=d.createElement('div');panel.id='bmModifyPayPanel';panel.className='panel';panel.style.marginTop='12px';
      panel.innerHTML='<h4>PAYMENT AFTER MODIFICATION</h4><div class="formgrid"><label>Payment Mode<select id="bmModifyPayMode" class="select" onchange="bmModifyPayUi()"><option value="KEEP">Keep Current Payment</option><option>Cash</option><option>Credit/UPI</option><option>BTC</option></select></label><label id="bmModifyPayTypeWrap" style="display:none">Type<select id="bmModifyPayType" class="select" onchange="bmModifyPayTypeChanged()"><option>UPI</option><option>Card</option><option>PhonePe</option><option>Paytm</option><option>Credit</option></select></label><label>Reference / UTR<input id="bmModifyPayRef" class="input" placeholder="Optional"></label></div><div id="bmModifyPartyBox" class="btc-payment-party-box" style="display:none"></div>';
      foot.parentElement.insertBefore(panel,foot)
    }
    const save=foot.querySelector('button.btn:not(.secondary)');if(save){save.textContent='✓ Save & Print';save.setAttribute('onclick','bmSaveModifyAndPrint('+Number(id)+')')}
   },30)
  }
  return r
 }
}
w.bmSaveModifyAndPrint=async function(id){
 const plan={mode:d.querySelector('#bmModifyPayMode')?.value||'KEEP',type:d.querySelector('#bmModifyPayType')?.value||'UPI',ref:d.querySelector('#bmModifyPayRef')?.value||null,party:modifyParty};
 try{
  if(typeof oldSaveEdit!=='function')throw new Error('Bill modify save function is not loaded');
  await oldSaveEdit(Number(id));
  if(d.querySelector('#modal'))return;
  modifyParty=plan.party;
  if(plan.mode!=='KEEP'){
   await api('/api/sales/'+Number(id)+'/edit-model').catch(()=>null);
   if(plan.mode==='BTC'){
    if(!modifyParty)throw new Error('Select Customer / Company for BTC');
    let cid=Number(modifyParty.Id);if(String(modifyParty.PartyType).toUpperCase()==='CUSTOMER'){const x=await api('/api/btc/companies/from-customer/'+cid,{method:'POST'});cid=Number(x.id)}
    await api('/api/btc/bill/'+Number(id)+'/payment-mode',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({PaymentMode:'BTC',CompanyId:cid,ReferenceNo:plan.ref,Reason:'Changed during bill modification'})})
   }else{
    let customerId=null,customerName=null;if(plan.mode==='Credit/UPI'&&plan.type==='Credit'){if(!modifyParty)throw new Error('Select Customer / Company for Credit');customerId=String(modifyParty.PartyType).toUpperCase()==='CUSTOMER'?Number(modifyParty.Id):null;customerName=modifyParty.Name||null}
    await api('/api/sales/'+Number(id)+'/payment-mode',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({PaymentMode:plan.mode,PaymentType:plan.type,ReferenceNo:plan.ref,Reason:'Changed during bill modification',Payments:null,CustomerId:customerId,CustomerName:customerName})})
   }
  }
  if(typeof w.printInvoice!=='function')throw new Error('Print Master is not loaded');await w.printInvoice(Number(id));toast('Bill modification saved and print sent');if(typeof w.bmRefresh==='function')await w.bmRefresh()
 }catch(e){alert('Modify / Save & Print failed: '+(e.message||e))}
};
w.bmReprint=async function(id){try{if(typeof w.printInvoice!=='function')throw new Error('Print Master is not loaded');await w.printInvoice(Number(id));toast('Reprint sent to Print Master')}catch(e){alert('Reprint failed: '+(e.message||e))}};
})(window,document);