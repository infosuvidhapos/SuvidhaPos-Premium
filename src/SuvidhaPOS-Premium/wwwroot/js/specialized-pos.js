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
      <div class="uom-help">Stock is ALWAYS stored in Base Unit. For example: BOX → STRIP → TABLET. Type to search or select from Unit Master; arbitrary duplicate unit text cannot be saved. <button type="button" class="btn small secondary" onclick="closeModal();loadUnitMaster()">Unit Master</button></div>
      ${unitDatalist('uomUnitList')}
      <div class="formgrid">
        <label>Base Unit (smallest)<input id="ubase" class="input" list="uomUnitList" autocomplete="off" value="${esc2(u.BaseUnit||'PCS')}" placeholder="Search / select unit" oninput="refreshUomPreview(false)"></label>
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
        <label>Base Purchase ₹<input id="ubp" class="input" type="number" step="0.0001" value="${b.purchase}" oninput="syncUomRates('purchase','base')"></label>
        <label>Base MRP ₹<input id="ubm" class="input" type="number" step="0.0001" value="${b.mrp}" oninput="syncUomRates('mrp','base')"></label>
        <label>Base Sale ₹<input id="ubs" class="input" type="number" step="0.0001" value="${b.sale}" oninput="syncUomRates('sale','base')"></label>
        <label>Inner Purchase ₹<input id="uip" class="input" type="number" step="0.01" value="${ip}" oninput="syncUomRates('purchase','inner')"></label>
        <label>Inner MRP ₹<input id="uim" class="input" type="number" step="0.01" value="${im}" oninput="syncUomRates('mrp','inner')"></label>
        <label>Inner Sale ₹<input id="uis" class="input" type="number" step="0.01" value="${is}" oninput="syncUomRates('sale','inner')"></label>
        <label>Pack Purchase ₹<input id="upp" class="input" type="number" step="0.01" value="${pp}" oninput="syncUomRates('purchase','pack')"></label>
        <label>Pack MRP ₹<input id="ump" class="input" type="number" step="0.01" value="${pm}" oninput="syncUomRates('mrp','pack')"></label>
        <label>Pack Sale ₹<input id="usp" class="input" type="number" step="0.01" value="${ps}" oninput="syncUomRates('sale','pack')"></label>
        <label><input id="uloose" type="checkbox" ${u.AllowLoose!==false?'checked':''}> Allow Base/Loose sale</label>
      </div>
    </div>`,`<button class="btn" onclick="saveUomProduct(${id||0})">Save Item</button>`);
    window.__uomRateSource={
      purchase:pp>0?'pack':(ip>0?'inner':'base'),
      mrp:im>0?'inner':(pm>0?'pack':'base'),
      sale:is>0?'inner':(ps>0?'pack':'base')
    };
    refreshUomPreview(false);
  };

  function uomRateFactors(){
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
    const auto=document.querySelector('#uautorates');if(auto&&!auto.checked)return;
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
    try{
      const identity=await api('/api/products/identity-check?name='+encodeURIComponent((unm.value||'').trim())+'&barcode='+encodeURIComponent((ubc.value||'').trim())+'&excludeId='+(id||0));
      if(identity.duplicate){const c=identity.conflict||{};return alert('Duplicate '+(c.ConflictType==='NAME'?'Item Name':'Barcode')+': '+(c.Name||unm.value)+' already exists.')}
      await loadUnits();
      const base=canonicalUnit(ubase.value),inner=canonicalUnit(uinner.value,true),pack=canonicalUnit(upack.value);
      if(!base)return alert("Base Unit '"+(ubase.value||'')+"' Unit Master me nahi hai. Search/select karein ya Unit Master me add karein.");
      if(inner===null)return alert("Inner Unit '"+(uinner.value||'')+"' Unit Master me nahi hai. Search/select karein ya Unit Master me add karein.");
      if(!pack)return alert("Pack Unit '"+(upack.value||'')+"' Unit Master me nahi hai. Search/select karein ya Unit Master me add karein.");
      ubase.value=base;uinner.value=inner;upack.value=pack;
      const inf=inner?Math.max(1,+uinnerfactor.value||1):1,pf=Math.max(1,+upackfactor.value||1),tf=inner?inf*pf:pf;
      const bp=Math.max(0,+ubp.value||0),bm=Math.max(0,+ubm.value||0),bs=Math.max(0,+ubs.value||0);
      const ip=Math.max(0,+uip.value||0),im=Math.max(0,+uim.value||0),isale=Math.max(0,+uis.value||0);
      const pp=Math.max(0,+upp.value||0),pm=Math.max(0,+ump.value||0),psale=Math.max(0,+usp.value||0);
      const body={Name:unm.value,Barcode:ubc.value||null,Sku:usk.value||null,CategoryId:null,Category:ucat.value||'General',Unit:base,Hsn:uhsn.value||null,GstRate:+ugst.value,Mrp:bm,PurchasePrice:bp,SalePrice:bs,MinStock:5,MaxStock:0,LocationCode:uloc.value||null,RackName:urack.value||null,ShelfName:null,TrackBatch:true,TrackExpiry:true};
      const r=await api(id?'/api/products/'+id:'/api/products',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const pid=id||r.id;
      await api('/api/products/'+pid+'/uom',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({BaseUnit:base,InnerUnit:inner||null,PackUnit:pack,ConversionFactor:tf,InnerConversionFactor:inf,PackInnerFactor:pf,PackPurchaseRate:pp,PackMrp:pm,PackSalePrice:psale,InnerPurchaseRate:ip,InnerMrp:im,InnerSalePrice:isale,LooseSalePrice:bs,AllowLoose:uloose.checked})});
      S.uoms[pid]=null;await loadUom(pid,true);closeModal();toast('Item saved — stock unit: '+base);loadProducts()
    }catch(e){alert(e.message)}
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

  window.loadPurchase=async function(){await spec();if(S.mode==='jewellery')return loadJewelleryPurchase();return loadUomPurchase()};
  async function loadUomPurchase(){
    setPage('purchase');navTitle('Purchases','Keyboard-ready Purchase · Multi Unit · Barcode Purchase');
    S.items=await api('/api/products?size=1000');S.suppliers=await api('/api/suppliers');
    const pharma=/pharmacy|medical/i.test(S.spec?.StoreType||''),history=await api('/api/purchases');
    app.innerHTML=`<div class="content purchase-page"><div class="panel purchase-hero"><div class="panelhead"><div><h3>PURCHASE INWARD</h3><p class="muted">Standard multi-unit entry or fast barcode-scanner purchase. Stock always posts in Base Unit.</p></div><span class="tag">${pharma?'BATCH + EXPIRY':'BASE STOCK'}</span></div><div class="purchase-actions"><button class="btn" onclick="openUomPurchase()">＋ New Purchase <small>F2</small></button><button class="btn green" onclick="openBarcodePurchase()">▥ Barcode Purchase <small>F4</small></button><span class="tag">F10 Save · Enter Next · Esc Close</span></div></div><div class="panel"><div class="panelhead"><h3>RECENT PURCHASES</h3><span class="tag">${history.length} RECORDS</span></div><div class="tablewrap"><table class="table"><thead><tr><th>INVOICE</th><th>SUPPLIER</th><th>DATE</th><th>SUBTOTAL</th><th>TAX</th><th>TOTAL</th><th>PAID</th><th>BALANCE</th></tr></thead><tbody>${history.map(x=>`<tr><td><b>${esc2(x.InvoiceNo)}</b></td><td>${esc2(x.SupplierName)}</td><td>${fmt(x.PurchaseDate)}</td><td>₹${money2(x.SubTotal)}</td><td>₹${money2(x.Tax)}</td><td><b>₹${money2(x.GrandTotal)}</b></td><td>₹${money2(x.PaidAmount||0)}</td><td>₹${money2((x.GrandTotal||0)-(x.PaidAmount||0))}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">No purchases yet</td></tr>'}</tbody></table></div></div></div>`;
    if(!window.__purchasePageKeyboardBound){
      window.__purchasePageKeyboardBound=true;
      document.addEventListener('keydown',e=>{
        if(document.querySelector('.modal.open')||!document.querySelector('.purchase-page'))return;
        if(e.key==='F2'){e.preventDefault();openUomPurchase()}
        if(e.key==='F4'){e.preventDefault();openBarcodePurchase()}
      },true);
    }
  }
  function purchaseModalBox(){
    const box=document.querySelector('#modal .modalbox');if(!box)return null;
    box.classList.add('purchase-modalbox');box.style.width='min(1180px,96vw)';box.style.maxWidth='1180px';box.style.maxHeight='94vh';box.style.overflow='auto';return box
  }
  function purchaseKeyboard(root,saveFn,focusId,invoiceId,supplierId){
    const box=purchaseModalBox();if(!box)return;
    box.addEventListener('keydown',e=>{
      if(e.key==='F10'){e.preventDefault();saveFn();return}
      if(e.key==='F2'&&invoiceId){e.preventDefault();document.querySelector(invoiceId)?.focus();return}
      if(e.key==='F3'&&supplierId){e.preventDefault();document.querySelector(supplierId)?.focus();return}
      if(e.key==='F4'&&focusId){e.preventDefault();document.querySelector(focusId)?.focus();return}
      if(e.key==='Escape'){e.preventDefault();closeModal();return}
      if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.altKey)return;
      const tag=(e.target.tagName||'').toLowerCase();if(!['input','select','button'].includes(tag))return;
      e.preventDefault();
      if(e.target.id==='uprod'){addUomPurchaseLine();return}
      if(e.target.id==='bpScan'){barcodePurchaseScan();return}
      const all=[...box.querySelectorAll('[data-pur-key="1"]')].filter(x=>!x.disabled&&x.offsetParent!==null);
      const i=all.indexOf(e.target);if(i>=0&&i<all.length-1){all[i+1].focus();if(all[i+1].select)all[i+1].select()}
      else if(focusId)document.querySelector(focusId)?.focus()
    });
  }
  function purchaseTopHtml(prefix){
    return `<div class="purchase-top-grid"><label>Invoice No<input id="${prefix}i" data-pur-key="1" class="input" autocomplete="off"></label><label>Supplier<select id="${prefix}sup" data-pur-key="1" class="select"><option value="">Walk-in Supplier</option>${(S.suppliers||[]).map(x=>`<option value="${x.Id}">${esc2(x.Name)}</option>`).join('')}</select></label></div>`
  }
  function purchaseBottomHtml(prefix){
    return `<div class="purchase-bottom-grid"><label>Discount<input id="${prefix}disc" data-pur-key="1" class="input" type="number" value="0" min="0" step=".01"></label><label>Paid Amount<input id="${prefix}paid" data-pur-key="1" class="input" type="number" value="0" min="0" step=".01"></label><label>Payment<select id="${prefix}m" data-pur-key="1" class="select"><option>Credit</option><option>Cash</option><option>UPI</option><option>Card</option></select></label></div>`
  }
  window.openUomPurchase=async function(){
    S.purLines=[];
    modal('New Purchase — Multi Unit',`<div class="purchase-entry purchase-standard"><div class="purchase-key-hint"><span>F2 Invoice</span><span>F3 Supplier</span><span>F4 Item</span><span>Enter Next</span><span>F10 Save</span><span>Esc Close</span></div>${purchaseTopHtml('u')}<div class="purchase-add-row"><label>Item<select id="uprod" data-pur-key="1" class="select"><option value="">Select item / barcode</option>${S.items.map(x=>`<option value="${x.Id}">${esc2(x.Name)} • ${esc2(x.Barcode||'')}</option>`).join('')}</select></label><button class="btn" data-pur-key="1" onclick="addUomPurchaseLine()">＋ Add</button></div><div id="upLines" class="purchase-lines"></div>${purchaseBottomHtml('u')}</div>`,`<button class="btn" onclick="saveUomPurchase()">✓ Save Purchase (F10)</button>`);
    purchaseKeyboard('#modal',w.saveUomPurchase,'#uprod','#ui','#usup');setTimeout(()=>document.querySelector('#upi')?.focus(),30)
  };
  window.addUomPurchaseLine=async function(){
    const id=Number(document.querySelector('#uprod')?.value);if(!id)return toast('Select item');
    const p=S.items.find(x=>x.Id===id),u=await loadUom(id),opts=uomChoices(p,u),def=opts.slice().sort((a,b)=>b.factor-a.factor)[0];
    S.purLines.push({ProductId:id,Name:p.Name,Barcode:p.Barcode||'',Uom:u,Options:opts,Unit:def.unit,Factor:def.factor,Qty:1,FreeQuantity:0,Cost:def.purchase,SalePrice:def.sale,Mrp:def.mrp,GstRate:+p.GstRate,BatchNo:'',ExpiryDate:''});renderUomPurchaseLines();
    const s=document.querySelector('#uprod');if(s)s.value='';setTimeout(()=>document.querySelector('#upLines .purchase-line-card:last-child input[data-field="Qty"]')?.focus(),20)
  };
  window.setPurchaseUom=function(i,unit){const x=S.purLines[i],o=x.Options.find(a=>a.unit===unit);if(!o)return;x.Unit=o.unit;x.Factor=o.factor;x.Cost=o.purchase;x.SalePrice=o.sale;x.Mrp=o.mrp;renderUomPurchaseLines()};
  function lineSummary(x){return `Base Qty <b>${money2((+x.Qty+(+x.FreeQuantity||0))*x.Factor)} ${esc2(x.Uom.BaseUnit)}</b> · Base Cost <b>₹${money2(x.Cost/x.Factor)}</b> · Line Total <b>₹${money2(x.Qty*x.Cost)}</b>`}
  function renderUomPurchaseLines(){
    const el=document.querySelector('#upLines');if(!el)return;
    el.innerHTML=S.purLines.map((x,i)=>`<div class="purchase-line-card" data-index="${i}"><div class="purchase-line-head"><div><b>${esc2(x.Name)}</b><small>${esc2(x.Barcode||'')} · Base ${esc2(x.Uom.BaseUnit)}</small></div><button class="btn small danger" onclick="S.purLines.splice(${i},1);renderUomPurchaseLines()">×</button></div><div class="purchase-line-fields"><label>Purchase Unit<select data-pur-key="1" class="select" onchange="setPurchaseUom(${i},this.value)">${x.Options.map(o=>`<option value="${esc2(o.unit)}" ${o.unit===x.Unit?'selected':''}>${esc2(o.unit)} ×${o.factor}</option>`).join('')}</select></label><label>Qty<input data-pur-key="1" data-field="Qty" class="input" type="number" min=".001" step=".001" value="${x.Qty}" oninput="S2(${i},'Qty',this.value)"></label><label>Free<input data-pur-key="1" class="input" type="number" min="0" step=".001" value="${x.FreeQuantity}" oninput="S2(${i},'FreeQuantity',this.value)"></label><label>Purchase / ${esc2(x.Unit)}<input data-pur-key="1" class="input" type="number" min="0" step=".01" value="${x.Cost}" oninput="S2(${i},'Cost',this.value)"></label><label>Sale / ${esc2(x.Unit)}<input data-pur-key="1" class="input" type="number" min="0" step=".01" value="${x.SalePrice}" oninput="S2(${i},'SalePrice',this.value)"></label><label>MRP / ${esc2(x.Unit)}<input data-pur-key="1" class="input" type="number" min="0" step=".01" value="${x.Mrp}" oninput="S2(${i},'Mrp',this.value)"></label><label>Batch<input data-pur-key="1" class="input" value="${esc2(x.BatchNo)}" oninput="S2(${i},'BatchNo',this.value)"></label><label>Expiry<input data-pur-key="1" class="input" type="date" value="${x.ExpiryDate}" onchange="S2(${i},'ExpiryDate',this.value)"></label></div><div class="purchase-line-summary" id="purSummary${i}">${lineSummary(x)}</div></div>`).join('')
  };
  window.renderUomPurchaseLines=renderUomPurchaseLines;
  window.S2=(i,k,v)=>{if(!S.purLines[i])return;S.purLines[i][k]=['Qty','FreeQuantity','Cost','SalePrice','Mrp'].includes(k)?+v:v;const s=document.querySelector('#purSummary'+i);if(s)s.innerHTML=lineSummary(S.purLines[i])};
  async function postPurchase(lines,prefix,note){
    if(!lines.length){toast('Add purchase items');return false;}
    const pharma=/pharmacy|medical/i.test(S.spec?.StoreType||'');
    if(pharma&&lines.some(x=>!String(x.BatchNo||'').trim())){toast('Batch No is mandatory for Pharmacy / Medical Store');return false;}
    if(lines.some(x=>!x.ExpiryDate)){toast('Expiry date is required for every batch');return false;}
    const sid=Number(document.querySelector('#'+prefix+'sup')?.value)||null,sup=(S.suppliers||[]).find(x=>x.Id===sid);
    const body={InvoiceNo:document.querySelector('#'+prefix+'i')?.value||null,SupplierId:sid,SupplierName:sup?.Name||'Walk-in Supplier',PaymentMode:document.querySelector('#'+prefix+'m')?.value||'Credit',PaidAmount:+(document.querySelector('#'+prefix+'paid')?.value||0),Discount:+(document.querySelector('#'+prefix+'disc')?.value||0),Notes:note,Lines:lines.map(x=>({ProductId:x.ProductId,Qty:x.Qty*x.Factor,FreeQuantity:x.FreeQuantity*x.Factor,Cost:x.Cost/x.Factor,SalePrice:x.SalePrice/x.Factor,Mrp:x.Mrp/x.Factor,TaxRate:x.GstRate,BatchNo:x.BatchNo||null,ManufactureDate:null,ExpiryDate:x.ExpiryDate,UnitPurchased:x.Unit,PurchasedQty:x.Qty,TotalBaseQty:x.Qty*x.Factor,RatePerPurchasedUnit:x.Cost}))};
    await api('/api/purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return true
  }
  window.saveUomPurchase=async function(){try{if(!await postPurchase(S.purLines,'u','Multi-unit purchase; inventory posted in base units'))return;closeModal();toast('Purchase saved — stock converted to base units');loadPurchase()}catch(e){alert(e.message||e)}};

  window.openBarcodePurchase=async function(){
    S.barPurLines=[];
    modal('Barcode Purchase — Keyboard Ready',`<div class="purchase-entry barcode-purchase"><div class="purchase-key-hint"><span>F2 Invoice</span><span>F3 Supplier</span><span>F4 Scan Barcode</span><span>Enter Add / Next</span><span>F10 Save</span><span>Esc Close</span></div>${purchaseTopHtml('bp')}<div class="barcode-scan-card"><label>SCAN / TYPE BARCODE<input id="bpScan" data-pur-key="1" class="input barcode-scan-input" autocomplete="off" placeholder="Scan barcode and press Enter"></label><button class="btn green" onclick="barcodePurchaseScan()">＋ Add Barcode</button></div><div id="bpLines" class="purchase-lines"></div>${purchaseBottomHtml('bp')}</div>`,`<button class="btn green" onclick="saveBarcodePurchase()">✓ Save Barcode Purchase (F10)</button>`);
    purchaseKeyboard('#modal',w.saveBarcodePurchase,'#bpScan','#bpi','#bpsup');setTimeout(()=>document.querySelector('#bpScan')?.focus(),30)
  };
  window.barcodePurchaseScan=async function(){
    const input=document.querySelector('#bpScan'),q=String(input?.value||'').trim();if(!q)return;
    const key=q.toLowerCase(),p=S.items.find(x=>String(x.Barcode||'').toLowerCase()===key||String(x.Sku||'').toLowerCase()===key);
    if(!p){toast('Barcode not found: '+q);input?.select();return}
    let row=S.barPurLines.find(x=>x.ProductId===p.Id);
    if(row){row.Qty+=1}else{const u=await loadUom(p.Id),opts=uomChoices(p,u),def=opts.find(o=>Number(o.factor)===1)||opts[0];row={ProductId:p.Id,Name:p.Name,Barcode:p.Barcode||'',Uom:u,Options:opts,Unit:def.unit,Factor:def.factor,Qty:1,FreeQuantity:0,Cost:def.purchase,SalePrice:def.sale,Mrp:def.mrp,GstRate:+p.GstRate,BatchNo:'',ExpiryDate:''};S.barPurLines.push(row)}
    if(input){input.value='';input.focus()}renderBarcodePurchaseLines()
  };
  window.barcodePurchaseUom=function(i,unit){const x=S.barPurLines[i],o=x?.Options.find(a=>a.unit===unit);if(!o)return;x.Unit=o.unit;x.Factor=o.factor;x.Cost=o.purchase;x.SalePrice=o.sale;x.Mrp=o.mrp;renderBarcodePurchaseLines()};
  window.barcodePurchaseSet=function(i,k,v){const x=S.barPurLines[i];if(!x)return;x[k]=['Qty','FreeQuantity','Cost','SalePrice','Mrp'].includes(k)?+v:v;const s=document.querySelector('#bpSummary'+i);if(s)s.innerHTML=lineSummary(x)};
  function renderBarcodePurchaseLines(){
    const el=document.querySelector('#bpLines');if(!el)return;
    const rows=S.barPurLines||[],totalQty=rows.reduce((a,x)=>a+Number(x.Qty||0),0),total=rows.reduce((a,x)=>a+Number(x.Qty||0)*Number(x.Cost||0),0);
    el.innerHTML=`<div class="barcode-purchase-table-wrap"><table class="table barcode-purchase-table"><thead><tr><th>#</th><th>BARCODE / ITEM</th><th>UNIT</th><th>QTY</th><th>FREE</th><th>PURCHASE</th><th>SALE</th><th>MRP</th><th>BATCH</th><th>EXPIRY</th><th>AMOUNT</th><th></th></tr></thead><tbody>${rows.map((x,i)=>`<tr data-index="${i}"><td>${i+1}</td><td class="bp-item"><b>${esc2(x.Barcode||'-')}</b><small>${esc2(x.Name)} · Base ${esc2(x.Uom.BaseUnit)}</small></td><td><select data-pur-key="1" class="select" onchange="barcodePurchaseUom(${i},this.value)">${x.Options.map(o=>`<option value="${esc2(o.unit)}" ${o.unit===x.Unit?'selected':''}>${esc2(o.unit)} ×${o.factor}</option>`).join('')}</select></td><td><input data-pur-key="1" class="input" type="number" min=".001" step=".001" value="${x.Qty}" oninput="barcodePurchaseSet(${i},'Qty',this.value)"></td><td><input data-pur-key="1" class="input" type="number" min="0" step=".001" value="${x.FreeQuantity}" oninput="barcodePurchaseSet(${i},'FreeQuantity',this.value)"></td><td><input data-pur-key="1" class="input" type="number" min="0" step=".01" value="${x.Cost}" oninput="barcodePurchaseSet(${i},'Cost',this.value)"></td><td><input data-pur-key="1" class="input" type="number" min="0" step=".01" value="${x.SalePrice}" oninput="barcodePurchaseSet(${i},'SalePrice',this.value)"></td><td><input data-pur-key="1" class="input" type="number" min="0" step=".01" value="${x.Mrp}" oninput="barcodePurchaseSet(${i},'Mrp',this.value)"></td><td><input data-pur-key="1" class="input" value="${esc2(x.BatchNo)}" oninput="barcodePurchaseSet(${i},'BatchNo',this.value)"></td><td><input data-pur-key="1" class="input" type="date" value="${x.ExpiryDate}" onchange="barcodePurchaseSet(${i},'ExpiryDate',this.value)"></td><td class="bp-amount"><b>₹${money2(Number(x.Qty||0)*Number(x.Cost||0))}</b><small id="bpSummary${i}">Base Qty ${money2((Number(x.Qty||0)+Number(x.FreeQuantity||0))*Number(x.Factor||1))}</small></td><td><button class="btn small danger" title="Remove line" onclick="S.barPurLines.splice(${i},1);renderBarcodePurchaseLines()">×</button></td></tr>`).join('')||'<tr><td colspan="12" class="empty">Scan a barcode to begin purchase entry</td></tr>'}</tbody><tfoot><tr><td colspan="3"><b>Purchase Totals</b></td><td><b>${money2(totalQty)}</b></td><td colspan="6"></td><td class="bp-amount"><b>₹${money2(total)}</b></td><td></td></tr></tfoot></table></div>`
  }
  window.renderBarcodePurchaseLines=renderBarcodePurchaseLines;
  window.saveBarcodePurchase=async function(){try{if(!await postPurchase(S.barPurLines,'bp','Barcode purchase; keyboard/scanner entry; inventory posted in base units'))return;closeModal();toast('Barcode Purchase saved and stock updated');loadPurchase()}catch(e){alert(e.message||e)}};

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
