(function(w,d){
'use strict';
const state=()=>w.__jewelSuiteState||{};
const app=()=>d.getElementById('app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const iso=x=>{const d=new Date(x);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const rate=(metal,purity)=>Number((state().rates||[]).find(x=>String(x.MetalType||x.metalType||'').toLowerCase()===String(metal||'').toLowerCase()&&String(x.Purity||x.purity||'').toLowerCase()===String(purity||'').toLowerCase())?.RatePerGram||0);
function activate(page){d.querySelectorAll('#sidebar .js-nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));try{w.scrollTo({top:0,left:0,behavior:'instant'});d.documentElement.scrollTop=0;d.body.scrollTop=0}catch{}}
function metric(label,value){return '<div class="js-metric"><span>'+esc(label)+'</span><b>'+value+'</b></div>'}
function head(title,sub,actions){return '<div class="js-page-head"><div><h1>'+esc(title)+'</h1><p>'+esc(sub||'')+'</p></div><div class="js-page-actions">'+(actions||'')+'</div></div>'}
function empty(cols,msg){return '<tr><td colspan="'+cols+'" class="js-empty">'+esc(msg)+'</td></tr>'}

w.jewelSyncLiveRates=async function(force){
  const s=state(),now=Date.now();
  if(!force&&s.lastLiveSync&&now-s.lastLiveSync<300000)return s.rates||[];
  try{
    const r=await api('/api/jewellery/live-rates?save=true');
    s.liveRateMeta=r;
    const rows=Array.isArray(r.rates)?r.rates:[];
    if(rows.length){
      s.rates=rows.map(x=>({MetalType:x.MetalType??x.metalType,Purity:x.Purity??x.purity,RatePerGram:Number((x.RatePerGram??x.ratePerGram) || 0),EffectiveAt:r.updatedAt||new Date().toISOString()}));
      s.lastLiveSync=now;
    }
    return s.rates||[];
  }catch(e){
    if(force)try{toast('Internet metal rate update failed — saved rates kept')}catch{}
    return s.rates||[];
  }
};
w.jewelRefreshLiveRates=async function(){await w.jewelSyncLiveRates(true);try{toast('Gold & silver internet rates refreshed')}catch{};if(typeof w.loadDashboard==='function')w.loadDashboard()};

w.loadJewelDaybook=async function(day){
  activate('jDaybook');day=day||iso(new Date());
  const sales=await api('/api/jewellery/sales?from='+day+'&to='+day).catch(()=>[]);
  const rows=sales.map(x=>({time:new Date(x.BillDate).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),ref:x.InvoiceNo,party:x.CustomerName,mode:x.PaymentMode,amount:Number(x.NetPayable||0)}));
  const net=rows.reduce((a,x)=>a+x.amount,0),cash=rows.filter(x=>/cash/i.test(x.mode)).reduce((a,x)=>a+x.amount,0),upi=rows.filter(x=>/upi|credit/i.test(x.mode)).reduce((a,x)=>a+x.amount,0);
  app().innerHTML='<div class="js-content js-report-page">'+head('Daybook','All jewellery billing movements for one day','<label class="js-date-filter">DATE<input id="jsDaybookDate" type="date" value="'+day+'" onchange="loadJewelDaybook(this.value)"></label>')+
  '<div class="js-report-metrics">'+metric('NET SALES','₹'+money(net))+metric('CASH IN','₹'+money(cash))+metric('CASH OUT','₹0.00')+metric('UPI / CREDIT','₹'+money(upi))+metric('CARD','₹0.00')+metric('BANK','₹0.00')+'</div>'+
  '<div class="js-card js-report-card"><div class="js-report-card-head"><b>Movements ('+rows.length+')</b></div><table class="js-clean-table"><thead><tr><th>Time</th><th>Type</th><th>Reference</th><th>Party</th><th>Mode</th><th>Amount</th></tr></thead><tbody>'+
  (rows.map(x=>'<tr><td>'+esc(x.time)+'</td><td>Sale</td><td class="mono">'+esc(x.ref)+'</td><td>'+esc(x.party)+'</td><td>'+esc(x.mode)+'</td><td class="js-gold-text">₹'+money(x.amount)+'</td></tr>').join('')||empty(6,'No movements on this date'))+'</tbody></table></div></div>';
};

w.loadJewelSalesReport=async function(from,to){
  activate('jSalesReport');to=to||iso(new Date());from=from||iso(new Date(Date.now()-29*86400000));
  const sales=await api('/api/jewellery/sales?from='+from+'&to='+to).catch(()=>[]);
  const total=sales.reduce((a,x)=>a+Number(x.NetPayable||0),0),avg=sales.length?total/sales.length:0,byDay={},buyers={};
  sales.forEach(x=>{const k=String(x.BillDate||'').slice(5,10);byDay[k]=(byDay[k]||0)+Number(x.NetPayable||0);buyers[x.CustomerName]=(buyers[x.CustomerName]||0)+Number(x.NetPayable||0)});
  const points=Object.entries(byDay),max=Math.max(1,...points.map(x=>x[1]));
  const bars='<div class="js-trend-chart">'+points.map(x=>'<div class="js-trend-col"><span style="height:'+Math.max(2,Number(x[1])/max*100)+'%"></span><small>'+esc(x[0])+'</small></div>').join('')+'</div>';
  const top=Object.entries(buyers).sort((a,b)=>b[1]-a[1]).slice(0,10);
  app().innerHTML='<div class="js-content js-report-page">'+head('Sales Report','Trend, revenue and top buyers')+
  '<div class="js-report-filter"><label>FROM<input id="jsSalesFrom" type="date" value="'+from+'"></label><label>TO<input id="jsSalesTo" type="date" value="'+to+'"></label><button class="js-gold" onclick="loadJewelSalesReport(jsSalesFrom.value,jsSalesTo.value)">Apply</button></div>'+
  '<div class="js-report-metrics four">'+metric('TOTAL REVENUE','₹'+money(total))+metric('RETAIL SALES','₹'+money(total))+metric('WHOLESALE SALES','₹0.00')+metric('AVG TICKET SIZE','₹'+money(avg))+'</div>'+
  '<div class="js-card js-report-card"><div class="js-report-card-head"><b>30-Day Sales Trend</b></div>'+(points.length?bars:'<div class="js-report-empty">No jewellery sales in this period</div>')+'</div>'+
  '<div class="js-card js-report-card"><div class="js-report-card-head"><b>Top Customers</b></div><table class="js-clean-table"><thead><tr><th>Customer</th><th>Revenue</th></tr></thead><tbody>'+(top.map(x=>'<tr><td>'+esc(x[0])+'</td><td class="js-gold-text">₹'+money(x[1])+'</td></tr>').join('')||empty(2,'No customer sales yet'))+'</tbody></table></div></div>';
};

w.loadJewelGstReport=async function(from,to){
  activate('jGstReport');to=to||iso(new Date());from=from||iso(new Date(Date.now()-29*86400000));
  const sales=await api('/api/jewellery/sales?from='+from+'&to='+to).catch(()=>[]);
  const taxable=sales.reduce((a,x)=>a+Number(x.GrossAmount||0),0),cg=sales.reduce((a,x)=>a+Number(x.Cgst||0),0),sg=sales.reduce((a,x)=>a+Number(x.Sgst||0),0),slabs={};
  sales.forEach(x=>{const k=Number(x.GstRate||0),v=slabs[k]||(slabs[k]={count:0,taxable:0,cg:0,sg:0});v.count++;v.taxable+=Number(x.GrossAmount||0);v.cg+=Number(x.Cgst||0);v.sg+=Number(x.Sgst||0)});
  const body=Object.entries(slabs).map(([k,v])=>'<tr><td>'+esc(k)+'%</td><td>'+v.count+'</td><td>₹'+money(v.taxable)+'</td><td>₹'+money(v.cg)+'</td><td>₹'+money(v.sg)+'</td><td class="js-gold-text">₹'+money(v.cg+v.sg)+'</td></tr>').join('');
  app().innerHTML='<div class="js-content js-report-page">'+head('GST Report','CGST / SGST split by slab')+
  '<div class="js-report-filter"><label>FROM<input id="jsGstFrom" type="date" value="'+from+'"></label><label>TO<input id="jsGstTo" type="date" value="'+to+'"></label><button class="js-gold" onclick="loadJewelGstReport(jsGstFrom.value,jsGstTo.value)">Apply</button></div>'+
  '<div class="js-report-metrics four">'+metric('TAXABLE VALUE','₹'+money(taxable))+metric('CGST','₹'+money(cg))+metric('SGST','₹'+money(sg))+metric('TOTAL TAX','₹'+money(cg+sg))+'</div>'+
  '<div class="js-card js-report-card"><div class="js-report-card-head"><b>By GST Slab</b></div><table class="js-clean-table"><thead><tr><th>GST Rate</th><th>Invoices</th><th>Taxable Amount</th><th>CGST</th><th>SGST</th><th>Total Tax</th></tr></thead><tbody>'+(body||empty(6,'No taxable jewellery invoices in this period'))+'</tbody></table></div></div>';
};

w.loadJewelStockReport=async function(){
  activate('jStockReport');const items=await api('/api/jewellery/catalog').catch(()=>[]),groups={};
  items.forEach(x=>{const k=(x.MetalType||'Other')+'|'+(x.Category||'Uncategorised'),g=groups[k]||(groups[k]={metal:x.MetalType||'Other',category:x.Category||'Uncategorised',items:0,weight:0,value:0});g.items++;g.weight+=Number(x.NetWeight||0);g.value+=Number(x.NetWeight||0)*rate(x.MetalType,x.Purity)});
  const rows=Object.values(groups),weight=items.reduce((a,x)=>a+Number(x.NetWeight||0),0),value=rows.reduce((a,x)=>a+x.value,0);
  app().innerHTML='<div class="js-content js-report-page">'+head('Stock Report','Inventory valuation by metal and category')+
  '<div class="js-report-metrics three">'+metric('TOTAL ITEMS',String(items.length))+metric('TOTAL WEIGHT',money(weight)+' g')+metric('TOTAL VALUATION','₹'+money(value))+'</div>'+
  '<div class="js-card js-report-card"><div class="js-report-card-head"><b>Stock By Group</b></div><table class="js-clean-table"><thead><tr><th>Metal</th><th>Category</th><th>Items</th><th>Weight</th><th>Valuation</th></tr></thead><tbody>'+
  (rows.map(x=>'<tr><td><span class="js-metal-tag '+String(x.metal).toLowerCase()+'">'+esc(x.metal)+'</span></td><td>'+esc(x.category)+'</td><td>'+x.items+'</td><td>'+money(x.weight)+' g</td><td class="js-gold-text">₹'+money(x.value)+'</td></tr>').join('')||empty(5,'No jewellery stock available'))+'</tbody></table></div></div>';
};

w.loadJewelGirviReport=async function(){
  activate('jGirviReport');
  app().innerHTML='<div class="js-content js-report-page">'+head('Girvi Report','Loan-book exposure — real entries only')+
  '<div class="js-report-metrics four">'+metric('ACTIVE LOANS','0')+metric('OVERDUE','0')+metric('OUTSTANDING PRINCIPAL','₹0.00')+metric('TOTAL OUTSTANDING','₹0.00')+'</div>'+
  '<div class="js-report-two"><div class="js-card js-report-card"><div class="js-report-card-head"><b>Book Composition</b></div><div class="js-composition"><div><span>CLOSED LOANS</span><b>0</b></div><div><span>ACCRUED INTEREST</span><b>₹0.00</b></div><div><span>COLLATERAL WEIGHT</span><b>0.000 g</b></div></div></div><div class="js-card js-risk"><h3>Risk Snapshot</h3><div>Active <b>0</b></div><div>Overdue <b>0</b></div><div>Closed <b>0</b></div><hr><div>Outstanding <strong>₹0.00</strong></div></div></div>'+
  '<div class="js-card js-report-card"><div class="js-report-card-head"><b>⚠ Overdue Loans</b></div><div class="js-report-empty">Girvi transactions are not enabled yet, so no sample or fabricated loan data is shown.</div></div></div>';
};
})(window,document);
