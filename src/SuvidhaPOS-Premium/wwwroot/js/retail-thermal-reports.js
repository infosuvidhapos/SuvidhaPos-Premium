(function(w,d){
'use strict';
w.__retailThermalReportsV1='2026.09.15';
const TYPES=new Set(['account-report','cashier-report','payment-mode-report','expense-report','day-close-report','audit-trail-report']);
const titles={
 'account-report':'Daily Account Summary','cashier-report':'Cashier Closing Report','payment-mode-report':'Payment Mode Report',
 'expense-report':'Expense Report','day-close-report':'Day Close Report','audit-trail-report':'Audit Trail Report'
};
let currentType='account-report',currentData=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:3});
const iso=d=>{const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const val=(o,k,alt)=>o?.[k]??o?.[alt??'__missing'];
const m=(o,k,alt)=>Number(val(o,k,alt)||0);
const text=(o,k,alt)=>String(val(o,k,alt)??'');
const moneyText=v=>typeof v==='string'?v:'₹'+money(v);
const row=(label,value,cls='')=>'<div class="rtr-row '+cls+'"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>';
const section=(title,body)=>'<section class="rtr-section"><h4>'+esc(title)+'</h4>'+body+'</section>';
const rule=()=>'<div class="rtr-rule"></div>';
const dateText=x=>{const t=new Date(x);return isNaN(t)?String(x||''):t.toLocaleString('en-IN')};

function accountBody(x){
 const s=x.sales||{},t=x.tax||{},p=x.payments||{},c=x.cashAccount||{},o=x.other||{},b=x.bills||{};
 const actual=c.isClosed?moneyText(m(c,'actualCash')):'NOT CLOSED',diff=c.isClosed?moneyText(m(c,'shortExcess')):'--';
 return section('SALES SUMMARY',
  row('Gross Sales',moneyText(m(s,'grossSales')))+row('(-) Item Discount',moneyText(m(s,'itemDiscount')))+row('(-) Bill Discount',moneyText(m(s,'billDiscount')))+row('(-) Returns',moneyText(m(s,'returns')))+rule()+row('NET SALES',moneyText(m(s,'netSales')),'strong') )+
 section('TAX SUMMARY',
  row('Taxable Sale',moneyText(m(t,'taxableSale')))+row('CGST',moneyText(m(t,'cgst')))+row('SGST',moneyText(m(t,'sgst')))+row('IGST',moneyText(m(t,'igst')))+rule()+row('Total Tax',moneyText(m(t,'totalTax')),'strong'))+
 section('PAYMENT SUMMARY',
  row('Cash',moneyText(m(p,'cash')))+row('UPI',moneyText(m(p,'upi')))+row('Card',moneyText(m(p,'card')))+row('Credit',moneyText(m(p,'credit')))+row('Other',moneyText(m(p,'other')))+rule()+row('Total Collection',moneyText(m(p,'totalCollection')),'strong'))+
 section('CASH ACCOUNT',
  row('Opening Cash',moneyText(m(c,'openingCash')))+row('(+) Cash Sale',moneyText(m(c,'cashSale')))+row('(+) Cash Received',moneyText(m(c,'cashReceived')))+row('(-) Cash Expense',moneyText(m(c,'cashExpense')))+row('(-) Cash Refund',moneyText(m(c,'cashRefund')))+row('(-) Cash Withdrawal',moneyText(m(c,'cashWithdrawal')))+rule()+row('Expected Cash',moneyText(m(c,'expectedCash')),'strong')+row('Actual Cash',actual,'strong')+rule()+row('SHORT / EXCESS',diff,'strong'))+
 section('OTHER TRANSACTIONS',
  row('Purchase',moneyText(m(o,'purchase')))+row('Expenses',moneyText(m(o,'expenses')))+row('Customer Received',moneyText(m(o,'customerReceived')))+row('Supplier Paid',moneyText(m(o,'supplierPaid')))+row('Credit Sale',moneyText(m(o,'creditSale')))+row('Return Amount',moneyText(m(o,'returnAmount'))))+
 section('BILL SUMMARY',
  row('Total Bills',String(Math.round(m(b,'totalBills'))))+row('Cancelled Bills',String(Math.round(m(b,'cancelledBills'))))+row('Hold Bills',String(Math.round(m(b,'holdBills'))))+row('Return Bills',String(Math.round(m(b,'returnBills'))))+row('Average Bill Value',moneyText(m(b,'averageBillValue'))));
}
function cashierBody(x){
 const list=x.cashiers||[],pay=x.payments||[];if(!list.length)return section('CASHIER SUMMARY','<div class="rtr-empty">No cashier sales in selected period</div>');
 return list.map(c=>{
  const name=text(c,'Cashier','cashier'),payments=pay.filter(p=>text(p,'Cashier','cashier')===name);
  return section('CASHIER : '+name,row('Bills',String(Math.round(m(c,'Bills','bills'))))+row('Gross Sales',moneyText(m(c,'GrossSales','grossSales')))+row('(-) Item Discount',moneyText(m(c,'ItemDiscount','itemDiscount')))+row('(-) Bill Discount',moneyText(m(c,'BillDiscount','billDiscount')))+row('NET SALES',moneyText(m(c,'NetSales','netSales')),'strong')+row('Tax',moneyText(m(c,'Tax','tax')))+row('Collected',moneyText(m(c,'Paid','paid')))+rule()+payments.map(p=>row(text(p,'Mode','mode')+' ('+Math.round(m(p,'Txns','txns'))+')',moneyText(m(p,'Amount','amount')))).join(''));
 }).join('');
}
function paymentBody(x){
 const rows=x.rows||[];
 return section('PAYMENT SUMMARY',rows.map(r=>row(text(r,'mode','Mode')+' ('+Math.round(m(r,'transactions','Transactions'))+')',moneyText(m(r,'amount','Amount')))).join('')+rule()+row('Gross Collection',moneyText(m(x,'grossCollection')))+row('(-) Return Amount',moneyText(m(x,'returnAmount')))+row('NET COLLECTION',moneyText(m(x,'netCollection')),'strong'));
}
function expenseBody(x){
 const modes=x.paymentModes||[],cats=x.categories||[],rows=x.rows||[];
 let body=section('EXPENSE SUMMARY',row('Total Expense',moneyText(m(x,'total')),'strong')+modes.map(r=>row(text(r,'PaymentMode','paymentMode')+' ('+Math.round(m(r,'Transactions','transactions'))+')',moneyText(m(r,'Amount','amount')))).join(''));
 body+=section('CATEGORY SUMMARY',cats.map(r=>row(text(r,'Category','category')+' ('+Math.round(m(r,'Transactions','transactions'))+')',moneyText(m(r,'Amount','amount')))).join(''));
 body+=section('EXPENSE DETAIL',rows.map(r=>'<div class="rtr-detail"><b>'+esc(text(r,'Category','category'))+'</b><span>'+esc(dateText(val(r,'ExpenseDate','expenseDate')))+'</span><span>'+esc(text(r,'PaymentMode','paymentMode'))+'</span><strong>'+esc(moneyText(m(r,'Amount','amount')))+'</strong>'+(text(r,'Notes','notes')?'<small>'+esc(text(r,'Notes','notes'))+'</small>':'')+'</div>').join('')||'<div class="rtr-empty">No expenses</div>');
 return body;
}
function dayCloseBody(x){
 const rows=x.rows||[];if(!rows.length)return section('DAY CLOSE','<div class="rtr-empty">No Day Close record in selected period</div>');
 return rows.map(r=>section('DATE : '+esc(String(val(r,'BusinessDate','businessDate')||'').slice(0,10)),
  row('Opening Cash',moneyText(m(r,'OpeningCash','openingCash')))+row('(+) Cash Sales',moneyText(m(r,'CashSales','cashSales')))+row('(+) Cash In',moneyText(m(r,'CashIn','cashIn')))+row('(-) Cash Out',moneyText(m(r,'CashOut','cashOut')))+rule()+row('Expected Cash',moneyText(m(r,'ExpectedCash','expectedCash')),'strong')+row('Actual Cash',moneyText(m(r,'ActualCash','actualCash')),'strong')+row('SHORT / EXCESS',moneyText(m(r,'ShortExcess','shortExcess')),'strong')+rule()+row('Closed By',text(r,'ClosedBy','closedBy')||'-')+row('Closed At',dateText(val(r,'ClosedAt','closedAt')))+(text(r,'Notes','notes')?'<div class="rtr-note">'+esc(text(r,'Notes','notes'))+'</div>':'')
 )).join('');
}
function auditBody(x){
 const acts=x.actions||[],rows=x.rows||[];
 let body=section('AUDIT SUMMARY',row('Total Activities',String(Math.round(m(x,'total'))),'strong')+acts.slice(0,12).map(r=>row(text(r,'Action','action'),String(Math.round(m(r,'Transactions','transactions'))))).join(''));
 body+=section('AUDIT TRAIL',rows.map(r=>'<div class="rtr-audit"><span>'+esc(dateText(val(r,'CreatedAt','createdAt')))+'</span><b>'+esc(text(r,'UserName','userName'))+' · '+esc(text(r,'Action','action'))+'</b><em>'+esc(text(r,'Entity','entity'))+(val(r,'EntityId','entityId')?' #'+esc(val(r,'EntityId','entityId')):'')+'</em>'+(text(r,'Details','details')?'<small>'+esc(text(r,'Details','details'))+'</small>':'')+'</div>').join('')||'<div class="rtr-empty">No audit activity</div>');
 return body;
}
function bodyFor(x){switch(x.type){case'account-report':return accountBody(x);case'cashier-report':return cashierBody(x);case'payment-mode-report':return paymentBody(x);case'expense-report':return expenseBody(x);case'day-close-report':return dayCloseBody(x);case'audit-trail-report':return auditBody(x);default:return''}}
function receiptHtml(x){
 const z=x.meta||{},single=z.from===z.to;
 return '<div class="rtr-receipt"><div class="rtr-head"><h2>'+esc(text(z,'outlet')||'SUVIDHA POS')+'</h2>'+(text(z,'address')?'<p>'+esc(text(z,'address'))+'</p>':'')+(text(z,'gstin')?'<p>GSTIN : '+esc(text(z,'gstin'))+'</p>':'')+'<h3>'+esc(x.title||titles[x.type]||'REPORT')+'</h3></div>'+
 '<div class="rtr-meta">'+row('Outlet',text(z,'outlet'))+(single?row('Date',text(z,'from')):row('From / To',text(z,'from')+' / '+text(z,'to')))+row('Shift',text(z,'shift')||'All')+row('User',text(z,'cashier')||'All')+'</div>'+
 bodyFor(x)+'<footer class="rtr-foot"><div>Printed: '+esc(dateText(val(z,'printedAt')))+'</div><div>Cashier: '+esc(text(z,'printedBy')||'SYSTEM')+'</div>'+
 ((x.type==='account-report'||x.type==='cashier-report'||x.type==='day-close-report')?'<div class="rtr-sign"><span>Cashier Sign: ______________</span><span>Manager Sign: ______________</span></div>':'')+
 '</footer></div>';
}
function printDoc(x){return '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(x.title||'Report')+'</title><style>'+thermalCss()+'</style></head><body>'+receiptHtml(x)+'</body></html>'}
function thermalCss(){return '@page{size:80mm auto;margin:2mm}*{box-sizing:border-box}html,body{width:76mm;margin:0;padding:0;background:#fff;color:#000;font-family:Arial,sans-serif;font-size:9.5px;line-height:1.25}.rtr-receipt{width:76mm;padding:0 1mm}.rtr-head{text-align:center}.rtr-head h2{font-size:14px;margin:0 0 2px}.rtr-head p{margin:1px 0;font-size:8.5px}.rtr-head h3{font-size:11px;margin:4px 0 5px}.rtr-meta{border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 0}.rtr-section{margin-top:5px}.rtr-section h4{text-align:left;font-size:10px;margin:0 0 2px;padding:2px 0;border-bottom:1px solid #000}.rtr-row{display:flex;justify-content:space-between;gap:8px;padding:1px 0}.rtr-row b{text-align:right;white-space:nowrap}.rtr-row.strong{font-weight:800;font-size:10px}.rtr-rule{border-top:1px solid #000;margin:2px 0}.rtr-detail,.rtr-audit{display:grid;grid-template-columns:1fr auto;gap:1px 6px;border-bottom:1px dotted #777;padding:3px 0}.rtr-detail span,.rtr-audit span,.rtr-audit em{font-size:8px;font-style:normal}.rtr-detail strong{text-align:right}.rtr-detail small,.rtr-audit small{grid-column:1/-1;font-size:8px}.rtr-audit b{font-size:8.5px;text-align:right}.rtr-audit em{grid-column:1/-1}.rtr-note{font-size:8px;padding:2px 0}.rtr-empty{text-align:center;padding:5px 0}.rtr-foot{border-top:1px solid #000;margin-top:6px;padding-top:4px;font-size:8.5px}.rtr-sign{display:grid;gap:12px;margin:14px 0 4px}.rtr-sign span{display:block}';
}
function stem(){
 const x=currentData||{},z=x.meta||{},name=titles[currentType]||'Report';
 return name+' Form '+(z.from||'')+' To '+(z.to||z.from||'')
}
function controls(){
 const now=iso(new Date()),hasUser=!['expense-report','day-close-report'].includes(currentType);
 return '<div class="panel rtr-controls"><label>From<input id="rtrFrom" class="input" type="date" value="'+now+'"></label><label>To<input id="rtrTo" class="input" type="date" value="'+now+'"></label>'+
 (hasUser?'<label>User<select id="rtrCashier" class="select"><option value="">All</option></select></label>':'<input id="rtrCashier" type="hidden" value="">')+
 ((currentType==='expense-report'||currentType==='audit-trail-report')?'<label class="rtr-search">Search<input id="rtrQ" class="input" placeholder="Search report..."></label>':'<input id="rtrQ" type="hidden" value="">')+
 '<button class="btn" onclick="runRetailThermalReport()">Generate Report</button><button class="btn green" onclick="printRetailThermalReport(\'DIRECT\')">🖨 Thermal Print 80mm</button><button class="btn secondary" onclick="printRetailThermalReport(\'PREVIEW\')">Preview / Print</button><span id="rtrExportActions" class="report-export-actions" hidden><button class="btn secondary" onclick="saveRetailThermalPdf()">Export PDF</button><button class="btn secondary" onclick="exportRetailThermalExcel()">Export Excel</button></span></div>'
}
w.openRetailThermalReport=async function(type){
 if(!TYPES.has(type))return false;currentType=type;currentData=null;
 const host=typeof w.openNormalReportPopup==='function'?w.openNormalReportPopup():(d.querySelector('#normalReportWorkspace')||app);
 host.innerHTML='<div class="rtr-workspace normal-report-popup-content"><div class="rtr-top"><div><span>80MM THERMAL REPORT</span><h2>'+esc(titles[type])+'</h2><p>Choose current/default date filters, then Generate Report. Export actions appear after results load.</p></div><button class="btn secondary" onclick="closeNormalReport()">✕ Close</button></div>'+controls()+'<div class="rtr-preview-shell"><div id="rtrPreview" class="rtr-paper"><div class="empty">Report has not been generated yet.</div></div></div></div>';
 setTimeout(()=>d.querySelector('#rtrFrom')?.focus(),20);return true
};
w.runRetailThermalReport=async function(){
 const from=d.querySelector('#rtrFrom')?.value||iso(new Date()),to=d.querySelector('#rtrTo')?.value||from,cash=d.querySelector('#rtrCashier')?.value||'',q=d.querySelector('#rtrQ')?.value||'',actions=d.querySelector('#rtrExportActions');if(actions)actions.hidden=true;
 try{
  const x=await api('/api/reports/thermal/'+encodeURIComponent(currentType)+'?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)+'&cashier='+encodeURIComponent(cash)+'&q='+encodeURIComponent(q));
  currentData=x;const sel=d.querySelector('#rtrCashier'),keep=cash;if(sel&&sel.options.length<=1){(x.availableCashiers||[]).forEach(r=>{const name=text(r,'Cashier','cashier');if(!name)return;const o=d.createElement('option');o.value=name;o.textContent=name;sel.appendChild(o)});sel.value=keep}
  const box=d.querySelector('#rtrPreview');if(box)box.innerHTML=receiptHtml(x);if(actions)actions.hidden=false
 }catch(e){currentData=null;const box=d.querySelector('#rtrPreview');if(box)box.innerHTML='<div class="alert">'+esc(e.message||e)+'</div>'}
};
w.printRetailThermalReport=async function(mode){if(!currentData)await w.runRetailThermalReport();if(!currentData)return;const html=printDoc(currentData),name=stem();if(w.premiumPrintHtml)return w.premiumPrintHtml(html,name,mode);const p=w.open('','_blank','width=480,height=820');if(!p)return alert('Popup blocked');p.document.write(html.replace('</body>','<script>window.onload=function(){window.print()}<\/script></body>'));p.document.close()};
w.saveRetailThermalPdf=async function(){if(!currentData)await w.runRetailThermalReport();if(!currentData)return;const html=printDoc(currentData),name=stem();if(w.desktopPrintHtml&&w.desktopPrintHtml(html,'REPORT_PDF',name))return;return w.printRetailThermalReport('PREVIEW')};
function flatRows(x){
 const out=[],push=(sec,label,value)=>out.push([sec,label,value]);
 if(x.type==='account-report'){const a=[['SALES',x.sales],['TAX',x.tax],['PAYMENT',x.payments],['CASH ACCOUNT',x.cashAccount],['OTHER',x.other],['BILL SUMMARY',x.bills]];a.forEach(([sec,o])=>Object.entries(o||{}).forEach(([k,v])=>push(sec,k,v)))}
 else if(x.type==='cashier-report'){(x.cashiers||[]).forEach(r=>Object.entries(r).forEach(([k,v])=>push('CASHIER '+text(r,'Cashier','cashier'),k,v)));(x.payments||[]).forEach(r=>push('PAYMENT '+text(r,'Cashier','cashier'),text(r,'Mode','mode'),m(r,'Amount','amount')))}
 else if(x.type==='payment-mode-report'){(x.rows||[]).forEach(r=>push('PAYMENT MODE',text(r,'mode','Mode'),m(r,'amount','Amount')));push('TOTAL','Net Collection',m(x,'netCollection'))}
 else if(x.type==='expense-report'){(x.rows||[]).forEach(r=>push('EXPENSE '+String(val(r,'ExpenseDate','expenseDate')||'').slice(0,10),text(r,'Category','category')+' / '+text(r,'PaymentMode','paymentMode'),m(r,'Amount','amount')))}
 else if(x.type==='day-close-report'){(x.rows||[]).forEach(r=>Object.entries(r).forEach(([k,v])=>push('DAY '+String(val(r,'BusinessDate','businessDate')||'').slice(0,10),k,v)))}
 else if(x.type==='audit-trail-report'){(x.rows||[]).forEach(r=>push(dateText(val(r,'CreatedAt','createdAt')),text(r,'UserName','userName')+' / '+text(r,'Action','action'),text(r,'Details','details')))}
 return out
}
w.exportRetailThermalExcel=async function(){
 if(!currentData)return alert('Generate report first');
 const rows=flatRows(currentData),z=currentData.meta||{},title=titles[currentType]||'Report';
 const payload={fileName:stem()+'.xlsx',sheetName:title,outlet:z.outlet||'Main Outlet',reportTitle:title,from:z.from||'',to:z.to||z.from||'',printedOn:dateText(z.printedAt||new Date()),columns:['Section / Date','Particular','Value'],rows};
 if(w.desktopSaveReportXlsx&&w.desktopSaveReportXlsx(payload))return;
 const html='<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial}.r{border-collapse:collapse;width:100%}.r th,.r td{border:1px solid #9aa4ad;padding:6px}.head th{border:0;background:#fff;text-align:center}.outlet{font-size:16pt}.title{font-size:14pt}.sub{font-size:10pt}.cols th{background:#dfe9f3}.r tbody tr:nth-child(even) td{background:#f8fbfd}</style></head><body><table class="r"><thead><tr class="head"><th class="outlet" colspan="3">'+esc(z.outlet||'Main Outlet')+'</th></tr><tr class="head"><th class="title" colspan="3">'+esc(title)+'</th></tr><tr class="head"><th class="sub" colspan="3">Reporting For :'+esc(z.from||'')+' To '+esc(z.to||'')+'</th></tr><tr class="head"><th class="sub" colspan="3">Printed On :'+esc(dateText(z.printedAt||new Date()))+'</th></tr><tr><td colspan="3"></td></tr><tr class="cols"><th>Section / Date</th><th>Particular</th><th>Value</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></body></html>';
 const name=stem()+'.xls';if(w.desktopSaveTextFile&&w.desktopSaveTextFile(name,'\ufeff'+html))return;
 const blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8'}),a=d.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;d.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)
};
})(window,document);
