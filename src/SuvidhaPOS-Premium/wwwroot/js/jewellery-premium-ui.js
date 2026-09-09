(function(w,d){
'use strict';
const state=()=>w.__jewelSuiteState||{};
const app=()=>d.getElementById('app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const iso=x=>{const z=new Date(x);return new Date(z.getTime()-z.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const rate=(metal,purity)=>Number((state().rates||[]).find(x=>String(x.MetalType||x.metalType||'').toLowerCase()===String(metal||'').toLowerCase()&&String(x.Purity||x.purity||'').toLowerCase()===String(purity||'').toLowerCase())?.RatePerGram||0);
function activate(page){d.body.classList.add('jewel-suite-mode');d.body.dataset.storeType='jewellery-shop';d.querySelectorAll('#sidebar .js-nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));if(w.toggleJewelReports)w.toggleJewelReports(true);try{w.scrollTo({top:0,left:0,behavior:'instant'});d.documentElement.scrollTop=0;d.body.scrollTop=0}catch{}}
function metric(label,value,sub=''){return '<div class="js-metric"><span>'+esc(label)+'</span><b>'+value+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div>'}
function head(title,sub,actions){return '<div class="js-page-head"><div><h1>'+esc(title)+'</h1><p>'+esc(sub||'')+'</p></div><div class="js-page-actions">'+(actions||'')+'</div></div>'}
function empty(cols,msg){return '<tr><td colspan="'+cols+'" class="js-empty">'+esc(msg)+'</td></tr>'}
function actions(file){return '<button class="js-outline" onclick="loadJewelReports()">← Reports</button><button class="js-outline" onclick="window.print()">▣ Print</button><button class="js-gold" onclick="jewelExportReport(\''+file+'\')">⇩ Export CSV</button>'}
function safeDate(v){try{return new Date(v).toLocaleDateString('en-IN')}catch{return '-'}}

w.jewelExportReport=function(name){
  const table=app()?.querySelector('table');if(!table){try{toast('No report rows available to export')}catch{};return}
  const csv=[...table.querySelectorAll('tr')].map(r=>[...r.querySelectorAll('th,td')].map(c=>'"'+String(c.innerText||'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=d.createElement('a');
  a.href=url;a.download=(name||'jewellery-report')+'-'+iso(new Date())+'.csv';d.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
};

w.jewelSyncLiveRates=async function(force){
  const s=state(),now=Date.now();if(!force&&s.lastLiveSync&&now-s.lastLiveSync<300000)return s.rates||[];
  try{const r=await api('/api/jewellery/live-rates?save=true');s.liveRateMeta=r;const rows=Array.isArray(r.rates)?r.rates:[];if(rows.length){s.rates=rows.map(x=>({MetalType:x.MetalType??x.metalType,Purity:x.Purity??x.purity,RatePerGram:Number((x.RatePerGram??x.ratePerGram)||0),EffectiveAt:r.updatedAt||new Date().toISOString()}));s.lastLiveSync=now}return s.rates||[]}
  catch(e){if(force)try{toast('Internet metal rate update failed — saved rates kept')}catch{};return s.rates||[]}
};
w.jewelRefreshLiveRates=async function(){await w.jewelSyncLiveRates(true);try{toast('Gold & silver internet rates refreshed')}catch{};if(typeof w.loadDashboard==='function')w.loadDashboard()};

w.loadJewelReports=function(){
  activate('jReports');
  app().innerHTML='<div class="js-content js-report-page">'+head('Reports','Jewellery business reports — live database values only','<button class="js-outline" onclick="window.print()">▣ Print</button>')+
  '<div class="js-report-grid"><button class="js-report-tile" onclick="loadJewelDaybook()"><i>▣</i><b>Daybook</b><span>Daily billing movements and payment modes</span></button>'+
  '<button class="js-report-tile" onclick="loadJewelSalesReport()"><i>⌁</i><b>Sales Report</b><span>Revenue trend, invoices and top customers</span></button>'+
  '<button class="js-report-tile" onclick="loadJewelGstReport()"><i>%</i><b>GST Report</b><span>Taxable value with CGST / SGST breakup</span></button>'+
  '<button class="js-report-tile" onclick="loadJewelStockReport()"><i>◇</i><b>Stock Report</b><span>Tag-wise stock, weight and valuation</span></button>'+
  '<button class="js-report-tile" onclick="loadJewelGirviReport()"><i>⚖</i><b>Girvi Report</b><span>Loan-book report area without fabricated entries</span></button></div></div>';
};

w.loadJewelDaybook=async function(day){
  activate('jDaybook');day=day||iso(new Date());const sales=await api('/api/jewellery/sales?from='+day+'&to='+day).catch(()=>[]);
  const rows=sales.map(x=>({time:new Date(x.BillDate).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),ref:x.InvoiceNo,party:x.CustomerName,mode:x.PaymentMode,gross:Number(x.GrossAmount||0),tax:Number(x.Cgst||0)+Number(x.Sgst||0),amount:Number(x.NetPayable||0)}));
  const net=rows.reduce((a,x)=>a+x.amount,0),cash=rows.filter(x=>/cash/i.test(x.mode)).reduce((a,x)=>a+x.amount,0),upi=rows.filter(x=>/upi|credit/i.test(x.mode)).reduce((a,x)=>a+x.amount,0),tax=rows.reduce((a,x)=>a+x.tax,0);
  app().innerHTML='<div class="js-content js-report-page">'+head('Daybook','All jewellery billing movements for one day',actions('jewellery-daybook')+'<label class="js-date-filter">DATE<input id="jsDaybookDate" type="date" value="'+day+'" onchange="loadJewelDaybook(this.value)"></label>')+
  '<div class="js-report-metrics">'+metric('NET SALES','₹'+money(net),rows.length+' invoice(s)')+metric('CASH IN','₹'+money(cash))+metric('UPI / CREDIT','₹'+money(upi))+metric('GST','₹'+money(tax))+metric('CASH OUT','₹0.00','No fabricated expense data')+metric('BANK','₹0.00','No bank register entries')+'</div>'+
  '<div class="js-card js-report-card"><div class="js-report-card-head"><b>Movements ('+rows.length+')</b></div><div class="js-report-table-wrap"><table class="js-clean-table"><thead><tr><th>Time</th><th>Type</th><th>Reference</th><th>Party</th><th>Mode</th><th>Gross</th><th>GST</th><th>Net Amount</th></tr></thead><tbody>'+
  (rows.map(x=>'<tr><td>'+esc(x.time)+'</td><td><span class="js-type">Sale</span></td><td class="mono">'+esc(x.ref)+'</td><td>'+esc(x.party)+'</td><td>'+esc(x.mode)+'</td><td>₹'+money(x.gross)+'</td><td>₹'+money(x.tax)+'</td><td class="js-gold-text">₹'+money(x.amount)+'</td></tr>').join('')||empty(8,'No movements on this date'))+'</tbody></table></div></div></div>';
};

w.loadJewelSalesReport=async function(from,to){
  activate('jSalesReport');to=to||iso(new Date());from=from||iso(new Date(Date.now()-29*86400000));const sales=await api('/api/jewellery/sales?from='+from+'&to='+to).catch(()=>[]);
  const total=sales.reduce((a,x)=>a+Number(x.NetPayable||0),0),gross=sales.reduce((a,x)=>a+Number(x.GrossAmount||0),0),tax=sales.reduce((a,x)=>a+Number(x.Cgst||0)+Number(x.Sgst||0),0),avg=sales.length?total/sales.length:0,byDay={},buyers={};
  sales.forEach(x=>{const k=String(x.BillDate||'').slice(5,10);byDay[k]=(byDay[k]||0)+Number(x.NetPayable||0);const c=x.CustomerName||'Walk-in Customer';buyers[c]=(buyers[c]||0)+Number(x.NetPayable||0)});
  const points=Object.entries(byDay),max=Math.max(1,...points.map(x=>x[1])),bars='<div class="js-trend-chart">'+points.map(x=>'<div class="js-trend-col"><span style="height:'+Math.max(2,Number(x[1])/max*100)+'%"></span><small>'+esc(x[0])+'</small></div>').join('')+'</div>',top=Object.entries(buyers).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const detail=sales.map(x=>'<tr><td>'+safeDate(x.BillDate)+'</td><td class="mono">'+esc(x.InvoiceNo)+'</td><td>'+esc(x.CustomerName||'Walk-in Customer')+'</td><td>'+esc(x.PaymentMode||'-')+'</td><td>₹'+money(x.GrossAmount)+'</td><td>₹'+money(Number(x.Cgst||0)+Number(x.Sgst||0))+'</td><td class="js-gold-text">₹'+money(x.NetPayable)+'</td><td>₹'+money(x.PaidAmount)+'</td><td>₹'+money(x.Balance)+'</td></tr>').join('');
  app().innerHTML='<div class="js-content js-report-page">'+head('Sales Report','Revenue, invoice details and customer performance',actions('jewellery-sales'))+
  '<div class="js-report-filter"><label>FROM<input id="jsSalesFrom" type="date" value="'+from+'"></label><label>TO<input id="jsSalesTo" type="date" value="'+to+'"></label><button class="js-gold" onclick="loadJewelSalesReport(jsSalesFrom.value,jsSalesTo.value)">Apply</button></div>'+
  '<div class="js-report-metrics four">'+metric('TOTAL REVENUE','₹'+money(total),sales.length+' invoice(s)')+metric('GROSS BEFORE GST','₹'+money(gross))+metric('GST COLLECTED','₹'+money(tax))+metric('AVG TICKET SIZE','₹'+money(avg))+'</div>'+
  '<div class="js-card js-report-card"><div class="js-report-card-head"><b>Sales Trend</b></div>'+(points.length?bars:'<div class="js-report-empty">No jewellery sales in this period</div>')+'</div>'+
  '<div class="js-report-two"><div class="js-card js-report-card"><div class="js-report-card-head"><b>Invoice Detail</b></div><div class="js-report-table-wrap"><table class="js-clean-table"><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Mode</th><th>Gross</th><th>GST</th><th>Net</th><th>Paid</th><th>Balance</th></tr></thead><tbody>'+(detail||empty(9,'No sales invoices found'))+'</tbody></table></div></div><div class="js-card js-report-card"><div class="js-report-card-head"><b>Top Customers</b></div><table class="js-clean-table"><thead><tr><th>Customer</th><th>Revenue</th></tr></thead><tbody>'+(top.map(x=>'<tr><td>'+esc(x[0])+'</td><td class="js-gold-text">₹'+money(x[1])+'</td></tr>').join('')||empty(2,'No customer sales yet'))+'</tbody></table></div></div></div>';
};

w.loadJewelGstReport=async function(from,to){
  activate('jGstReport');to=to||iso(new Date());from=from||iso(new Date(Date.now()-29*86400000));const sales=await api('/api/jewellery/sales?from='+from+'&to='+to).catch(()=>[]);
  const taxable=sales.reduce((a,x)=>a+Number(x.GrossAmount||0),0),cg=sales.reduce((a,x)=>a+Number(x.Cgst||0),0),sg=sales.reduce((a,x)=>a+Number(x.Sgst||0),0),slabs={};
  sales.forEach(x=>{const k=Number(x.GstRate||0),v=slabs[k]||(slabs[k]={count:0,taxable:0,cg:0,sg:0});v.count++;v.taxable+=Number(x.GrossAmount||0);v.cg+=Number(x.Cgst||0);v.sg+=Number(x.Sgst||0)});
  const slabBody=Object.entries(slabs).map(([k,v])=>'<tr><td>'+esc(k)+'%</td><td>'+v.count+'</td><td>₹'+money(v.taxable)+'</td><td>₹'+money(v.cg)+'</td><td>₹'+money(v.sg)+'</td><td class="js-gold-text">₹'+money(v.cg+v.sg)+'</td></tr>').join('');
  const detail=sales.map(x=>'<tr><td>'+safeDate(x.BillDate)+'</td><td class="mono">'+esc(x.InvoiceNo)+'</td><td>'+esc(x.CustomerName||'Walk-in Customer')+'</td><td>'+money(x.GstRate)+'%</td><td>₹'+money(x.GrossAmount)+'</td><td>₹'+money(x.Cgst)+'</td><td>₹'+money(x.Sgst)+'</td><td class="js-gold-text">₹'+money(Number(x.Cgst||0)+Number(x.Sgst||0))+'</td></tr>').join('');
  app().innerHTML='<div class="js-content js-report-page">'+head('GST Report','Taxable value and CGST / SGST invoice breakup',actions('jewellery-gst'))+
  '<div class="js-report-filter"><label>FROM<input id="jsGstFrom" type="date" value="'+from+'"></label><label>TO<input id="jsGstTo" type="date" value="'+to+'"></label><button class="js-gold" onclick="loadJewelGstReport(jsGstFrom.value,jsGstTo.value)">Apply</button></div>'+
  '<div class="js-report-metrics four">'+metric('TAXABLE VALUE','₹'+money(taxable),sales.length+' invoice(s)')+metric('CGST','₹'+money(cg))+metric('SGST','₹'+money(sg))+metric('TOTAL TAX','₹'+money(cg+sg))+'</div>'+
  '<div class="js-report-two"><div class="js-card js-report-card"><div class="js-report-card-head"><b>By GST Slab</b></div><table class="js-clean-table"><thead><tr><th>GST Rate</th><th>Invoices</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Total Tax</th></tr></thead><tbody>'+(slabBody||empty(6,'No taxable jewellery invoices in this period'))+'</tbody></table></div><div class="js-card js-report-card"><div class="js-report-card-head"><b>Invoice Tax Detail</b></div><div class="js-report-table-wrap"><table class="js-clean-table"><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>GST</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Total</th></tr></thead><tbody>'+(detail||empty(8,'No GST invoice detail'))+'</tbody></table></div></div></div></div>';
};

w.loadJewelStockReport=async function(q,metal){
  activate('jStockReport');q=q||'';metal=metal||'ALL';let items=await api('/api/jewellery/catalog?q='+encodeURIComponent(q)).catch(()=>[]);if(metal!=='ALL')items=items.filter(x=>String(x.MetalType||'').toLowerCase()===String(metal).toLowerCase());
  const groups={};items.forEach(x=>{const k=(x.MetalType||'Other')+'|'+(x.Category||'Uncategorised'),g=groups[k]||(groups[k]={metal:x.MetalType||'Other',category:x.Category||'Uncategorised',items:0,weight:0,value:0});g.items++;g.weight+=Number(x.NetWeight||0);g.value+=Number(x.NetWeight||0)*rate(x.MetalType,x.Purity)});
  const rows=Object.values(groups),weight=items.reduce((a,x)=>a+Number(x.NetWeight||0),0),value=items.reduce((a,x)=>a+Number(x.NetWeight||0)*rate(x.MetalType,x.Purity),0);
  const detail=items.map(x=>'<tr><td class="mono">'+esc(x.TagNo)+'</td><td>'+esc(x.ItemName)+'</td><td><span class="js-metal-tag '+String(x.MetalType||'').toLowerCase()+'">'+esc(x.MetalType)+'</span></td><td>'+esc(x.Purity)+'</td><td>'+money(x.GrossWeight)+' g</td><td>'+money(x.NetWeight)+' g</td><td>'+esc(x.Huid||'-')+'</td><td>'+esc(x.RackName||'-')+'</td><td class="js-gold-text">₹'+money(Number(x.NetWeight||0)*rate(x.MetalType,x.Purity))+'</td></tr>').join('');
  app().innerHTML='<div class="js-content js-report-page">'+head('Stock Report','Tag-wise jewellery inventory, weight and valuation',actions('jewellery-stock'))+
  '<div class="js-report-filter"><label>SEARCH<input id="jsStockSearch" value="'+esc(q)+'" placeholder="Tag, HUID or item"></label><label>METAL<select id="jsStockMetal"><option value="ALL">All Metals</option><option '+(metal==='Gold'?'selected':'')+'>Gold</option><option '+(metal==='Silver'?'selected':'')+'>Silver</option><option '+(metal==='Platinum'?'selected':'')+'>Platinum</option></select></label><button class="js-gold" onclick="loadJewelStockReport(jsStockSearch.value,jsStockMetal.value)">Apply</button></div>'+
  '<div class="js-report-metrics three">'+metric('TOTAL ITEMS',String(items.length))+metric('TOTAL NET WEIGHT',money(weight)+' g')+metric('TOTAL VALUATION','₹'+money(value))+'</div>'+
  '<div class="js-report-two"><div class="js-card js-report-card"><div class="js-report-card-head"><b>Stock By Group</b></div><table class="js-clean-table"><thead><tr><th>Metal</th><th>Category</th><th>Items</th><th>Weight</th><th>Valuation</th></tr></thead><tbody>'+(rows.map(x=>'<tr><td><span class="js-metal-tag '+String(x.metal).toLowerCase()+'">'+esc(x.metal)+'</span></td><td>'+esc(x.category)+'</td><td>'+x.items+'</td><td>'+money(x.weight)+' g</td><td class="js-gold-text">₹'+money(x.value)+'</td></tr>').join('')||empty(5,'No jewellery stock available'))+'</tbody></table></div><div class="js-card js-report-card"><div class="js-report-card-head"><b>Tag-wise Stock Detail</b></div><div class="js-report-table-wrap"><table class="js-clean-table"><thead><tr><th>Tag</th><th>Item</th><th>Metal</th><th>Purity</th><th>Gross</th><th>Net</th><th>HUID</th><th>Rack</th><th>Valuation</th></tr></thead><tbody>'+(detail||empty(9,'No stock tags match this filter'))+'</tbody></table></div></div></div></div>';
};

w.loadJewelGirviReport=async function(){
  activate('jGirviReport');
  app().innerHTML='<div class="js-content js-report-page">'+head('Girvi Report','Loan-book exposure — real entries only',actions('jewellery-girvi'))+
  '<div class="js-report-filter"><label>STATUS<select id="jsGirviStatus"><option>All</option><option>Active</option><option>Overdue</option><option>Closed</option></select></label><label>SEARCH<input id="jsGirviSearch" placeholder="Client / voucher"></label><button class="js-gold" onclick="loadJewelGirviReport()">Apply</button></div>'+
  '<div class="js-report-metrics four">'+metric('ACTIVE LOANS','0')+metric('OVERDUE','0')+metric('OUTSTANDING PRINCIPAL','₹0.00')+metric('TOTAL OUTSTANDING','₹0.00')+'</div>'+
  '<div class="js-report-two"><div class="js-card js-report-card"><div class="js-report-card-head"><b>Book Composition</b></div><div class="js-composition"><div><span>CLOSED LOANS</span><b>0</b></div><div><span>ACCRUED INTEREST</span><b>₹0.00</b></div><div><span>COLLATERAL WEIGHT</span><b>0.000 g</b></div></div></div><div class="js-card js-risk"><h3>Risk Snapshot</h3><div>Active <b>0</b></div><div>Overdue <b>0</b></div><div>Closed <b>0</b></div><hr><div>Outstanding <strong>₹0.00</strong></div></div></div>'+
  '<div class="js-card js-report-card"><div class="js-report-card-head"><b>Girvi Register</b></div><table class="js-clean-table"><thead><tr><th>Voucher</th><th>Client</th><th>Date</th><th>Collateral</th><th>Weight</th><th>Principal</th><th>Interest</th><th>Status</th></tr></thead><tbody>'+empty(8,'Girvi transactions are not enabled yet in this database; no sample or fabricated loan data is shown.')+'</tbody></table></div></div>';
};
})(window,document);
