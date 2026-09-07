(function(){
  const TYPES=[
    'Retail Shop','Pharmacy / Medical Store','Agriculture Product Store','Seeds & Fertilizer Store','Pesticide / Crop Care Store','General Store','Grocery Store','Supermarket','Wholesale Store','Distributor','FMCG Store','Cosmetics & Beauty Store','Personal Care Store','Stationery Store','Hardware Store','Electrical Store','Electronics Store','Mobile & Accessories Store','Garments Store','Footwear Store','Hardware & Sanitary Store','Auto Parts Store','Pet / Veterinary Store','Dairy Store','Bakery','Restaurant / Cafe','Sweet Shop','Department Store','Jewellery Shop','Other'
  ];
  const e=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const saveLoginOutlet=(o)=>{try{localStorage.setItem('suvidha_outlet_display',JSON.stringify({OutletName:o?.OutletName||'Main Outlet',StoreType:o?.StoreType||'Retail Shop'}));}catch{}};
  const restoreLoginOutlet=()=>{try{const raw=localStorage.getItem('suvidha_outlet_display');if(!raw)return;const x=JSON.parse(raw),el=document.getElementById('loginOutlet');if(el)el.textContent=(x.OutletName||'Main Outlet')+' · '+(x.StoreType||'Retail Shop');}catch{}};
  restoreLoginOutlet();
  // The login page is not authenticated yet. Redirect only the read-only specialization lookup
  // to the public endpoint; all other /api requests keep their normal authentication behavior.
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    try{
      const url=typeof input==='string'?input:(input&&input.url)||'';
      if(url==='/api/specialization' || url.startsWith('/api/specialization?')) input=url.replace('/api/specialization','/public/specialization');
    }catch{}
    return nativeFetch(input,init);
  };
  const syncPublicOutlet=async()=>{try{const r=await nativeFetch('/public/specialization',{cache:'no-store'});if(r.ok){const x=await r.json();saveLoginOutlet(x);const el=document.getElementById('loginOutlet');if(el)el.textContent=(x.OutletName||'Main Outlet')+' · '+(x.StoreType||'Retail Shop');}}catch{}};
  syncPublicOutlet();
  window.loadSettings=async function(){
    setPage('settings');title.textContent='Settings';
    try{
      const [x,o]=await Promise.all([api('/api/settings'),api('/api/outlet')]);
      const type=o.StoreType||'Retail Shop';
      saveLoginOutlet(o);
      document.querySelector('#outletPill').textContent=o.OutletName||'Main Outlet';
      document.body.dataset.storeType=type.replace(/[^a-z0-9]+/gi,'-').toLowerCase();
      app.innerHTML=`<div class="content">
        <div class="twocol">
          <div class="panel"><h3>COMPANY & INVOICE</h3><div class="formgrid">
            <label>Company Name<input id="sn" class="input" value="${e(x.CompanyName)}"></label>
            <label>Invoice Prefix<input id="si" class="input" value="${e(x.InvoicePrefix)}"></label>
            <label>Phone<input id="spn" class="input" value="${e(x.Phone)}"></label>
            <label>GSTIN<input id="sg" class="input" value="${e(x.Gstin)}"></label>
            <label class="full">Address<textarea id="sa" class="textarea">${e(x.Address)}</textarea></label>
          </div><button class="btn" style="margin-top:12px" onclick="saveSettings()">Save Settings</button></div>
          <div class="panel outlet-master-panel"><div class="panelhead"><h3>OUTLET MASTER</h3><span class="tag">ADMIN ONLY</span></div>
            <p class="muted">Select the business profile for this outlet. Normal login has no outlet selector.</p>
            <div class="formgrid">
              <label>Outlet Name<input id="oname" class="input" value="${e(o.OutletName||'Main Outlet')}"></label>
              <label>Store Type<select id="otype" class="select" onchange="applyOutletTypePreview()">${TYPES.map(t=>`<option value="${e(t)}" ${t===type?'selected':''}>${e(t)}</option>`).join('')}</select></label>
              <label>Phone<input id="ophone" class="input" value="${e(o.Phone||'')}"></label>
              <label>GSTIN<input id="ogst" class="input" value="${e(o.Gstin||'')}"></label>
              <label class="full">Address<textarea id="oaddr" class="textarea">${e(o.Address||'')}</textarea></label>
              <label class="full"><input id="oreqbatch" type="checkbox" ${o.RequireBatch?'checked':''}> Batch mandatory &nbsp;&nbsp; <input id="oreqexp" type="checkbox" ${o.RequireExpiry?'checked':''}> Expiry mandatory</label>
            </div>
            <div id="outletModePreview" class="outlet-mode-preview"></div>
            <button class="btn" style="margin-top:12px" onclick="saveOutlet()">Save Outlet Master</button>
          </div>
        </div>
        <div class="panel" style="margin-top:14px"><h3>AI CONFIGURATION</h3><p class="muted">AI import supports scanned PDF, Excel, images/handwritten notes and pasted messages.</p><div class="formgrid"><label>OpenAI API Key<input id="oaikey" class="input" type="password" placeholder="Leave blank to keep existing key"></label><label>Model<input id="oaimodel" class="input" value="gpt-5.6-luna"></label></div><button class="btn" style="margin-top:12px" onclick="saveAISettings()">Save AI Settings</button></div>
        <div class="panel" style="margin-top:14px"><h3>LOCAL DATABASE</h3><p class="muted">Database: <b>SuvidhaPOS</b> • SQL Server local</p><button class="btn" onclick="backup()">💾 Create Backup Now</button></div>
      </div>`;
      applyOutletTypePreview();
      if(window.refreshAiKeyStatus) await window.refreshAiKeyStatus();
    }catch(err){app.innerHTML=`<div class="content"><div class="alert">${e(err.message)}</div></div>`}
  };
  window.applyOutletTypePreview=function(){
    const v=document.querySelector('#otype')?.value||'Retail Shop', box=document.querySelector('#outletModePreview');if(!box)return;
    const jewellery=/jewell?ry|gold|silver/i.test(v);
    if(jewellery){box.innerHTML='<div class="outlet-mode-jewellery"><b>💎 JEWELLERY BILLING MODE</b><span>New Billing, Item Master and Purchase will use Jewellery flow: tag/barcode, metal purity, gross/net weight, making charges, stones, HUID, live metal rates and old-metal adjustment.</span></div>'}
    else{box.innerHTML='<div class="outlet-mode-standard"><b>▣ STANDARD / UOM BILLING MODE</b><span>Normal billing flow is active. Packaging/UOM conversion can be used where configured.</span></div>'}
  };
  window.saveOutlet=async function(){
    const o={OutletName:oname.value.trim()||'Main Outlet',StoreType:otype.value,Address:oaddr.value||null,Phone:ophone.value||null,Gstin:ogst.value||null,RequireBatch:oreqbatch.checked,RequireExpiry:oreqexp.checked,DefaultUnit:'PCS'};
    try{await api('/api/outlet',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});saveLoginOutlet(o);const loginEl=document.getElementById('loginOutlet');if(loginEl)loginEl.textContent=o.OutletName+' · '+o.StoreType;document.querySelector('#outletPill').textContent=o.OutletName;document.body.dataset.storeType=o.StoreType.replace(/[^a-z0-9]+/gi,'-').toLowerCase();toast(o.StoreType==='Jewellery Shop'?'Jewellery Billing Mode enabled':'Outlet Master saved');await loadSettings();}catch(err){alert(err.message)}};
})();
