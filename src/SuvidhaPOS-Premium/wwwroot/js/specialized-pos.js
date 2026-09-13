(function(){
  const S={mode:'retail',uoms:{},units:null,spec:null,items:[],suppliers:[],purLines:[],uomCart:[],jCart:[],oldCredit:0};
  window.S=S;
  const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money2=x=>Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  async function spec(){try{S.spec=await api('/api/specialization');S.mode=S.spec.IsJewellery?'jewellery':'uom';document.body.dataset.storeType=(S.spec.StoreType||'').replace(/[^a-z0-9]+/gi,'-').toLowerCase();}catch{S.mode='uom'}return S.mode}
  async function loadUom(id,force=false){if(!force&&S.uoms[id])return S.uoms[id];S.uoms[id]=await api('/api/products/'+id+'/uom');return S.uoms[id]}
  async function loadUnits(force=false){
    if(!force&&Array.isArray(S.units))return S.units;
    const rows=await api('/api/unit-master');
    S.units=rows.map(x=>({Id:Number(x.Id??x.id),UnitName:String(x.UnitName??x.unitName??'').trim().toUpperCase(),UnitCode:String(x.UnitCode??x.unitCode??'').trim().toUpperCase(),Description:String(x.Description??x.description??''),UnitCategory:String(x.UnitCategory??x.unitCategory??'CUSTOM')}));
    return S.units;
  }
  function unitDatalist(id='uomUnitList'){return `<datalist id="${id}">${(S.units||[]).map(x=>`<option value="${esc2(x.UnitName)}" label="${esc2((x.UnitCode!==x.UnitName?x.UnitCode+' · ':'')+(x.Description||x.UnitCategory))}"></option>`).join('')}</datalist>`}
  function canonicalUnit(v,optional=false){const raw=String(v||'').trim().toUpperCase();if(!raw&&optional)return '';const x=(S.units||[]).find(u=>u.UnitName===raw||u.UnitCode===raw);return x?x.UnitName:null}
  function navTitle(t,sub){title.textContent=t;document.querySelector('header p').textContent=sub}
  function totalFactor(u){const inner=String(u.InnerUnit||'').trim();const innerFactor=Math.max(1,Number(u.InnerConversionFactor)||1);const packFactor=Math.max(1,Number(u.PackInnerFactor)||1);return inner?innerFactor*packFactor:Math.max(1,Number(u.ConversionFactor)||packFactor||1)}
  function baseRates(p,u){const tf=totalFactor(u);return {
    purchase:p.PurchasePrice!=null?Number(p.PurchasePrice):Number(u.PackPurchaseRate||0)/tf,
    mrp:p.Mrp!=null?Number(p.Mrp):Number(u.PackMrp||0)/tf,
    sale:u.LooseSalePrice!=null?Number(u.LooseSalePrice):p.SalePrice!=null?Number(p.SalePrice):Number(u.PackSalePrice||0)/tf
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
      app.innerHTML='<div class="content"><div class="toolbar"><input id="pq2" class="input" placeholder="Search item, barcode, SKU, location..." oninput="filterTable(\'uomRows\',this.value)"><button class="btn" onclick="openUomProduct()">＋ Add Item</button><button class="btn secondary" onclick="openProductBulkEdit()">✎ Bulk Edit</button><button class="btn secondary" onclick="loadStock()">Stock View</button></div><div class="panel"><div class="panelhead"><div><h3>ITEM MASTER + MULTI UNIT</h3><p class="muted">Example: 1 BOX = 10 STRIP = 100 TABLET. Database stock remains TABLET.</p></div><span class="tag">BASE UNIT STOCK</span></div><div class="tablewrap"><table class="table"><thead><tr><th>ITEM</th><th>BASE</th><th>INNER</th><th>PACK</th><th>CONVERSION</th><th>STOCK</th><th>PACK MRP</th><th>LOOSE SALE</th><th>RACK</th><th></th></tr></thead><tbody id="uomRows">'+rows.map(x=>'<tr data-id="'+x.Id+'"><td><b>'+esc2(x.Name)+'</b><br><small class="muted">'+esc2(x.Barcode||x.Sku||'')+'</small></td><td>...</td><td>...</td><td>...</td><td>...</td><td>'+money2(x.Stock)+'</td><td>₹'+money2(x.Mrp)+'</td><td>₹'+money2(x.SalePrice)+'</td><td>'+esc2(x.LocationCode||x.RackName||'-')+'</td><td><button class="btn small" onclick="openUomProduct('+x.Id+')">Edit</button></td></tr>').join('')+'</tbody></table></div></div></div>';
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
    await loadUnits();
    let x={Name:'',Barcode:'',Sku:'',Category:'General',Unit:'PCS',Hsn:'',GstRate:0,Mrp:0,PurchasePrice:0,SalePrice:0,MinStock:5,MaxStock:0,LocationCode:'',RackName:'',TrackBatch:true,TrackExpiry:true,TaxMode:'INCLUSIVE',Dis_Rate:0};
    if(id)x=await api('/api/products/'+id);
    const u=id?await loadUom(id,true):{BaseUnit:'PCS',InnerUnit:'',PackUnit:'BOX',ConversionFactor:1,InnerConversionFactor:1,PackInnerFactor:1,PackPurchaseRate:0,PackMrp:0,PackSalePrice:0,InnerPurchaseRate:0,InnerMrp:0,InnerSalePrice:0,LooseSalePrice:x.SalePrice||0,AllowLoose:true};
    const tf=totalFactor(u),inner=String(u.InnerUnit||''),innerFactor=Math.max(1,Number(u.InnerConversionFactor)||1),packFactor=inner?Math.max(1,Number(u.PackInnerFactor)||1):tf,b=baseRates(x,u);
    const ip=Number(u.InnerPurchaseRate??b.purchase*innerFactor),im=Number(u.InnerMrp??b.mrp*innerFactor),is=Number(u.InnerSalePrice??b.sale*innerFactor);
    const pp=Number(u.PackPurchaseRate??b.purchase*tf),pm=Number(u.PackMrp??b.mrp*tf),ps=Number(u.PackSalePrice??b.sale*tf);
    const multi=!!id&&(tf>1||!!inner||String(u.PackUnit||'').toUpperCase()!==String(u.BaseUnit||x.Unit||'PCS').toUpperCase());
    S.itemDraft={id:id||0,original:{...x},pricingChanged:!id,saving:false};
    modal((id?'Edit':'Add')+' Item',`<div class="retail-item-form">
      <div class="retail-item-caption"><span>${id?'Item code '+esc2(x.ItemCode||id):'New item · code assigned on save'}</span><span>Required *</span></div>
      <div class="retail-item-grid">
        <label class="item-full">Item Name *<input id="unm" class="input" value="${esc2(x.Name)}" maxlength="200" required autocomplete="off" placeholder="Enter item name"></label>
        <label>Barcode<input id="ubc" class="input" value="${esc2(x.Barcode)}" maxlength="80" placeholder="Scan or enter barcode"></label>
        <label>Price / MRP ₹ *<input id="ubm" class="input" type="number" min="0" step="0.01" value="${b.mrp}" required oninput="syncUomRates('mrp','base')"></label>
        <label>Discount %<input id="udiscount" class="input" type="number" min="0" max="100" step="0.01" value="${Number(x.Dis_Rate||0)}" oninput="applyItemDiscount()"></label>
        <label>Category<input id="ucat" class="input" value="${esc2(x.Category||'General')}" maxlength="100"></label>
        <label>HSN / SAC<input id="uhsn" class="input" value="${esc2(x.Hsn)}" maxlength="30"></label>
        <label>Unit<input id="ubase" class="input" list="uomUnitList" autocomplete="off" value="${esc2(u.BaseUnit||x.Unit||'PCS')}" oninput="refreshUomPreview(false)"></label>
        <label>GST %<input id="ugst" class="input" data-no-tax-enhance="1" type="number" min="0" max="100" step="0.01" value="${x.GstRate}" list="retailItemGst"><datalist id="retailItemGst"><option value="0"><option value="3"><option value="5"><option value="12"><option value="18"><option value="28"><option value="40"></datalist></label>
        <fieldset class="item-tax-options"><legend>Tax detail</legend><label><input type="radio" name="uTaxMode" value="INCLUSIVE" ${String(x.TaxMode||'INCLUSIVE').toUpperCase()==='INCLUSIVE'?'checked':''}> Inclusive</label><label><input type="radio" name="uTaxMode" value="EXCLUSIVE" ${String(x.TaxMode||'').toUpperCase()==='EXCLUSIVE'?'checked':''}> Exclusive</label></fieldset>
        <label>Location<input id="uloc" class="input" value="${esc2(x.LocationCode||'')}" maxlength="50"></label>
        <label>Rack<input id="urack" class="input" value="${esc2(x.RackName||'')}" maxlength="80"></label>
        <label class="item-sku">SKU<input id="usk" class="input" value="${esc2(x.Sku)}" maxlength="80" placeholder="Optional"></label>
        <label>Purchase price ₹<input id="ubp" class="input" type="number" min="0" step="0.01" value="${b.purchase}" oninput="syncUomRates('purchase','base')"></label>
        <label class="item-sale-preview">Selling price ₹<input id="ubs" class="input" type="number" value="${b.sale}" readonly><small>MRP less Discount %</small></label>
      </div>
      <label class="item-unit-toggle"><span><b>Multi-unit conversion</b><small>Enable for box, strip or pack quantities</small></span><input id="umulti" type="checkbox" role="switch" aria-controls="uomDetails" ${multi?'checked':''} onchange="toggleItemUnits()"><span class="item-switch" aria-hidden="true"></span></label>
      ${unitDatalist('uomUnitList')}
      <div id="uomDetails" class="uom-card" ${multi?'':'hidden'}><div class="uom-title">Unit conversion & linked rates</div>
      <div class="uom-help">Stock stays in the base unit. Set the pack sizes below. <button type="button" class="btn small secondary" onclick="closeModal();loadUnitMaster()">Unit Master</button></div>
      <div class="formgrid">
        <label>Inner Unit (optional)<input id="uinner" class="input" list="uomUnitList" autocomplete="off" value="${esc2(inner)}" placeholder="Search / select unit" oninput="refreshUomPreview(true)"></label>
        <label>1 Inner = Base Qty<input id="uinnerfactor" class="input" type="number" min="1" step="0.001" value="${innerFactor}" oninput="refreshUomPreview(true)"></label>
        <label>Pack Unit<input id="upack" class="input" list="uomUnitList" autocomplete="off" value="${esc2(u.PackUnit||'BOX')}" placeholder="Search / select unit" oninput="refreshUomPreview(false)"></label>
        <label>1 Pack = Inner/Base Qty<input id="upackfactor" class="input" type="number" min="1" step="0.001" value="${packFactor}" oninput="refreshUomPreview(true)"></label>
        <label>Total Conversion<input id="utotalfactor" class="input" value="${tf}" readonly></label>
      </div>
      <div id="uomPreview" class="uom-help"></div>
      <div class="formgrid">
        <label class="full"><input id="uautorates" type="checkbox" checked onchange="if(this.checked)recalcAllUomRates()"> Auto-calculate linked Purchase / MRP / Sale rates <span class="muted">(uncheck for manual override)</span></label>
        <div class="uom-help full">Practical entry: Pack Purchase → Inner/Base Purchase auto; Inner MRP → Pack/Base MRP auto. You can type at Base, Inner or Pack level — the other two levels follow automatically.</div>
        <label>Inner Purchase ₹<input id="uip" class="input" type="number" step="0.01" value="${ip}" oninput="syncUomRates('purchase','inner')"></label>
        <label>Inner MRP ₹<input id="uim" class="input" type="number" step="0.01" value="${im}" oninput="syncUomRates('mrp','inner')"></label>
        <label>Inner Sale ₹<input id="uis" class="input" type="number" step="0.01" value="${is}" oninput="syncUomRates('sale','inner')"></label>
        <label>Pack Purchase ₹<input id="upp" class="input" type="number" step="0.01" value="${pp}" oninput="syncUomRates('purchase','pack')"></label>
        <label>Pack MRP ₹<input id="ump" class="input" type="number" step="0.01" value="${pm}" oninput="syncUomRates('mrp','pack')"></label>
        <label>Pack Sale ₹<input id="usp" class="input" type="number" step="0.01" value="${ps}" oninput="syncUomRates('sale','pack')"></label>
        <label><input id="uloose" type="checkbox" ${u.AllowLoose!==false?'checked':''}> Allow Base/Loose sale</label>
      </div>
    </div></div>`,`<button id="uSaveItem" class="btn" onclick="saveUomProduct(${id||0})">Save Item</button>`);
    document.querySelector('#modal .modalbox')?.classList.add('retail-item-modal');
    window.__uomRateSource={
      purchase:pp>0?'pack':(ip>0?'inner':'base'),
      mrp:im>0?'inner':(pm>0?'pack':'base'),
      sale:is>0?'inner':(ps>0?'pack':'base')
    };
    refreshUomPreview(false);
  };

  window.toggleItemUnits=function(){
    const on=document.querySelector('#umulti')?.checked;
    const details=document.querySelector('#uomDetails');if(details)details.hidden=!on;
    document.querySelector('#umulti')?.setAttribute('aria-expanded',String(!!on));
    refreshUomPreview(false);
    if(on&&S.itemDraft?.pricingChanged){syncUomRates('purchase','base');syncUomRates('mrp','base')}
  };
  window.applyItemDiscount=function(){
    const mrp=Number(document.querySelector('#ubm')?.value),discount=Number(document.querySelector('#udiscount')?.value);
    if(S.itemDraft)S.itemDraft.pricingChanged=true;
    if(!Number.isFinite(mrp)||!Number.isFinite(discount)||mrp<0||discount<0||discount>100)return;
    setUomRate('ubs',Math.round(mrp*(100-discount))/100,'base');
    syncUomRates('sale','base');
  };
  function uomRateFactors(){
    if(document.querySelector('#umulti')&&!document.querySelector('#umulti').checked)return {hasInner:false,inf:1,pf:1,tf:1};
    const inner=(document.querySelector('#uinner')?.value||'').trim();
    const inf=inner?Math.max(1,Number(document.querySelector('#uinnerfactor')?.value)||1):1;
    const pf=Math.max(1,Number(document.querySelector('#upackfactor')?.value)||1);
    return {hasInner:!!inner,inf,pf,tf:inner?inf*pf:pf};
  }
  function uomRateIds(family){
    if(family==='purchase')return {base:'ubp',inner:'uip',pack:'upp'};
    if(family==='mrp')return {base:'ubm',inner:'uim',pack:'ump'};
    return {base:'ubs',inner:'uis',pack:'usp'};
  }
  function uomRateNumber(id){return Math.max(0,Number(document.querySelector('#'+id)?.value)||0)}
  function setUomRate(id,value,level){
    const el=document.querySelector('#'+id);if(!el)return;
    const decimals=level==='base'?4:2,scale=Math.pow(10,decimals);
    const v=Math.round(Math.max(0,Number(value)||0)*scale)/scale;
    el.value=String(v);
  }
  window.syncUomRates=function(family,source){
    window.__uomRateSource=window.__uomRateSource||{};
    window.__uomRateSource[family]=source;
    const auto=document.querySelector('#uautorates');if(auto&&!auto.checked){if(family==='mrp')applyItemDiscount();return;}
    const ids=uomRateIds(family),f=uomRateFactors(),src=uomRateNumber(ids[source]);
    let base=0,inner=0,pack=0;
    if(source==='pack'){
      pack=src;base=f.tf>0?pack/f.tf:0;inner=f.hasInner?(f.pf>0?pack/f.pf:0):base;
    }else if(source==='inner'){
      inner=src;base=f.hasInner?(f.inf>0?inner/f.inf:0):inner;pack=f.hasInner?inner*f.pf:base*f.pf;
    }else{
      base=src;inner=f.hasInner?base*f.inf:base;pack=base*f.tf;
    }
    setUomRate(ids.base,base,'base');
    setUomRate(ids.inner,inner,'inner');
    setUomRate(ids.pack,pack,'pack');
    if(family==='mrp')applyItemDiscount();
  };
  window.recalcAllUomRates=function(){
    const src=window.__uomRateSource||{purchase:'pack',mrp:'inner',sale:'inner'};
    ['purchase','mrp','sale'].forEach(f=>syncUomRates(f,src[f]||'base'));
  };

  window.refreshUomPreview=function(recalcRates=false){
    const base=(document.querySelector('#ubase')?.value||'PCS').trim().toUpperCase(),inner=(document.querySelector('#uinner')?.value||'').trim().toUpperCase(),pack=(document.querySelector('#upack')?.value||'PACK').trim().toUpperCase();
    const inf=Math.max(1,Number(document.querySelector('#uinnerfactor')?.value)||1),pf=Math.max(1,Number(document.querySelector('#upackfactor')?.value)||1),tf=inner?inf*pf:pf;
    const t=document.querySelector('#utotalfactor');if(t)t.value=tf;
    const p=document.querySelector('#uomPreview');if(p)p.textContent=inner?`1 ${pack} = ${pf} ${inner}; 1 ${inner} = ${inf} ${base}; therefore 1 ${pack} = ${tf} ${base}`:`1 ${pack} = ${tf} ${base}`;
    if(recalcRates&&document.querySelector('#uautorates')?.checked)recalcAllUomRates();
  };

  window.saveUomProduct=async function(id){
    const draft=S.itemDraft;if(!draft||draft.saving)return;
    const read=key=>document.getElementById(key)?.value||'';
    const number=key=>Number(read(key));
    const name=read('unm').trim();if(!name)return alert('Enter Item Name');
    const numeric=['ubm','ubp','ubs','udiscount','ugst'];
    if(numeric.some(k=>!Number.isFinite(number(k))||number(k)<0)||number('udiscount')>100||number('ugst')>100)return alert('Enter valid prices, GST and discount between 0 and 100%.');
    draft.saving=true;const save=document.querySelector('#uSaveItem');if(save){save.disabled=true;save.textContent='Saving…'}
    try{
      const identity=await api('/api/products/identity-check?name='+encodeURIComponent(name)+'&barcode='+encodeURIComponent(read('ubc').trim())+'&excludeId='+(id||0));
      if(identity.duplicate){const c=identity.conflict||{};throw new Error('Duplicate '+(c.ConflictType==='NAME'?'Item Name':'Barcode')+': '+(c.Name||name)+' already exists.')}
      await loadUnits();
      const multi=document.querySelector('#umulti').checked;
      const base=canonicalUnit(read('ubase')),inner=multi?canonicalUnit(read('uinner'),true):'',pack=multi?canonicalUnit(read('upack')):base;
      if(!base||inner===null||!pack)throw new Error('Select valid base, inner and pack units from Unit Master.');
      const inf=inner?number('uinnerfactor'):1,pf=multi?number('upackfactor'):1,tf=inner?inf*pf:pf;
      if(!(inf>=1&&pf>=1&&Number.isFinite(tf)))throw new Error('Unit conversion must be at least 1.');
      const bp=number('ubp'),bm=number('ubm'),bs=number('ubs'),o=draft.original;
      const uom={BaseUnit:base,InnerUnit:inner||null,PackUnit:pack,ConversionFactor:tf,InnerConversionFactor:inf,PackInnerFactor:pf,PackPurchaseRate:multi?number('upp'):bp,PackMrp:multi?number('ump'):bm,PackSalePrice:multi?number('usp'):bs,InnerPurchaseRate:multi?number('uip'):0,InnerMrp:multi?number('uim'):0,InnerSalePrice:multi?number('uis'):0,LooseSalePrice:bs,AllowLoose:multi?document.querySelector('#uloose').checked:true};
      const body={Name:name,Barcode:read('ubc').trim()||null,Sku:read('usk').trim()||null,CategoryId:o.CategoryId??null,Category:read('ucat')||'General',Unit:base,Hsn:read('uhsn')||null,GstRate:number('ugst'),TaxMode:document.querySelector('input[name="uTaxMode"]:checked')?.value||'INCLUSIVE',Mrp:bm,PurchasePrice:bp,SalePrice:bs,MinStock:o.MinStock??5,MaxStock:o.MaxStock??0,LocationCode:read('uloc')||null,RackName:read('urack')||null,ShelfName:o.ShelfName??null,TrackBatch:o.TrackBatch??true,TrackExpiry:o.TrackExpiry??true,Uom:uom};
      if(draft.pricingChanged)body.DiscountPer=number('udiscount');
      const r=await api(id?'/api/products/'+id:'/api/products',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const pid=id||r.id;
      S.uoms[pid]=null;closeModal();toast('Item saved · code '+pid);await loadProducts();
    }catch(e){alert(e.message)}finally{draft.saving=false;if(save?.isConnected){save.disabled=false;save.textContent='Save Item'}}
  };

  window.openProductBulkEdit=async function(){
    await loadUnits();
    const rows=await api('/api/products?size=1000');
    S.bulkRows=rows.map(x=>({...x}));
    modal('Bulk Edit Items — Duplicate Validation',`<div class="alert">Duplicate Item Name aur Duplicate Barcode allowed nahi hai. Save se pehle poora batch validate hoga.</div><div class="tablewrap" style="max-height:62vh"><table class="table"><thead><tr><th>ITEM NAME</th><th>BARCODE</th><th>SKU</th><th>CATEGORY</th><th>UNIT</th><th>GST%</th><th>MRP</th><th>PURCHASE</th><th>SALE</th><th>RACK</th></tr></thead><tbody>${S.bulkRows.map((x,i)=>`<tr><td><input class="input" value="${esc2(x.Name)}" onchange="bulkProductSet(${i},'Name',this.value)"></td><td><input class="input" value="${esc2(x.Barcode||'')}" onchange="bulkProductSet(${i},'Barcode',this.value)"></td><td><input class="input" value="${esc2(x.Sku||'')}" onchange="bulkProductSet(${i},'Sku',this.value)"></td><td><input class="input" value="${esc2(x.Category||'')}" onchange="bulkProductSet(${i},'Category',this.value)"></td><td><input class="input" list="bulkUnitList" autocomplete="off" value="${esc2(x.Unit||'PCS')}" onchange="bulkProductSet(${i},'Unit',this.value)"></td><td><input class="input" type="number" value="${x.GstRate||0}" onchange="bulkProductSet(${i},'GstRate',this.value)"></td><td><input class="input" type="number" value="${x.Mrp||0}" onchange="bulkProductSet(${i},'Mrp',this.value)"></td><td><input class="input" type="number" value="${x.PurchasePrice||0}" onchange="bulkProductSet(${i},'PurchasePrice',this.value)"></td><td><input class="input" type="number" value="${x.SalePrice||0}" onchange="bulkProductSet(${i},'SalePrice',this.value)"></td><td><input class="input" value="${esc2(x.RackName||x.LocationCode||'')}" onchange="bulkProductSet(${i},'RackName',this.value)"></td></tr>`).join('')}</tbody></table></div>${unitDatalist('bulkUnitList')}`,`<button class="btn" onclick="saveProductBulkEdit()">Validate & Save All</button>`);
    const mb=document.querySelector('#modal .modalbox');if(mb){mb.style.width='96vw';mb.style.maxWidth='1500px'}
  };
  window.bulkProductSet=function(i,k,v){if(!S.bulkRows?.[i])return;S.bulkRows[i][k]=['GstRate','Mrp','PurchasePrice','SalePrice','MinStock','MaxStock'].includes(k)?Number(v||0):v};
  window.saveProductBulkEdit=async function(){
    try{
      await loadUnits();
      for(const x of (S.bulkRows||[])){const u=canonicalUnit(x.Unit);if(!u)return alert("Unit '"+(x.Unit||'')+"' Unit Master me nahi hai for item "+x.Name);x.Unit=u}
      const rows=(S.bulkRows||[]).map(x=>({Id:x.Id,Name:(x.Name||'').trim(),Barcode:(x.Barcode||'').trim()||null,Sku:(x.Sku||'').trim()||null,Category:x.Category||'General',Unit:x.Unit||'PCS',Hsn:x.Hsn||null,GstRate:+x.GstRate||0,Mrp:+x.Mrp||0,PurchasePrice:+x.PurchasePrice||0,SalePrice:+x.SalePrice||0,MinStock:+x.MinStock||0,MaxStock:+x.MaxStock||0,LocationCode:x.LocationCode||null,RackName:x.RackName||null,ShelfName:x.ShelfName||null}));
      const r=await api('/api/products/bulk-edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Rows:rows})});
      closeModal();toast('Bulk edit saved: '+r.updated+' items');loadProducts()
    }catch(e){alert(e.message)}
  };

  window.suvidhaUom={load:loadUom,choices:uomChoices};
  window.loadPurchase=async function(){await spec();if(S.mode==='jewellery')return loadJewelleryPurchase();return window.loadRetailPurchases()};

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
