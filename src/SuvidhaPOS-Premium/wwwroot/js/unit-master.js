(function(){
'use strict';
const U={rows:[]};
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=(x,a,b)=>x&&x[a]!==undefined?x[a]:x?.[b];
function norm(x){return {Id:Number(val(x,'Id','id')),UnitName:String(val(x,'UnitName','unitName')||''),UnitCode:String(val(x,'UnitCode','unitCode')||''),Description:String(val(x,'Description','description')||''),UnitCategory:String(val(x,'UnitCategory','unitCategory')||'CUSTOM'),SortOrder:Number(val(x,'SortOrder','sortOrder')||100),IsActive:!!val(x,'IsActive','isActive'),IsSystem:!!val(x,'IsSystem','isSystem'),UsageCount:Number(val(x,'UsageCount','usageCount')||0)}}
async function loadRows(){U.rows=(await api('/api/unit-master?includeInactive=true')).map(norm)}
function render(){
 const q=(document.querySelector('#unitQ')?.value||'').trim().toLowerCase(),cat=document.querySelector('#unitCat')?.value||'ALL',status=document.querySelector('#unitStatus')?.value||'ALL';
 const rows=U.rows.filter(x=>(!q||[x.UnitName,x.UnitCode,x.Description,x.UnitCategory].join(' ').toLowerCase().includes(q))&&(cat==='ALL'||x.UnitCategory===cat)&&(status==='ALL'||(status==='ACTIVE')===x.IsActive));
 const body=document.querySelector('#unitRows');if(!body)return;
 body.innerHTML=rows.map(x=>`<tr><td><b>${e(x.UnitName)}</b><br><small class="muted">${e(x.Description||'')}</small></td><td><span class="tag">${e(x.UnitCode)}</span></td><td>${e(x.UnitCategory)}</td><td>${x.UsageCount}</td><td><span class="status ${x.IsActive?'ok':'out'}">${x.IsActive?'Active':'Inactive'}</span></td><td>${x.IsSystem?'Predefined':'Custom'}</td><td><button class="btn small" onclick="openUnitEditor(${x.Id})">Edit</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">No units found</td></tr>'
}
window.loadUnitMaster=async function(){
 setPage('unitmaster');title.textContent='Unit Master';document.querySelector('header p').textContent='Predefined searchable units with duplicate protection';
 try{await loadRows();app.innerHTML=`<div class="content"><div class="toolbar"><input id="unitQ" class="input" placeholder="Search unit / code / category..." oninput="unitMasterRender()"><select id="unitCat" class="select" onchange="unitMasterRender()"><option>ALL</option><option>COUNT</option><option>MEDICAL</option><option>PACKAGING</option><option>WEIGHT</option><option>VOLUME</option><option>LENGTH</option><option>CUSTOM</option></select><select id="unitStatus" class="select" onchange="unitMasterRender()"><option>ALL</option><option>ACTIVE</option><option>INACTIVE</option></select><button class="btn" onclick="openUnitEditor(0)">＋ Add Unit</button></div><div class="panel"><div class="panelhead"><div><h3>UNIT MASTER</h3><p class="muted">Item Master Base / Inner / Pack unit fields use only active units from this master. Unit Name and Unit Code are unique.</p></div><span class="tag">${U.rows.length} UNITS</span></div><div class="tablewrap"><table class="table"><thead><tr><th>UNIT</th><th>CODE</th><th>CATEGORY</th><th>USED</th><th>STATUS</th><th>TYPE</th><th></th></tr></thead><tbody id="unitRows"></tbody></table></div></div></div>`;render()}catch(err){app.innerHTML=errorBox(err)}
};
window.loadUnitmaster=window.loadUnitMaster;
window.unitMasterRender=render;
window.openUnitEditor=function(id){
 const x=U.rows.find(a=>a.Id===id)||{Id:0,UnitName:'',UnitCode:'',Description:'',UnitCategory:'COUNT',SortOrder:100,IsActive:true,IsSystem:false,UsageCount:0};
 modal((id?'Edit':'Add')+' Unit',`<div class="alert">Duplicate Unit Name / Unit Code allowed nahi hai. Example: TABLET / TAB, BOX / BOX, LITRE / LTR.</div><div class="formgrid"><label>Unit Name<input id="umName" class="input" value="${e(x.UnitName)}" placeholder="TABLET"></label><label>Unit Code<input id="umCode" class="input" value="${e(x.UnitCode)}" placeholder="TAB"></label><label>Category<select id="umCategory" class="select"><option>COUNT</option><option>MEDICAL</option><option>PACKAGING</option><option>WEIGHT</option><option>VOLUME</option><option>LENGTH</option><option>CUSTOM</option></select></label><label>Sort Order<input id="umSort" class="input" type="number" value="${x.SortOrder||100}"></label><label class="full">Description<input id="umDescription" class="input" value="${e(x.Description)}" placeholder="Display / usage note"></label><label class="full"><input id="umActive" type="checkbox" ${x.IsActive?'checked':''}> Active ${x.UsageCount?'<span class="muted">('+x.UsageCount+' existing reference(s); used units cannot be deactivated)</span>':''}</label></div>`,`<button class="btn" onclick="saveUnitMaster(${id})">Save Unit</button>`);
 document.querySelector('#umCategory').value=x.UnitCategory||'CUSTOM';setTimeout(()=>document.querySelector('#umName')?.focus(),40)
};
window.saveUnitMaster=async function(id){
 const body={UnitName:(umName.value||'').trim(),UnitCode:(umCode.value||'').trim(),Description:(umDescription.value||'').trim()||null,UnitCategory:umCategory.value,SortOrder:Number(umSort.value||100),IsActive:umActive.checked};
 if(!body.UnitName||!body.UnitCode)return alert('Unit Name and Unit Code are required');
 try{await api(id?'/api/unit-master/'+id:'/api/unit-master',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});closeModal();toast(id?'Unit updated':'Unit added');if(window.S){S.units=null}await loadUnitMaster()}catch(err){alert(err.message)}
};
})();