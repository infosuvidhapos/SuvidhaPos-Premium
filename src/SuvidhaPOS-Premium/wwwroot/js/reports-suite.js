(function(){
 window.__suvidhaPremiumReportMaster='6.4.6';
 const defs=[
 ['account-report','Account Report'],
 ['daily-sale-bill-wise','Daily Sale Report Bill Wise'],
 ['cashier-report','Cashier Report'],
 ['date-wise-summary','Date Wise Summary'],
 ['bill-modification','Bill Modification Report'],
 ['utility-report','Utility Report'],
 ['item-wise-report','Item Wise Report'],
 ['profit-loss','Profit & Loss Report'],
 ['date-wise-sale-summary','Date Wise Sale Summary Report'],
 ['bill-customer-report','Bill/Customer Report'],
 ['category-wise-sale','Category Wise Sale Report'],
 ['category-wise-monthly-sale','Category Wise Monthly Sale Report'],
 ['hsn-wise-sale','HSN Wise Sale Report'],
 ['purchase-register','Purchase Register Report'],
 ['bill-detail','Bill Detail Report'],
 ['qty-wise-report','Qty Wise Report'],
 ['product-expiry','Product Expiry Report'],
 ['gstr1','GSTR1'],
 ['current-stock-report','Current Stock Report']
 ];
 let currentRows=[],currentDef=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=x=>Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const iso=d=>{const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)};
 const pretty=k=>k.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').toUpperCase();
 const fileStem=()=>`SuvidhaPOS_${currentDef?.[0]||'report'}_${document.querySelector('#reportFrom')?.value||''}_${document.querySelector('#reportTo')?.value||''}`;
 const raw=v=>v===null||v===undefined?'':String(v);
 const format=(k,v)=>{if(v===null||v===undefined)return '-';if(/percent|rate|gst/i.test(k)&&typeof v==='number')return esc(v)+'%';if(typeof v==='number'){if(/amount|value|price|total|tax|paid|cost|sales|expense|profit|credit|debit|discount|mrp|balance|collected/i.test(k))return '₹'+money(v);return money(v)}if(/date|time|created/i.test(k)){const d=new Date(v);if(!isNaN(d))return esc(d.toLocaleString('en-IN'))}return esc(v)};

 window.loadReports=async function(){setPage('reports');title.textContent='Report Master';document.querySelector('header p').textContent='From/To date reports with Excel and PDF export';const today=iso(new Date()),from=iso(new Date(Date.now()-29*86400000));app.innerHTML=`<div class="content">
 <div class="panel report-toolbar"><div class="formgrid"><label>Report<select id="reportType" class="select" data-no-tax-enhance="1" data-report-master="1">${defs.map(x=>`<option value="${x[0]}">${esc(x[1])}</option>`).join('')}</select></label><label>From Date<input id="reportFrom" class="input" type="date" value="${from}"></label><label>To Date<input id="reportTo" class="input" type="date" value="${today}"></label><label>Search<input id="reportQ" class="input" placeholder="Bill, item, customer, supplier, user..."></label></div><div class="toolbar"><button class="btn" onclick="runReport()">Generate Report</button><button class="btn secondary" onclick="exportReportExcel()">⬇ Export Excel</button><button class="btn secondary" onclick="exportReportPdf()">⬇ Export PDF</button></div></div>
 <div id="reportMeta" class="muted" style="margin:8px 0"></div><div class="panel"><div class="tablewrap"><table class="table" id="reportTable"><thead></thead><tbody><tr><td class="empty">Select report and generate</td></tr></tbody></table></div></div></div>`;
 document.querySelector('#reportType').addEventListener('change',runReport);document.querySelector('#reportMeta').textContent='19 report masters loaded';await runReport()};

 window.runReport=async function(){const type=document.querySelector('#reportType')?.value;if(!type)return;currentDef=defs.find(x=>x[0]===type)||defs[0];const from=document.querySelector('#reportFrom').value,to=document.querySelector('#reportTo').value,q=encodeURIComponent(document.querySelector('#reportQ').value||'');try{currentRows=await api(`/api/premium-reports/${type}?from=${from}&to=${to}&q=${q}`);render()}catch(e){document.querySelector('#reportTable').innerHTML=`<tbody><tr><td class="alert">${esc(e.message)}</td></tr></tbody>`}};

 function render(){const table=document.querySelector('#reportTable'),rows=currentRows||[];if(!rows.length){table.querySelector('thead').innerHTML='';table.querySelector('tbody').innerHTML='<tr><td class="empty">No records found</td></tr>';document.querySelector('#reportMeta').textContent=(currentDef?.[1]||'Report')+' · 0 records';return}const keys=Object.keys(rows[0]);table.querySelector('thead').innerHTML='<tr>'+keys.map(k=>`<th>${esc(pretty(k))}</th>`).join('')+'</tr>';table.querySelector('tbody').innerHTML=rows.map(r=>'<tr>'+keys.map(k=>`<td>${format(k,r[k])}</td>`).join('')+'</tr>').join('');document.querySelector('#reportMeta').textContent=`${currentDef?.[1]} · ${rows.length} records · ${document.querySelector('#reportFrom').value} to ${document.querySelector('#reportTo').value}`}

 window.exportReportExcel=function(){if(!currentRows.length)return toast('No report data to export');const keys=Object.keys(currentRows[0]);const html=`<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:10pt}th,td{border:1px solid #888;padding:5px}th{background:#eee}h2,p{font-family:Arial}</style></head><body><h2>SuvidhaPOS Premium — ${esc(currentDef?.[1]||'Report')}</h2><p>From ${esc(document.querySelector('#reportFrom').value)} to ${esc(document.querySelector('#reportTo').value)}</p><table><thead><tr>${keys.map(k=>`<th>${esc(pretty(k))}</th>`).join('')}</tr></thead><tbody>${currentRows.map(r=>'<tr>'+keys.map(k=>`<td>${esc(raw(r[k]))}</td>`).join('')+'</tr>').join('')}</tbody></table></body></html>`;const blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fileStem()+'.xls';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)};

 window.exportReportPdf=function(){if(!currentRows.length)return toast('No report data to export');const keys=Object.keys(currentRows[0]),name=currentDef?.[1]||'Report';const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial;font-size:9px;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:4px}th{background:#eee}h2{margin:0 0 4px}p{margin:0 0 8px}</style></head><body><h2>SuvidhaPOS Premium — ${esc(name)}</h2><p>From ${esc(document.querySelector('#reportFrom').value)} to ${esc(document.querySelector('#reportTo').value)} · Records ${currentRows.length}</p><table><thead><tr>${keys.map(k=>`<th>${esc(pretty(k))}</th>`).join('')}</tr></thead><tbody>${currentRows.map(r=>'<tr>'+keys.map(k=>`<td>${format(k,r[k])}</td>`).join('')+'</tr>').join('')}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`;const w=window.open('','_blank');if(!w)return toast('Allow popups for PDF export');w.document.write(html);w.document.close()};
})();
