(function(w,d){
'use strict';
const oldOpen=w.openPaymentChange,oldUi=w.bmPaymentModeUi,oldSave=w.savePaymentChange;
let selected=null,partyRows=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function search(q=''){const r=await api('/api/retail/customer-company?q='+encodeURIComponent(q));partyRows=Array.isArray(r)?r:[];return partyRows}
function rowsHtml(){return partyRows.map(x=>'<button type="button" class="'+(selected&&selected.PartyType===x.PartyType&&Number(selected.Id)===Number(x.Id)?'selected':'')+'" data-bmp="'+esc(x.PartyType)+'" data-id="'+Number(x.Id)+'"><span><b>'+esc(x.Name)+'</b><small>'+esc(x.PartyType)+' · '+esc(x.Phone||'-')+'</small></span><b>₹'+Number(x.Balance||0).toFixed(2)+'</b></button>').join('')||'<div class="empty">No customer/company found</div>'}
function wire(){const box=d.querySelector('#bmBtcPartyRows');if(!box)return;box.querySelectorAll('button[data-bmp]').forEach(b=>b.onclick=()=>{selected=partyRows.find(x=>x.PartyType===b.dataset.bmp&&Number(x.Id)===Number(b.dataset.id))||null;box.innerHTML=rowsHtml();wire()})}
async function renderPicker(){
 const mode=d.querySelector('#bmPayMode')?.value,host=d.querySelector('#bmBtcPartyBox');
 if(mode!=='BTC'){if(host)host.remove();return}
 let box=host;if(!box){box=d.createElement('div');box.id='bmBtcPartyBox';box.className='btc-payment-party-box';const anchor=d.querySelector('#bmMulti');anchor?.insertAdjacentElement('beforebegin',box)}
 await search('');
 box.innerHTML='<label>BTC Customer / Company<input id="bmBtcPartySearch" class="input" placeholder="Search name / mobile / GSTIN"></label><div id="bmBtcPartyRows" class="btc-payment-party-results">'+rowsHtml()+'</div>';
 wire();const q=d.querySelector('#bmBtcPartySearch');if(q)q.oninput=async()=>{selected=null;await search(q.value);const r=d.querySelector('#bmBtcPartyRows');if(r){r.innerHTML=rowsHtml();wire()}};
}
w.openPaymentChange=async function(){selected=null;const r=await oldOpen.apply(this,arguments);setTimeout(()=>w.bmPaymentModeUi&&w.bmPaymentModeUi(),20);return r};
w.bmPaymentModeUi=function(){if(typeof oldUi==='function')oldUi.apply(this,arguments);renderPicker()};
w.savePaymentChange=async function(id,total){
 const mode=d.querySelector('#bmPayMode')?.value;
 if(mode!=='BTC')return oldSave.apply(this,arguments);
 if(!selected)return alert('Select Customer / Company for BTC');
 let cid=Number(selected.Id);
 if(String(selected.PartyType).toUpperCase()==='CUSTOMER'){const r=await api('/api/btc/companies/from-customer/'+cid,{method:'POST'});cid=Number(r.id)}
 try{await api('/api/btc/bill/'+Number(id)+'/payment-mode',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({PaymentMode:'BTC',CompanyId:cid,ReferenceNo:d.querySelector('#bmPayRef')?.value||null,Reason:d.querySelector('#bmPayReason')?.value||'Payment mode correction'})});closeModal();toast('Payment mode changed to BTC / Bill To Company');if(typeof w.bmRefresh==='function')await w.bmRefresh()}catch(e){alert(e.message||e)}
};
w.bmReprint=async function(id){try{if(typeof w.printInvoice!=='function')throw new Error('Print Master is not loaded');await w.printInvoice(Number(id))}catch(e){alert('Reprint failed: '+(e.message||e))}};
})(window,document);