(function(){
  const fixed=[{name:'GST 0%',rate:0},{name:'GST 3%',rate:3},{name:'GST 5%',rate:5},{name:'GST 18%',rate:18},{name:'GST 40%',rate:40}]; let taxes=fixed.slice();
  const escT=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const loadTaxes=async()=>{try{const rows=await api('/api/taxes');if(rows?.length)taxes=rows.map(x=>({id:x.Id,name:x.TaxName,rate:Number(x.Rate),isDefault:!!x.IsDefault}));}catch{}return taxes};
  const options=value=>taxes.map(x=>`<option value="${x.rate}" ${Number(value)===x.rate?'selected':''}>${escT(x.name)}</option>`).join('');
  window.taxOptionsHtml=options; window.normalizeTaxValue=v=>{const n=Number(String(v??'').replace('%','').trim());const hit=taxes.find(x=>x.rate===n);return hit?hit.rate:(Number.isFinite(n)?n:0)};
  const controlCaption=el=>{
    const label=el.closest('label');
    if(!label)return '';
    return Array.from(label.childNodes)
      .filter(n=>n.nodeType===Node.TEXT_NODE)
      .map(n=>n.textContent||'').join(' ').trim().toLowerCase();
  };
  const isTaxControl=el=>{
    if(!el)return false;
    if(el.dataset.noTaxEnhance==='1'||el.dataset.reportMaster==='1'||el.id==='reportType')return false;
    const id=(el.id||'').toLowerCase(),name=(el.name||'').toLowerCase(),caption=controlCaption(el);
    return /(gst|tax)/.test(id+' '+name+' '+caption);
  };
  function enhance(root=document){
    root.querySelectorAll('input[type="number"]').forEach(input=>{
      if(input.dataset.taxEnhanced==='1'||!isTaxControl(input))return;
      input.dataset.taxEnhanced='1';
      input.setAttribute('list','suvidhaTaxList');
      let dl=document.getElementById('suvidhaTaxList');
      if(!dl){dl=document.createElement('datalist');dl.id='suvidhaTaxList';document.body.appendChild(dl)}
      dl.innerHTML=taxes.map(x=>`<option value="${x.rate}">${escT(x.name)}</option>`).join('');
      const sel=document.createElement('select');
      sel.className='select tax-inline-select';
      sel.innerHTML=options(input.value);
      sel.title='Select GST / Tax';
      sel.addEventListener('change',()=>{input.value=sel.value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))});
      input.addEventListener('input',()=>{const n=Number(input.value);const hit=taxes.find(x=>x.rate===n);sel.value=hit?String(hit.rate):''});
      input.parentNode.insertBefore(sel,input)
    });
    root.querySelectorAll('select').forEach(sel=>{
      if(sel.dataset.taxEnhanced==='1'||sel.classList.contains('tax-inline-select')||!isTaxControl(sel))return;
      sel.dataset.taxEnhanced='1';
      const current=sel.value;
      sel.innerHTML=options(current)+`<option value="${escT(current)}" ${!taxes.some(x=>String(x.rate)===String(current))?'selected':''}>Custom ${escT(current)}%</option>`
    })
  }
  window.refreshTaxControls=async()=>{await loadTaxes();document.querySelectorAll('.tax-inline-select').forEach(x=>x.remove());document.querySelectorAll('[data-tax-enhanced="1"]').forEach(x=>delete x.dataset.taxEnhanced);enhance(document)};
  window.loadTaxmaster=async function(){setPage('taxmaster');title.textContent='Tax Master';document.querySelector('header p').textContent='Fixed GST slabs + optional custom taxes';await loadTaxes();app.innerHTML=`<div class="content"><div class="panel"><div class="panelhead"><div><h3>GST / TAX MASTER</h3><p class="muted">Default slabs: GST 0%, GST 3%, GST 5%, GST 18%, GST 40%. Add extra tax rates only when required.</p></div><button class="btn" onclick="openTaxAdd()">＋ Add Custom Tax</button></div><div class="tablewrap"><table class="table"><thead><tr><th>TAX NAME</th><th>RATE</th><th>TYPE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>${taxes.map(x=>`<tr><td><b>${escT(x.name)}</b></td><td>${x.rate}%</td><td>${x.isDefault?'Default GST':'Custom'}</td><td><span class="status ok">ACTIVE</span></td><td>${x.isDefault?'<span class="muted">Protected</span>':`<button class="btn small" onclick="editTax(${x.id},'${escT(x.name)}',${x.rate})">Edit</button> <button class="btn small danger" onclick="deleteTax(${x.id})">Delete</button>`}</td></tr>`).join('')}</tbody></table></div></div></div>`};
  window.openTaxAdd=()=>modal('Add Custom Tax',`<div class="formgrid"><label>Tax Name<input id="tnm" class="input" placeholder="Example: Local Cess"></label><label>Rate %<input id="trt" class="input" type="number" step="0.01" min="0" max="100" placeholder="2.00"></label></div><p class="muted">Custom taxes appear in GST/Tax dropdowns after saving.</p>`,`<button class="btn" onclick="saveTax(0)">Save Tax</button>`);
  window.editTax=(id,name,rate)=>modal('Edit Custom Tax',`<div class="formgrid"><label>Tax Name<input id="tnm" class="input" value="${escT(name)}"></label><label>Rate %<input id="trt" class="input" type="number" step="0.01" min="0" max="100" value="${rate}"></label></div>`,`<button class="btn" onclick="saveTax(${id})">Update Tax</button>`);
  window.saveTax=async id=>{try{await api(id?'/api/taxes/'+id:'/api/taxes',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({TaxName:tnm.value,Rate:+trt.value})});closeModal();await loadTaxmaster();toast('Tax Master saved');await refreshTaxControls()}catch(e){alert(e.message)}};
  window.deleteTax=async id=>{if(!confirm('Delete this custom tax?'))return;try{await api('/api/taxes/'+id,{method:'DELETE'});await loadTaxmaster();await refreshTaxControls();toast('Tax removed')}catch(e){alert(e.message)}};
  document.addEventListener('click',e=>{const b=e.target.closest('.nav[data-page="taxmaster"]');if(b){e.stopImmediatePropagation();loadTaxmaster()}} ,true);
  const mo=new MutationObserver(()=>enhance(document));mo.observe(document.body,{childList:true,subtree:true}); loadTaxes().then(()=>enhance(document));
})();