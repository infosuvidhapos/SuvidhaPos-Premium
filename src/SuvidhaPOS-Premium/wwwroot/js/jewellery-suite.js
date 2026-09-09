(function(){
  'use strict';
  const JS={enabled:false,mode:'retail',items:[],rates:[],cart:[],oldMetal:[],payments:[{mode:'Cash',amount:0,reference:''}],liveRateMeta:null,lastLiveSync:0};window.__jewelSuiteState=JS;
  const money=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const appBox=()=>document.getElementById('app');
  const notify=m=>{try{toast(m)}catch{alert(m)}};
  const rate=(metal,purity)=>{
    const r=JS.rates.find(x=>String(x.MetalType||'').toLowerCase()===String(metal||'').toLowerCase()&&String(x.Purity||'').toLowerCase()===String(purity||'').toLowerCase());
    return Number(r?.RatePerGram||0);
  };
  const icon=(x)=>'<span class="js-icon">'+x+'</span>';

  function shell(){
    const side=document.getElementById('sidebar'); if(!side)return;
    side.innerHTML=`
      <div class="js-brand"><img class="js-brand-logo" src="/img/suvidha-pos-mark.svg?v=6115jewelreports" alt="Suvidha POS"></div>
      <div class="js-quick"><span>⌘ K</span><input id="jsQuickSearch" placeholder="Quick search"></div>
      <div class="js-side-scroll">
        <div class="js-section">OVERVIEW</div>
        <button class="nav js-nav active" data-page="dashboard" onclick="loadDashboard()">${icon('▦')}<span>Dashboard</span></button>
        <div class="js-section js-section-row">BILLING <span>⌄</span></div>
        <button class="nav js-nav" data-page="jewelInvoices" onclick="loadJewelInvoices()">${icon('▤')}<span>All Invoices</span></button>
        <button class="nav js-nav" data-page="billing" onclick="loadBilling()">${icon('▣')}<span>Create Invoice</span></button>
        <button class="nav js-nav" data-page="purchase" onclick="loadPurchase()">${icon('🛒')}<span>Purchase Bill</span></button>
        <button class="nav js-nav" onclick="jewelSuiteInvoice('karigar')">${icon('⚒')}<span>Karigar Bill</span></button>
        <button class="nav js-nav" onclick="jewelSuiteInvoice('exchange')">${icon('↔')}<span>Exchange</span></button>
        <button class="nav js-nav" onclick="jewelSuiteInvoice('repair')">${icon('⌕')}<span>Repair</span></button>
        <button class="nav js-nav" onclick="jewelComingSoon('Estimates')">${icon('▤')}<span>Estimates</span></button>
        <div class="js-section">WORKSHOP</div>
        <button class="nav js-nav" onclick="jewelComingSoon('Issue Register')">${icon('▤')}<span>Issue Register</span></button>
        <button class="nav js-nav" onclick="jewelComingSoon('Karigar Master')">${icon('⚒')}<span>Karigar</span></button>
        <button class="nav js-nav" onclick="jewelComingSoon('Karigar Jobs')">${icon('▥')}<span>Karigar Jobs</span></button>
        <button class="nav js-nav" onclick="jewelSuiteInvoice('repair')">${icon('⌕')}<span>Repairs</span></button>
        <div class="js-section">FINANCE</div>
        <button class="nav js-nav" onclick="loadJewelGirviReport()">${icon('⚖')}<span>Girvi Loans</span></button>
        <button class="nav js-nav" onclick="jewelComingSoon('Cr/Dr Ledger')">${icon('▭')}<span>Cr/Dr Ledger</span></button>
        <button class="nav js-nav" onclick="jewelComingSoon('Saving Schemes')">${icon('♧')}<span>Saving Schemes</span></button>
        <div class="js-section">INVENTORY</div>
        <button class="nav js-nav" data-page="products" onclick="loadProducts()">${icon('◇')}<span>Stock</span></button>
        <button class="js-section js-section-toggle" type="button" aria-expanded="false" aria-controls="jsReportsMenu" onclick="toggleJewelReports()"><span>REPORTS</span><span id="jsReportsChevron">›</span></button>
        <div id="jsReportsMenu" class="js-report-nav">
          <button class="nav js-nav" data-page="jDaybook" onclick="loadJewelDaybook()">${icon('▣')}<span>Daybook</span></button>
          <button class="nav js-nav" data-page="jSalesReport" onclick="loadJewelSalesReport()">${icon('⌁')}<span>Sales Report</span></button>
          <button class="nav js-nav" data-page="jGstReport" onclick="loadJewelGstReport()">${icon('%')}<span>GST Report</span></button>
          <button class="nav js-nav" data-page="jStockReport" onclick="loadJewelStockReport()">${icon('◇')}<span>Stock Report</span></button>
          <button class="nav js-nav" data-page="jGirviReport" onclick="loadJewelGirviReport()">${icon('⚖')}<span>Girvi Report</span></button>
        </div>
        <div class="js-section">MASTERS</div>
        <button class="nav js-nav" data-page="customers" onclick="loadCustomers()">${icon('♙')}<span>Customers</span></button>
        <button class="nav js-nav" onclick="loadJewelRates()">${icon('↗')}<span>Au/Ag Rates</span></button>
        <div class="js-section">SYSTEM</div>
        <button class="nav js-nav" onclick="loadSettings()">${icon('⚙')}<span>Settings & AMC</span></button>
      </div>
      <div class="js-side-user"><b>${esc(window.currentUser?.DisplayName||'Super Admin')}</b><small>${esc(window.currentUser?.Role||'Super Admin')}</small><button onclick="logout()">↪ &nbsp; Sign Out</button></div>`;
    const q=document.getElementById('jsQuickSearch');
    if(q)q.addEventListener('input',()=>{const t=q.value.toLowerCase();side.querySelectorAll('.js-nav').forEach(x=>x.style.display=x.textContent.toLowerCase().includes(t)?'':'none')});
  }

  window.toggleJewelReports=function(force){
    const box=document.getElementById('jsReportsMenu');
    const button=document.querySelector('.js-section-toggle[aria-controls="jsReportsMenu"]');
    const chevron=document.getElementById('jsReportsChevron');
    if(!box)return false;
    const open=typeof force==='boolean'?force:!box.classList.contains('open');
    box.classList.toggle('open',open);
    if(button)button.setAttribute('aria-expanded',open?'true':'false');
    if(chevron)chevron.textContent=open?'⌄':'›';
    return open;
  };

  function activate(page){
    document.body.classList.add('jewel-suite-mode');
    document.body.dataset.storeType='jewellery-shop';
    document.querySelectorAll('#sidebar .js-nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
    if(/^j(Daybook|SalesReport|GstReport|StockReport|GirviReport|Reports)$/.test(String(page||'')))window.toggleJewelReports(true);
    try{window.scrollTo({top:0,left:0,behavior:'instant'});document.documentElement.scrollTop=0;document.body.scrollTop=0;appBox().scrollTop=0}catch{}
  }
  function pageHeading(title,sub,actions=''){
    return `<div class="js-page-head"><div><h1>${esc(title)}</h1><p>${esc(sub||'')}</p></div><div class="js-page-actions">${actions}</div></div>`;
  }
  function metric(label,value,extra='',tone=''){
    return `<div class="js-metric ${tone}"><span>${esc(label)}</span><b>${value}</b><small>${esc(extra)}</small></div>`;
  }

  async function dashboard(){
    activate('dashboard');
    const [rates,items,sales,purchases]=await Promise.all([
      api('/api/jewellery/metal-rates').catch(()=>[]),
      api('/api/jewellery/catalog').catch(()=>[]),
      api('/api/jewellery/sales').catch(()=>[]),
      api('/api/purchases').catch(()=>[])
    ]);
    JS.rates=rates;JS.items=items;if(window.jewelSyncLiveRates)await window.jewelSyncLiveRates(false);
    const today=new Date().toISOString().slice(0,10),month=today.slice(0,7);
    const todaySales=sales.filter(x=>String(x.BillDate||'').slice(0,10)===today).reduce((a,x)=>a+Number(x.NetPayable||0),0);
    const monthSales=sales.filter(x=>String(x.BillDate||'').slice(0,7)===month).reduce((a,x)=>a+Number(x.NetPayable||0),0);
    const receivables=sales.reduce((a,x)=>a+Math.max(0,Number(x.Balance||0)),0);
    const payables=purchases.reduce((a,x)=>a+Math.max(0,Number(x.GrandTotal||0)-Number(x.PaidAmount||0)),0);
    const valuation=items.reduce((a,x)=>a+Number(x.NetWeight||0)*rate(x.MetalType,x.Purity),0);
    const gst=sales.reduce((a,x)=>a+Math.max(0,Number(x.NetPayable||0)-Number(x.GrossAmount||0)+Number(x.OldMetalCredit||0)),0);
    const find=(m,p)=>rate(m,p);
    appBox().innerHTML=`<div class="js-content">
      ${pageHeading('Dashboard',"Welcome back — here's today's quick view")}
      <div class="js-block-title">↗ &nbsp; GOLD & SILVER RATE TODAY <small class="js-rate-source">${esc(JS.liveRateMeta?.source||'Saved rate master')}${JS.liveRateMeta?.stale?' · STALE':''}</small></div>
      <div class="js-rate-strip">
        <div class="js-rate-chip gold"><i>Au</i><span>Gold 24K<b>₹${money(find('Gold','24K'))}<small>/g</small></b></span></div>
        <div class="js-rate-chip gold"><i>Au</i><span>Gold 22K<b>₹${money(find('Gold','22K'))}<small>/g</small></b></span></div>
        <div class="js-rate-chip gold"><i>Au</i><span>Gold 18K<b>₹${money(find('Gold','18K'))}<small>/g</small></b></span></div>
        <div class="js-rate-chip"><i>Ag</i><span>Silver 999<b>₹${money(find('Silver','999'))}<small>/g</small></b></span></div>
        <div class="js-rate-chip"><i>Ag</i><span>Silver 925<b>₹${money(find('Silver','925'))}<small>/g</small></b></span></div>
        <div class="js-rate-chip"><i>Pt</i><span>Platinum 950<b>₹${money(find('Platinum','950'))}<small>/g</small></b></span></div>
        <button onclick="jewelRefreshLiveRates()">↻ &nbsp; Internet Rates</button>
      </div>
      <div class="js-block-title">＋ &nbsp; CREATE INVOICE</div>
      <div class="js-create-grid">
        <button class="purchase" onclick="loadPurchase()">🛒<b>Purchase</b></button>
        <button class="retail" onclick="jewelSuiteInvoice('retail')">▣<b>Retail</b></button>
        <button class="wholesale" onclick="jewelSuiteInvoice('wholesale')">♜<b>Wholesale</b></button>
        <button class="karigar" onclick="jewelSuiteInvoice('karigar')">♙<b>Karigar</b></button>
        <button class="exchange" onclick="jewelSuiteInvoice('exchange')">↔<b>Exchange</b></button>
        <button class="repair" onclick="jewelSuiteInvoice('repair')">⌕<b>Repair</b></button>
      </div>
      <div class="js-block-title">▣ &nbsp; MODULES</div>
      <div class="js-module-grid">
        <button onclick="loadJewelInvoices()">▤<b>All Vouchers</b><span>View all bills & invoices</span></button>
        <button onclick="jewelComingSoon('Girvi Loans')">⚖<b>Girvi Loans</b><span>Pawn / gold loans</span></button>
        <button onclick="jewelComingSoon('Cr/Dr Ledger')">▭<b>Cr/Dr Ledger</b><span>Customer account ledger</span></button>
        <button onclick="jewelComingSoon('Saving Schemes')">♧<b>Saving Schemes</b><span>Gold/silver saving plans</span></button>
        <button onclick="loadProducts()">◇<b>Stocks</b><span>Jewellery stock register</span></button>
        <button onclick="loadJewelReports()">⌁<b>All Reports</b><span>Daybook, GST, sales, stock & girvi</span></button>
      </div>
      <div class="js-block-title">♙ &nbsp; CREATE PARTY</div>
      <div class="js-party-grid">
        <button class="retail" onclick="loadCustomers()">♙<b>Retail Customer</b><span>Retail</span></button>
        <button class="wholesale" onclick="loadCustomers()">♜<b>Wholesale Party</b><span>Wholesale</span></button>
        <button class="purchase" onclick="loadSuppliers()">🛒<b>Supplier</b><span>Supplier</span></button>
        <button class="karigar" onclick="jewelComingSoon('Karigar Master')">♙<b>Karigar</b><span>Karigar</span></button>
        <button class="repair" onclick="jewelComingSoon('Girvi Client')">⚖<b>Girvi Client</b><span>Girvi</span></button>
      </div>
      <div class="js-block-title">SUMMARY</div>
      <div class="js-metric-grid">
        ${metric("Today's Sales",'₹'+money(todaySales),'+ live jewellery billing')}
        ${metric('Month Sales','₹'+money(monthSales),'current month')}
        ${metric('Receivables','₹'+money(receivables),'customer balance','danger')}
        ${metric('Payables','₹'+money(payables),'supplier balance')}
        ${metric('Active Loans','0','girvi module')}
        ${metric('Stock Valuation','₹'+money(valuation),items.length+' active tags')}
        ${metric('GST Collected','₹'+money(gst),'sales GST')}
        ${metric('Retail vs Wholesale','Retail 100%','Wholesale 0%')}
      </div>
      <div class="js-block-title">ANALYTICS</div>
      <div class="js-analytics"><div><h3>30-Day Sales Trend</h3><div class="js-chart-empty">₹0k<br><span>Sales chart fills as jewellery invoices are posted</span></div></div><div><h3>Recent Activity</h3>${sales.slice(0,5).map(x=>`<div class="js-activity"><i>▤</i><span>Retail invoice <b>${esc(x.InvoiceNo)}</b><small>${new Date(x.BillDate).toLocaleString('en-IN')}</small></span><strong>₹${money(x.NetPayable)}</strong></div>`).join('')||'<div class="js-empty">No jewellery invoices yet</div>'}</div></div>
    </div>`;
  }

  async function invoices(){
    activate('jewelInvoices');
    const rows=await api('/api/jewellery/sales').catch(()=>[]);
    appBox().innerHTML=`<div class="js-content">
      ${pageHeading('Invoices','Retail and wholesale billing','<button class="js-outline" onclick="jewelSuiteInvoice(\'wholesale\')">＋ Wholesale</button><button class="js-gold" onclick="jewelSuiteInvoice(\'retail\')">＋ Retail</button>')}
      <div class="js-card js-invoice-list"><div class="js-invoice-tools"><input id="jsInvoiceSearch" placeholder="⌕  Search by customer or invoice #"><select id="jsInvoiceFilter"><option>All Invoices</option><option>Paid</option><option>Unpaid</option></select></div>
      <table><thead><tr><th>Invoice #</th><th>Date</th><th>Customer</th><th>Type</th><th>Total</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody id="jsInvoiceRows">${rows.map(x=>`<tr><td class="mono">${esc(x.InvoiceNo)}</td><td>${new Date(x.BillDate).toLocaleDateString('en-IN')}</td><td>${esc(x.CustomerName)}</td><td><span class="js-type">${esc(x.Type||'retail')}</span></td><td>₹${money(x.NetPayable)}</td><td>${Number(x.Balance||0)?'₹'+money(x.Balance):'-'}</td><td><span class="js-status ${x.Status==='paid'?'paid':'unpaid'}">${esc(x.Status)}</span></td><td><button class="js-edit" onclick="jewelComingSoon('Invoice edit / '+${JSON.stringify('')})">✎ Edit</button></td></tr>`).join('')||'<tr><td colspan="8" class="js-empty">No jewellery invoices yet</td></tr>'}</tbody></table></div>
    </div>`;
    const q=document.getElementById('jsInvoiceSearch');if(q)q.addEventListener('input',()=>{const t=q.value.toLowerCase();document.querySelectorAll('#jsInvoiceRows tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(t)?'':'none')});
  }

  function invoiceModeName(mode){return ({retail:'Retail Sale',wholesale:'Wholesale',purchase:'Purchase Bill',karigar:'Karigar Bill',exchange:'Exchange',repair:'Repair Bill'})[mode]||'Retail Sale'}
  async function invoice(mode='retail'){
    JS.mode=mode;JS.cart=[];JS.oldMetal=[];JS.payments=[{mode:'Cash',amount:0,reference:''}];
    activate(mode==='purchase'?'purchase':'billing');
    const [items,rates]=await Promise.all([api('/api/jewellery/catalog').catch(()=>[]),api('/api/jewellery/metal-rates').catch(()=>[])]);
    JS.items=items;JS.rates=rates;
    const name=invoiceModeName(mode),prefix=({retail:'JB',wholesale:'WS',purchase:'PB',karigar:'KB',exchange:'EX',repair:'RP'})[mode]||'JB';
    const today=new Date().toISOString().slice(0,10);
    appBox().innerHTML=`<div class="js-content js-invoice-page">
      ${pageHeading(name,'Create a new '+name.toLowerCase(),'<button class="js-outline" onclick="premiumPrintJewelleryDraft()">▣ Print</button><button class="js-gold" onclick="jewelSuiteSaveInvoice()">▣ Save Bill</button>')}
      <div class="js-bill-title">← &nbsp; <b>${esc(name)}</b> <span>${prefix}-****</span></div>
      <div class="js-bill-tabs">${['retail','wholesale','purchase','karigar','exchange','repair'].map(m=>`<button class="${m===mode?'active':''}" onclick="jewelSuiteInvoice('${m}')">${invoiceModeName(m)}</button>`).join('')}</div>
      <div class="js-card js-customer-card"><label>CUSTOMER<select id="jsCust"><option>Walk-in Customer</option></select></label><button onclick="loadCustomers()">♙+</button><label>DATE<input id="jsBillDate" type="date" value="${today}"></label></div>
      <div class="js-card js-sale-card"><div class="js-card-head"><b>Sale Items</b><button onclick="jewelSuitePickItem()">＋ &nbsp; Add Row</button></div>
        <div class="js-sale-table"><table><thead><tr><th>#</th><th>TAG NO</th><th>ITEM NAME</th><th>METAL</th><th>PURITY</th><th>GROSS (G)</th><th>LESS (G)</th><th>NET (G)</th><th>TUNCH%</th><th>WASTE%</th><th>MAKING</th><th>FINE WT</th><th>RATE/G (₹)</th><th>AMOUNT (₹)</th><th></th></tr></thead><tbody id="jsSaleRows"><tr><td colspan="15" class="js-empty">No items added yet<br><button onclick="jewelSuitePickItem()">＋ &nbsp; Add First Item</button></td></tr></tbody></table></div>
      </div>
      <div class="js-card js-exchange-card"><div class="js-card-head"><b>↻ &nbsp; Exchange / Old Metal Return <small>Old metal / return</small></b><button onclick="jewelSuiteAddOldMetal()">＋ &nbsp; Add Row</button></div>
        <div class="js-sale-table"><table><thead><tr><th>#</th><th>TAG NO</th><th>ITEM NAME</th><th>METAL</th><th>PURITY</th><th>GROSS (G)</th><th>LESS (G)</th><th>NET (G)</th><th>TUNCH%</th><th>WASTE%</th><th>MAKING</th><th>FINE WT</th><th>RATE/G (₹)</th><th>AMOUNT (₹)</th></tr></thead><tbody id="jsOldRows"><tr><td colspan="14" class="js-empty">No exchange items — add old metal brought by customer<br><button onclick="jewelSuiteAddOldMetal()">＋ &nbsp; Add Exchange Item</button></td></tr></tbody></table></div>
      </div>
      <div class="js-bill-bottom"><div class="js-card"><div class="js-card-head"><b>Payment Received</b><button onclick="jewelSuiteAddPayment()">＋ &nbsp; Add Mode</button></div><div id="jsPayRows"></div></div>
      <div class="js-card js-summary"><h3>Summary & Balance</h3><div>Sale Total <b id="jsSaleTotal">₹0.00</b></div><div>Discount (₹) <input id="jsJewelDiscount" type="number" value="0" oninput="jewelSuiteRenderBill()"></div><div>GST <select id="jsJewelGst" onchange="jewelSuiteRenderBill()"><option value="0">0%</option><option value="3" selected>3%</option></select><b id="jsJewelGstAmt">₹0.00</b></div><hr><div>Gross <b id="jsGross">₹0.00</b></div><div>Old Metal <b id="jsOldCredit">₹0.00</b></div><div class="js-balance">Balance <b id="jsBalance">₹0.00</b></div><label>Notes<textarea id="jsJewelNotes" placeholder="Internal notes..."></textarea></label><button class="js-gold js-finalize" onclick="jewelSuiteSaveInvoice()">▣ &nbsp; Save & Finalize Bill</button></div></div>
    </div>`;
    renderBill();
  }

  function lineCalc(x){
    const r=rate(x.MetalType,x.Purity)||Number(x.RatePerGram||0);
    const purity=Number(x.PurityPercent||0)/100;
    const fine=Number(x.NetWeight||0)*purity;
    const making=String(x.MakingChargeType||'FLAT').toUpperCase()==='PER_GRAM'?Number(x.NetWeight||0)*Number(x.MakingValue||0):String(x.MakingChargeType||'').toUpperCase()==='PERCENTAGE'?(Number(x.NetWeight||0)*r)*Number(x.MakingValue||0)/100:Number(x.MakingValue||0);
    const wastage=(Number(x.NetWeight||0)*r)*Number(x.WastagePercent||0)/100;
    const extras=Number(x.LabourCharge||0)+Number(x.HallmarkCharge||0)+Number(x.OtherCharge||0);
    const amount=Number(x.NetWeight||0)*r+Number(x.StoneValue||0)+making+wastage+extras;
    return {r,fine:Number(x.FineWeight||0)||fine,making,wastage,extras,amount};
  }
  function renderBill(){
    const tb=document.getElementById('jsSaleRows');if(!tb)return;
    tb.innerHTML=JS.cart.length?JS.cart.map((x,i)=>{const z=lineCalc(x);return `<tr><td>${i+1}</td><td class="mono">${esc(x.TagNo)}</td><td>${esc(x.ItemName)}</td><td>${esc(x.MetalType)}</td><td>${esc(x.Purity)}</td><td>${money(x.GrossWeight)}</td><td>${money(Number(x.LessWeight||0)||Math.max(0,Number(x.GrossWeight||0)-Number(x.NetWeight||0)))}</td><td>${money(x.NetWeight)}</td><td>${money(x.PurityPercent)}%</td><td>${money(Number(x.WastagePercent||0))}%</td><td>₹${money(z.making+z.wastage+z.extras)}</td><td>${money(z.fine)}</td><td>₹${money(z.r)}</td><td><b>₹${money(z.amount)}</b></td><td><button onclick="jewelSuiteRemoveItem(${i})">×</button></td></tr>`}).join(''):'<tr><td colspan="15" class="js-empty">No items added yet<br><button onclick="jewelSuitePickItem()">＋ &nbsp; Add First Item</button></td></tr>';
    const old=document.getElementById('jsOldRows');if(old)old.innerHTML=JS.oldMetal.length?JS.oldMetal.map((x,i)=>`<tr><td>${i+1}</td><td>-</td><td>Old Metal</td><td>${esc(x.metal)}</td><td>${money(x.purity)}%</td><td>${money(x.gross)}</td><td>${money(x.less)}</td><td>${money(x.net)}</td><td>${money(x.purity)}%</td><td>0%</td><td>-</td><td>${money(x.fine)}</td><td>₹${money(x.rate)}</td><td>₹${money(x.amount)}</td></tr>`).join(''):'<tr><td colspan="14" class="js-empty">No exchange items — add old metal brought by customer<br><button onclick="jewelSuiteAddOldMetal()">＋ &nbsp; Add Exchange Item</button></td></tr>';
    const sale=JS.cart.reduce((a,x)=>a+lineCalc(x).amount,0),discount=Number(document.getElementById('jsJewelDiscount')?.value||0),gstRate=Number(document.getElementById('jsJewelGst')?.value||0),tax=Math.max(0,sale-discount)*gstRate/100,oldCredit=JS.oldMetal.reduce((a,x)=>a+x.amount,0),gross=Math.max(0,sale-discount)+tax,balance=Math.max(0,gross-oldCredit);
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent='₹'+money(v)};
    set('jsSaleTotal',sale);set('jsJewelGstAmt',tax);set('jsGross',gross);set('jsOldCredit',oldCredit);set('jsBalance',balance);
    JS.current={sale,discount,gstRate,tax,oldCredit,gross,balance};
    const pays=document.getElementById('jsPayRows');if(pays)pays.innerHTML=JS.payments.map((p,i)=>`<div class="js-payment-row"><select onchange="JSuitePayment(${i},'mode',this.value)"><option ${p.mode==='Cash'?'selected':''}>Cash</option><option ${p.mode==='UPI'?'selected':''}>UPI</option><option ${p.mode==='Card'?'selected':''}>Card</option><option ${p.mode==='Bank'?'selected':''}>Bank</option><option ${p.mode==='Credit'?'selected':''}>Credit</option><option ${p.mode==='Cheque'?'selected':''}>Cheque</option></select><input type="number" placeholder="Amount ₹" value="${p.amount||''}" onchange="JSuitePayment(${i},'amount',this.value)"><button onclick="jewelSuiteRemovePayment(${i})">⌫</button></div>`).join('');
  }

  window.jewelSuitePickItem=function(){
    const available=JS.items.filter(x=>!JS.cart.some(c=>c.Id===x.Id));
    modal('Select Jewellery Item',`<input id="jsPickSearch" class="input" placeholder="Search tag, HUID or item..." oninput="document.querySelectorAll('.js-pick-row').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(this.value.toLowerCase())?'':'none')"><div class="js-picker">${available.map(x=>`<button class="js-pick-row" onclick="jewelSuiteAddItem(${x.Id})"><b>${esc(x.TagNo)} · ${esc(x.ItemName)}</b><span>${esc(x.MetalType)} ${esc(x.Purity)} · Net ${money(x.NetWeight)}g · HUID ${esc(x.Huid||'-')}</span></button>`).join('')||'<div class="js-empty">No available tags</div>'}</div>`,'<button class="btn secondary" onclick="closeModal()">Close</button>')};
  window.jewelSuiteAddItem=function(id){const x=JS.items.find(a=>a.Id===id);if(x){JS.cart.push({...x,StoneValue:Number(x.StoneValue||0)});closeModal();renderBill()}};
  window.jewelSuiteRemoveItem=function(i){JS.cart.splice(i,1);renderBill()};
  window.jewelSuiteAddOldMetal=function(){modal('Old Metal / Exchange',`<div class="formgrid"><label>Metal<select id="jsOmMetal" class="select"><option>Gold</option><option>Silver</option></select></label><label>Gross Weight (g)<input id="jsOmGross" class="input" type="number" step="0.001"></label><label>Less / Stone (g)<input id="jsOmLess" class="input" type="number" step="0.001" value="0"></label><label>Purity %<input id="jsOmPurity" class="input" type="number" step="0.01" value="91.6"></label><label>Rate / g<input id="jsOmRate" class="input" type="number" step="0.01" value="${rate('Gold','22K')}"></label></div>`,'<button class="btn" onclick="jewelSuiteCommitOldMetal()">Add Exchange Item</button>')};
  window.jewelSuiteCommitOldMetal=function(){const gross=Number(jsOmGross.value||0),less=Number(jsOmLess.value||0),net=Math.max(0,gross-less),purity=Number(jsOmPurity.value||0),fine=net*purity/100,r=Number(jsOmRate.value||0);JS.oldMetal.push({metal:jsOmMetal.value,gross,less,net,purity,fine,rate:r,amount:fine*r});closeModal();renderBill()};
  window.jewelSuiteAddPayment=function(){JS.payments.push({mode:'Cash',amount:0,reference:''});renderBill()};
  window.jewelSuiteRemovePayment=function(i){JS.payments.splice(i,1);if(!JS.payments.length)JS.payments.push({mode:'Cash',amount:0,reference:''});renderBill()};
  window.JSuitePayment=function(i,k,v){JS.payments[i][k]=k==='amount'?Number(v||0):v};
  window.jewelSuiteRenderBill=renderBill;

  window.jewelSuiteSaveInvoice=async function(){
    if(!['retail','wholesale'].includes(JS.mode))return notify(invoiceModeName(JS.mode)+' design is enabled for Jewellery Shop; posting workflow will use its dedicated register.');
    if(!JS.cart.length)return notify('Add jewellery item first');
    try{
      const pay=JS.payments[0]?.mode||'Cash';
      const r=await api('/api/jewellery/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CustomerName:document.getElementById('jsCust')?.value||'Walk-in Customer',CustomerId:null,CustomerPan:null,GstRate:JS.current?.gstRate||3,OldMetalCredit:JS.current?.oldCredit||0,PaidAmount:JS.payments.reduce((a,x)=>a+Number(x.amount||0),0),PaymentMode:pay,Notes:document.getElementById('jsJewelNotes')?.value||('SuvidhaPOS Jewellery '+JS.mode+' invoice'),Lines:JS.cart.map(x=>({JewelleryItemId:x.Id,MetalRatePerGram:lineCalc(x).r,StoneValue:Number(x.StoneValue||0),MakingChargeType:x.MakingChargeType,MakingValue:Number(x.MakingValue||0)}))})});
      notify('Jewellery bill saved: '+r.invoiceNo);setTimeout(()=>loadJewelInvoices(),500);
    }catch(e){alert(e.message)}
  };

  async function ratesPage(){
    const rows=await api('/api/jewellery/metal-rates').catch(()=>[]);JS.rates=rows;
    appBox().innerHTML=`<div class="js-content">${pageHeading('Au/Ag Rates','Gold & silver internet reference + manual rate master','<button class="js-outline" onclick="jewelRefreshLiveRates()">↻ Internet Rate</button><button class="js-gold" onclick="openMetalRate()">＋ Manual Rate</button>')}<div class="js-card"><table class="js-clean-table"><thead><tr><th>Metal</th><th>Purity</th><th>Rate / Gram</th><th>Effective</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.MetalType)}</b></td><td>${esc(x.Purity)}</td><td class="js-gold-text">₹${money(x.RatePerGram)}</td><td>${new Date(x.EffectiveAt).toLocaleString('en-IN')}</td></tr>`).join('')||'<tr><td colspan="4" class="js-empty">No rates configured</td></tr>'}</tbody></table></div></div>`};
  window.loadJewelRates=ratesPage;
  window.loadJewelInvoices=invoices;
  window.jewelSuiteInvoice=invoice;
  window.jewelComingSoon=function(name){notify(name+' is available only in Jewellery Shop workspace; detailed transaction workflow can be added next.')};

  const canonicalStoreType=v=>/^(Gold & Diamond Jewellery|Silver Jewellery)$/i.test(String(v||'').trim())?'Jewellery Shop':String(v||'').trim();
  const prop=(s,a,b)=>s&&s[a]!==undefined?s[a]:(s&&s[b]!==undefined?s[b]:undefined);
  const isJewelleryProfile=s=>!!s&&(prop(s,'IsJewellery','isJewellery')===true||canonicalStoreType(prop(s,'StoreType','storeType'))==='Jewellery Shop');
  async function enable(profile){
    let s=profile;
    if(!s){
      try{s=await fetch('/public/specialization?_='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}}).then(r=>r.ok?r.json():null)}catch{}
    }
    if(!isJewelleryProfile(s)){
      // Ignore a stale/incomplete refresh after Jewellery mode is active.
      // A real outlet-type change already reloads the application from Outlet Master.
      if(JS.enabled||document.body.classList.contains('jewel-suite-mode'))return true;
      document.body.classList.remove('jewel-suite-mode');
      window.__jewelSuiteEnabled=false;JS.enabled=false;
      return false;
    }
    if(JS.enabled&&document.body.classList.contains('jewel-suite-mode'))return true;
    JS.enabled=true;window.__jewelSuiteEnabled=true;
    document.body.classList.add('jewel-suite-mode');
    document.body.dataset.storeType='jewellery-shop';
    shell();
    setTimeout(()=>window.jewelSyncLiveRates&&window.jewelSyncLiveRates(false),180);
    window.loadDashboard=dashboard;
    window.loadBilling=()=>invoice('retail');
    window.loadPurchase=()=>invoice('purchase');
    window.loadReports=()=>window.loadJewelReports?window.loadJewelReports():dashboard();
    const current=document.querySelector('#loginScreen');
    if(!current||getComputedStyle(current).display==='none'||document.body.getAttribute('data-authenticated')==='true')dashboard();
    return true;
  }
  window.applyJewelleryOutletMode=enable;
  window.addEventListener('suvidha:outlet-synced',e=>enable(e.detail));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>enable(window.suvidhaOutlet),0));else setTimeout(()=>enable(window.suvidhaOutlet),0);
})();
