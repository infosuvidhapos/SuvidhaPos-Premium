(function(w,d){
'use strict';
const active=()=>d.body.classList.contains('jewel-suite-mode');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=()=>{const x=new Date();return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const modules={
 ESTIMATE:{name:'Estimates',sub:'Item-wise quotations, GST, validity and acceptance',fields:['PartyName','Phone','Date','DueDate','Title','Lines','Notes']},
 ISSUE:{name:'Issue Register',sub:'Tag issue to Karigar, full return and weight reconciliation',fields:['KarigarId','ItemId','Weight','Date','DueDate','Title','Notes']},
 KARIGAR:{name:'Karigar',sub:'Workshop contacts, skills and active status',fields:['PartyName','Phone','Address','Title','Date','Notes']},
 JOB:{name:'Karigar Jobs',sub:'Work orders, progress, payments and delivery',fields:['PartyName','KarigarId','Title','Date','DueDate','Metal','Weight','Amount','PaidAmount','Notes']},
 REPAIR:{name:'Repairs',sub:'Customer repair intake, charges, advance and delivery',fields:['CustomerId','PartyName','Phone','Title','Date','DueDate','Metal','Weight','Amount','PaidAmount','Notes']},
 GIRVI:{name:'Girvi Loans',sub:'Collateral, principal, agreed annual simple interest and receipts',fields:['CustomerId','PartyName','Phone','Address','Title','Metal','Weight','Date','DueDate','Amount','AnnualRate','Notes']},
 LEDGER:{name:'Cr/Dr Ledger',sub:'Jewellery customer debit/credit entries and balance',fields:['CustomerId','Title','Date','Direction','Amount','ReferenceNo','Notes']},
 SCHEME:{name:'Saving Schemes',sub:'Customer savings accounts, instalments and maturity',fields:['CustomerId','PartyName','Phone','Title','Date','Instalment','Months','Notes']}
};
let current='ESTIMATE',pageNo=1,search='',pendingId=null,details=null,parties=[],karigars=[],items=[];
const val=id=>d.getElementById(id)?.value||'';
const request=(url,body,method='POST')=>api(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const guid=()=>w.crypto.randomUUID();
const toastError=e=>w.alert(e.message||e);
function detailData(row){try{return JSON.parse(row.Details)}catch{return {}}}
function formField(key,kind){
 const labels={PartyName:kind==='KARIGAR'?'Karigar name':'Customer / party name',Title:kind==='KARIGAR'?'Skill / speciality':'Item / description',Date:'Date',DueDate:kind==='ESTIMATE'?'Valid until':'Due date',Weight:'Gross weight (g)',Amount:kind==='GIRVI'?'Principal ₹':'Amount ₹',PaidAmount:'Advance ₹',AnnualRate:'Annual simple interest % (365-day basis)',Instalment:'Monthly instalment ₹',Months:'Months',Direction:'Debit / Credit',ReferenceNo:'Reference',CustomerId:'Customer',KarigarId:'Karigar',ItemId:'In-stock tag'};
 let control='';const nums=['Weight','Amount','PaidAmount','AnnualRate','Instalment','Months'];
 if(key==='Lines')return '<div class="full jreg-estimate-lines"><h3>Estimate items</h3><p class="muted">Rate is per gram when weight is entered; otherwise it is per piece. Making is the line total.</p><div id="jregLines"></div><button class="btn secondary small" type="button" onclick="jregAddLine()">＋ Add item</button></div>';
 if(key==='Notes'||key==='Address')control='<textarea id="jr'+key+'" class="textarea" maxlength="500"></textarea>';
 else if(key==='CustomerId')control='<select id="jrCustomerId" class="select" onchange="jregSelectCustomer()"><option value="">'+(kind==='LEDGER'?'Select customer':'Walk-in / enter name')+'</option>'+parties.map(x=>'<option value="'+x.Id+'">'+esc(x.Name)+' · '+esc(x.Phone||'')+'</option>').join('')+'</select>';
 else if(key==='KarigarId')control='<select id="jrKarigarId" class="select"><option value="">Select active Karigar</option>'+karigars.map(x=>'<option value="'+x.Id+'">'+esc(x.PartyName)+'</option>').join('')+'</select>';
 else if(key==='ItemId')control='<select id="jrItemId" class="select" onchange="jregSelectTag()"><option value="">Select tag</option>'+items.map(x=>'<option value="'+x.Id+'">'+esc(x.TagNo)+' · '+esc(x.ItemName)+'</option>').join('')+'</select>';
 else if(key==='Direction')control='<select id="jrDirection" class="select"><option value="DR">DR — Customer owes</option><option value="CR">CR — Customer credit</option></select>';
 else if(key==='Metal')control='<select id="jrMetal" class="select"><option>Gold</option><option>Silver</option><option>Platinum</option><option>Other</option></select>';
 else control='<input id="jr'+key+'" class="input" '+(nums.includes(key)?'type="number" min="0" step="'+(key==='Months'?'1':key==='Weight'?'0.0001':'0.01')+'"':'type="'+(key==='Date'||key==='DueDate'?'date':'text')+'" maxlength="'+(key==='Phone'?'40':'200')+'"')+' value="'+(key==='Date'?date():key==='Months'?'12':nums.includes(key)?'0':'')+'">';
 return '<label class="'+(['Notes','Address','Title'].includes(key)?'full':'')+'">'+esc(labels[key]||key)+control+'</label>';
}
w.loadJewelleryRegister=async function(kind,page=1,q=''){
 if(!active()||!modules[kind])return;current=kind;pageNo=page;search=q;const config=modules[kind];
 setPage('jreg'+kind);title.textContent=config.name;const sub=d.querySelector('header p');if(sub)sub.textContent=config.sub;
 const app=d.getElementById('app');app.innerHTML='<div class="content">Loading '+esc(config.name)+'…</div>';
 try{
  const result=await api('/api/jewellery/registers/'+kind+'?page='+page+'&q='+encodeURIComponent(q));
  const rows=result.rows||[];
  app.innerHTML='<div class="content jewellery-register-page"><div class="js-page-head"><div><h1>'+esc(config.name)+'</h1><p>'+esc(config.sub)+'</p></div><button class="js-gold" onclick="jregNew(\''+kind+'\')">＋ '+(kind==='KARIGAR'?'Add Karigar':'New Entry')+'</button></div><div class="panel"><div class="toolbar"><input id="jregSearch" class="input" placeholder="Name, description or entry number" value="'+esc(q)+'"><button class="btn secondary" onclick="loadJewelleryRegister(\''+kind+'\',1,document.getElementById(\'jregSearch\').value)">Search</button><span class="muted">'+result.total+' entries</span></div><div class="tablewrap"><table class="table"><thead><tr><th>ENTRY</th><th>DATE</th><th>PARTY</th><th>DESCRIPTION</th><th>STATUS</th><th>AMOUNT</th><th>PAID</th><th></th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+kind.slice(0,3)+'-'+row.Id+'</td><td>'+esc(String(row.RecordDate).slice(0,10))+'</td><td>'+esc(row.PartyName)+'</td><td>'+esc(row.Title)+'</td><td><span class="tag">'+esc(row.Status)+'</span></td><td>₹'+money(row.Amount)+'</td><td>₹'+money(row.PaidAmount)+'</td><td><button class="btn small secondary" onclick="jregOpen(\''+kind+'\','+row.Id+')">Open</button></td></tr>').join('')+'</tbody></table>'+(rows.length?'':'<p class="empty">No entries found. Add the first entry above.</p>')+'</div><div class="toolbar jreg-pager"><button class="btn secondary small" '+(page<=1?'disabled':'')+' onclick="jregPage(-1)">Previous</button><span>Page '+page+'</span><button class="btn secondary small" '+(page*100>=result.total?'disabled':'')+' onclick="jregPage(1)">Next</button></div></div></div>';
 }catch(e){app.innerHTML='<div class="content"><div class="alert">'+esc(e.message)+'</div></div>'}
};
w.jregPage=delta=>w.loadJewelleryRegister(current,pageNo+delta,search);
w.jregNew=async function(kind){
 if(!active())return;current=kind;pendingId=guid();
 try{
  const needed=modules[kind].fields;
  if(needed.includes('CustomerId'))parties=await api('/api/customers');
  if(needed.includes('KarigarId')){const all=await api('/api/jewellery/registers/KARIGAR?q=&page=1');karigars=(all.rows||[]).filter(x=>x.Status==='ACTIVE');}
  if(needed.includes('ItemId'))items=(await api('/api/jewellery/catalog')).filter(x=>x.Status==='IN_STOCK');
  modal('New '+modules[kind].name,'<div class="formgrid jreg-form">'+needed.map(key=>formField(key,kind)).join('')+'</div>','<button id="jregSave" class="btn" onclick="jregSave()">Save Entry</button>');
  d.querySelector('#modal .modalbox')?.classList.add('jreg-dialog');
  if(kind==='ESTIMATE')w.jregAddLine();
 }catch(e){toastError(e)}
};
w.jregSelectCustomer=function(){const x=parties.find(x=>String(x.Id)===val('jrCustomerId'));if(!x)return;for(const [k,v] of Object.entries({PartyName:x.Name,Phone:x.Phone,Address:x.Address})){const input=d.getElementById('jr'+k);if(input)input.value=v||''}};
w.jregSelectTag=function(){const x=items.find(x=>String(x.Id)===val('jrItemId'));if(!x)return;d.getElementById('jrWeight').value=x.GrossWeight;d.getElementById('jrTitle').value=x.TagNo+' · '+x.ItemName};
w.jregAddLine=function(){
 const box=d.getElementById('jregLines'),row=d.createElement('div');row.className='jreg-line';
 row.innerHTML='<label>Item<input data-field="Name" class="input" maxlength="200"></label><label>Qty<input data-field="Quantity" class="input" type="number" min="0.001" step="0.001" value="1"></label><label>Weight / pc g<input data-field="Weight" class="input" type="number" min="0" step="0.0001" value="0"></label><label>Rate ₹<input data-field="Rate" class="input" type="number" min="0" step="0.01" value="0"></label><label>Making ₹<input data-field="Making" class="input" type="number" min="0" step="0.01" value="0"></label><label>GST %<input data-field="GstRate" class="input" type="number" min="0" max="100" step="0.01" value="0"></label><label>Tax mode<select data-field="TaxMode" class="select"><option>EXCLUSIVE</option><option>INCLUSIVE</option></select></label><button class="btn small danger" type="button" onclick="this.closest(\'.jreg-line\').remove()">×</button>';
 box.appendChild(row);
};
w.jregSave=async function(){
 if(!active())return;const button=d.getElementById('jregSave');if(button.disabled)return;button.disabled=true;
 try{
  const data={};for(const key of modules[current].fields){if(key==='Lines')continue;const raw=val('jr'+key);data[key]=['CustomerId','KarigarId','ItemId'].includes(key)?(Number(raw)||null):['Weight','Amount','PaidAmount','AnnualRate','Instalment','Months'].includes(key)?Number(raw):raw;}
  if(!data.DueDate)delete data.DueDate;
  if(current==='ISSUE')data.PartyName=karigars.find(x=>x.Id===data.KarigarId)?.PartyName||'';
  if(current==='LEDGER')data.PartyName=parties.find(x=>x.Id===data.CustomerId)?.Name||'';
  if(current==='ESTIMATE')data.Lines=[...d.querySelectorAll('.jreg-line')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,['Name','TaxMode'].includes(input.dataset.field)?input.value:Number(input.value)])));
  const result=await request('/api/jewellery/registers/'+current,{RequestId:pendingId,Data:data});closeModal();await w.jregOpen(current,result.id);
 }catch(e){toastError(e)}finally{button.disabled=false}
};
function actions(kind,data){
 const status=data.Status;
 if(kind==='KARIGAR')return ['EDIT',status==='ACTIVE'?'DEACTIVATE':'ACTIVATE'];
 if(kind==='ESTIMATE')return status==='OPEN'?['ACCEPT','CANCEL']:[];
 if(kind==='ISSUE')return status==='ISSUED'?['RETURN']:[];
 if(kind==='LEDGER')return status==='POSTED'?['REVERSE']:[];
 if(kind==='SCHEME')return status==='ACTIVE'?['PAYMENT','REDEEM','REFUND']:[];
 if(kind==='GIRVI')return status==='ACTIVE'?['PAYMENT']:[];
 if(['JOB','REPAIR'].includes(kind)&&['OPEN','IN_PROGRESS','READY'].includes(status))return [data.PaidAmount<data.Amount?'PAYMENT':null,status==='OPEN'?'START':status==='IN_PROGRESS'?'READY':'DELIVER',data.PaidAmount===0?'CANCEL':'REFUND'].filter(Boolean);
 return [];
}
w.jregOpen=async function(kind,id){
 if(!active())return;current=kind;
 try{
  const result=await api('/api/jewellery/registers/'+kind+'/'+id);details={kind,id,...result};const x=result.data;
  const metrics=kind==='GIRVI'?['<div>Principal remaining<b>₹'+money(x.PrincipalOutstanding)+'</b></div><div>Due today<b>₹'+money(result.due)+'</b></div><div>Annual rate<b>'+money(x.AnnualRate)+'%</b></div>']:kind==='ISSUE'?['<div>Issued<b>'+x.Weight+' g</b></div><div>Returned<b>'+x.ReturnedWeight+' g</b></div><div>Weight difference<b>'+(x.Status==='RETURNED'?(x.Weight-x.ReturnedWeight).toFixed(4):'Pending')+' g</b></div>']:['<div>Total<b>₹'+money(x.Amount)+'</b></div><div>Paid / collected<b>₹'+money(x.PaidAmount)+'</b></div><div>Balance<b>₹'+money(Math.max(0,x.Amount-x.PaidAmount))+'</b></div>'];
  setPage('jreg'+kind);title.textContent=modules[kind].name;
  d.getElementById('app').innerHTML='<div class="content jewellery-register-page"><div class="js-page-head"><div><h1>'+esc(modules[kind].name)+' #'+id+'</h1><p>'+esc(x.PartyName)+' · '+esc(x.Status)+'</p></div><div class="toolbar"><button class="js-outline" onclick="loadJewelleryRegister(\''+kind+'\')">← Register</button><button class="js-gold" onclick="jregPrint()">Print</button></div></div><div class="panel" id="jregDetail"><h2>'+esc(x.Title)+'</h2><p>'+esc(x.PartyName)+' · '+esc(x.Phone)+'</p><p>'+esc(x.Address)+'</p><p>Date: '+esc(String(x.Date).slice(0,10))+(x.DueDate?' · Due / maturity: '+esc(String(x.DueDate).slice(0,10)):'')+'</p><div class="jreg-metrics">'+metrics.join('')+'</div>'+ (kind==='ESTIMATE'?'<div class="tablewrap"><table class="table"><thead><tr><th>Item</th><th>Qty</th><th>Weight</th><th>Rate</th><th>Making</th><th>GST</th></tr></thead><tbody>'+x.Lines.map(l=>'<tr><td>'+esc(l.Name)+'</td><td>'+l.Quantity+'</td><td>'+l.Weight+'</td><td>'+money(l.Rate)+'</td><td>'+money(l.Making)+'</td><td>'+l.GstRate+'% '+esc(l.TaxMode)+'</td></tr>').join('')+'</tbody></table></div>':'')+'<p>'+esc(x.Notes)+'</p></div><div class="toolbar jreg-actions">'+actions(kind,x).map(action=>'<button class="btn secondary" onclick="jregAction(\''+action+'\')">'+esc(action==='PAYMENT'?(kind==='JOB'?'Pay Karigar':'Receive Payment'):action.replaceAll('_',' '))+'</button>').join('')+'</div><div id="jregLedger"></div><div class="panel"><h3>Transaction history</h3><div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Action</th><th>Amount</th><th>Mode</th><th>Reference</th><th>Notes</th></tr></thead><tbody>'+result.events.map(e=>'<tr><td>'+esc(String(e.EventDate).slice(0,10))+'</td><td>'+esc(e.EventType)+'</td><td>₹'+money(e.Amount)+'</td><td>'+esc(e.PaymentMode||'')+'</td><td>'+esc(e.ReferenceNo||'')+'</td><td>'+esc(e.Notes||'')+'</td></tr>').join('')+'</tbody></table></div></div></div>';
  if(kind==='LEDGER'){
   const ledger=await api('/api/jewellery/registers/ledger/customer/'+x.CustomerId);
   d.getElementById('jregLedger').innerHTML='<div class="panel"><h3>'+esc(x.PartyName)+' — Cr/Dr balance</h3><b>₹'+money(Math.abs(ledger.balance))+' '+(ledger.balance>=0?'DR':'CR')+'</b><p>Reversed entries remain in history and are excluded from this balance.</p><div class="tablewrap"><table class="table"><thead><tr><th>Entry</th><th>Date</th><th>Description</th><th>DR/CR</th><th>Amount</th><th>Status</th></tr></thead><tbody>'+ledger.rows.map(r=>'<tr><td>'+r.Id+'</td><td>'+esc(String(r.RecordDate).slice(0,10))+'</td><td>'+esc(r.Title)+'</td><td>'+esc(r.Direction)+'</td><td>'+money(r.Amount)+'</td><td>'+esc(r.Status)+'</td></tr>').join('')+'</tbody></table></div></div>';
  }
 }catch(e){toastError(e)}
};
w.jregAction=function(action){
 if(!active()||!details)return;pendingId=guid();
 const label=action==='PAYMENT'||(action==='REFUND'&&['JOB','REPAIR'].includes(details.kind))?'Payment / refund amount ₹':action==='RETURN'?'Returned weight (g)':null;
 modal(action.replaceAll('_',' '),'<div class="formgrid jreg-form">'+(action==='EDIT'?['PartyName','Title','Phone','Address'].map(k=>'<label>'+esc(k)+'<input class="input" id="jra'+k+'" value="'+esc(details.data[k])+'"></label>').join(''):'')+'<label>Date<input id="jraDate" class="input" type="date" value="'+date()+'"></label>'+(label?'<label>'+label+'<input id="jraValue" class="input" type="number" min="0" step="'+(action==='RETURN'?'0.0001':'0.01')+'" value="'+(action==='RETURN'?details.data.Weight:'')+'"></label>':'')+(action==='PAYMENT'?'<label>Payment mode<select id="jraMode" class="select"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option><option>Cheque</option></select></label>':'')+'<label>Reference<input id="jraRef" class="input" maxlength="100"></label><label class="full">Notes / reason<textarea id="jraNotes" class="textarea" maxlength="500"></textarea></label></div>','<button id="jraSave" class="btn" onclick="jregPostAction(\''+action+'\')">Confirm</button>');
};
w.jregPostAction=async function(action){
 if(!active()||!details)return;const button=d.getElementById('jraSave');if(button.disabled)return;button.disabled=true;
 try{
  await request('/api/jewellery/registers/'+details.kind+'/'+details.id+'/actions',{RequestId:pendingId,Revision:details.row.Revision,Action:action,Date:val('jraDate'),Amount:action==='PAYMENT'||(action==='REFUND'&&['JOB','REPAIR'].includes(details.kind))?Number(val('jraValue')):0,Weight:action==='RETURN'?Number(val('jraValue')):0,PaymentMode:val('jraMode')||'Cash',ReferenceNo:val('jraRef'),Notes:val('jraNotes'),PartyName:val('jraPartyName'),Title:val('jraTitle'),Phone:val('jraPhone'),Address:val('jraAddress')});
  closeModal();await w.jregOpen(details.kind,details.id);
 }catch(e){toastError(e)}finally{button.disabled=false}
};
w.jregPrint=async function(){
 if(!active()||!details)return;const x=details.data,header=esc(modules[details.kind].name)+' #'+details.id;
 const html='<!doctype html><html><head><meta charset="utf-8"><title>'+header+'</title><style>body{font:12px Arial;color:#332d22;margin:25px}h1{color:#916918}table{width:100%;border-collapse:collapse}td,th{padding:7px;border-bottom:1px solid #ddd;text-align:left}.jreg-metrics{display:flex;gap:35px}.jreg-metrics b{display:block}button{display:none}</style></head><body><h1>SuvidhaPOS Jewellery · '+header+'</h1><p>Status: '+esc(x.Status)+'</p>'+d.getElementById('jregDetail').innerHTML+'<h3>Receipts / history</h3><table><tr><th>Date</th><th>Action</th><th>Amount</th><th>Reference</th></tr>'+details.events.map(e=>'<tr><td>'+esc(String(e.EventDate).slice(0,10))+'</td><td>'+esc(e.EventType)+'</td><td>'+money(e.Amount)+'</td><td>'+esc(e.ReferenceNo||'')+'</td></tr>').join('')+'</table></body></html>';
 if(w.premiumPrintHtml)await w.premiumPrintHtml(html,header);else{const popup=w.open('','_blank');if(popup){popup.document.write(html);popup.document.close();popup.print()}}
};
// Distinct functions keep each sidebar option independently controllable.
for(const [name,kind] of Object.entries({loadJewelEstimates:'ESTIMATE',loadJewelIssueRegister:'ISSUE',loadJewelKarigars:'KARIGAR',loadJewelJobs:'JOB',loadJewelRepairs:'REPAIR',loadJewelGirviLoans:'GIRVI',loadJewelLedger:'LEDGER',loadJewelSavingSchemes:'SCHEME'}))w[name]=()=>w.loadJewelleryRegister(kind);
})(window,document);
