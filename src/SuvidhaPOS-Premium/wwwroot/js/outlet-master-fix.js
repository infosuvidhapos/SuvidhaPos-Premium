(function(){
  const e=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const canonicalType=v=>/^(Gold & Diamond Jewellery|Silver Jewellery)$/i.test(String(v||'').trim())?'Jewellery Shop':(String(v||'').trim()||'Retail Shop');
  const saveLoginOutlet=(o)=>{try{localStorage.setItem('suvidha_outlet_display',JSON.stringify({OutletName:o?.OutletName||'Main Outlet',StoreType:canonicalType(o?.StoreType||'Retail Shop')}));}catch{}};
  const restoreLoginOutlet=()=>{try{const raw=localStorage.getItem('suvidha_outlet_display');if(!raw)return;const x=JSON.parse(raw),el=document.getElementById('loginOutlet');if(el)el.textContent=(x.OutletName||'Main Outlet')+' · '+canonicalType(x.StoreType||'Retail Shop');}catch{}};
  restoreLoginOutlet();
  window.loadSettings=async function(){
    setPage('settings');title.textContent='Settings';
    try{
      const [x,o]=await Promise.all([api('/api/settings'),api('/api/outlet')]);
      const type=canonicalType(o.StoreType||'Retail Shop');
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
            <p class="muted">Outlet details can be edited here. Store Type is controlled only from SuvidhaPremium website and syncs through the signed license.</p>
            <div class="formgrid">
              <label>Outlet Name<input id="oname" class="input" value="${e(o.OutletName||'Main Outlet')}"></label>
              <label>Store Type<input id="otype" class="input" value="${e(type)}" readonly title="Managed from SuvidhaPremium website"></label>
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
    const o={
      OutletName:oname.value.trim()||'Main Outlet',
      StoreType:canonicalType(otype.value),
      Address:oaddr.value||null,Phone:ophone.value||null,Gstin:ogst.value||null,
      RequireBatch:oreqbatch.checked,RequireExpiry:oreqexp.checked,DefaultUnit:'PCS'
    };
    try{
      await api('/api/outlet',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});
      saveLoginOutlet(o);
      const loginEl=document.getElementById('loginOutlet');if(loginEl)loginEl.textContent=o.OutletName+' · '+o.StoreType;
      const pill=document.querySelector('#outletPill');if(pill)pill.textContent=o.OutletName;
      document.body.dataset.storeType=o.StoreType.replace(/[^a-z0-9]+/gi,'-').toLowerCase();
      if(window.refreshLoginOutlet)await window.refreshLoginOutlet(true);
      window.dispatchEvent(new CustomEvent('suvidha:outlet-saved',{detail:o}));
      toast('Outlet details saved — Store Type remains managed by SuvidhaPremium');
      setTimeout(()=>location.replace('/?outlet='+Date.now()),450);
    }catch(err){alert(err.message)}
  };
})();
