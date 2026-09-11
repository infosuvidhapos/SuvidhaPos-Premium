(function(w,d){
'use strict';
const oldOpen=w.openBtcCompanySelect,oldChoose=w.btcChooseCompany;
if(typeof oldOpen!=='function'||typeof oldChoose!=='function')return;
let pick=null,rows=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function list(q=''){const r=await api('/api/retail/customer-company?q='+encodeURIComponent(q));return Array.isArray(r)?r:[]}
function html(){return rows.map(x=>'<button class="btc-company-row '+(pick&&pick.PartyType===x.PartyType&&Number(pick.Id)===Number(x.Id)?'selected':'')+'" data-party="'+esc(x.PartyType)+'" data-id="'+Number(x.Id)+'"><div><b>'+esc(x.Name)+'</b><small>'+esc(x.PartyType)+' · '+esc(x.Phone||'-')+' · '+esc(x.GstIn||'-')+'</small></div><div><b>Outstanding ₹'+Number(x.Balance||0).toFixed(2)+'</b></div></button>').join('')||'<div class="empty">No customer/company found</div>'}
function wire(){const box=d.querySelector('#btcUnifiedRows');if(!box)return;box.querySelectorAll('.btc-company-row').forEach(b=>b.onclick=()=>{pick=rows.find(x=>x.PartyType===b.dataset.party&&Number(x.Id)===Number(b.dataset.id))||null;box.innerHTML=html();wire()})}
w.openBtcCompanySelect=async function(){
 if(!(typeof state!=='undefined'&&state.cart&&state.cart.length))return toast('Add items to invoice before Bill To Company');
 pick=null;rows=await list('');
 modal('BTC / Credit – Customer / Company','<div class="btc-select-company"><div class="btc-modal-toolbar"><input id="btcUnifiedSearch" class="input" placeholder="Search name / mobile / GSTIN"><button class="btn secondary" onclick="btcOpenCompanyMaster()">＋ New</button></div><div id="btcUnifiedRows" class="btc-company-list">'+html()+'</div><div class="btc-billing-advance"><label>Advance Amount (optional)<input id="btcUnifiedAdvance" class="input" type="number" min="0" step="0.01" placeholder="0.00"></label><div><span>Advance Payment</span><button class="active" data-uadv="Cash">Cash</button><button data-uadv="Credit/UPI">Credit / UPI</button></div></div></div>','<button class="btn green" onclick="btcUnifiedSubmit()">Submit · Save & Print</button>');
 wire();
 const q=d.querySelector('#btcUnifiedSearch');if(q)q.oninput=async()=>{rows=await list(q.value);pick=null;const box=d.querySelector('#btcUnifiedRows');if(box){box.innerHTML=html();wire()}};
 d.querySelectorAll('[data-uadv]').forEach(b=>b.onclick=()=>{d.querySelectorAll('[data-uadv]').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
};
w.btcUnifiedSubmit=async function(){
 if(!pick)return toast('Select customer / company first');
 const amount=Number(d.querySelector('#btcUnifiedAdvance')?.value||0),mode=d.querySelector('[data-uadv].active')?.dataset.uadv||'Cash';
 let cid=Number(pick.Id);
 if(String(pick.PartyType).toUpperCase()==='CUSTOMER'){const r=await api('/api/btc/companies/from-customer/'+cid,{method:'POST'});cid=Number(r.id)}
 closeModal();
 await oldOpen();
 const m=d.querySelector('#modal');if(m)m.style.visibility='hidden';
 const a=d.querySelector('#btcBillingAdvance');if(a)a.value=amount||'';
 if(mode==='Credit/UPI'&&typeof w.btcBillingAdvanceMode==='function')w.btcBillingAdvanceMode('Credit/UPI');
 await oldChoose(cid);
 setTimeout(()=>w.cbComplete&&w.cbComplete(),30);
};
})(window,document);