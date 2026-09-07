(function(){
  const S={mode:'retail',uoms:{},spec:null,items:[],suppliers:[],purLines:[],uomCart:[],jCart:[],oldCredit:0};
  window.S=S;
  const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money2=x=>Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  async function spec(){try{S.spec=await api('/api/specialization');S.mode=S.spec.IsJewellery?'jewellery':'uom';document.body.dataset.storeType=(S.spec.StoreType||'').replace(/[^a-z0-9]+/gi,'-').toLowerCase();}catch{S.mode='uom'}return S.mode}
  async function loadUom(id,force=false){if(!force&&S.uoms[id])return S.uoms[id];S.uoms[id]=await api('/api/products/'+id+'/uom');return S.uoms[id]}
  function navTitle(t,sub){title.textContent=t;document.querySelector('header p').textContent=sub}
  function totalFactor(u){const inner=String(u.InnerUnit||'').trim();const innerFactor=Math.max(1,Number(u.InnerConversionFactor)||1);const packFactor=Math.max(1,Number(u.PackInnerFactor)||1);return inner?innerFactor*packFactor:Math.max(1,Number(u.ConversionFactor)||packFactor||1)}
  function baseRates(p,u){const tf=totalFactor(u);return {
    purchase:Number(p.PurchasePrice||0)||((Number(u.PackPurchaseRate)||0)/tf),
    mrp:Number(p.Mrp||0)||((Number(u.PackMrp)||0)/tf),
    sale:Number(u.LooseSalePrice||0)||Number(p.SalePrice||0)||((Number(u.PackSalePrice)||0)/tf)
  }}
  function uomChoices(p,u){
    const b=baseRates(p,u),arr=[],base=String(u.BaseUnit||p.Unit||'PCS').toUpperCase();
    arr.push({unit:base,factor:1,purchase:b.purchase,mrp:b.mrp,sale:b.sale,level:'BASE'});
    const iu=String(u.InnerUnit||'').trim().toUpperCase(),inf=Math.max(1,Number(u.InnerConversionFactor)||1);
    if(iu&&iu!==base&&inf>1)arr.push({unit:iu,factor:inf,purchase:Number(u.InnerPurchaseRate||0)||b.purchase*inf,mrp:Number(u.InnerMrp||0)||b.mrp*inf,sale:Number(u.InnerSalePrice||0)||b.sale*inf,level:'INNER'});
    const pu=String(u.PackUnit||'').trim().toUpperCase(),pf=totalFactor(u);
    if(pu&&pu!==base&&!arr.some(x=>x.unit===pu)&&pf>1)arr.push({unit:pu,factor:pf,purchase:Number(u.PackPurchaseRate||0)||b.purchase*pf,mrp:Number(u.PackMrp||0)||b.mrp*pf,sale:Number(u.PackSalePrice||0)||b.sale*pf,level:'PACK'});
    return arr;
  }
  function stockDisplay(q,u){
    q=Math.max(0,Number(q)||0);const parts=[],tf=totalFactor(u),base=String(u.BaseUnit||'PCS').toUpperCase(),pack=String(u.PackUnit||'').toUpperCase(),inner=String(u.InnerUnit||'').toUpperCase(),inf=Math.max(1,Number(u.InnerConversionFactor)||1);
    if(pack&&pack!==base&&tf>1){const n=Math.floor(q/tf);if(n){parts.push(n+' '+pack);q-=n*tf}}
    if(inner&&inner!==base&&inf>1){const n=Math.floor(q/inf);if(n){parts.push(n+' '+inner);q-=n*inf}}
    if(q>0||!parts.length)parts.push(Number(q.toFixed(3))+' '+base);
    return parts.join(', ');
  }
  window.formatBaseStock=stockDisplay;

  window.loadProducts=async function(){
    await spec();if(S.mode==='jewellery')return loadJewelleryCatalog();
    setPage('products');navTitle('Items & Inventory','Inventory is always maintained in the smallest Base Unit');
    try{
      const rows=await api('/api/products?size=500');S.items=rows;
      app.innerHTML='<div class="content"><div class="toolbar"><input id="pq2" class="input" placeholder="Search item, barcode, SKU, location..." oninput="filterTable(\'uomRows\',this.value)"><button class="btn" onclick="openUomProduct()">＋ Add Item</button><button class="btn secondary" onclick="loadStock()">Stock View</button></div><div class="panel"><div class="panelhead"><div><h3>ITEM MASTER + MULTI UNIT</h3><p class="muted">Example: 1 BOX = 10 STRIP = 100 TABLET. Database stock remains TABLET.</p></div><span class="tag">BASE UNIT STOCK</span></div><div class="tablewrap"><table class="table"><thead><tr><th>ITEM</th><th>BASE</th><th>INNER</th><th>PACK</th><th>CONVERSION</th><th>STOCK</th><th>PACK MRP</th><th>LOOSE SALE</th><th>RACK</th><th></th></tr></thead><tbody id="uomRows">'+rows.map(x=>'<tr data-id="'+x.Id+'"><td><b>'+esc2(x.Name)+'</b><br><small class="muted">'+esc2(x.Barcode||x.Sku||'')+'</small></td><td>...</td><td>...</td><td>...</td><td>...</td><td>'+money2(x.Stock)+'</td><td>₹'+money2(x.Mrp)+'</td><td>₹'+money2(x.SalePrice)+'</td><td>'+esc2(x.LocationCode||x.RackName||'-')+'</td><td><button class="btn small" onclick="openUomProduct('+x.Id+')">Edit</button></td></tr>').join('')+'</tbody></table></div></div></div>';
      for(const x of rows){
        const u=await loadUom(x.Id),tr=document.querySelector('#uomRows tr[data-id="'+x.Id+'"]');if(!tr)continue;
        const tf=totalFactor(u),inner=String(u.InnerUnit||'').trim();
        tr.children[1].textContent=u.BaseUnit||x.Unit||'PCS';
        tr.children[2].textContent=inner||'-';
        tr.children[3].textContent=u.PackUnit||'-';
        tr.children[4].textContent=inner?'1 '+u.PackUnit+' = '+u.PackInnerFactor+' '+inner+' = '+tf+' '+u.BaseUnit:'1 '+u.PackUnit+' = '+tf+' '+u.BaseUnit;
        tr.children[5].innerHTML='<b>'+esc2(stockDisplay(x.Stock,u))+'</b><br><small class="muted">'+money2(x.Stock)+' '+esc2(u.BaseUnit)+'</small>';
        tr.children[6].textContent='₹'+money2(u.PackMrp||0);
        tr.children[7].textContent='₹'+money2(u.LooseSalePrice||x.SalePrice||0);
      }
    }catch(e){app.innerHTML=errorBox(e)}
  };

  window.openUomProduct=async function(id){
    let x={Name:'',Barcode:'',Sku:'',Category:'General',Unit:'PCS',Hsn:'',GstRate:0,Mrp:0,PurchasePrice:0,SalePrice:0,MinStock:5,MaxStock:0,LocationCode:'',RackName:'',TrackBatch:true,TrackExpiry:true};
    if(id)x=await api('/api/products/'+id);
    const u=id?await loadUom(id):{BaseUnit:'PCS',InnerUnit:'',PackUnit:'BOX',ConversionFactor:1,InnerConversionFactor:1,PackInnerFactor:1,PackPurchaseRate:0,PackMrp:0,PackSalePrice:0,InnerPurchaseRate:0,InnerMrp:0,InnerSalePrice:0,LooseSalePrice:x.SalePrice||0,AllowLoose:true};
    const tf=totalFactor(u),inner=String(u.InnerUnit||''),innerFactor=Math.max(1,Number(u.InnerConversionFactor)||1),packFactor=inner?Math.max(1,Number(u.PackInnerFactor)||1):tf,b=baseRates(x,u);
    const ip=Number(u.InnerPurchaseRate||0)||b.purchase*innerFactor,im=Number(u.InnerMrp||0)||b.mrp*innerFactor,is=Number(u.InnerSalePrice||0)||b.sale*innerFactor;
    const pp=Number(u.PackPurchaseRate||0)||b.purchase*tf,pm=Number(u.PackMrp||0)||b.mrp*tf,ps=Number(u.PackSalePrice||0)||b.sale*tf;
    modal((id?'Edit':'Add')+' Item — Multi Unit',`<div class="formgrid">
      <label class="full">Item Name<input id="unm" class="input" value="${esc2(x.Name)}"></label>
      <label>Barcode<input id="ubc" class="input" value="${esc2(x.Barcode)}"></label><label>SKU<input id="usk" class="input" value="${esc2(x.Sku)}"></label>
      <label>Category<input id="ucat" class="input" value="${esc2(x.Category)}"></label><label>HSN/SAC<input id="uhsn" class="input" value="${esc2(x.Hsn)}"></label>
      <label>GST %<input id="ugst" class="input" type="number" step="0.01" value="${x.GstRate}"></label>
      <label>Location Code<input id="uloc" class="input" value="${esc2(x.LocationCode||'')}"></label><label>Rack Name<input id="urack" class="input" value="${esc2(x.RackName||'')}"></label>
    </div>
    <div class="uom-card"><div class="uom-title">📦 MULTI-UNIT CONVERSION — BASE STOCK RULE</div>
      <div class="uom-help">Stock is ALWAYS stored in Base Unit. For example: BOX → STRIP → TABLET. Inner Unit is optional.</div>
      <div class="formgrid">
        <label>Base Unit (smallest)<input id="ubase" class="input" value="${esc2(u.BaseUnit||'PCS')}" placeholder="TABLET / PCS"></label>
        <label>Inner Unit (optional)<input id="uinner" class="input" value="${esc2(inner)}" placeholder="STRIP"></label>
        <label>1 Inner = Base Qty<input id="uinnerfactor" class="input" type="number" min="1" step="0.001" value="${innerFactor}" oninput="refreshUomPreview()"></label>
        <label>Pack Unit<input id="upack" class="input" value="${esc2(u.PackUnit||'BOX')}" placeholder="BOX"></label>
        <label>1 Pack = Inner/Base Qty<input id="upackfactor" class="input" type="number" min="1" step="0.001" value="${packFactor}" oninput="refreshUomPreview()"></label>
        <label>Total Conversion<input id="utotalfactor" class="input" value="${tf}" readonly></label>
      </div>
      <div id="uomPreview" class="uom-help"></div>
      <div class="formgrid">
        <label>Base Purchase ₹<input id="ubp" class="input" type="number" step="0.0001" value="${b.purchase}"></label>
        <label>Base MRP ₹<input id="ubm" class="input" type="number" step="0.0001" value="${b.mrp}"></label>
        <label>Base Sale ₹<input id="ubs" class="input" type="number" step="0.0001" value="${b.sale}"></label>
        <label>Inner Purchase ₹<input id="uip" class="input" type="number" step="0.01" value="${ip}"></label>
        <label>Inner MRP ₹<input id="uim" class="input" type="number" step="0.01" value="${im}"></label>
        <label>Inner Sale ₹<input id="uis" class="input" type="number" step="0.01" value="${is}"></label>
        <label>Pack Purchase ₹<input id="upp" class="input" type="number" step="0.01" value="${pp}"></label>
        <label>Pack MRP ₹<input id="ump" class="input" type="number" step="0.01" value="${pm}"></label>
        <label>Pack Sale ₹<input id="usp" class="input" type="number" step="0.01" value="${ps}"></label>
        <label><input id="uloose" type="checkbox" ${u.AllowLoose!==false?'checked':''}> Allow Base/Loose sale</label>
      </div>
    </div>`,`<button class="btn" onclick="saveUomProduct(${id||0})">Save Item</button>`);
    refreshUomPreview();
  };

  window.refreshUomPreview=function(){
    const base=(document.querySelector('#ubase')?.value||'PCS').trim().toUpperCase(),inner=(document.querySelector('#uinner')?.value||'').trim().toUpperCase(),pack=(document.querySelector('#upack')?.value||'PACK').trim().toUpperCase();
    const inf=Math.max(1,Number(document.querySelector('#uinnerfactor')?.value)||1),pf=Math.max(1,Number(document.querySelector('#upackfactor')?.value)||1),tf=inner?inf*pf:pf;
    const t=document.querySelector('#utotalfactor');if(t)t.value=tf;
    const p=document.querySelector('#uomPreview');if(p)p.textContent=inner?`1 ${pack} = ${pf} ${inner}; 1 ${inner} = ${inf} ${base}; therefore 1 ${pack} = ${tf} ${base}`:`1 ${pack} = ${tf} ${base}`;
  };

  window.saveUomProduct=async function(id){
    try{
      const base=(ubase.value||'PCS').trim().toUpperCase(),inner=(uinner.value||'').trim().toUpperCase(),pack=(upack.value||base).trim().toUpperCase();
      const inf=inner?Math.max(1,+uinnerfactor.value||1):1,pf=Math.max(1,+upackfactor.value||1),tf=inner?inf*pf:pf;
      const bp=+ubp.value||0,bm=+ubm.value||0,bs=+ubs.value||0;
      const ip=+uip.value||bp*inf,im=+uim.value||bm*inf,isale=+uis.value||bs*inf;
      const pp=+upp.value||bp*tf,pm=+ump.value||bm*tf,psale=+usp.value||bs*tf;
      const body={Name:unm.value,Barcode:ubc.value||null,Sku:usk.value||null,CategoryId:null,Category:ucat.value||'General',Unit:base,Hsn:uhsn.value||null,GstRate:+ugst.value,Mrp:bm,PurchasePrice:bp,SalePrice:bs,MinStock:5,MaxStock:0,LocationCode:uloc.value||null,RackName:urack.value||null,ShelfName:null,TrackBatch:true,TrackExpiry:true};
      const r=await api(id?'/api/products/'+id:'/api/products',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const pid=id||r.id;
      await api('/api/products/'+pid+'/uom',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({BaseUnit:base,InnerUnit:inner||null,PackUnit:pack,ConversionFactor:tf,InnerConversionFactor:inf,PackInnerFactor:pf,PackPurchaseRate:pp,PackMrp:pm,PackSalePrice:psale,InnerPurchaseRate:ip,InnerMrp:im,InnerSalePrice:isale,LooseSalePrice:bs,AllowLoose:uloose.checked})});
      S.uoms[pid]=null;await loadUom(pid,true);closeModal();toast('Item saved — stock unit: '+base);loadProducts()
    }catch(e){alert(e.message)}
  };

  window.loadPurchase=async function(){await spec();if(S.mode==='jewellery')return loadJewelleryPurchase();return loadUomPurchase()};
  async function loadUomPurchase(){
    setPage('purchase');navTitle('Purchases','Purchase in BOX / STRIP / TABLET; stock posts only in Base Unit');
    S.items=await api('/api/products?size=500');S.suppliers=await api('/api/suppliers');
    const pharma=/pharmacy|medical/i.test(S.spec?.StoreType||'');
    app.innerHTML=`<div class="content"><div class="panel"><div class="panelhead"><div><h3>MULTI-UNIT PURCHASE INWARD</h3><p class="muted">Choose purchased unit on each line. Quantity and rates are converted to Base Unit before stock posting.</p></div><span class="tag">${pharma?'BATCH + EXPIRY MANDATORY':'BASE STOCK'}</span></div><div class="toolbar"><button class="btn" onclick="openUomPurchase()">＋ New Purchase</button><span class="tag">Example: 1 BOX × 10 STRIP × 10 TABLET = 100 TABLET</span></div></div><div class="panel"><h3>RECENT PURCHASES</h3><div class="tablewrap"><table class="table"><thead><tr><th>INVOICE</th><th>SUPPLIER</th><th>DATE</th><th>SUBTOTAL</th><th>TAX</th><th>TOTAL</th></tr></thead><tbody>${(await api('/api/purchases')).map(x=>`<tr><td>${esc2(x.InvoiceNo)}</td><td>${esc2(x.SupplierName)}</td><td>${fmt(x.PurchaseDate)}</td><td>₹${money2(x.SubTotal)}</td><td>₹${money2(x.Tax)}</td><td><b>₹${money2(x.GrandTotal)}</b></td></tr>`).join('')}</tbody></table></div></div></div>`
  }
  window.openUomPurchase=async function(){
    S.purLines=[];
    modal('New Purchase — Multi Unit',`<div class="formgrid"><label>Invoice No<input id="upi" class="input"></label><label>Supplier<select id="usup" class="select"><option value="">Walk-in Supplier</option>${(S.suppliers||[]).map(x=>`<option value="${x.Id}">${esc2(x.Name)}</option>`).join('')}</select></label></div><div class="toolbar" style="margin-top:12px"><select id="uprod" class="select" style="flex:1"><option value="">Select item</option>${S.items.map(x=>`<option value="${x.Id}">${esc2(x.Name)} • ${esc2(x.Barcode||'')}</option>`).join('')}</select><button class="btn" onclick="addUomPurchaseLine()">Add</button></div><div id="upLines"></div><div class="formgrid" style="margin-top:12px"><label>Discount<input id="udisc" class="input" type="number" value="0"></label><label>Paid Amount<input id="upaid" class="input" type="number" value="0"></label><label>Payment<select id="upm" class="select"><option>Credit</option><option>Cash</option><option>UPI</option><option>Card</option></select></label></div>`,`<button class="btn" onclick="saveUomPurchase()">Save Purchase</button>`)
  };
  window.addUomPurchaseLine=async function(){
    const id=Number(uprod.value);if(!id)return;
    const p=S.items.find(x=>x.Id===id),u=await loadUom(id),opts=uomChoices(p,u),def=opts.slice().sort((a,b)=>b.factor-a.factor)[0];
    S.purLines.push({ProductId:id,Name:p.Name,Uom:u,Options:opts,Unit:def.unit,Factor:def.factor,Qty:1,FreeQuantity:0,Cost:def.purchase,SalePrice:def.sale,Mrp:def.mrp,GstRate:+p.GstRate,BatchNo:'',ExpiryDate:''});renderUomPurchaseLines()
  };
  window.setPurchaseUom=function(i,unit){const x=S.purLines[i],o=x.Options.find(a=>a.unit===unit);if(!o)return;x.Unit=o.unit;x.Factor=o.factor;x.Cost=o.purchase;x.SalePrice=o.sale;x.Mrp=o.mrp;renderUomPurchaseLines()};
  function renderUomPurchaseLines(){const el=document.querySelector('#upLines');if(!el)return;el.innerHTML=S.purLines.map((x,i)=>`<div class="uom-line"><div><b>${esc2(x.Name)}</b><br><span class="tag">Base: ${esc2(x.Uom.BaseUnit)} • Stock + ${money2((+x.Qty+(+x.FreeQuantity||0))*x.Factor)} ${esc2(x.Uom.BaseUnit)}</span></div><label>Purchase Unit<select class="select" onchange="setPurchaseUom(${i},this.value)">${x.Options.map(o=>`<option value="${esc2(o.unit)}" ${o.unit===x.Unit?'selected':''}>${esc2(o.unit)} (×${o.factor})</option>`).join('')}</select></label><label>Qty<input class="input" type="number" min="0.001" step="0.001" value="${x.Qty}" onchange="S2(${i},'Qty',this.value)"></label><label>Free<input class="input" type="number" min="0" step="0.001" value="${x.FreeQuantity}" onchange="S2(${i},'FreeQuantity',this.value)"></label><label>Rate / ${esc2(x.Unit)}<input class="input" type="number" value="${x.Cost}" onchange="S2(${i},'Cost',this.value)"></label><label>Sale / ${esc2(x.Unit)}<input class="input" type="number" value="${x.SalePrice}" onchange="S2(${i},'SalePrice',this.value)"></label><label>MRP / ${esc2(x.Unit)}<input class="input" type="number" value="${x.Mrp}" onchange="S2(${i},'Mrp',this.value)"></label><label>Batch<input class="input" value="${esc2(x.BatchNo)}" onchange="S2(${i},'BatchNo',this.value)"></label><label>Expiry<input class="input" type="date" value="${x.ExpiryDate}" onchange="S2(${i},'ExpiryDate',this.value)"></label><div class="uom-result">Base Qty ${money2(x.Qty*x.Factor)} ${esc2(x.Uom.BaseUnit)}<br>Base Cost ₹${money2(x.Cost/x.Factor)}<br>Total ₹${money2(x.Qty*x.Cost)}</div><button class="btn small danger" onclick="S.purLines.splice(${i},1);renderUomPurchaseLines()">×</button></div>`).join('')};
  window.renderUomPurchaseLines=renderUomPurchaseLines;
  window.S2=(i,k,v)=>{S.purLines[i][k]=['Qty','FreeQuantity','Cost','SalePrice','Mrp'].includes(k)?+v:v;renderUomPurchaseLines()};
  window.saveUomPurchase=async function(){
    if(!S.purLines.length)return toast('Add purchase items');
    const pharma=/pharmacy|medical/i.test(S.spec?.StoreType||'');
    if(pharma&&S.purLines.some(x=>!String(x.BatchNo||'').trim()))return toast('Batch No is mandatory for Pharmacy / Medical Store');
    if(S.purLines.some(x=>!x.ExpiryDate))return toast('Expiry date is required for every batch');
    try{
      const sid=Number(usup.value)||null,sup=(S.suppliers||[]).find(x=>x.Id===sid);
      await api('/api/purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({InvoiceNo:upi.value||null,SupplierId:sid,SupplierName:sup?.Name||'Walk-in Supplier',PaymentMode:upm.value,PaidAmount:+upaid.value,Discount:+udisc.value,Notes:'Multi-unit purchase; inventory posted in base units',Lines:S.purLines.map(x=>({ProductId:x.ProductId,Qty:x.Qty*x.Factor,FreeQuantity:x.FreeQuantity*x.Factor,Cost:x.Cost/x.Factor,SalePrice:x.SalePrice/x.Factor,Mrp:x.Mrp/x.Factor,TaxRate:x.GstRate,BatchNo:x.BatchNo||null,ManufactureDate:null,ExpiryDate:x.ExpiryDate,UnitPurchased:x.Unit,PurchasedQty:x.Qty,TotalBaseQty:x.Qty*x.Factor,RatePerPurchasedUnit:x.Cost}))})});
      closeModal();toast('Purchase saved — stock converted to '+S.purLines[0].Uom.BaseUnit);loadPurchase()
    }catch(e){alert(e.message)}
  };

  // Counter Billing (loaded later) is the primary retail/pharma sale UI.
  window.loadBilling=async function(){await spec();if(S.mode==='jewellery')return loadJewelleryBilling();if(window.loadCounterBillingUom)return window.loadCounterBillingUom();return loadUomBillingFallback()};
  async function loadUomBillingFallback(){setPage('billing');navTitle('New Billing','Multi-unit billing is loading...');app.innerHTML='<div class="content"><div class="panel"><h3>Base Unit Billing</h3><p class="muted">Counter billing module will open automatically.</p></div></div>'}

  async function loadJewelleryCatalog(){setPage('products');navTitle('Jewellery Inventory','Tagged stock • HUID • weight • purity • making');const rows=await api('/api/jewellery/catalog');S.jewItems=rows;app.innerHTML=`<div class="content"><div class="toolbar"><input id="jqcat" class="input" placeholder="Search tag, barcode, HUID or item..." oninput="jewelCatalogFilter(this.value)"><button class="btn" onclick="openJewelleryItem()">＋ New Tag</button><button class="btn secondary" onclick="loadBilling()">Open Jewellery Billing</button></div><div class="panel"><div class="panelhead"><h3>TAGGED JEWELLERY INVENTORY</h3><span class="tag">${rows.length} ACTIVE TAGS</span></div><div class="tablewrap"><table class="table"><thead><tr><th>TAG / ITEM</th><th>METAL</th><th>PURITY</th><th>HUID</th><th>GROSS</th><th>NET</th><th>STONE</th><th>MAKING</th><th>RACK</th><th>STATUS</th></tr></thead><tbody id="jcatrows">${rows.map(x=>`<tr><td><b>${esc2(x.TagNo)}</b><br>${esc2(x.ItemName)}</td><td>${esc2(x.MetalType)}</td><td>${esc2(x.Purity)}</td><td>${esc2(x.Huid||'-')}</td><td>${money2(x.GrossWeight)} g</td><td>${money2(x.NetWeight)} g</td><td>${money2(x.StoneWeight)} g</td><td>${esc2(x.MakingChargeType)} ₹${money2(x.MakingValue)}</td><td>${esc2(x.RackName||'-')}</td><td><span class="status ok">${esc2(x.Status)}</span></td></tr>`).join('')||'<tr><td colspan="10" class="empty">No tagged jewellery stock</td></tr>'}</tbody></table></div></div></div>`}
  window.jewelCatalogFilter=function(q){const term=(q||'').toLowerCase();document.querySelectorAll('#jcatrows tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(term)?'':'none')};
  window.openJewelleryItem=function(){modal('New Jewellery Tag',`<div class="formgrid"><label>Tag No<input id="jtag" class="input" placeholder="GOLD-0001"></label><label>Barcode<input id="jbc" class="input"></label><label class="full">Item Name<input id="jname" class="input" placeholder="22K Gold Ring"></label><label>Category<input id="jcat" class="input" value="Gold Jewellery"></label><label>Metal<select id="jmetal" class="select"><option>Gold</option><option>Silver</option><option>Platinum</option></select></label><label>Purity<select id="jpur" class="select"><option>24K</option><option selected>22K</option><option>18K</option><option>14K</option></select></label><label>Purity %<input id="jpp" class="input" type="number" value="91.6"></label><label>HUID<input id="jhuid" class="input"></label><label>Gross Weight (g)<input id="jgross" class="input" type="number" step="0.001"></label><label>Net Weight (g)<input id="jnet" class="input" type="number" step="0.001"></label><label>Stone Weight (g)<input id="jstone" class="input" type="number" step="0.001" value="0"></label><label>Making Type<select id="jmct" class="select"><option>PER_GRAM</option><option>PERCENTAGE</option><option>FLAT</option></select></label><label>Making Value<input id="jmv" class="input" type="number" step="0.01"></label><label>Rack<input id="jrack" class="input"></label></div>`,`<button class="btn" onclick="saveJewelleryItem()">Save Tag</button>`)};
  window.saveJewelleryItem=async function(){try{await api('/api/jewellery/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({TagNo:jtag.value,Barcode:jbc.value||null,ItemName:jname.value,Category:jcat.value,MetalType:jmetal.value,Purity:jpur.value,PurityPercent:+jpp.value,Huid:jhuid.value||null,GrossWeight:+jgross.value,NetWeight:+jnet.value,StoneWeight:+jstone.value,MakingChargeType:jmct.value,MakingValue:+jmv.value,Status:'IN_STOCK',RackName:jrack.value||null})});closeModal();toast('Jewellery tag created');loadJewelleryCatalog()}catch(e){alert(e.message)}};
  async function loadJewelleryPurchase(){setPage('purchase');navTitle('Jewellery Purchase','Create tagged inventory from purchase/karigar entry');app.innerHTML=`<div class="content"><div class="panel"><div class="panelhead"><h3>JEWELLERY PURCHASE / TAG ENTRY</h3><span class="tag">TAGGED INVENTORY</span></div><p class="muted">Each jewellery piece gets its own Tag No. Capture metal, purity, HUID, gross/net/stone weight and making charge.</p><button class="btn" onclick="openJewelleryItem()">＋ Add Purchased Tag</button></div><div class="panel"><h3>METAL RATES</h3><div id="jrates"></div><button class="btn secondary" onclick="openMetalRate()">＋ Add / Update Rate</button></div></div>`;loadMetalRates()}
  window.loadMetalRates=async function(){const r=await api('/api/jewellery/metal-rates');document.querySelector('#jrates').innerHTML=r.map(x=>`<div class="metal-rate"><b>${esc2(x.MetalType)} ${esc2(x.Purity)}</b><span>₹${money2(x.RatePerGram)} / gram</span></div>`).join('')||'<div class="empty">No metal rates configured</div>'};
  window.openMetalRate=function(){modal('Metal Rate',`<div class="formgrid"><label>Metal<select id="mrmetal" class="select"><option>Gold</option><option>Silver</option><option>Platinum</option></select></label><label>Purity<select id="mrpur" class="select"><option>24K</option><option>22K</option><option>18K</option><option>14K</option></select></label><label>Rate / Gram<input id="mrrate" class="input" type="number" step="0.01"></label></div>`,`<button class="btn" onclick="saveMetalRate()">Save Rate</button>`)};
  window.saveMetalRate=async function(){try{await api('/api/jewellery/metal-rates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({MetalType:mrmetal.value,Purity:mrpur.value,RatePerGram:+mrrate.value,EffectiveAt:null})});closeModal();loadMetalRates()}catch(e){alert(e.message)}};
  async function loadJewelleryBilling(){setPage('billing');navTitle('Jewellery Billing','Tag-based billing • live metal rate • old metal exchange');S.jCart=[];S.oldCredit=0;const rows=await api('/api/jewellery/catalog');S.jewItems=rows;const rates=await api('/api/jewellery/metal-rates');const gold22=rates.find(x=>x.MetalType==='Gold'&&x.Purity==='22K')?.RatePerGram||0;app.innerHTML=`<div class="content jewellery-pos"><div class="jtop"><div class="panel"><div class="panelhead"><h3>METAL RATE</h3><span class="tag">LIVE / EFFECTIVE</span></div><div class="formgrid"><label>Gold 22K ₹/g<input id="jrate" class="input" type="number" step="0.01" value="${gold22}"></label><label>GST %<input id="jgst" class="input" type="number" step="0.01" value="3"></label></div></div><div class="panel"><div class="panelhead"><h3>CUSTOMER</h3></div><div class="formgrid"><label>Name<input id="jcust" class="input" value="Walk-in Customer"></label><label>PAN<input id="jpan" class="input"></label></div></div></div><div class="jbody"><div class="panel"><div class="panelhead"><h3>TAG / BARCODE SCAN</h3><span class="tag">IN STOCK</span></div><input id="jsearch" class="input search" placeholder="Scan Tag No / Barcode / HUID..." oninput="renderJewelSearch(this.value)"><div id="jresults"></div><div class="panel oldmetal"><div class="panelhead"><h3>OLD METAL / GOLD EXCHANGE</h3></div><div class="formgrid"><label>Gross g<input id="omgross" class="input" type="number" step="0.001" value="0"></label><label>Stone Deduction g<input id="omstone" class="input" type="number" step="0.001" value="0"></label><label>Wax Deduction g<input id="omwax" class="input" type="number" step="0.001" value="0"></label><label>Assayed Purity %<input id="ompurity" class="input" type="number" step="0.001" value="91.6"></label><label>Melting Loss %<input id="omloss" class="input" type="number" step="0.001" value="0"></label><label>Purchase Rate ₹/g<input id="omrate" class="input" type="number" step="0.01" value="${gold22}"></label></div><button class="btn secondary" style="margin-top:10px" onclick="calcOldMetal()">Calculate Old Metal Credit</button><div id="omresult" class="oldmetal-result">Credit ₹0.00</div></div></div><div class="panel"><div class="panelhead"><h3>JEWELLERY INVOICE</h3><button class="btn small secondary" onclick="S.jCart=[];renderJewCart()">Clear</button></div><div id="jcart"></div><div class="jtotals"><div>Metal <b id="jmetalamt">₹0.00</b></div><div>Stone <b id="jstoneamt">₹0.00</b></div><div>Making <b id="jmakingamt">₹0.00</b></div><div>Gross <b id="jgrossamt">₹0.00</b></div><div>CGST <b id="jcgst">₹0.00</b></div><div>SGST <b id="jsgst">₹0.00</b></div><div>Old Metal <b id="joldamt">₹0.00</b></div><div class="grand">NET PAYABLE <b id="jnetamt">₹0.00</b></div></div><select id="jpay" class="select" style="width:100%;margin-top:10px"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option><option>Credit</option></select><button class="btn green block" style="margin-top:10px;padding:14px" onclick="payJewelleryBill()">PAY & COMPLETE JEWELLERY BILL</button></div></div></div>`;renderJewelSearch('');renderJewCart()}
  window.renderJewelSearch=function(q){const term=(q||'').toLowerCase();const a=S.jewItems.filter(x=>!term||(x.TagNo+' '+(x.Barcode||'')+' '+(x.Huid||'')+' '+x.ItemName).toLowerCase().includes(term)).slice(0,10);document.querySelector('#jresults').innerHTML=a.map(x=>`<div class="jresult"><div><b>${esc2(x.TagNo)} • ${esc2(x.ItemName)}</b><br><small>${esc2(x.MetalType)} ${esc2(x.Purity)} • Gross ${money2(x.GrossWeight)}g • Net ${money2(x.NetWeight)}g • HUID ${esc2(x.Huid||'-')} • Rack ${esc2(x.RackName||'-')}</small></div><button class="btn small" onclick="addJewCart(${x.Id})">ADD</button></div>`).join('')||'<div class="empty">No tagged item found</div>'};
  window.addJewCart=function(id){if(S.jCart.some(x=>x.Id===id))return toast('Tag already added');const p=S.jewItems.find(x=>x.Id===id);if(!p)return;S.jCart.push({Id:id,Name:p.ItemName,Tag:p.TagNo,Net:+p.NetWeight,Stone:+p.StoneWeight,MCT:p.MakingChargeType,MV:+p.MakingValue,Metal:p.MetalType,Purity:p.Purity});renderJewCart()};
  window.renderJewCart=function(){const box=document.querySelector('#jcart');if(!box)return;box.innerHTML=S.jCart.map((x,i)=>`<div class="jline"><div><b>${esc2(x.Tag)}</b><br>${esc2(x.Name)} • ${esc2(x.Metal)} ${esc2(x.Purity)} • Net ${money2(x.Net)}g</div><label>Stone ₹<input class="input" type="number" value="0" onchange="S.jCart[${i}].StoneValue=+this.value;renderJewCart()"></label><label>Making Type<select class="select" onchange="S.jCart[${i}].MCT=this.value;renderJewCart()"><option ${x.MCT==='PER_GRAM'?'selected':''}>PER_GRAM</option><option ${x.MCT==='PERCENTAGE'?'selected':''}>PERCENTAGE</option><option ${x.MCT==='FLAT'?'selected':''}>FLAT</option></select></label><label>Making Value<input class="input" type="number" value="${x.MV}" onchange="S.jCart[${i}].MV=+this.value;renderJewCart()"></label><b class="jline-total">₹${money2(jLine(x))}</b><button class="btn small danger" onclick="S.jCart.splice(${i},1);renderJewCart()">×</button></div>`).join('')||'<div class="empty">Scan/add a jewellery tag</div>';let metal=0,stone=0,making=0;S.jCart.forEach(x=>{const mv=+jrate.value*x.Net;metal+=mv;stone+=+(x.StoneValue||0);making+=jMaking(x,mv)});const gross=metal+stone+making,gst=gross*(+jgst.value||3)/100,old=S.oldCredit||0,net=gross+gst-old;document.querySelector('#jmetalamt').textContent='₹'+money2(metal);document.querySelector('#jstoneamt').textContent='₹'+money2(stone);document.querySelector('#jmakingamt').textContent='₹'+money2(making);document.querySelector('#jgrossamt').textContent='₹'+money2(gross);document.querySelector('#jcgst').textContent='₹'+money2(gst/2);document.querySelector('#jsgst').textContent='₹'+money2(gst/2);document.querySelector('#joldamt').textContent='₹'+money2(old);document.querySelector('#jnetamt').textContent='₹'+money2(net)};
  function jMaking(x,metal){return x.MCT==='PER_GRAM'?x.Net*x.MV:x.MCT==='PERCENTAGE'?metal*x.MV/100:x.MV}function jLine(x){const metal=(+document.querySelector('#jrate')?.value||0)*x.Net,stone=+(x.StoneValue||0);return metal+stone+jMaking(x,metal)}
  window.calcOldMetal=async function(){try{const r=await api('/api/jewellery/old-metal/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({GrossWeight:+omgross.value,StoneWeight:+omstone.value,WaxDeduction:+omwax.value,AssayedPurityPercent:+ompurity.value,MeltingLossPercent:+omloss.value,PurchaseRatePerGram:+omrate.value})});S.oldCredit=+r.credit;document.querySelector('#omresult').innerHTML=`Melt ${money2(r.meltWeight)}g • Pure ${money2(r.netPureWeight)}g • <b>Credit ₹${money2(r.credit)}</b>`;renderJewCart()}catch(e){alert(e.message)}};
  window.payJewelleryBill=async function(){if(!S.jCart.length)return toast('Add jewellery tag');try{const r=await api('/api/jewellery/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CustomerName:jcust.value,CustomerId:null,CustomerPan:jpan.value||null,GstRate:+jgst.value||3,OldMetalCredit:S.oldCredit||0,PaidAmount:0,PaymentMode:jpay.value,Notes:'Jewellery billing',Lines:S.jCart.map(x=>({JewelleryItemId:x.Id,MetalRatePerGram:+jrate.value,StoneValue:+(x.StoneValue||0),MakingChargeType:x.MCT,MakingValue:+x.MV}))})});toast('Jewellery bill completed: '+r.invoiceNo);setTimeout(loadJewelleryBilling,700)}catch(e){alert(e.message)}};
  const oldLoadDashboard=window.loadDashboard;window.loadDashboard=async function(){await spec();await oldLoadDashboard();if(S.mode==='jewellery'){const h=document.querySelector('#title');if(h)h.textContent='Jewellery Dashboard'}};
  setTimeout(()=>spec(),50);
})();
