(function(w,d){
'use strict';
if(typeof w.btcSetBillingCompanyById!=='function')return;
let partyRows=[],selectedParty=null,selectedCompany=null,advanceAmount=0,advanceMode='',advanceType='UPI',advanceRef='',advanceDetailConfirmed=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
async function list(q=''){const r=await api('/api/retail/customer-company?q='+encodeURIComponent(q||''));partyRows=Array.isArray(r)?r:[];return partyRows}
async function allCompanies(){const r=await api('/api/btc/companies?q=');return Array.isArray(r)?r:[]}
async function toCompany(p){
 if(!p)return null;
 if(String(p.PartyType).toUpperCase()==='COMPANY'){const rows=await allCompanies();return rows.find(x=>Number(x.Id)===Number(p.Id))||null}
 const r=await api('/api/btc/companies/from-customer/'+Number(p.Id),{method:'POST'});
 const rows=await allCompanies();return rows.find(x=>Number(x.Id)===Number(r.id))||null
}
function partyHtml(){
 return partyRows.map(x=>'<button class="btc-company-row" data-party="'+esc(x.PartyType)+'" data-id="'+Number(x.Id)+'"><div><b>'+esc(x.Name)+'</b><small>'+esc(x.PartyType)+' · '+esc(x.Phone||'-')+' · '+esc(x.GstIn||'-')+'</small></div><div><b>Outstanding ₹'+money(x.Balance||0)+'</b></div></button>').join('')||'<div class="empty">No customer/company found</div>'
}
function wirePartyRows(){
 const box=d.querySelector('#btcUnifiedRows');if(!box)return;
 box.querySelectorAll('.btc-company-row').forEach(b=>b.onclick=async()=>{const p=partyRows.find(x=>String(x.PartyType)===b.dataset.party&&Number(x.Id)===Number(b.dataset.id));if(!p)return;selectedParty=p;selectedCompany=await toCompany(p);if(!selectedCompany)return alert('Selected party could not be prepared for BTC');advanceAmount=0;advanceMode='';advanceType='UPI';advanceRef='';advanceDetailConfirmed=false;showAdvanceStep()})
}
async function showSelectStep(preselectCompanyId=0){
 closeModal();selectedParty=null;selectedCompany=null;advanceAmount=0;advanceMode='';advanceType='UPI';advanceRef='';advanceDetailConfirmed=false;
 if(preselectCompanyId){
  const rows=await allCompanies(),c=rows.find(x=>Number(x.Id)===Number(preselectCompanyId));
  if(c){selectedCompany=c;selectedParty={PartyType:'Company',Id:c.Id,Name:c.CompanyName,Phone:c.Phone,GstIn:c.GstIn,Balance:c.Outstanding};return showAdvanceStep()}
 }
 await list('');
 modal('BTC / Credit – Customer / Company',
 '<div class="btc-select-company btc-billing-flow"><div class="btc-step-title"><b>1. Select Customer / Company</b><span>Search by name, mobile or GSTIN</span></div><div class="btc-modal-toolbar"><input id="btcUnifiedSearch" class="input" placeholder="Search name / mobile / GSTIN" autocomplete="off"><button class="btn secondary" onclick="btcOpenCompanyMaster(0,\'billing\')">＋ New Company</button></div><div id="btcUnifiedRows" class="btc-company-list">'+partyHtml()+'</div></div>',
 '');
 wirePartyRows();
 const q=d.querySelector('#btcUnifiedSearch');if(q){q.focus();q.oninput=async()=>{await list(q.value);const box=d.querySelector('#btcUnifiedRows');if(box){box.innerHTML=partyHtml();wirePartyRows()}}}
}
function paymentPanel(){
 const visible=advanceAmount>0;
 return '<div id="btcAdvancePayPanel" class="btc-advance-pay-panel" style="display:'+(visible?'grid':'none')+'"><span>Advance Payment</span><button class="'+(advanceMode==='Cash'?'active':'')+'" onclick="btcAdvanceChooseCash()">💵 Cash</button><button class="'+(advanceMode==='Credit/UPI'?'active':'')+'" onclick="btcAdvanceOpenCredit()">💳 Credit / UPI</button>'+(advanceMode==='Credit/UPI'&&advanceDetailConfirmed?'<small class="full">Selected: '+esc(advanceType)+(advanceRef?' · '+esc(advanceRef):'')+'</small>':'')+'</div>'
}
function showAdvanceStep(){
 if(!selectedCompany)return showSelectStep();
 closeModal();
 modal('BTC / Credit – Advance & Submit',
 '<div class="btc-select-company btc-billing-flow"><div class="btc-step-title"><b>2. Selected Party</b><button class="btn small secondary" onclick="openBtcCompanySelect()">← Change</button></div><div class="btc-selected-party"><div><b>'+esc(selectedCompany.CompanyName)+'</b><small>'+esc(selectedCompany.Phone||'-')+' · GSTIN '+esc(selectedCompany.GstIn||'-')+'</small></div><div><b>Outstanding ₹'+money(selectedCompany.Outstanding||0)+'</b><small>Credit '+(Number(selectedCompany.CreditLimit||0)>0?'₹'+money(selectedCompany.CreditLimit):'Unlimited')+'</small></div></div><label class="btc-advance-amount">Advance Amount (optional)<input id="btcUnifiedAdvance" class="input" type="number" min="0" step="0.01" value="'+(advanceAmount||'')+'" placeholder="0.00"></label>'+paymentPanel()+'<div class="btc-flow-help">Advance payment buttons appear only after an amount is entered. Leave blank/0 to create only the BTC bill.</div></div>',
 '<button class="btn green" onclick="btcUnifiedSubmit()">✓ Submit · Save & Print</button>');
 const a=d.querySelector('#btcUnifiedAdvance');if(a){a.focus();a.oninput=()=>{advanceAmount=Math.max(0,Number(a.value)||0);if(!advanceAmount){advanceMode='';advanceDetailConfirmed=false}const host=d.querySelector('#btcAdvancePayPanel');if(host){const tmp=d.createElement('div');tmp.innerHTML=paymentPanel();host.replaceWith(tmp.firstElementChild)}}}
}
w.btcAdvanceChooseCash=function(){advanceAmount=Math.max(0,Number(d.querySelector('#btcUnifiedAdvance')?.value)||advanceAmount);if(!advanceAmount)return;advanceMode='Cash';advanceType='Cash';advanceRef='';advanceDetailConfirmed=true;showAdvanceStep()};
w.btcAdvanceOpenCredit=function(){advanceAmount=Math.max(0,Number(d.querySelector('#btcUnifiedAdvance')?.value)||advanceAmount);if(!advanceAmount)return;closeModal();modal('Credit / UPI – Advance Payment',
 '<div class="btc-credit-option-page"><div class="btc-selected-party"><div><b>'+esc(selectedCompany?.CompanyName||'')+'</b><small>Advance payment options</small></div><b>₹'+money(advanceAmount)+'</b></div><div class="formgrid"><label>Payment Type<select id="btcAdvType" class="select"><option>UPI</option><option>Card</option><option>PhonePe</option><option>Paytm</option><option>Credit</option></select></label><label>Amount<input class="input" value="'+money(advanceAmount)+'" readonly></label><label class="full">Reference / UTR / Invoice No.<input id="btcAdvRef" class="input" value="'+esc(advanceRef)+'" placeholder="Optional"></label></div></div>',
 '<button class="btn green" onclick="btcAdvanceConfirmCredit()">✓ Use Credit / UPI</button>');
 const t=d.querySelector('#btcAdvType');if(t){t.value=advanceType||'UPI';setTimeout(()=>t.focus(),20)}
};
w.btcAdvanceConfirmCredit=function(){advanceType=d.querySelector('#btcAdvType')?.value||'UPI';advanceRef=d.querySelector('#btcAdvRef')?.value?.trim()||'';advanceMode='Credit/UPI';advanceDetailConfirmed=true;showAdvanceStep()};
w.openBtcCompanySelect=async function(preselectCompanyId=0){if(!(typeof state!=='undefined'&&state.cart&&state.cart.length))return toast('Add items to invoice before Bill To Company');try{await showSelectStep(Number(preselectCompanyId)||0)}catch(e){alert(e.message||e)}};
w.btcUnifiedSubmit=async function(){
 if(!selectedCompany)return toast('Select customer / company first');
 advanceAmount=Math.max(0,Number(d.querySelector('#btcUnifiedAdvance')?.value)||advanceAmount);
 if(advanceAmount>0&&!advanceMode)return toast('Select Cash or Credit / UPI for the advance');
 if(advanceAmount>0&&advanceMode==='Credit/UPI'&&!advanceDetailConfirmed)return w.btcAdvanceOpenCredit();
 try{
  if(advanceAmount>0){
   const note='Advance received during BTC billing'+(advanceMode==='Credit/UPI'?' · '+advanceType:'');
   const r=await api('/api/btc/advance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CompanyId:Number(selectedCompany.Id),Amount:advanceAmount,PaymentMode:advanceMode,ReferenceNo:advanceRef||null,Notes:note})});
   toast('Advance '+r.receiptNo+' received · ₹'+money(advanceAmount))
  }
  await w.btcSetBillingCompanyById(Number(selectedCompany.Id));
  closeModal();
  await w.cbComplete();
 }catch(e){alert(e.message||e)}
};
})(window,document);