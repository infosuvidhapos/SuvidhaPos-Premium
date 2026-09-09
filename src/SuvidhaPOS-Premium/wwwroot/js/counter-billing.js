(function(){
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  let selectedProduct=-1,selectedRow=-1,suggestIndex=0,paymentMode='Cash',paymentSubtype='Cash',multiPayments=[],uomCache={},selectedUom=null,cashEnterArmedAt=0,completing=false;
  const oldLoadBilling=window.loadBilling;
  async function loadCbUom(id,p){if(uomCache[id])return uomCache[id];try{uomCache[id]=await api('/api/products/'+id+'/uom')}catch{const base=String(p?.Unit||'PCS').trim().toUpperCase()||'PCS';uomCache[id]={BaseUnit:base,PackUnit:base,ConversionFactor:1,LooseSalePrice:Number(p?.SalePrice||0),AllowLoose:true}}return uomCache[id]}
  function cbTotalFactor(u){const inner=String(u.InnerUnit||'').trim(),inf=Math.max(1,Number(u.InnerConversionFactor)||1),pf=Math.max(1,Number(u.PackInnerFactor)||1);return inner?inf*pf:Math.max(1,Number(u.ConversionFactor)||pf||1)}
  function cbUnitChoices(p,u){const tf=cbTotalFactor(u),base=String(u.BaseUnit||p.Unit||'PCS').toUpperCase(),baseSale=Number(u.LooseSalePrice||0)||Number(p.SalePrice||0)||((Number(u.PackSalePrice)||0)/tf),baseMrp=(Number(u.PackMrp||0)>0?Number(u.PackMrp)/tf:Number(p.Mrp||0));const a=[{unit:base,factor:1,rate:baseSale,mrp:baseMrp,level:'BASE'}];const inner=String(u.InnerUnit||'').trim().toUpperCase(),inf=Math.max(1,Number(u.InnerConversionFactor)||1);if(inner&&inner!==base&&inf>1)a.push({unit:inner,factor:inf,rate:Number(u.InnerSalePrice||0)||baseSale*inf,mrp:Number(u.InnerMrp||0)||baseMrp*inf,level:'INNER'});const pack=String(u.PackUnit||'').trim().toUpperCase();if(pack&&pack!==base&&!a.some(x=>x.unit===pack)&&tf>1)a.push({unit:pack,factor:tf,rate:Number(u.PackSalePrice||0)||baseSale*tf,mrp:Number(u.PackMrp||0)||baseMrp*tf,level:'PACK'});return a}
  function cbStockText(stock,u){let q=Math.max(0,Number(stock)||0),parts=[],tf=cbTotalFactor(u),base=String(u.BaseUnit||'PCS').toUpperCase(),pack=String(u.PackUnit||'').toUpperCase(),inner=String(u.InnerUnit||'').toUpperCase(),inf=Math.max(1,Number(u.InnerConversionFactor)||1);if(pack&&pack!==base&&tf>1){const n=Math.floor(q/tf);if(n){parts.push(n+' '+pack);q-=n*tf}}if(inner&&inner!==base&&inf>1){const n=Math.floor(q/inf);if(n){parts.push(n+' '+inner);q-=n*inf}}if(q>0||!parts.length)parts.push(Number(q.toFixed(3))+' '+base);return parts.join(', ')}
  function cbBaseUsed(productId,exclude=-1){return (state.cart||[]).reduce((a,x,i)=>a+(i===exclude||x.Id!==productId?0:Number(x.Qty||0)*Number(x.Factor||1)),0)}
  function cbChoice(){if(!selectedUom)return null;const unit=document.querySelector('#cbUom')?.value;return selectedUom.options.find(x=>x.unit===unit)||selectedUom.options[0]}
  function applyCbChoice(choice){if(!choice||!selectedUom)return;const p=selectedUom.product;document.querySelector('#cbRate').value=Number(choice.rate||0).toFixed(2);document.querySelector('#cbMrp').value=Number(choice.mrp||0).toFixed(2);const av=Math.max(0,(Number(p.Stock||0)-cbBaseUsed(p.Id))/choice.factor);document.querySelector('#cbAvl').textContent=Number(av.toFixed(3));document.querySelector('#cbAvl').parentElement.title='Base stock: '+cbStockText(p.Stock,selectedUom.uom)}
  window.cbUomChanged=function(){applyCbChoice(cbChoice())};
  window.cbCycleUom=function(){if(!selectedUom)return toast('Select item first');const sel=document.querySelector('#cbUom');if(!sel||sel.options.length<2)return;sel.selectedIndex=(sel.selectedIndex+1)%sel.options.length;cbUomChanged();sel.focus()};


  function lineTaxParts(x){
    const gross=Number(x.Qty||0)*Number(x.Rate||0),rate=Math.max(0,Number(x.Gst||0)),inclusive=String(x.TaxMode||'EXCLUSIVE').toUpperCase()==='INCLUSIVE';
    const tax=rate<=0?0:(inclusive?gross*rate/(100+rate):gross*rate/100);
    const taxable=inclusive?gross-tax:gross;
    return {taxable,tax,gross:inclusive?gross:gross+tax};
  }
  function discountInfo(){
    const type=document.querySelector('#cbDiscountType')?.value||'RUPEES';
    const value=Math.max(0,Number(document.querySelector('#cbDiscountValue')?.value)||0);
    const gross=(state.cart||[]).reduce((a,x)=>a+lineTaxParts(x).gross,0);
    const amount=type==='PERCENT'?gross*Math.min(100,value)/100:value;
    return {type,value,amount:Math.min(amount,gross)};
  }
  function totals(){
    const parts=(state.cart||[]).map(lineTaxParts);
    const sub=parts.reduce((a,x)=>a+x.taxable,0),tax=parts.reduce((a,x)=>a+x.tax,0),gross=parts.reduce((a,x)=>a+x.gross,0);
    const d=discountInfo();
    return {sub,tax,discount:d.amount,total:Math.max(0,gross-d.amount)};
  }
  function ensureHidden(){
    const root=document.querySelector('.counter-billing');if(!root)return;
    if(!document.querySelector('#cbDiscountType'))root.insertAdjacentHTML('beforeend','<input type="hidden" id="cbDiscountType" value="RUPEES"><input type="hidden" id="cbDiscountValue" value="0">');
  }

  async function renderCounterBilling(){
    setPage('billing');title.textContent='New Billing';document.querySelector('header p').textContent='Keyboard-first counter billing';
    state.products=await api('/api/products?size=500');state.cart=[];selectedProduct=-1;selectedRow=-1;suggestIndex=0;paymentMode='Cash';paymentSubtype='Cash';multiPayments=[];cashEnterArmedAt=0;completing=false;
    app.innerHTML=`<div class="counter-billing">
      <div class="cb-head"><div>🧾 New Invoice (Sale)</div><div class="cb-billno">Bill No : <b id="cbBillNo">New</b></div><div class="cb-type">Counter Sale · Keyboard Ready</div></div>
      <div class="cb-shortcuts"><span>↑↓ Select Item</span><span>Enter Next Field</span><span>Enter×2 Cash Print</span><span>F1 Discount</span><span>F2 Unit</span><span>F3 Customer</span><span>F4 Reset</span><span>F6 Cash</span><span>F7 Credit/UPI</span><span>F8 BTC</span><span>F9 Multi Mode</span><span>F10 Save/Print</span><span>Esc Back</span></div>
      <div class="cb-inputbar">
        <label class="cb-field">Barcode / Item Name<input id="cbSearch" autocomplete="off" placeholder="Type item, use ↑↓, Enter" autofocus></label>
        <label class="cb-field">Item Name<input id="cbItemName" readonly tabindex="-1" placeholder="Select item"></label>
        <div class="cb-available">Avl Qty <b id="cbAvl">0.000</b></div>
        <label class="cb-field">UOM<select id="cbUom"><option value="">—</option></select></label>
        <label class="cb-field">Quantity<input id="cbQty" type="number" min="0.001" step="0.001" value="1"></label>
        <label class="cb-field">Sale Price<input id="cbRate" type="number" step="0.01" value="0"></label>
        <label class="cb-field">MRP<input id="cbMrp" type="number" step="0.01" value="0"></label>
        <button class="cb-iconbtn add" onclick="cbAddSelected()" title="Add item (Enter)">＋</button>
        <button class="cb-iconbtn remove" onclick="cbRemoveSelected()" title="Remove selected (Delete)">✕</button>
      </div>
      <div id="cbSuggest" class="cb-suggestions" style="display:none"></div>
      <div class="cb-main">
        <div class="cb-table-wrap"><table class="cb-table"><thead><tr><th>Item Code</th><th>Item Name</th><th>Sale Price</th><th>UOM</th><th>Qty</th><th>Amount</th><th>MRP</th><th>Edit</th></tr></thead><tbody id="cbRows"></tbody></table></div>
        <div class="cb-pay">
          <button class="cash selected" data-mode="Cash" onclick="cbPaySelect('Cash')">💵 Cash<br><small>F6</small></button>
          <button data-mode="Credit/UPI" onclick="cbOpenCreditUpi()">💳 Credit / UPI<br><small>F7</small></button>
          <button data-mode="BTC" onclick="cbPaySelect('BTC')">₿ BTC<br><small>F8</small></button>
          <button data-mode="Multi Mode" onclick="cbOpenMulti()">▦ Multi Mode<br><small>F9</small></button>
        </div>
      </div>
      <div class="cb-countbar"><span>No of Item <b id="cbItemCount">0</b></span><span>Total Qty <b id="cbQtyTotal">0.00</b></span><span>Payment <b id="cbPaymentLabel">Cash</b></span></div>
      <div class="cb-customer"><span class="cb-label">Mobile(F3)</span><input id="cbMobile"><span class="cb-label">Name</span><input id="cbCustomer" value="Walk-in Customer"><span class="cb-label">GSTNo</span><input id="cbGstNo"><span class="cb-label">Remarks</span><input id="cbRemarks"><span class="cb-label">State</span><select id="cbState"><option>Uttar Pradesh</option><option>Bihar</option><option>Delhi</option><option>Other</option></select></div>
      <div class="cb-totals"><div class="cb-total-lines"><div>Subtotal <b id="cbSub">₹0.00</b></div><div>Discount <b id="cbDisc">₹0.00</b><small id="cbDiscLabel">₹0.00</small></div><div>Tax <b id="cbTax">₹0.00</b></div></div><div class="cb-total-box"><div class="cb-total-row payable"><span>Amount Payable :</span><span class="cb-payable" id="cbTotal">₹0.00</span></div><div class="cb-total-row"><span>Payment Mode :</span><span class="cb-tender" id="cbTender">Cash</span></div><div class="cb-total-row"><span>Balance :</span><span class="cb-balance" id="cbBalance">₹0.00</span></div></div></div>
      <div class="cb-actions"><button class="discount" onclick="cbDiscount()">Discount (F1)</button><button class="hold" onclick="document.querySelector('#cbMobile').focus()">Customer (F3)</button><button class="clear" onclick="cbReset()">Reset (F4)</button><button class="print" onclick="cbComplete()">✓ Save & Print (F10)</button><button class="back" onclick="loadDashboard()">Back (Esc)</button></div>
    </div>`;
    ensureHidden();
    const search=document.querySelector('#cbSearch'),qty=document.querySelector('#cbQty'),rate=document.querySelector('#cbRate'),mrp=document.querySelector('#cbMrp'),uom=document.querySelector('#cbUom');
    uom.addEventListener('change',()=>{cashEnterArmedAt=0;cbUomChanged()});
    uom.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();qty.focus();qty.select()}});
    search.addEventListener('input',()=>{cashEnterArmedAt=0;cbSearch()});
    search.addEventListener('keydown',async e=>{
      const q=search.value.trim(),list=getSuggestions();
      if(e.key==='ArrowDown'){e.preventDefault();cashEnterArmedAt=0;if(list.length){suggestIndex=Math.min(list.length-1,suggestIndex+1);renderSuggestions(list)}return}
      if(e.key==='ArrowUp'){e.preventDefault();cashEnterArmedAt=0;if(list.length){suggestIndex=Math.max(0,suggestIndex-1);renderSuggestions(list)}return}
      if(e.key==='Enter'){
        e.preventDefault();
        if(!q){
          if(!state.cart.length)return toast('Search and add an item first');
          const now=Date.now();
          if(now-cashEnterArmedAt<=1200){
            cashEnterArmedAt=0;cbPaySelect('Cash');await cbComplete();return;
          }
          cashEnterArmedAt=now;cbPaySelect('Cash');toast('Cash ready — press Enter again to Save & Print');return;
        }
        cashEnterArmedAt=0;
        const exact=list.find(x=>(x.Barcode||'').toLowerCase()===q.toLowerCase());
        const p=exact||list[suggestIndex]||list[0];
        if(p)await cbPick(p.Id);else toast('No matching item');
        return
      }
      if(e.key==='Escape'){cashEnterArmedAt=0;cbHideSuggest()}
    });
    qty.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();rate.focus();rate.select()}});
    rate.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();mrp.focus();mrp.select()}});
    mrp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();cbAddSelected()}});
    document.removeEventListener('keydown',cbKeys);
    document.addEventListener('keydown',cbKeys);
    cbRender();search.focus();
    const sales=await api('/api/sales?from=1900-01-01&to=2999-12-31').catch(()=>[]);
    if(Array.isArray(sales)&&sales.length)document.querySelector('#cbBillNo').textContent=Math.max(...sales.map(x=>Number(x.Id)||0))+1;
  }

  function getSuggestions(){
    const q=(document.querySelector('#cbSearch')?.value||'').trim().toLowerCase();
    if(!q)return [];
    const score=x=>{const name=String(x.Name||'').toLowerCase(),bc=String(x.Barcode||'').toLowerCase(),sku=String(x.Sku||'').toLowerCase();if(name.startsWith(q))return 0;if(bc.startsWith(q))return 1;if(sku.startsWith(q))return 2;return 3};
    return state.products.filter(x=>(x.Name+' '+(x.Barcode||'')+' '+(x.Sku||'')+' '+(x.LocationCode||'')+' '+(x.RackName||'')).toLowerCase().includes(q)).sort((a,b)=>score(a)-score(b)||String(a.Name||'').localeCompare(String(b.Name||'')));
  }
  function renderSuggestions(list){
    const box=document.querySelector('#cbSuggest');if(!box)return;
    if(suggestIndex>=list.length)suggestIndex=Math.max(0,list.length-1);
    box.innerHTML=list.map((x,i)=>`<div class="cb-suggestion ${i===suggestIndex?'active':''}" onclick="cbPick(${x.Id})"><div><b>${esc(x.Name)}</b><small>${esc(x.Barcode||x.Sku||'')} · ${esc(x.Unit||'')} · Stock ${money(x.Stock)} · Rack ${esc(x.LocationCode||x.RackName||'-')} · ₹${money(x.SalePrice)}</small></div><span>Enter</span></div>`).join('');
    box.style.display=list.length?'block':'none';
    box.querySelector('.cb-suggestion.active')?.scrollIntoView({block:'nearest'});
  }
  function cbSearch(){suggestIndex=0;renderSuggestions(getSuggestions())}
  async function cbPick(id){
    const p=state.products.find(x=>x.Id===id);if(!p)return;
    const u=await loadCbUom(id,p),options=cbUnitChoices(p,u);
    selectedProduct=id;selectedUom={product:p,uom:u,options};cashEnterArmedAt=0;
    document.querySelector('#cbSearch').value=p.Barcode||p.Name;
    document.querySelector('#cbItemName').value=p.Name;
    document.querySelector('#cbUom').innerHTML=options.map(o=>`<option value="${esc(o.unit)}">${esc(o.unit)} ×${o.factor}${o.level==='BASE'?' · BASE':''}</option>`).join('');
    const baseChoice=options.find(x=>x.level==='BASE')||options[0];document.querySelector('#cbUom').value=baseChoice.unit;
    applyCbChoice(baseChoice);cbHideSuggest();document.querySelector('#cbUom').focus()
  }
  window.cbPick=cbPick;

  window.cbAddSelected=function(){
    if(selectedProduct<0||!selectedUom)return toast('Select an item first');
    const p=selectedUom.product,choice=cbChoice();if(!p||!choice)return;
    const qty=Math.max(.001,Number(document.querySelector('#cbQty').value)||1),factor=Math.max(1,Number(choice.factor)||1),baseNeed=qty*factor;
    const used=cbBaseUsed(p.Id);
    if(used+baseNeed>Number(p.Stock||0))return toast('Available: '+cbStockText(Math.max(0,Number(p.Stock||0)-used),selectedUom.uom));
    const rate=Math.max(0,Number(document.querySelector('#cbRate').value)||choice.rate||0),mrp=Math.max(0,Number(document.querySelector('#cbMrp').value)||choice.mrp||0);
    let c=state.cart.find(x=>x.Id===selectedProduct&&x.Uom===choice.unit);
    if(c)c.Qty+=qty;
    else state.cart.push({Id:p.Id,Name:p.Name,Barcode:p.Barcode||p.Sku||p.Id,Qty:qty,Rate:rate,Gst:Number(p.GstRate||0),TaxMode:String(p.TaxMode||'EXCLUSIVE').toUpperCase(),Mrp:mrp,Uom:choice.unit,BaseUnit:selectedUom.uom.BaseUnit||p.Unit||'PCS',Factor:factor,Stock:Number(p.Stock||0)});
    selectedRow=state.cart.findIndex(x=>x.Id===p.Id&&x.Uom===choice.unit);
    selectedProduct=-1;selectedUom=null;cashEnterArmedAt=0;document.querySelector('#cbQty').value=1;document.querySelector('#cbSearch').value='';document.querySelector('#cbItemName').value='';document.querySelector('#cbAvl').textContent='0.000';document.querySelector('#cbUom').innerHTML='<option value="">—</option>';document.querySelector('#cbRate').value='0';document.querySelector('#cbMrp').value='0';cbRender();document.querySelector('#cbSearch').focus()
  };
  window.cbRemoveSelected=function(){if(selectedRow>=0&&state.cart[selectedRow])state.cart.splice(selectedRow,1);else if(state.cart.length)state.cart.pop();selectedRow=Math.min(selectedRow,state.cart.length-1);cbRender()};
  window.cbSelectRow=function(i){selectedRow=i;cbRender()};
  window.cbQty=function(i,v){const c=state.cart[i];if(!c)return;const n=Math.max(.001,Number(v)||.001),used=cbBaseUsed(c.Id,i);if(used+n*c.Factor>c.Stock)return toast('Stock limit reached');c.Qty=n;cbRender()};
  window.cbEdit=async function(i){
    selectedRow=i;const c=state.cart[i];if(!c)return;const p=state.products.find(x=>x.Id===c.Id),u=await loadCbUom(c.Id,p),options=cbUnitChoices(p,u);selectedProduct=c.Id;selectedUom={product:p,uom:u,options};
    document.querySelector('#cbItemName').value=c.Name;document.querySelector('#cbSearch').value=c.Barcode||c.Name;document.querySelector('#cbUom').innerHTML=options.map(o=>`<option value="${esc(o.unit)}">${esc(o.unit)} ×${o.factor}</option>`).join('');document.querySelector('#cbUom').value=c.Uom;document.querySelector('#cbRate').value=c.Rate;document.querySelector('#cbMrp').value=c.Mrp;document.querySelector('#cbQty').value=c.Qty;applyCbChoice(options.find(o=>o.unit===c.Uom)||options[0]);document.querySelector('#cbRate').value=c.Rate;document.querySelector('#cbMrp').value=c.Mrp;document.querySelector('#cbRate').focus();document.querySelector('#cbRate').select();cbRender()
  };

  function cbRender(){const rows=document.querySelector('#cbRows');if(!rows)return;rows.innerHTML=state.cart.map((x,i)=>`<tr class="${selectedRow===i?'selected':''}" onclick="cbSelectRow(${i})"><td>${esc(x.Barcode)}</td><td class="name">${esc(x.Name)}</td><td>${money(x.Rate)}</td><td><b>${esc(x.Uom)}</b><br><small>×${x.Factor} ${esc(x.BaseUnit)}</small></td><td><input class="qty" type="number" min=".001" step=".001" value="${x.Qty}" onclick="event.stopPropagation()" onchange="cbQty(${i},this.value)"></td><td>${money(x.Qty*x.Rate)}</td><td>${money(x.Mrp)}</td><td><button class="cb-edit" onclick="event.stopPropagation();cbEdit(${i})">✎</button></td></tr>`).join('')||'<tr><td colspan="8" class="empty">No items in invoice</td></tr>';const t=totals(),d=discountInfo();document.querySelector('#cbItemCount').textContent=state.cart.length;document.querySelector('#cbQtyTotal').textContent=state.cart.reduce((a,x)=>a+x.Qty,0).toFixed(2);document.querySelector('#cbSub').textContent='₹'+money(t.sub);document.querySelector('#cbDisc').textContent='₹'+money(t.discount);document.querySelector('#cbDiscLabel').textContent=d.type==='PERCENT'?d.value+'%':'₹'+money(d.value);document.querySelector('#cbTax').textContent='₹'+money(t.tax);document.querySelector('#cbTotal').textContent='₹'+money(t.total);document.querySelector('#cbTender').textContent=paymentMode+(paymentMode==='Credit/UPI'?' · '+paymentSubtype:'');document.querySelector('#cbPaymentLabel').textContent=paymentMode+(paymentMode==='Credit/UPI'?' · '+paymentSubtype:'');document.querySelector('#cbBalance').textContent='₹0.00'}

  window.cbDiscount=function(){
    ensureHidden();
    modal('Bill Discount',`<div class="formgrid"><label>Discount Type<select id="discTypeDlg" class="select"><option value="RUPEES">Rupees ₹</option><option value="PERCENT">Percentage %</option></select></label><label>Value<input id="discValueDlg" class="input" type="number" min="0" step="0.01" value="${document.querySelector('#cbDiscountValue').value}"></label></div><div class="muted" style="margin-top:10px">F1 opens this discount master. Percentage is calculated on subtotal.</div>`,`<button class="btn" onclick="cbApplyDiscount()">Apply Discount</button>`);
    document.querySelector('#discTypeDlg').value=document.querySelector('#cbDiscountType').value;setTimeout(()=>{document.querySelector('#discValueDlg')?.focus();document.querySelector('#discValueDlg')?.select()},50)
  };
  window.cbApplyDiscount=function(){document.querySelector('#cbDiscountType').value=document.querySelector('#discTypeDlg').value;document.querySelector('#cbDiscountValue').value=Math.max(0,Number(document.querySelector('#discValueDlg').value)||0);closeModal();cbRender();document.querySelector('#cbSearch')?.focus()};

  window.cbPaySelect=function(mode,subtype){paymentMode=mode;paymentSubtype=subtype||mode;multiPayments=[];document.querySelectorAll('.cb-pay button').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));cbRender()};
  window.cbOpenCreditUpi=function(){const t=totals();modal('Credit / UPI',`<div class="formgrid"><label>Type<select id="cupType" class="select"><option>UPI</option><option>Credit</option></select></label><label>Amount<input id="cupAmount" class="input" type="number" value="${t.total.toFixed(2)}"></label><label class="full">Reference / UTR<input id="cupRef" class="input"></label></div>`,`<button class="btn" onclick="cbApplyCreditUpi()">Use Credit / UPI</button>`)};
  window.cbApplyCreditUpi=function(){const type=document.querySelector('#cupType').value,amount=Math.max(0,Number(document.querySelector('#cupAmount').value)||0),ref=document.querySelector('#cupRef').value||null;paymentMode='Credit/UPI';paymentSubtype=type;multiPayments=[{Mode:'Credit/UPI',Type:type,Amount:amount,ReferenceNo:ref}];closeModal();document.querySelectorAll('.cb-pay button').forEach(b=>b.classList.toggle('selected',b.dataset.mode==='Credit/UPI'));cbRender();document.querySelector('#cbSearch')?.focus()};

  window.cbOpenMulti=function(){const t=totals();multiPayments=[];modal('Multi Mode Payment',`<div class="panel"><div class="metricrow"><div class="mini">Payable<b>₹${money(t.total)}</b></div><div class="mini">Allocated<b id="mpAllocated">₹0.00</b></div><div class="mini">Balance<b id="mpBalance">₹${money(t.total)}</b></div></div><div class="formgrid" style="margin-top:12px"><label>Mode<select id="mpMode" class="select"><option>Cash</option><option>Credit</option><option>UPI</option><option>BTC</option></select></label><label>Amount<input id="mpAmount" class="input" type="number" min="0" step="0.01"></label><label>Reference<input id="mpRef" class="input"></label></div><div class="toolbar"><button class="btn" onclick="cbMultiAdd()">Add</button><button class="btn secondary" onclick="multiPayments.pop();cbMultiRender()">Remove Last</button></div><div class="tablewrap"><table class="table"><thead><tr><th>MODE</th><th>AMOUNT</th><th>REFERENCE</th></tr></thead><tbody id="mpRows"></tbody></table></div></div>`,`<button class="btn" onclick="cbApplyMulti()">Use Multi Mode</button>`);cbMultiRender();setTimeout(()=>document.querySelector('#mpAmount')?.focus(),30)};
  window.cbMultiAdd=function(){const amount=Math.max(0,Number(document.querySelector('#mpAmount').value)||0);if(!amount)return toast('Enter amount');const due=totals().total,sum=multiPayments.reduce((a,x)=>a+x.Amount,0);if(sum+amount>due+0.01)return toast('Amount exceeds balance');const type=document.querySelector('#mpMode').value;multiPayments.push({Mode:'Multi Mode',Type:type,Amount:amount,ReferenceNo:document.querySelector('#mpRef').value||null});document.querySelector('#mpAmount').value='';document.querySelector('#mpRef').value='';cbMultiRender()};
  window.cbMultiRender=function(){const due=totals().total,sum=multiPayments.reduce((a,x)=>a+x.Amount,0);const rows=document.querySelector('#mpRows');if(rows)rows.innerHTML=multiPayments.map(x=>`<tr><td>${esc(x.Type)}</td><td>₹${money(x.Amount)}</td><td>${esc(x.ReferenceNo||'')}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">No allocation</td></tr>';if(document.querySelector('#mpAllocated'))document.querySelector('#mpAllocated').textContent='₹'+money(sum);if(document.querySelector('#mpBalance'))document.querySelector('#mpBalance').textContent='₹'+money(due-sum)};
  window.cbApplyMulti=function(){const due=totals().total,sum=multiPayments.reduce((a,x)=>a+x.Amount,0);if(Math.abs(due-sum)>.01)return toast('Allocate full payable amount first');paymentMode='Multi Mode';paymentSubtype='Multi Mode';closeModal();document.querySelectorAll('.cb-pay button').forEach(b=>b.classList.toggle('selected',b.dataset.mode==='Multi Mode'));cbRender();document.querySelector('#cbSearch')?.focus()};

  window.cbReset=function(){state.cart=[];selectedProduct=-1;selectedRow=-1;selectedUom=null;cashEnterArmedAt=0;completing=false;paymentMode='Cash';paymentSubtype='Cash';multiPayments=[];ensureHidden();document.querySelector('#cbDiscountType').value='RUPEES';document.querySelector('#cbDiscountValue').value='0';cbRender();document.querySelector('#cbSearch')?.focus()};
  window.cbComplete=async function(){if(completing)return;if(!state.cart.length)return toast('Add item first');const d=discountInfo(),t=totals();if(paymentMode==='Multi Mode'&&Math.abs(multiPayments.reduce((a,x)=>a+x.Amount,0)-t.total)>.01)return cbOpenMulti();if(paymentMode==='Credit/UPI'&&!multiPayments.length)multiPayments=[{Mode:'Credit/UPI',Type:paymentSubtype||'UPI',Amount:t.total,ReferenceNo:null}];if(paymentMode==='Cash')multiPayments=[{Mode:'Cash',Type:'Cash',Amount:t.total,ReferenceNo:null}];if(paymentMode==='BTC')multiPayments=[{Mode:'BTC',Type:'BTC',Amount:t.total,ReferenceNo:null}];completing=true;try{const customer=document.querySelector('#cbCustomer').value||'Walk-in Customer';const paid=multiPayments.filter(x=>x.Type!=='Credit').reduce((a,x)=>a+x.Amount,0);const data=await api('/api/premium/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CustomerId:null,CustomerName:customer,PaymentMode:paymentMode,PaidAmount:paid,DiscountType:d.type,DiscountValue:d.value,Notes:document.querySelector('#cbRemarks').value||null,Payments:multiPayments,Lines:state.cart.map(x=>({ProductId:x.Id,Qty:x.Qty*x.Factor,SalePrice:x.Rate/x.Factor,TaxRate:x.Gst,TaxMode:x.TaxMode||'EXCLUSIVE',Discount:0,UnitSold:x.Uom,SoldQty:x.Qty,BaseQty:x.Qty*x.Factor,RatePerSoldUnit:x.Rate}))})});toast('Bill completed: '+data.invoiceNo);if(typeof printLastBill==='function')printLastBill(data.id);setTimeout(renderCounterBilling,650)}catch(e){completing=false;alert(e.message)}};

  function cbKeys(e){if(state.page!=='billing'||!document.querySelector('.counter-billing'))return;const tag=(document.activeElement?.tagName||'').toLowerCase();if(e.key==='F1'){e.preventDefault();cbDiscount();return}if(e.key==='F2'){e.preventDefault();cbCycleUom();return}if(e.key==='F3'){e.preventDefault();document.querySelector('#cbMobile')?.focus();return}if(e.key==='F4'){e.preventDefault();cbReset();return}if(e.key==='F6'){e.preventDefault();cbPaySelect('Cash');return}if(e.key==='F7'){e.preventDefault();cbOpenCreditUpi();return}if(e.key==='F8'){e.preventDefault();cbPaySelect('BTC');return}if(e.key==='F9'){e.preventDefault();cbOpenMulti();return}if(e.key==='F10'){e.preventDefault();cbComplete();return}if(e.key==='Escape'){e.preventDefault();loadDashboard();return}if(tag==='input'||tag==='select'||tag==='textarea')return;if(e.key==='Delete'){e.preventDefault();cbRemoveSelected();return}if((e.key==='+'||e.key==='=')&&selectedRow>=0&&state.cart[selectedRow]){e.preventDefault();const c=state.cart[selectedRow];if(cbBaseUsed(c.Id,selectedRow)+(c.Qty+1)*c.Factor<=c.Stock)c.Qty++;else toast('Stock limit reached');cbRender();return}if(e.key==='-'&&selectedRow>=0&&state.cart[selectedRow]){e.preventDefault();state.cart[selectedRow].Qty=Math.max(.001,state.cart[selectedRow].Qty-1);cbRender()}}
  function cbHideSuggest(){const b=document.querySelector('#cbSuggest');if(b)b.style.display='none'}

  window.loadCounterBillingUom=renderCounterBilling;
  window.loadBilling=async function(){try{const s=await api('/api/specialization');if(s.IsJewellery)return oldLoadBilling();return renderCounterBilling()}catch{return renderCounterBilling()}};
})();
