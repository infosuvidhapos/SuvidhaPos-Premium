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
 ['current-stock-report','Current Stock Report'],
 ['stock-date-wise-report','Stock Report Date Wise'],
 ['stock-transfer-report','Stock Transfer Report']
 ];
 let currentRows=[],currentDef=null,stockAllRows=[];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=x=>Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const iso=d=>{const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)};
 const pretty=k=>k.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').toUpperCase();
 const safeFile=s=>String(s||'Report').replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/\s+/g,' ').trim();
 const billGroups=()=>{const m=new Map();(currentRows||[]).forEach(r=>{const k=String(r.SaleId||r.InvoiceNo||'');if(!m.has(k))m.set(k,{id:Number(r.SaleId||0),invoiceNo:r.InvoiceNo||k,billDate:r.BillDate,customer:r.CustomerName||'Walk-in Customer',payment:r.PaymentMode||'',format:r.PrintFormat||'',template:r.PrintTemplate||'',subTotal:r.BillSubTotal,discount:r.BillDiscount,tax:r.BillTax,total:r.BillTotal,paid:r.PaidAmount,lines:[]});m.get(k).lines.push(r)});return [...m.values()]};
 const fileStem=()=>{const name=currentDef?.[1]||'Report',from=document.querySelector('#reportFrom')?.value||'',to=document.querySelector('#reportTo')?.value||from;
  if(currentDef?.[0]==='bill-detail'){const bills=billGroups();if(bills.length===1)return safeFile('Bill No. '+bills[0].invoiceNo);return safeFile('Bill Detail Report From '+from+' To '+to)}
  if(currentDef?.[0]==='current-stock-report')return safeFile('Current Stock Report As On '+(document.querySelector('#stockAsOn')?.value||to));
  return safeFile(name+' From '+from+' To '+to)
 };
 const raw=v=>v===null||v===undefined?'':String(v);
 const format=(k,v)=>{if(v===null||v===undefined)return '-';if(/percent|rate|gst/i.test(k)&&typeof v==='number')return esc(v)+'%';if(typeof v==='number'){if(/amount|value|price|total|tax|paid|cost|sales|expense|profit|credit|debit|discount|mrp|balance|collected/i.test(k))return '₹'+money(v);return money(v)}if(/date|time|created/i.test(k)){const d=new Date(v);if(!isNaN(d))return esc(d.toLocaleString('en-IN'))}return esc(v)};

 window.loadReports=async function(){
  setPage('reports');title.textContent='Report Master';document.querySelector('header p').textContent='21 premium business reports with filters and export';
  currentRows=[];currentDef=null;
  const meta={
   'account-report':['▣','Accounts','Ledger / account view','blue'],
   'daily-sale-bill-wise':['▥','Sales','Daily bill-wise performance','orange'],
   'cashier-report':['♙','Sales','Cashier collection summary','cyan'],
   'date-wise-summary':['▤','Sales','Date-wise business summary','purple'],
   'bill-modification':['✎','Audit','Bill edit / modification audit','red'],
   'utility-report':['⚙','Utility','Operational utility report','teal'],
   'item-wise-report':['◇','Inventory','Item-wise sales analysis','indigo'],
   'profit-loss':['₹','Finance','Profit and loss summary','green'],
   'date-wise-sale-summary':['⌁','Sales','Date-wise sale totals','orange'],
   'bill-customer-report':['♙','Customers','Bill and customer analysis','blue'],
   'category-wise-sale':['◈','Sales','Category performance','purple'],
   'category-wise-monthly-sale':['▦','Sales','Monthly category comparison','indigo'],
   'hsn-wise-sale':['%','Tax','HSN-wise taxable sales','teal'],
   'purchase-register':['🛒','Purchase','Purchase register and totals','orange'],
   'bill-detail':['▤','Sales','Detailed invoice report','blue'],
   'qty-wise-report':['#','Inventory','Quantity-wise movement','cyan'],
   'product-expiry':['◷','Inventory','Expiry and batch watch','red'],
   'gstr1':['GST','Tax','GSTR-1 outward supply summary','green'],
   'current-stock-report':['▦','Inventory','Current stock and valuation','indigo'],
   'stock-date-wise-report':['⌁','Inventory','Opening, inward, outward and closing by date','teal'],
   'stock-transfer-report':['⇄','Inventory','Outlet-to-outlet transfer audit','blue']
  };
  app.innerHTML=`<div class="content normal-report-master">
   <div class="normal-report-intro">
    <div><span class="normal-report-kicker">ANALYTICS & REPORTING</span><h2>Business Reports</h2><p>Choose a report tile to open filters, live data, Excel export and PDF print.</p></div>
    <div class="normal-report-count"><b>21</b><span>Reports Ready</span></div>
   </div>
   <select id="reportType" data-no-tax-enhance="1" data-report-master="1" hidden>${defs.map(x=>`<option value="${x[0]}">${esc(x[1])}</option>`).join('')}</select>
   <div class="normal-report-grid">${defs.map(x=>{const m=meta[x[0]]||['▤','Report','Open business report','blue'];return `<button class="normal-report-tile tone-${m[3]}" onclick="openNormalReport('${x[0]}')"><div class="normal-report-tile-top"><span class="normal-report-icon">${m[0]}</span><span class="normal-report-arrow">↗</span></div><span class="normal-report-category">${esc(m[1])}</span><b>${esc(x[1])}</b><small>${esc(m[2])}</small></button>`}).join('')}</div>
   <div id="normalReportWorkspace"></div>
  </div>`;
 };

 window.openNormalReport=async function(type){
  if(type==='current-stock-report')return openCurrentStockReport();
  currentDef=defs.find(x=>x[0]===type)||defs[0];
  const sel=document.querySelector('#reportType');if(sel)sel.value=currentDef[0];
  const today=iso(new Date()),from=iso(new Date(Date.now()-29*86400000));
  const box=document.querySelector('#normalReportWorkspace');if(!box)return;
  box.innerHTML=`<div class="panel normal-report-workspace">
   <div class="normal-report-workspace-head"><div><span class="normal-report-kicker">OPEN REPORT</span><h3>${esc(currentDef[1])}</h3></div><button class="btn small secondary" onclick="closeNormalReport()">✕ Close</button></div>
   <div class="normal-report-filters"><label>From Date<input id="reportFrom" class="input" type="date" value="${from}"></label><label>To Date<input id="reportTo" class="input" type="date" value="${today}"></label><label>${currentDef[0]==='bill-detail'?'Bill No / Search':'Search'}<input id="reportQ" class="input" placeholder="${currentDef[0]==='bill-detail'?'Bill No, customer or item...':'Bill, item, customer, supplier, user...'}"></label></div>
   <div class="toolbar"><button class="btn" onclick="runReport()">Generate Report</button><button class="btn secondary" onclick="exportReportExcel()">⬇ Export Excel</button><button class="btn secondary" onclick="exportReportPdf()">⬇ Export PDF</button></div>
   <div id="reportMeta" class="muted normal-report-meta">Loading report…</div>
   <div class="normal-report-table-shell"><div class="tablewrap"><table class="table" id="reportTable"><thead></thead><tbody><tr><td class="empty">Generating report…</td></tr></tbody></table></div></div>
  </div>`;
  box.scrollIntoView({behavior:'smooth',block:'start'});
  await runReport();
 };
 window.closeNormalReport=function(){currentRows=[];stockAllRows=[];currentDef=null;const box=document.querySelector('#normalReportWorkspace');if(box)box.innerHTML='';};

 async function openCurrentStockReport(){
  currentDef=defs.find(x=>x[0]==='current-stock-report')||["current-stock-report","Current Stock Report"];
  const today=iso(new Date()),box=document.querySelector('#normalReportWorkspace');if(!box)return;
  box.innerHTML=`<div class="panel normal-report-workspace stock-report-workspace">
   <div class="normal-report-workspace-head"><div><span class="normal-report-kicker">INVENTORY POSITION</span><h3>Current Stock Report</h3><p class="muted">Fast item-wise stock view with valuation, category and location filters.</p></div><button class="btn small secondary" onclick="closeNormalReport()">✕ Close</button></div>
   <input id="reportFrom" type="hidden" value="${today}"><input id="reportTo" type="hidden" value="${today}">
   <div class="stock-report-filters">
    <label>As On Date<input id="stockAsOn" class="input" type="date" value="${today}" onchange="stockReload()"></label>
    <label>Category<select id="stockCategory" class="select" onchange="stockApplyFilters()"><option value="">All Categories</option></select></label>
    <label>Stock Status<select id="stockStatus" class="select" onchange="stockApplyFilters()"><option value="ALL">All Stock</option><option value="POSITIVE">In Stock</option><option value="LOW">Low Stock ≤ 5</option><option value="ZERO">Zero Stock</option><option value="NEGATIVE">Negative Stock</option></select></label>
    <label class="stock-search">Search<input id="reportQ" class="input" placeholder="Item / barcode / SKU / category / rack..." oninput="stockApplyFilters()" onkeydown="if(event.key==='Enter'){event.preventDefault();stockApplyFilters()}"></label>
   </div>
   <div class="toolbar stock-report-actions"><button class="btn" onclick="stockReload()">↻ Generate / Refresh</button><button class="btn secondary" onclick="exportReportExcel()">⬇ Export Excel</button><button class="btn secondary" onclick="printCurrentStockReport()">⬇ Export PDF</button></div>
   <div id="stockSummary" class="stock-summary-grid"></div>
   <div id="reportMeta" class="muted normal-report-meta">Loading current stock…</div>
   <div class="normal-report-table-shell stock-report-table-shell"><div class="tablewrap"><table class="table stock-report-table" id="reportTable"><thead></thead><tbody><tr><td class="empty">Loading stock…</td></tr></tbody></table></div></div>
  </div>`;
  box.scrollIntoView({behavior:'smooth',block:'start'});await stockReload()
 }
 window.stockReload=async function(){
  const asOn=document.querySelector('#stockAsOn')?.value||iso(new Date());const hiddenFrom=document.querySelector('#reportFrom'),hiddenTo=document.querySelector('#reportTo');if(hiddenFrom)hiddenFrom.value=asOn;if(hiddenTo)hiddenTo.value=asOn;
  try{
   stockAllRows=await api(`/api/premium-reports/current-stock-report?from=${asOn}&to=${asOn}&q=`);
   if(!Array.isArray(stockAllRows))stockAllRows=[];
   const sel=document.querySelector('#stockCategory'),before=sel?.value||'',cats=[...new Set(stockAllRows.map(x=>String(x.Category||'Uncategorised')).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
   if(sel){sel.innerHTML='<option value="">All Categories</option>'+cats.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');if(cats.includes(before))sel.value=before}
   stockApplyFilters()
  }catch(e){const table=document.querySelector('#reportTable');if(table)table.innerHTML=`<tbody><tr><td class="alert">${esc(e.message||e)}</td></tr></tbody>`}
 };
 window.stockApplyFilters=function(){
  const cat=document.querySelector('#stockCategory')?.value||'',status=document.querySelector('#stockStatus')?.value||'ALL',q=String(document.querySelector('#reportQ')?.value||'').trim().toLowerCase();
  currentRows=(stockAllRows||[]).filter(r=>{
   const qty=Number(r.CurrentStock||0),rq=[r.ItemName,r.Barcode,r.SKU,r.Category,r.Unit,r.HSN,r.LocationCode,r.RackName,r.ShelfName].join(' ').toLowerCase();
   if(cat&&String(r.Category||'')!==cat)return false;if(q&&!rq.includes(q))return false;
   if(status==='POSITIVE'&&qty<=0)return false;if(status==='LOW'&&(qty<=0||qty>5))return false;if(status==='ZERO'&&Math.abs(qty)>.0001)return false;if(status==='NEGATIVE'&&qty>=0)return false;return true
  });
  renderCurrentStock()
 };
 function renderCurrentStock(){
  const rows=currentRows||[],table=document.querySelector('#reportTable');if(!table)return;
  const qty=rows.reduce((a,r)=>a+Number(r.CurrentStock||0),0),cost=rows.reduce((a,r)=>a+Number(r.StockCostValue||0),0),sale=rows.reduce((a,r)=>a+Number(r.StockSaleValue||0),0),mrp=rows.reduce((a,r)=>a+Number(r.CurrentStock||0)*Number(r.MRP||0),0);
  const sum=document.querySelector('#stockSummary');if(sum)sum.innerHTML=`<div><span>Items</span><b>${rows.length}</b></div><div><span>Total Qty</span><b>${money(qty)}</b></div><div><span>Cost Value</span><b>₹${money(cost)}</b></div><div><span>Sale Value</span><b>₹${money(sale)}</b></div><div><span>MRP Value</span><b>₹${money(mrp)}</b></div>`;
  table.querySelector('thead').innerHTML='<tr><th>#</th><th>BARCODE / SKU</th><th>ITEM</th><th>CATEGORY</th><th>UOM</th><th>QTY</th><th>PURCHASE</th><th>SALE</th><th>MRP</th><th>COST VALUE</th><th>SALE VALUE</th><th>LOCATION</th></tr>';
  table.querySelector('tbody').innerHTML=rows.map((r,i)=>{const qty=Number(r.CurrentStock||0),cls=qty<0?'stock-neg':qty===0?'stock-zero':qty<=5?'stock-low':'';return `<tr class="${cls}"><td>${i+1}</td><td><b>${esc(r.Barcode||'-')}</b><small>${esc(r.SKU||'')}</small></td><td><b>${esc(r.ItemName||'')}</b><small>HSN ${esc(r.HSN||'-')} · GST ${esc(r.GSTPercent||0)}%</small></td><td>${esc(r.Category||'Uncategorised')}</td><td>${esc(r.Unit||'PCS')}</td><td class="stock-qty"><b>${money(qty)}</b></td><td>₹${money(r.PurchasePrice)}</td><td>₹${money(r.SalePrice)}</td><td>₹${money(r.MRP)}</td><td>₹${money(r.StockCostValue)}</td><td>₹${money(r.StockSaleValue)}</td><td>${esc([r.LocationCode,r.RackName,r.ShelfName].filter(Boolean).join(' / ')||'-')}</td></tr>`}).join('')||'<tr><td colspan="12" class="empty">No stock records match the filters</td></tr>';
  const meta=document.querySelector('#reportMeta'),asOn=document.querySelector('#stockAsOn')?.value||'';if(meta)meta.textContent=`Current Stock Report · As on ${asOn} · ${rows.length} items · Qty ${money(qty)} · Cost ₹${money(cost)}`
 }
 window.printCurrentStockReport=function(){
  if(!currentRows.length)return toast('No stock data to print');
  const asOn=document.querySelector('#stockAsOn')?.value||'',cat=document.querySelector('#stockCategory')?.value||'All Categories',status=document.querySelector('#stockStatus')?.value||'ALL';
  const qty=currentRows.reduce((a,r)=>a+Number(r.CurrentStock||0),0),cost=currentRows.reduce((a,r)=>a+Number(r.StockCostValue||0),0),sale=currentRows.reduce((a,r)=>a+Number(r.StockSaleValue||0),0);
  const body=currentRows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.Barcode||'')}</td><td>${esc(r.ItemName||'')}</td><td>${esc(r.Category||'')}</td><td>${esc(r.Unit||'')}</td><td class="num">${money(r.CurrentStock)}</td><td class="num">${money(r.PurchasePrice)}</td><td class="num">${money(r.SalePrice)}</td><td class="num">${money(r.MRP)}</td><td class="num">${money(r.StockCostValue)}</td><td>${esc([r.LocationCode,r.RackName].filter(Boolean).join(' / '))}</td></tr>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Current Stock Report</title><style>@page{size:A4 landscape;margin:7mm}body{font-family:Arial,sans-serif;color:#111;font-size:8.5px}h1{font-size:17px;margin:0}p{margin:4px 0 8px;color:#444}.sum{display:flex;gap:12px;margin:8px 0}.sum b{border:1px solid #999;padding:5px 8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:4px;vertical-align:top}th{background:#eee;font-size:8px}.num{text-align:right;white-space:nowrap}tfoot td{font-weight:bold;background:#f4f4f4}</style></head><body><h1>SuvidhaPOS Premium — Current Stock Report</h1><p>As on ${esc(asOn)} · Category ${esc(cat)} · Status ${esc(status)}</p><div class="sum"><b>Items ${currentRows.length}</b><b>Qty ${money(qty)}</b><b>Cost ₹${money(cost)}</b><b>Sale ₹${money(sale)}</b></div><table><thead><tr><th>#</th><th>Barcode</th><th>Item</th><th>Category</th><th>UOM</th><th>Qty</th><th>Purchase</th><th>Sale</th><th>MRP</th><th>Cost Value</th><th>Location</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`;
  if(window.desktopPrintHtml&&window.desktopPrintHtml(html,'REPORT_PDF',fileStem()))return;const pw=window.open('','_blank','width=1200,height=850');if(!pw)return toast('Allow popups for Print / PDF');pw.document.write(html);pw.document.close()
 };

 window.runReport=async function(){const type=currentDef?.[0]||document.querySelector('#reportType')?.value;if(!type)return;currentDef=defs.find(x=>x[0]===type)||defs[0];const from=document.querySelector('#reportFrom')?.value||iso(new Date(Date.now()-29*86400000)),to=document.querySelector('#reportTo')?.value||iso(new Date()),q=encodeURIComponent(document.querySelector('#reportQ')?.value||'');try{currentRows=await api(`/api/premium-reports/${type}?from=${from}&to=${to}&q=${q}`);render()}catch(e){const table=document.querySelector('#reportTable');if(table)table.innerHTML=`<tbody><tr><td class="alert">${esc(e.message)}</td></tr></tbody>`}};

 function render(){
  const table=document.querySelector('#reportTable'),rows=currentRows||[];if(!table)return;
  if(!rows.length){table.querySelector('thead').innerHTML='';table.querySelector('tbody').innerHTML='<tr><td class="empty">No records found</td></tr>';document.querySelector('#reportMeta').textContent=(currentDef?.[1]||'Report')+' · 0 records';return}
  if(currentDef?.[0]==='bill-detail')return renderBillDetail();
  const keys=Object.keys(rows[0]);table.querySelector('thead').innerHTML='<tr>'+keys.map(k=>`<th>${esc(pretty(k))}</th>`).join('')+'</tr>';table.querySelector('tbody').innerHTML=rows.map(r=>'<tr>'+keys.map(k=>`<td>${format(k,r[k])}</td>`).join('')+'</tr>').join('');document.querySelector('#reportMeta').textContent=`${currentDef?.[1]} · ${rows.length} records · ${document.querySelector('#reportFrom').value} to ${document.querySelector('#reportTo').value}`
 }
 function renderBillDetail(){
  const table=document.querySelector('#reportTable'),bills=billGroups();
  table.querySelector('thead').innerHTML='<tr><th>Bill No / Date</th><th>Customer</th><th>Original Print</th><th>Items</th><th>Total</th><th>Action</th></tr>';
  table.querySelector('tbody').innerHTML=bills.map(b=>`<tr><td><b>${esc(b.invoiceNo)}</b><small>${esc(new Date(b.billDate).toLocaleString('en-IN'))}</small></td><td><b>${esc(b.customer)}</b><small>${esc(b.payment)}</small></td><td><b>${esc(b.format||'Thermal Printer 80MM')}</b><small>Template ${esc(b.template||'T01')}</small></td><td>${b.lines.length}</td><td><b>₹${money(b.total)}</b><small>Discount ₹${money(b.discount)} · Tax ₹${money(b.tax)}</small></td><td><button class="btn small secondary" onclick="previewBillDetailOriginal(${b.id})">Preview Original</button></td></tr>`).join('');
  document.querySelector('#reportMeta').textContent=`Bill Detail Report · ${bills.length} bill(s) · ${currentRows.length} item line(s) · ${document.querySelector('#reportFrom').value} to ${document.querySelector('#reportTo').value}`
 }
 window.previewBillDetailOriginal=async function(id){
  try{if(typeof window.getInvoicePrintArtifact!=='function')throw Error('Bill print engine is not ready');const a=await window.getInvoicePrintArtifact(id);if(window.desktopPrintHtml&&window.desktopPrintHtml(a.html,'PREVIEW','Bill No. '+a.invoiceNo))return;const p=window.open('','_blank');if(!p)return toast('Allow popups');p.document.write(a.html);p.document.close()}catch(e){alert(e.message||e)}
 };
 function genericExcelHtml(){
  const keys=Object.keys(currentRows[0]),name=currentDef?.[1]||'Report',from=document.querySelector('#reportFrom')?.value||'',to=document.querySelector('#reportTo')?.value||'';
  return `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:10pt}th,td{border:1px solid #888;padding:5px;vertical-align:top}th{background:#eee}h2,p{font-family:Arial}</style></head><body><h2>SuvidhaPOS Premium — ${esc(name)}</h2><p>From ${esc(from)} To ${esc(to)}</p><table><thead><tr>${keys.map(k=>`<th>${esc(pretty(k))}</th>`).join('')}</tr></thead><tbody>${currentRows.map(r=>'<tr>'+keys.map(k=>`<td>${esc(raw(r[k]))}</td>`).join('')+'</tr>').join('')}</tbody></table></body></html>`
 }
 function billDetailExcelHtml(){
  const from=document.querySelector('#reportFrom')?.value||'',to=document.querySelector('#reportTo')?.value||'',bills=billGroups();
  const body=bills.map(b=>`<h3>Bill No. ${esc(b.invoiceNo)}</h3><table class="meta"><tr><th>Date</th><td>${esc(new Date(b.billDate).toLocaleString('en-IN'))}</td><th>Customer</th><td>${esc(b.customer)}</td><th>Payment</th><td>${esc(b.payment)}</td></tr><tr><th>Original Print</th><td>${esc(b.format)}</td><th>Template</th><td>${esc(b.template)}</td><th>Bill Total</th><td>₹${money(b.total)}</td></tr></table><table><thead><tr><th>Item</th><th>Barcode</th><th>Qty</th><th>Rate</th><th>Discount</th><th>GST %</th><th>Taxable</th><th>Tax</th></tr></thead><tbody>${b.lines.map(r=>`<tr><td>${esc(r.ItemName)}</td><td>${esc(r.Barcode||'')}</td><td>${raw(r.Quantity)}</td><td>${raw(r.SalePrice)}</td><td>${raw(r.LineDiscount)}</td><td>${raw(r.TaxRate)}</td><td>${raw(r.TaxableValue)}</td><td>${raw(r.TaxAmount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="4">Bill Total</th><td>Discount ₹${money(b.discount)}</td><td>Tax ₹${money(b.tax)}</td><td colspan="2">₹${money(b.total)}</td></tr></tfoot></table>`).join('<br>');
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse;width:100%;margin:5px 0 12px}th,td{border:1px solid #777;padding:5px;font-size:10pt}th{background:#eee}h2,h3,p{margin:6px 0}</style></head><body><h2>SuvidhaPOS Premium — Bill Detail Report</h2><p>From ${esc(from)} To ${esc(to)} · ${bills.length} bill(s)</p>${body}</body></html>`
 }
 function saveExcel(html){
  const name=fileStem()+'.xls';if(window.desktopSaveTextFile&&window.desktopSaveTextFile(name,'\ufeff'+html))return;
  const blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)
 }
 window.exportReportExcel=function(){if(!currentRows.length)return toast('No report data to export');saveExcel(currentDef?.[0]==='bill-detail'?billDetailExcelHtml():genericExcelHtml())};
 async function exportBillDetailPdf(){
  const bills=billGroups();if(!bills.length)return toast('No bills to export');if(typeof window.getInvoicePrintArtifact!=='function')return alert('Bill print engine is not ready');
  try{
   const arts=[];for(const b of bills)arts.push(await window.getInvoicePrintArtifact(b.id));
   if(arts.length===1){const a=arts[0];if(window.desktopPrintHtml&&window.desktopPrintHtml(a.html,'REPORT_PDF',fileStem()))return;const p=window.open('','_blank');if(!p)return toast('Allow popups');p.document.write(a.html);p.document.close();return}
   const items=arts.map(a=>({html:a.html,fileName:'Bill No. '+a.invoiceNo+'.pdf'}));
   if(window.desktopPrintHtmlBatch&&window.desktopPrintHtmlBatch(items,fileStem()))return;
   alert('For exact multi-bill Thermal/A4 PDF export, use the SuvidhaPOS Windows desktop app. Each bill is saved in its original print size.')
  }catch(e){alert('Bill PDF export failed: '+(e.message||e))}
 }
 window.exportReportPdf=async function(){
  if(!currentRows.length)return toast('No report data to export');if(currentDef?.[0]==='bill-detail')return exportBillDetailPdf();
  const keys=Object.keys(currentRows[0]),name=currentDef?.[1]||'Report',from=document.querySelector('#reportFrom')?.value||'',to=document.querySelector('#reportTo')?.value||'';
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial;font-size:9px;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:4px}th{background:#eee}h2{margin:0 0 4px}p{margin:0 0 8px}</style></head><body><h2>SuvidhaPOS Premium — ${esc(name)}</h2><p>From ${esc(from)} To ${esc(to)} · Records ${currentRows.length}</p><table><thead><tr>${keys.map(k=>`<th>${esc(pretty(k))}</th>`).join('')}</tr></thead><tbody>${currentRows.map(r=>'<tr>'+keys.map(k=>`<td>${format(k,r[k])}</td>`).join('')+'</tr>').join('')}</tbody></table></body></html>`;
  if(window.desktopPrintHtml&&window.desktopPrintHtml(html,'REPORT_PDF',fileStem()))return;const w=window.open('','_blank');if(!w)return toast('Allow popups for PDF export');w.document.write(html.replace('</body>','<script>window.onload=function(){window.print()}<\/script></body>'));w.document.close()
 };
})();
