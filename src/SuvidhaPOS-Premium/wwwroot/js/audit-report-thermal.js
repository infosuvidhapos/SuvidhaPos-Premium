(function(w,d){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number(x||0)||0;
const money=x=>num(x).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const val=(o,...ks)=>{for(const k of ks)if(o&&o[k]!==undefined&&o[k]!==null)return o[k];return null};
const iso=d=>{const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)};
let auditData=null;

function row(label,value,mark=''){return '<div class="atr-row"><span>'+esc(label)+'</span><i>'+esc(mark)+'</i><b>'+esc(value)+'</b></div>'}
function section(title,body){return '<section class="atr-section"><h4>'+esc(title)+'</h4>'+body+'</section>'}
function outletLine(o){return [val(o,'Address','address'),val(o,'City','city'),val(o,'State','state')].filter(Boolean).join(', ')}

function receiptHtml(x){
 const o=val(x,'outlet')||{},s=val(x,'sales')||{},payments=val(x,'payments')||[],taxes=val(x,'taxes')||[],cashiers=val(x,'cashiers')||[],audit=val(x,'audit')||{};
 const from=new Date(val(x,'from')).toLocaleDateString('en-IN'),to=new Date(val(x,'to')).toLocaleDateString('en-IN'),printed=new Date(val(x,'printDateTime')).toLocaleString('en-IN');
 const ptotal=payments.reduce((a,r)=>a+num(val(r,'Amount','amount')),0), taxTotal=taxes.reduce((a,r)=>a+num(val(r,'TaxAmount','taxAmount')),0);
 const pay=payments.map(r=>row(val(r,'PaymentMode','paymentMode')||'Other','₹'+money(val(r,'Amount','amount')))).join('')||row('No payment breakup','₹0.00');
 const tax=taxes.map(r=>'<div class="atr-tax"><span>GST@'+money(val(r,'TaxRate','taxRate')).replace('.00','')+'%</span><b>₹'+money(val(r,'TaxableAmount','taxableAmount'))+'</b><strong>₹'+money(val(r,'TaxAmount','taxAmount'))+'</strong></div>').join('')||'<div class="atr-empty">No tax in selected period</div>';
 const cashier=cashiers.map(r=>'<div class="atr-cashier"><b>'+esc(val(r,'Cashier','cashier')||'System')+'</b><span>₹'+money(val(r,'Amount','amount'))+'</span>'+(num(val(r,'BtcAmount','btcAmount'))>0?'<small>BTC : ₹'+money(val(r,'BtcAmount','btcAmount'))+'</small>':'')+'</div>').join('')||'<div class="atr-empty">No cashier sales</div>';
 const cancelCount=Number(val(audit,'CancelActions','cancelActions')||0),modifyCount=Number(val(audit,'ModifyActions','modifyActions')||0);
 return '<div class="audit-thermal-receipt">'+
  '<header class="atr-head"><h2>'+esc(val(o,'OutletName','outletName')||'SuvidhaPOS Premium')+'</h2>'+(outletLine(o)?'<p>'+esc(outletLine(o))+'</p>':'')+(val(o,'Gstin','gstin')?'<p>GSTIN : '+esc(val(o,'Gstin','gstin'))+'</p>':'')+'<h3>Audit Report - Account Summary</h3></header>'+
  '<div class="atr-meta"><div><b>Print Date & Time:</b><span>'+esc(printed)+'</span></div><div><b>From :</b><span>'+esc(from)+'</span><b>To :</b><span>'+esc(to)+'</span></div>'+(val(x,'cashier')?'<div><b>Cashier :</b><span>'+esc(val(x,'cashier'))+'</span></div>':'')+'</div>'+
  section('Sales Details',
   row('Bill No.',(val(s,'firstBillNo')||'-')+'   To   '+(val(s,'lastBillNo')||'-'))+
   row('No of Tran (Tkt)',String(val(s,'ticketCount')||0))+
   row('Gross APC (Tkt)','₹'+money(val(s,'grossApc')))+
   row('Net APC (Tkt)','₹'+money(val(s,'netApc')))+
   '<div class="atr-rule"></div>'+
   row('Total Sales','₹'+money(val(s,'totalSales')))+
   row('Total Discount','₹'+money(val(s,'totalDiscount')),'(-)')+
   row('No of Discount (Tkt)',String(val(s,'discountTickets')||0))+
   row('Net Sales','₹'+money(val(s,'netSales')))+
   row('Total Tax','₹'+money(val(s,'totalTax')),'(+)')+
   row('Total R. off','₹'+money(val(s,'totalRoundOff')),num(val(s,'totalRoundOff'))>=0?'(+)':'(-)')+
   '<div class="atr-grand">'+row('Grand Total','₹'+money(val(s,'grandTotal')))+'</div>')+
  section('Payment Break up ( '+payments.length+' )',pay+'<div class="atr-total">'+row('Total','₹'+money(ptotal))+'</div>')+
  section('Tax details','<div class="atr-tax atr-tax-head"><span>Tax</span><b>TaxableAmt</b><strong>TaxAmt</strong></div>'+tax+'<div class="atr-total">'+row('Total Tax','₹'+money(taxTotal))+'</div>')+
  section('Cashier Report','<div class="atr-cashier atr-cashier-head"><b>Cashier</b><span>Amount</span></div>'+cashier)+
  section('Audit Activity',row('Cancel / Void Actions',String(cancelCount))+row('Modify / Edit Actions',String(modifyCount)))+
  '<div class="atr-final">'+row('Unsettled Amount','₹'+money(val(s,'unsettledAmount')))+'<div class="atr-end">* End of Reports *</div></div>'+
 '</div>';
}

async function fetchData(){
 const f=d.querySelector('#atrFrom')?.value||iso(new Date()),t=d.querySelector('#atrTo')?.value||f,cashier=(d.querySelector('#atrCashier')?.value||'').trim();
 auditData=await api('/api/reports/audit-summary?from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t)+'&cashier='+encodeURIComponent(cashier));
 return auditData;
}
w.runAuditThermalReport=async function(){try{const x=await fetchData(),box=d.querySelector('#auditThermalPreview');if(box)box.innerHTML=receiptHtml(x)}catch(e){alert(e.message||e)}};

function printDocument(x){
 return '<!doctype html><html><head><meta charset="utf-8"><title>Audit Report</title><style>'+
 '@page{size:80mm auto;margin:2mm}*{box-sizing:border-box}html,body{width:76mm;margin:0;padding:0;background:#fff;color:#000;font-family:Arial,sans-serif;font-size:9.5px;line-height:1.25}.audit-thermal-receipt{width:76mm;padding:0 1mm}.atr-head{text-align:center}.atr-head h2{font-size:13px;margin:0 0 2px}.atr-head h3{font-size:11px;margin:7px 0 4px}.atr-head p{margin:1px 0;font-size:8.5px}.atr-meta{border-bottom:1px solid #000;padding:3px 0 4px}.atr-meta>div{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:2px 5px;margin:1px 0}.atr-meta span{text-align:right}.atr-section{margin-top:5px}.atr-section h4{text-align:center;font-size:10px;margin:0 0 3px;padding:2px 0;border-top:1px solid #000;border-bottom:1px solid #000}.atr-row{display:grid;grid-template-columns:minmax(0,1fr) 22px auto;gap:2px;align-items:baseline;padding:1px 0}.atr-row i{font-style:normal;text-align:center}.atr-row b{text-align:right;white-space:nowrap}.atr-rule{border-top:1px solid #000;margin:2px 0}.atr-grand{font-size:10px;font-weight:700;border-top:1px solid #000;border-bottom:1px solid #000;margin-top:2px;padding:2px 0}.atr-total{border-top:1px solid #000;margin-top:2px;padding-top:2px}.atr-tax{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;padding:1px 0}.atr-tax b,.atr-tax strong{text-align:right}.atr-tax-head{font-weight:700;border-bottom:1px solid #000}.atr-cashier{display:grid;grid-template-columns:1fr auto;gap:2px;padding:1px 0}.atr-cashier span{text-align:right}.atr-cashier small{grid-column:1/-1;text-align:right}.atr-cashier-head{border-bottom:1px solid #000}.atr-empty{text-align:center;padding:3px}.atr-final{margin-top:5px;border-top:1px solid #000;padding-top:2px}.atr-end{text-align:center;font-weight:700;margin:12px 0 5px}'+
 '</style></head><body>'+receiptHtml(x)+'<script>window.onload=function(){setTimeout(function(){window.print()},80)}<\/script></body></html>';
}
w.printAuditThermalReport=async function(preview){
 try{const x=auditData||await fetchData(),html=printDocument(x);if(!preview&&typeof w.desktopPrintHtml==='function'&&w.desktopPrintHtml(html,'DIRECT','Audit-Report'))return;const pw=w.open('','_blank','width=480,height=820');if(!pw)return alert('Popup blocked');pw.document.write(html);pw.document.close()}catch(e){alert(e.message||e)}
};

w.openAuditThermalReport=async function(){
 if(typeof setPage==='function')setPage('reports');if(typeof title!=='undefined')title.textContent='Audit Report';const hp=d.querySelector('header p');if(hp)hp.textContent='Account summary style audit report · 80mm thermal printer';
 const now=new Date(),from=iso(now),to=from;
 app.innerHTML='<div class="content audit-report-page"><div class="audit-report-top"><div><span>REPORT / AUDIT</span><h2>Audit Report</h2><p>Thermal account summary inspired by your sample report.</p></div><button class="btn secondary" onclick="loadReports()">← Reports</button></div>'+
 '<div class="panel audit-report-controls"><label>From Date<input id="atrFrom" class="input" type="date" value="'+from+'"></label><label>To Date<input id="atrTo" class="input" type="date" value="'+to+'"></label><label>Cashier (optional)<input id="atrCashier" class="input" placeholder="All cashiers"></label><button class="btn" onclick="runAuditThermalReport()">Generate</button><button class="btn green" onclick="printAuditThermalReport(false)">🖨 Thermal Print 80mm</button><button class="btn secondary" onclick="printAuditThermalReport(true)">Preview / Print</button></div>'+
 '<div class="audit-report-preview-shell"><div id="auditThermalPreview" class="audit-report-paper"><div class="empty">Generating Audit Report...</div></div></div></div>';
 await w.runAuditThermalReport();
};
w.openAuditReport=w.openAuditThermalReport;

function patchExisting(){
 const nodes=[...d.querySelectorAll('button,a,[data-report-key],[data-report],[data-type]')];
 nodes.forEach(el=>{
  const text=String(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
  const key=String(el.dataset?.reportKey||el.dataset?.report||el.dataset?.type||'').trim().toLowerCase();
  if((text==='audit report'||text.startsWith('audit report '))||key==='audit'||key==='audit-report'){
   if(el.dataset.auditThermalPatched==='1')return;el.dataset.auditThermalPatched='1';el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();w.openAuditThermalReport()},true);
  }
 });
}
const oldOpenNormal=w.openNormalReport;if(typeof oldOpenNormal==='function'&&!oldOpenNormal.__auditWrapped){const fn=async function(type){if(String(type||'').toLowerCase()==='audit'||String(type||'').toLowerCase()==='audit-report')return w.openAuditThermalReport();return oldOpenNormal.apply(this,arguments)};fn.__auditWrapped=true;w.openNormalReport=fn}

function injectAuditTile(){
 const grid=d.querySelector('.normal-report-grid');if(!grid||grid.querySelector('[data-audit-thermal-report]'))return;
 // If an Audit Report tile exists in a future/legacy report catalog, bind that tile instead of duplicating it.
 const existing=[...grid.querySelectorAll('button,a')].find(x=>String(x.textContent||'').replace(/\s+/g,' ').trim().toLowerCase().startsWith('audit report'));
 if(existing){existing.dataset.auditThermalReport='1';existing.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();w.openAuditThermalReport()},true);return}
 const b=d.createElement('button');b.className='normal-report-tile tone-red';b.dataset.auditThermalReport='1';b.dataset.report='audit-report';
 b.onclick=w.openAuditThermalReport;
 b.innerHTML='<div class="normal-report-tile-top"><span class="normal-report-icon">⌕</span><span class="normal-report-arrow">↗</span></div><span class="normal-report-category">Audit / Thermal</span><b>Audit Report</b><small>80mm account summary · sales, payments, tax, cashier & audit activity</small>';
 grid.appendChild(b);
}
const reportsBeforeAudit=w.loadReports;
if(typeof reportsBeforeAudit==='function'&&!reportsBeforeAudit.__auditThermalReportsWrapped){
 const fn=async function(){const r=await reportsBeforeAudit.apply(this,arguments);setTimeout(()=>{injectAuditTile();patchExisting()},0);return r};fn.__auditThermalReportsWrapped=true;w.loadReports=fn;
}
new MutationObserver(()=>{patchExisting();injectAuditTile()}).observe(d.querySelector('#app')||d.body,{childList:true,subtree:true});patchExisting();injectAuditTile();
})(window,document);