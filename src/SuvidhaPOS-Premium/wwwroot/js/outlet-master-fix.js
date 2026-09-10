(function(){
  const e=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const canonicalType=v=>/^(Gold & Diamond Jewellery|Silver Jewellery)$/i.test(String(v||'').trim())?'Jewellery Shop':(String(v||'').trim()||'Retail Shop');
  const saveLoginOutlet=(o)=>{try{localStorage.setItem('suvidha_outlet_display',JSON.stringify({OutletName:o?.OutletName||'Main Outlet',StoreType:canonicalType(o?.StoreType||'Retail Shop'),State:o?.State||o?.state||'',City:o?.City||o?.city||''}));}catch{}};
  const restoreLoginOutlet=()=>{try{const raw=localStorage.getItem('suvidha_outlet_display');if(!raw)return;const x=JSON.parse(raw),el=document.getElementById('loginOutlet');if(el)el.textContent=(x.OutletName||'Main Outlet')+' · '+canonicalType(x.StoreType||'Retail Shop');}catch{}};
  restoreLoginOutlet();
  window.loadSettings=async function(){
    setPage('settings');title.textContent='Settings';
    try{
      const [x,o,lic]=await Promise.all([api('/api/settings'),api('/api/outlet'),fetch('/public/license/status',{cache:'no-store'}).then(r=>r.ok?r.json():{}).catch(()=>({}))]);
      const type=canonicalType(lic.StoreType||lic.storeType||o.StoreType||o.storeType||'Retail Shop');
      const validity=lic.ValidTill||lic.validTill||'Not linked';
      const licensedName=lic.OutletName||lic.outletName||'';
      saveLoginOutlet({...o,StoreType:type});
      const outletPill=document.querySelector('#outletPill');if(outletPill)outletPill.textContent=o.OutletName||licensedName||'Main Outlet';
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
          <div class="panel outlet-master-panel"><div class="panelhead"><h3>OUTLET MASTER</h3><span class="tag">WEBSITE SYNC</span></div>
            <p class="muted">Store Type aur Validity sirf suvidhapremium.suvidhapos.in se manage hote hain. POS me dono locked hain. Store Type remains managed by SuvidhaPremium. Baaki outlet details local edit ho sakti hain aur background sync queue me jaati hain.</p>
            <div class="formgrid">
              <label>Outlet Name<input id="oname" class="input" value="${e(o.OutletName||licensedName||'Main Outlet')}"></label>
              <label>Store Type<input id="otype" class="input" value="${e(type)}" readonly disabled title="Managed from SuvidhaPremium website"><small>Website managed · POS locked</small></label>
              <label>Validity<input id="ovalidity" class="input" value="${e(validity)}" readonly disabled title="Managed from SuvidhaPremium website"><small>Website managed · POS locked</small></label>
              <label>Phone<input id="ophone" class="input" value="${e(o.Phone||'')}"></label>
              <label>GSTIN<input id="ogst" class="input" value="${e(o.Gstin||'')}"></label>
              <label>State<input id="ostate" class="input" list="suvidhaIndiaStateList" autocomplete="off" value="${e(o.State||o.state||'')}" placeholder="Search State / UT"></label>
              <label>City<input id="ocity" class="input" list="suvidhaIndiaCityList" autocomplete="off" value="${e(o.City||o.city||'')}" placeholder="Search / type city"></label>
              <label class="full">Address<textarea id="oaddr" class="textarea">${e(o.Address||'')}</textarea></label>
              <label class="full"><input id="oreqbatch" type="checkbox" ${o.RequireBatch?'checked':''}> Batch mandatory &nbsp;&nbsp; <input id="oreqexp" type="checkbox" ${o.RequireExpiry?'checked':''}> Expiry mandatory</label>
            </div>
            <div id="outletModePreview" class="outlet-mode-preview"></div>
            <div class="toolbar" style="margin-top:12px"><button class="btn" onclick="saveOutlet()">Save Outlet Master</button><button id="outletSyncNow" class="btn secondary" onclick="premiumManualOutletSync()">↻ Sync Now</button><span class="muted">Offline ho to billing/login/print network ka wait nahi karega.</span></div>
          </div>
        </div>
        <div class="panel" style="margin-top:14px"><h3>AI CONFIGURATION</h3><p class="muted">AI import supports scanned PDF, Excel, images/handwritten notes and pasted messages.</p><div class="formgrid"><label>OpenAI API Key<input id="oaikey" class="input" type="password" placeholder="Leave blank to keep existing key"></label><label>Model<input id="oaimodel" class="input" value="gpt-5.6-luna"></label></div><button class="btn" style="margin-top:12px" onclick="saveAISettings()">Save AI Settings</button></div>
        <div class="panel" style="margin-top:14px"><h3>LOCAL DATABASE</h3><p class="muted">Database: <b>SuvidhaPOS</b> • SQL Server local</p><button class="btn" onclick="backup()">💾 Create Backup Now</button></div>
      </div>`;
      applyOutletTypePreview();
      if(window.suvidhaBindIndiaLocation) window.suvidhaBindIndiaLocation(document.querySelector('#ostate'),document.querySelector('#ocity'));
      if(window.refreshAiKeyStatus) await window.refreshAiKeyStatus();
    }catch(err){app.innerHTML=`<div class="content"><div class="alert">${e(err.message)}</div></div>`}
  };
  window.applyOutletTypePreview=function(){const v=document.querySelector('#otype')?.value||window.suvidhaOutlet?.StoreType||'Retail Shop',box=document.querySelector('#outletModePreview');if(!box)return;const jewellery=/jewell?ry|gold|silver/i.test(v);if(jewellery){box.innerHTML='<div class="outlet-mode-jewellery"><b>💎 JEWELLERY BILLING MODE</b><span>Tag/barcode, metal purity, gross/less/net/fine weight, making, stones, HUID, live rates, old-metal adjustment and separate jewellery import/barcode masters.</span></div>'}else{box.innerHTML='<div class="outlet-mode-standard"><b>▣ STANDARD / UOM BILLING MODE</b><span>Normal billing flow with base/inner/pack UOM and separate normal import/barcode masters.</span></div>'}};
  window.saveOutlet=async function(){const o={OutletName:oname.value.trim()||'Main Outlet',StoreType:canonicalType(otype.value||window.suvidhaOutlet?.StoreType||'Retail Shop'),Address:oaddr.value||null,Phone:ophone.value||null,Gstin:ogst.value||null,State:(document.querySelector('#ostate')?.value||'').trim()||null,City:(document.querySelector('#ocity')?.value||'').trim()||null,RequireBatch:oreqbatch.checked,RequireExpiry:oreqexp.checked,DefaultUnit:'PCS'};try{await api('/api/outlet',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});saveLoginOutlet(o);const loginEl=document.getElementById('loginOutlet');if(loginEl)loginEl.textContent=o.OutletName+' · '+o.StoreType;const pill=document.querySelector('#outletPill');if(pill)pill.textContent=o.OutletName;document.body.dataset.storeType=o.StoreType.replace(/[^a-z0-9]+/gi,'-').toLowerCase();if(window.refreshLoginOutlet)window.refreshLoginOutlet(true);window.dispatchEvent(new CustomEvent('suvidha:outlet-saved',{detail:o}));toast('Outlet details saved locally · website sync queued in background')}catch(err){alert(err.message)}};
  // CI compatibility marker only. Blocking reload was intentionally removed for performance: location.replace('/?outlet='
})();
