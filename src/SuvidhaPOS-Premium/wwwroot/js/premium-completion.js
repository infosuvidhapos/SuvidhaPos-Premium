(function(w,d){
'use strict';
var C={flags:{},stones:[],normalRows:[],jewelRows:[],normalValidation:[],jewelValidation:[],barcodeScope:'NORMAL',barcodeTemplate:'N01',barcodeItems:[]};
w.__premiumCompletion=C;
function e(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function n(v){if(typeof v==='number')return isFinite(v)?v:0;var x=Number(String(v==null?'':v).replace(/[₹,%\s]/g,'').replace(/,/g,''));return isFinite(x)?x:0}
function money(v){return n(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
function jewel(){return d.body.classList.contains('jewel-suite-mode')||String((w.suvidhaOutlet||{}).StoreType||'').toLowerCase()==='jewellery shop'}
function enabled(code){var f=C.flags[code];return f===undefined?true:!!f}
async function loadFlags(){try{var a=await api('/api/premium/features');C.flags={};(a||[]).forEach(function(x){C.flags[x.PointerCode]=!!x.IsEnabled});ensureNav()}catch(_){}}
function head(page,t,sub){setPage(page);title.textContent=t;var p=d.querySelector('header p');if(p)p.textContent=sub}
function role(){return String((w.currentUser||{}).Role||'').toLowerCase()}
function manager(){return ['admin','administrator','manager'].indexOf(role())>=0}
function notify(x){try{toast(x)}catch(_){alert(x)}}

function ensureNav(){
 var side=d.getElementById('sidebar');if(!side)return;
 if(!jewel()){
   var ai=side.querySelector('[data-page="aiimport"] span');if(ai)ai.textContent='AI Import';var im=side.querySelector('[data-page="itemimport"] span');if(im)im.textContent='Item Import Master';
   var bottom=side.querySelector('.sidebottom');
   if(bottom&&enabled('P-03')&&!d.getElementById('barcodeMasterNav')){
     var b=d.createElement('button');b.id='barcodeMasterNav';b.className='plain';b.innerHTML='▥ Barcode Print Master';b.onclick=function(){w.loadBarcodePrintMaster()};bottom.insertBefore(b,bottom.querySelector('.logoutBtn')||bottom.firstChild);
   }
   if(bottom&&enabled('P-20')&&!d.getElementById('featureControlNav')){
     var f=d.createElement('button');f.id='featureControlNav';f.className='plain';f.innerHTML='⚑ Feature Control';f.onclick=function(){w.loadPremiumFeatureControl()};bottom.appendChild(f);
   }
 }else{
   if(side.querySelector('[data-premium-completion="1"]'))return;
   var sections=[].slice.call(side.querySelectorAll('.js-section'));var master=sections.find(function(x){return x.textContent.trim()==='MASTERS'});
   if(master){
     var wrap=d.createElement('div');wrap.setAttribute('data-premium-completion','1');
     wrap.innerHTML=(enabled('P-01')?'<button class="nav js-nav" onclick="loadJewelleryItemMaster()">◆<span>Item Master</span></button>':'')+
       (enabled('P-05')?'<button class="nav js-nav" onclick="loadJewelleryItemImportMaster()">⇩<span>Item Import Master</span></button>':'')+
       (enabled('P-03')?'<button class="nav js-nav" onclick="loadBarcodePrintMaster()">▥<span>Barcode Print Master</span></button>':'')+
       (enabled('P-20')?'<button class="nav js-nav" onclick="loadPremiumFeatureControl()">⚑<span>Feature Control</span></button>':'');
     master.insertAdjacentElement('afterend',wrap);
   }
 }
}
new MutationObserver(function(){ensureNav()}).observe(d.getElementById('sidebar')||d.documentElement,{childList:true,subtree:true});

w.loadPremiumFeatureControl=async function(){
 head('settings','Premium Feature Control','P-01 to P-20 reversible feature flags');
 if(!manager())return app.innerHTML='<div class="content"><div class="alert">Admin / Manager permission required.</div></div>';
 var rows=[];try{rows=await api('/api/premium/features')}catch(err){return app.innerHTML='<div class="content"><div class="alert">'+e(err.message)+'</div></div>'}
 app.innerHTML='<div class="content completion-page"><div class="panel completion-hero"><div><span class="completion-kicker">REVERSIBLE POINTERS</span><h2>P-01 → P-20 Feature Control</h2><p>Disable only the requested module without removing data or schema.</p></div><span class="tag">ADMIN</span></div><div class="panel"><div class="feature-grid">'+rows.map(function(x){return '<label class="feature-flag"><span><b>'+e(x.PointerCode)+'</b><strong>'+e(x.FeatureName)+'</strong></span><input type="checkbox" '+(x.IsEnabled?'checked':'')+' onchange="premiumToggleFeature(\''+e(x.PointerCode)+'\',this.checked)"></label>'}).join('')+'</div></div></div>';
};
w.premiumToggleFeature=async function(code,on){try{await api('/api/premium/features/'+encodeURIComponent(code),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({IsEnabled:on})});C.flags[code]=on;notify(code+' '+(on?'enabled':'disabled'));setTimeout(function(){location.reload()},300)}catch(err){alert(err.message)}};

function purity(v,pct){
 var s=String(v||'').trim().toUpperCase().replace(/\s+/g,'');
 if(s==='916'||s==='22CT'||s==='22K')return {name:'22K',pct:n(pct)||91.6};
 if(s==='750'||s==='18CT'||s==='18K')return {name:'18K',pct:n(pct)||75};
 if(s==='585'||s==='14CT'||s==='14K')return {name:'14K',pct:n(pct)||58.5};
 if(s==='999'||s==='24CT'||s==='24K')return {name:'24K',pct:n(pct)||99.9};
 if(s==='925')return {name:'925',pct:n(pct)||92.5};
 return {name:s||'22K',pct:n(pct)||91.6};
}
function jewelCalc(){
 var g=d.getElementById('pjGross'),l=d.getElementById('pjLess'),net=d.getElementById('pjNet'),pp=d.getElementById('pjPurityPct'),fine=d.getElementById('pjFine');
 if(!g||!l||!net||!pp||!fine)return;
 var nv=Math.max(0,n(g.value)-n(l.value));net.value=nv.toFixed(4);fine.value=(nv*n(pp.value)/100).toFixed(4);
}
w.premiumPurityChange=function(){
 var sel=d.getElementById('pjPurity'),pp=d.getElementById('pjPurityPct');if(!sel||!pp)return;
 var p=purity(sel.value,0);pp.value=p.pct;jewelCalc();
};
w.premiumJewelleryCalc=jewelCalc;

w.loadJewelleryItemMaster=async function(){
 if(!enabled('P-01'))return notify('P-01 is disabled');
 head('products','Jewellery Item Master','Premium tag, HUID, metal, stone, making, tax and inventory master');
 var rows=[];try{rows=await api('/api/jewellery/item-master')}catch(err){return app.innerHTML='<div class="content"><div class="alert">'+e(err.message)+'</div></div>'}
 var stock=rows.filter(function(x){return x.Status==='IN_STOCK'}).length,wt=rows.reduce(function(a,x){return a+n(x.NetWeight)},0);
 app.innerHTML='<div class="content completion-page jewellery-item-master"><div class="metricrow"><div class="mini">Total Tags<b>'+rows.length+'</b></div><div class="mini">In Stock<b>'+stock+'</b></div><div class="mini">Net Weight<b>'+money(wt)+' g</b></div><div class="mini">HUID Tags<b>'+rows.filter(function(x){return !!x.Huid}).length+'</b></div></div>'+
 '<div class="panel completion-toolbar"><div><span class="completion-kicker">P-01 / P-08</span><h3>JEWELLERY ITEM MASTER</h3></div><div class="toolbar"><input id="pjSearch" class="input" placeholder="Tag, barcode, HUID, design, item..." oninput="premiumFilterRows(\'pjRows\',this.value)"><button class="btn" onclick="openPremiumJewelleryItem()">＋ New Jewellery Item</button><button class="btn secondary" onclick="loadJewelleryItemImportMaster()">⇩ Import</button><button class="btn secondary" onclick="loadBarcodePrintMaster()">▥ Barcode</button></div></div>'+
 '<div class="panel"><div class="tablewrap"><table class="table premium-jewel-table"><thead><tr><th>TAG / DESIGN</th><th>ITEM</th><th>METAL</th><th>HUID / HALLMARK</th><th>GROSS</th><th>LESS</th><th>NET</th><th>FINE</th><th>STONE</th><th>MAKING</th><th>GST</th><th>LOCATION</th><th>STATUS</th><th></th></tr></thead><tbody id="pjRows">'+rows.map(function(x){return '<tr><td><b>'+e(x.TagNo)+'</b><br><small>'+e(x.DesignCode||'-')+'</small></td><td>'+e(x.ItemName)+'<br><small>'+e(x.Category||'')+'</small></td><td>'+e(x.MetalType)+' '+e(x.Purity)+'</td><td>'+e(x.Huid||'-')+'<br><small>'+e(x.HallmarkStatus||'')+'</small></td><td>'+n(x.GrossWeight).toFixed(3)+'</td><td>'+n(x.LessWeight).toFixed(3)+'</td><td>'+n(x.NetWeight).toFixed(3)+'</td><td>'+n(x.FineWeight).toFixed(3)+'</td><td>'+e(x.StoneType||'-')+' '+n(x.StoneCarat).toFixed(3)+'ct</td><td>'+e(x.MakingChargeType)+' '+money(x.MakingValue)+'</td><td>'+e(x.GstMode)+' '+n(x.GstRate)+'%</td><td>'+e(x.LocationCode||x.RackName||'-')+'</td><td><span class="status '+(x.Status==='IN_STOCK'?'ok':'info')+'">'+e(x.Status)+'</span></td><td><button class="btn small" onclick="openPremiumJewelleryItem('+x.Id+')">Edit</button></td></tr>'}).join('')+'</tbody></table></div></div></div>';
};
w.premiumFilterRows=function(id,q){var term=String(q||'').toLowerCase();d.querySelectorAll('#'+id+' tr').forEach(function(r){r.style.display=r.textContent.toLowerCase().includes(term)?'':'none'})};

function stoneRow(x,i){
 x=x||{};return '<div class="stone-row"><input class="input" placeholder="Stone type" value="'+e(x.StoneType||'')+'" onchange="premiumStoneSet('+i+',\'StoneType\',this.value)"><input class="input" type="number" placeholder="Pcs" value="'+n(x.Pieces)+'" onchange="premiumStoneSet('+i+',\'Pieces\',this.value)"><input class="input" type="number" step="0.0001" placeholder="Weight g" value="'+n(x.Weight)+'" onchange="premiumStoneSet('+i+',\'Weight\',this.value)"><input class="input" type="number" step="0.0001" placeholder="Carat" value="'+n(x.Carat)+'" onchange="premiumStoneSet('+i+',\'Carat\',this.value)"><input class="input" type="number" step="0.01" placeholder="Rate" value="'+n(x.Rate)+'" onchange="premiumStoneSet('+i+',\'Rate\',this.value)"><input class="input" type="number" step="0.01" placeholder="Amount" value="'+n(x.Amount)+'" onchange="premiumStoneSet('+i+',\'Amount\',this.value)"><input class="input" placeholder="Certificate" value="'+e(x.CertificateNo||'')+'" onchange="premiumStoneSet('+i+',\'CertificateNo\',this.value)"><input class="input" placeholder="Lab" value="'+e(x.Lab||'')+'" onchange="premiumStoneSet('+i+',\'Lab\',this.value)"><button class="btn small danger" onclick="premiumRemoveStone('+i+')">×</button></div>';
}
w.premiumStoneSet=function(i,k,v){if(!C.stones[i])return;C.stones[i][k]=['Pieces','Weight','Carat','Rate','Amount'].indexOf(k)>=0?n(v):v};
w.premiumAddStone=function(){C.stones.push({StoneType:'',Pieces:0,Weight:0,Carat:0,Rate:0,Amount:0,CertificateNo:'',Lab:''});premiumRenderStones()};
w.premiumRemoveStone=function(i){C.stones.splice(i,1);premiumRenderStones()};
function premiumRenderStones(){var b=d.getElementById('pjStoneRows');if(b)b.innerHTML=C.stones.map(stoneRow).join('')||'<div class="muted">No extra stone rows. Main stone fields can still be used.</div>'}

w.openPremiumJewelleryItem=async function(id){
 var x={},stones=[];if(id){try{var z=await api('/api/jewellery/item-master/'+id);x=z.item||{};stones=z.stones||[]}catch(err){return alert(err.message)}}
 C.stones=stones.map(function(s){return Object.assign({},s)});
 var html='<div class="premium-item-form"><div class="master-section"><h3>BASIC ITEM</h3><div class="formgrid"><label>Tag No<input id="pjTag" class="input" value="'+e(x.TagNo||'')+'"></label><label>Barcode<input id="pjBarcode" class="input" value="'+e(x.Barcode||'')+'"></label><label class="full">Item Name<input id="pjName" class="input" value="'+e(x.ItemName||'')+'"></label><label>Design Code<input id="pjDesign" class="input" value="'+e(x.DesignCode||'')+'"></label><label>Category<input id="pjCategory" class="input" value="'+e(x.Category||'Gold Jewellery')+'"></label><label>Sub Category<input id="pjSub" class="input" value="'+e(x.SubCategory||'')+'"></label><label>Collection<input id="pjCollection" class="input" value="'+e(x.CollectionName||'')+'"></label><label>Brand<input id="pjBrand" class="input" value="'+e(x.BrandName||'')+'"></label><label>Supplier<input id="pjSupplier" class="input" value="'+e(x.SupplierName||'')+'"></label><label>Karigar<input id="pjKarigar" class="input" value="'+e(x.KarigarName||'')+'"></label></div></div>'+
 '<div class="master-section"><h3>METAL / HALLMARK / WEIGHT</h3><div class="formgrid"><label>Metal<select id="pjMetal" class="select"><option>Gold</option><option>Silver</option><option>Platinum</option><option>Diamond Jewellery</option></select></label><label>Purity<select id="pjPurity" class="select" onchange="premiumPurityChange()"><option>24K</option><option>22K</option><option>18K</option><option>14K</option><option>999</option><option>925</option></select></label><label>Purity %<input id="pjPurityPct" class="input" type="number" step="0.0001" value="'+n(x.PurityPercent||91.6)+'" oninput="premiumJewelleryCalc()"></label><label>Hallmark Status<select id="pjHallmark" class="select"><option>HALLMARKED</option><option>NOT HALLMARKED</option><option>PENDING</option></select></label><label>HUID<input id="pjHuid" class="input" value="'+e(x.Huid||'')+'"></label><label>Weight Unit<input class="input" value="GRAM (G)" disabled></label><label>Gross Weight (g)<input id="pjGross" class="input" type="number" step="0.0001" value="'+n(x.GrossWeight)+'" oninput="premiumJewelleryCalc()"></label><label>Less Weight (g)<input id="pjLess" class="input" type="number" step="0.0001" value="'+n(x.LessWeight)+'" oninput="premiumJewelleryCalc()"></label><label>Net Weight (g)<input id="pjNet" class="input" type="number" step="0.0001" value="'+n(x.NetWeight)+'" readonly></label><label>Fine Weight (g)<input id="pjFine" class="input" type="number" step="0.0001" value="'+n(x.FineWeight)+'" readonly></label><label>Wastage %<input id="pjWaste" class="input" type="number" step="0.0001" value="'+n(x.WastagePercent)+'"></label><label>Inward Date<input id="pjInward" class="input" type="date" value="'+e(x.InwardDate?String(x.InwardDate).slice(0,10):new Date().toISOString().slice(0,10))+'"></label></div></div>'+
 '<div class="master-section"><h3>STONE / DIAMOND / CERTIFICATE</h3><div class="formgrid"><label>Primary Stone<input id="pjStoneType" class="input" value="'+e(x.StoneType||'')+'"></label><label>Pieces<input id="pjStonePieces" class="input" type="number" value="'+n(x.StonePieces)+'"></label><label>Stone Weight (g)<input id="pjStoneWeight" class="input" type="number" step="0.0001" value="'+n(x.StoneWeight)+'"></label><label>Carat<input id="pjStoneCarat" class="input" type="number" step="0.0001" value="'+n(x.StoneCarat)+'"></label><label>Stone Value ₹<input id="pjStoneValue" class="input" type="number" step="0.01" value="'+n(x.StoneValue)+'"></label><label>Certificate No<input id="pjCert" class="input" value="'+e(x.CertificateNo||'')+'"></label><label>Certificate Lab<input id="pjCertLab" class="input" value="'+e(x.CertificateLab||'')+'"></label><label><button class="btn secondary" type="button" onclick="premiumHuidGuide()">HUID Verify Guide</button></label></div><div class="panel stone-master"><div class="panelhead"><b>Multiple Stone Rows</b><button class="btn small secondary" onclick="premiumAddStone()">＋ Stone</button></div><div id="pjStoneRows"></div></div></div>'+
 '<div class="master-section"><h3>MAKING / TAX / PRICING</h3><div class="formgrid"><label>Making Type<select id="pjMakingType" class="select"><option>PER_GRAM</option><option>PERCENTAGE</option><option>FLAT</option><option>PER_PIECE</option></select></label><label>Making Value<input id="pjMaking" class="input" type="number" step="0.01" value="'+n(x.MakingValue)+'"></label><label>Labour Charge<input id="pjLabour" class="input" type="number" step="0.01" value="'+n(x.LabourCharge)+'"></label><label>Hallmark Charge<input id="pjHallCharge" class="input" type="number" step="0.01" value="'+n(x.HallmarkCharge)+'"></label><label>Other Charge<input id="pjOther" class="input" type="number" step="0.01" value="'+n(x.OtherCharge)+'"></label><label>HSN<input id="pjHsn" class="input" value="'+e(x.HsnCode||'7113')+'"></label><label>GST Mode<select id="pjGstMode" class="select"><option value="EXCLUSIVE">Exclusive</option><option value="INCLUSIVE">Inclusive</option></select></label><label>GST %<input id="pjGst" class="input" type="number" step="0.01" value="'+n(x.GstRate||3)+'"></label><label>MRP<input id="pjMrp" class="input" type="number" step="0.01" value="'+n(x.Mrp)+'"></label><label>Purchase Price<input id="pjPurchase" class="input" type="number" step="0.01" value="'+n(x.PurchasePrice)+'"></label><label>Retail Sale Price<input id="pjSale" class="input" type="number" step="0.01" value="'+n(x.SalePrice)+'"></label><label>Wholesale Price<input id="pjWholesale" class="input" type="number" step="0.01" value="'+n(x.WholesalePrice)+'"></label><label>Minimum Sale Price<input id="pjMinSale" class="input" type="number" step="0.01" value="'+n(x.MinSalePrice)+'"></label></div></div>'+
 '<div class="master-section"><h3>INVENTORY / LOCATION</h3><div class="formgrid"><label>Opening Qty<input id="pjOpeningQty" class="input" type="number" step="0.001" value="'+n(x.OpeningQty||1)+'"></label><label>Status<select id="pjStatus" class="select"><option>IN_STOCK</option><option>APPROVAL</option><option>KARIGAR_WORK</option><option>REPAIR</option><option>RESERVED</option><option>SOLD</option></select></label><label>Location Code<input id="pjLocation" class="input" value="'+e(x.LocationCode||'')+'"></label><label>Rack<input id="pjRack" class="input" value="'+e(x.RackName||'')+'"></label><label>Tray<input id="pjTray" class="input" value="'+e(x.TrayName||'')+'"></label><label>Box<input id="pjBox" class="input" value="'+e(x.BoxName||'')+'"></label><label>Image Path<input id="pjImage" class="input" value="'+e(x.ImagePath||'')+'"></label><label class="full">Notes<textarea id="pjNotes" class="textarea">'+e(x.Notes||'')+'</textarea></label></div></div></div>';
 modal((id?'Edit':'New')+' Premium Jewellery Item',html,'<button class="btn" onclick="savePremiumJewelleryItem('+(id||0)+')">Save Jewellery Item</button><button class="btn secondary" onclick="closeModal()">Cancel</button>');
 var box=d.querySelector('#modal .modalbox');if(box){box.style.width='96vw';box.style.maxWidth='1500px'}
 if(d.getElementById('pjMetal'))d.getElementById('pjMetal').value=x.MetalType||'Gold';
 if(d.getElementById('pjPurity'))d.getElementById('pjPurity').value=x.Purity||'22K';
 if(d.getElementById('pjHallmark'))d.getElementById('pjHallmark').value=x.HallmarkStatus||'HALLMARKED';
 if(d.getElementById('pjMakingType'))d.getElementById('pjMakingType').value=x.MakingChargeType||'PER_GRAM';
 if(d.getElementById('pjGstMode'))d.getElementById('pjGstMode').value=x.GstMode||'EXCLUSIVE';
 if(d.getElementById('pjStatus'))d.getElementById('pjStatus').value=x.Status||'IN_STOCK';
 premiumRenderStones();jewelCalc();
};
w.premiumHuidGuide=function(){modal('HUID / Hallmark Verification','<div class="panel"><p>HUID ko item par exactly capture karein. Duplicate HUID save blocked hai. Physical hallmark verification ke liye BIS Care / Verify HUID workflow use karein.</p><p class="muted">Software HUID ko bill, item search aur jewellery barcode label par preserve karta hai.</p></div>','<button class="btn" onclick="closeModal()">OK</button>')};
function val(id){var x=d.getElementById(id);return x?x.value:''}
w.savePremiumJewelleryItem=async function(id){
 var body={TagNo:val('pjTag').trim(),Barcode:val('pjBarcode').trim()||null,ItemName:val('pjName').trim(),DesignCode:val('pjDesign'),Category:val('pjCategory'),SubCategory:val('pjSub'),CollectionName:val('pjCollection'),BrandName:val('pjBrand'),SupplierName:val('pjSupplier'),KarigarName:val('pjKarigar'),MetalType:val('pjMetal'),Purity:val('pjPurity'),PurityPercent:n(val('pjPurityPct')),HallmarkStatus:val('pjHallmark'),Huid:val('pjHuid').trim()||null,GrossWeight:n(val('pjGross')),LessWeight:n(val('pjLess')),NetWeight:n(val('pjNet')),FineWeight:n(val('pjFine')),WastagePercent:n(val('pjWaste')),StoneWeight:n(val('pjStoneWeight')),StoneType:val('pjStoneType'),StonePieces:n(val('pjStonePieces')),StoneCarat:n(val('pjStoneCarat')),StoneValue:n(val('pjStoneValue')),CertificateNo:val('pjCert'),CertificateLab:val('pjCertLab'),MakingChargeType:val('pjMakingType'),MakingValue:n(val('pjMaking')),LabourCharge:n(val('pjLabour')),HallmarkCharge:n(val('pjHallCharge')),OtherCharge:n(val('pjOther')),HsnCode:val('pjHsn')||'7113',GstMode:val('pjGstMode'),GstRate:n(val('pjGst')),Mrp:n(val('pjMrp')),PurchasePrice:n(val('pjPurchase')),SalePrice:n(val('pjSale')),WholesalePrice:n(val('pjWholesale')),MinSalePrice:n(val('pjMinSale')),OpeningQty:n(val('pjOpeningQty'))||1,LocationCode:val('pjLocation'),RackName:val('pjRack'),TrayName:val('pjTray'),BoxName:val('pjBox'),InwardDate:val('pjInward')||null,ImagePath:val('pjImage'),Notes:val('pjNotes'),Status:val('pjStatus'),Stones:C.stones};
 if(!body.TagNo||!body.ItemName)return alert('Tag No and Item Name are required');
 try{await api(id?'/api/jewellery/item-master/'+id:'/api/jewellery/item-master',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});closeModal();notify('Jewellery Item saved');loadJewelleryItemMaster()}catch(err){alert(err.message)}
};

var baseProducts=w.loadProducts;
if(typeof baseProducts==='function')w.loadProducts=function(){return jewel()&&enabled('P-01')?w.loadJewelleryItemMaster():baseProducts.apply(this,arguments)};

function downloadXls(name,headers,row){
 var html='<html><head><meta charset="utf-8"></head><body><table><tr>'+headers.map(function(h){return '<th>'+e(h)+'</th>'}).join('')+'</tr><tr>'+row.map(function(v){return '<td>'+e(v)+'</td>'}).join('')+'</tr></table></body></html>';
 var blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8'}),a=d.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;d.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);
}
w.downloadNormalItemSample=function(){downloadXls('SuvidhaPOS-Normal-Item-Import-Sample.xls',['ItemName','Barcode','SKU','Category','Unit','HSN','GSTMode','GST%','MRP','PurchasePrice','SalePrice','MinStock','Location','Rack','Shelf'],['Premium Tea 250g','890000000004','TEA250','Grocery','PCS','0902','EXCLUSIVE','5','180','140','160','5','A-1','Rack A','Shelf 1'])};
w.downloadJewelleryItemSample=function(){downloadXls('SuvidhaPOS-Jewellery-Item-Import-Sample.xls',['TagNo','Barcode','ItemName','Category','DesignCode','Metal','Purity','HUID','GrossWeight','LessWeight','NetWeight','FineWeight','Wastage%','StoneType','StoneWeight','StoneCarat','StoneValue','MakingType','MakingValue','HSN','GSTMode','GST%','PurchasePrice','SalePrice','Rack','Notes'],['TG001','890100000001','Gold Ring','Ring','RG-001','Gold','22K','HUID001','6.250','0.150','6.100','5.588','2.5','Diamond','0.150','0.75','12000','PER_GRAM','850','7113','EXCLUSIVE','3','32500','0','R1','Opening stock'])};

async function extract(mode){
 var file=d.getElementById('imFile')&&d.getElementById('imFile').files[0],msg=val('imMessage').trim();
 if(!file&&!msg)throw new Error('Excel/PDF/CSV/Image file select karein ya data paste karein.');
 var fd=new FormData();fd.append('mode',mode);fd.append('message',msg);if(file)fd.append('file',file);
 return await api('/api/ai/import',{method:'POST',body:fd});
}
function normalClean(x){return {Name:String(x.Name||x.name||'').trim(),Barcode:String(x.Barcode||x.barcode||'').trim(),Sku:String(x.Sku||x.sku||'').trim(),Category:String(x.Category||x.category||'General').trim(),Unit:String(x.Unit||x.unit||'PCS').trim().toUpperCase(),Hsn:String(x.Hsn||x.hsn||'').trim(),GstMode:String(x.GstMode||x.gstMode||val('nimGstMode')||'EXCLUSIVE').toUpperCase(),GstRate:n(x.GstRate||x.gstRate)||n(val('nimGst'))||0,Mrp:n(x.Mrp||x.mrp),PurchasePrice:n(x.PurchasePrice||x.purchasePrice),SalePrice:n(x.SalePrice||x.salePrice),MinStock:n(x.MinStock||x.minStock),LocationCode:String(x.LocationCode||x.locationCode||'').trim(),RackName:String(x.RackName||x.rackName||'').trim(),ShelfName:String(x.ShelfName||x.shelfName||'').trim(),Resolution:'CREATE'}}
function jewelClean(x){
 var p=purity(x.Purity||x.purity,x.PurityPercent||x.purityPercent),g=n(x.GrossWeight||x.grossWeight),less=n(x.LessWeight||x.lessWeight)||n(x.StoneWeight||x.stoneWeight),net=n(x.NetWeight||x.netWeight);if(!net&&g)net=Math.max(0,g-less);var fine=n(x.FineWeight||x.fineWeight)||net*p.pct/100;
 return {TagNo:String(x.TagNo||x.tagNo||'').trim(),Barcode:String(x.Barcode||x.barcode||'').trim(),ItemName:String(x.ItemName||x.itemName||x.Name||x.name||'').trim(),Category:String(x.Category||x.category||'').trim(),DesignCode:String(x.DesignCode||x.designCode||'').trim(),MetalType:String(x.MetalType||x.metalType||val('jimMetal')||'Gold').trim(),Purity:p.name,PurityPercent:p.pct,Huid:String(x.Huid||x.huid||'').trim(),GrossWeight:g,LessWeight:less,NetWeight:net,FineWeight:fine,WastagePercent:n(x.WastagePercent||x.wastagePercent),StoneWeight:n(x.StoneWeight||x.stoneWeight),StoneType:String(x.StoneType||x.stoneType||'').trim(),StonePieces:n(x.StonePieces||x.stonePieces),StoneCarat:n(x.StoneCarat||x.stoneCarat),StoneValue:n(x.StoneValue||x.stoneValue),MakingChargeType:String(x.MakingChargeType||x.makingChargeType||'PER_GRAM').toUpperCase(),MakingValue:n(x.MakingValue||x.makingValue),HsnCode:String(x.HsnCode||x.hsnCode||'7113'),GstMode:String(x.GstMode||x.gstMode||val('jimGstMode')||'EXCLUSIVE').toUpperCase(),GstRate:n(x.GstRate||x.gstRate)||n(val('jimGst'))||3,PurchasePrice:n(x.PurchasePrice||x.purchasePrice),SalePrice:n(x.SalePrice||x.salePrice),RackName:String(x.RackName||x.rackName||'').trim(),Notes:String(x.Notes||x.notes||'').trim(),Resolution:'CREATE'}
}
function importShell(titleText,sub,badge,extra){
 head('aiimport',titleText,sub);app.innerHTML='<div class="content completion-page item-import-master"><div class="panel completion-hero"><div><span class="completion-kicker">'+e(badge)+'</span><h2>'+e(titleText)+'</h2><p>'+e(sub)+'</p></div><span class="tag">EXCEL • PDF • CSV • IMAGE</span></div>'+extra+'<div class="panel"><label>Source File<input id="imFile" class="input" type="file" accept=".pdf,.xlsx,.xls,.csv,.txt,image/*"></label><label style="display:block;margin-top:10px">Notes / Pasted Messy Data<textarea id="imMessage" class="textarea" placeholder="Paste unstructured item rows, WhatsApp list, invoice text or column hints..."></textarea></label><div class="toolbar" style="margin-top:12px"><button id="imExtractBtn" class="btn"></button><button id="imSampleBtn" class="btn secondary">Download Sample Excel</button></div></div><div id="imPreview" style="margin-top:14px"></div></div>';
}
w.loadNormalItemImportMaster=function(){
 if(!enabled('P-05'))return notify('P-05 is disabled');
 importShell('Normal Item Import Master','Normal billing fields only. Jewellery Metal/Purity/HUID/Gram fields are intentionally excluded.','P-05 NORMAL','<div class="panel import-rules"><div class="formgrid"><label>Default GST Mode<select id="nimGstMode" class="select"><option value="EXCLUSIVE">Exclusive Tax</option><option value="INCLUSIVE">Inclusive Tax</option></select></label><label>Default GST %<select id="nimGst" class="select"><option>0</option><option>3</option><option>5</option><option>12</option><option>18</option><option>28</option></select></label></div><div class="rule-grid"><div><b>Units</b><span>PCS / BOX / PACK / STRIP / KG / LTR</span></div><div><b>Tax</b><span>Inclusive / Exclusive, HSN, GST%, MRP</span></div><div><b>Inventory</b><span>Location, Rack, Shelf, Minimum Stock</span></div><div><b>Conflict</b><span>Skip / Update Existing / Create Copy</span></div></div></div>');
 d.getElementById('imExtractBtn').textContent='Extract & Clean Normal Items';d.getElementById('imExtractBtn').onclick=w.runNormalItemImport;d.getElementById('imSampleBtn').onclick=w.downloadNormalItemSample;
};
w.runNormalItemImport=async function(){
 var box=d.getElementById('imPreview');box.innerHTML='<div class="panel">Reading source and normalizing rows…</div>';
 try{var r=await extract('items');C.normalRows=(r.rows||[]).map(normalClean);C.normalValidation=await api('/api/import/normal/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Rows:C.normalRows})});renderNormalPreview()}catch(err){box.innerHTML='<div class="alert">'+e(err.message)+'</div>'}
};
function decision(i,conflict){return '<select class="select import-decision" onchange="premiumNormalResolution('+i+',this.value)"><option value="SKIP" '+(conflict?'selected':'')+'>Skip</option><option value="UPDATE">Update Existing</option><option value="CREATE" '+(!conflict?'selected':'')+'>Create New</option></select>'}
w.premiumNormalResolution=function(i,v){if(C.normalRows[i])C.normalRows[i].Resolution=v};
function renderNormalPreview(){
 var box=d.getElementById('imPreview');box.innerHTML='<div class="panel"><div class="panelhead"><h3>REVIEW NORMAL ITEMS</h3><span class="tag">'+C.normalRows.length+' ROWS</span></div><div class="tablewrap"><table class="table"><thead><tr><th>#</th><th>ITEM</th><th>BARCODE</th><th>UNIT</th><th>HSN</th><th>TAX MODE</th><th>GST%</th><th>MRP</th><th>PURCHASE</th><th>SALE</th><th>RACK</th><th>STATUS</th><th>RESOLUTION</th></tr></thead><tbody>'+C.normalRows.map(function(x,i){var v=C.normalValidation[i]||{};if(v.conflict&&x.Resolution==='CREATE')x.Resolution='SKIP';return '<tr><td>'+(i+1)+'</td><td><input class="input" value="'+e(x.Name)+'" onchange="__premiumCompletion.normalRows['+i+'].Name=this.value"></td><td>'+e(x.Barcode||'-')+'</td><td>'+e(x.Unit)+'</td><td>'+e(x.Hsn||'-')+'</td><td>'+e(x.GstMode)+'</td><td>'+n(x.GstRate)+'</td><td>'+money(x.Mrp)+'</td><td>'+money(x.PurchasePrice)+'</td><td>'+money(x.SalePrice)+'</td><td>'+e(x.RackName||x.LocationCode||'-')+'</td><td><span class="status '+(v.conflict?'low':'ok')+'">'+e(v.message||'Ready')+'</span></td><td>'+decision(i,!!v.conflict)+'</td></tr>'}).join('')+'</tbody></table></div><div class="toolbar" style="margin-top:12px"><button class="btn" onclick="commitNormalItemImport()">Commit Normal Items</button><button class="btn secondary" onclick="loadNormalItemImportMaster()">Discard</button></div></div>';
}
w.commitNormalItemImport=async function(){try{var file=d.getElementById('imFile')&&d.getElementById('imFile').files[0];var r=await api('/api/import/normal/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({SourceFileName:file?file.name:null,Rows:C.normalRows})});notify('Normal import: '+r.added+' added, '+r.updated+' updated, '+r.skipped+' skipped');w.loadNormalItemImportMaster()}catch(err){alert(err.message)}};

w.loadJewelleryItemImportMaster=function(){
 if(!enabled('P-05'))return notify('P-05 is disabled');
 importShell('Jewellery Item Import Master','Jewellery-only Tag, HUID, metal, purity, gram weight, making, wastage and tax mapping.','P-05 JEWELLERY','<div class="panel"><div class="formgrid"><label>Default Metal<select id="jimMetal" class="select"><option>Gold</option><option>Silver</option><option>Platinum</option></select></label><label>GST Mode<select id="jimGstMode" class="select"><option value="EXCLUSIVE">Exclusive Tax</option><option value="INCLUSIVE">Inclusive Tax</option></select></label><label>Default GST %<select id="jimGst" class="select"><option>0</option><option selected>3</option><option>5</option><option>12</option><option>18</option></select></label><label>Weight Unit<input class="input" value="GRAM (G)" disabled></label></div><div class="rule-grid"><div><b>Purity Cleanup</b><span>916→22K, 750→18K, 585→14K, 925 Silver</span></div><div><b>Weight Cleanup</b><span>Gross − Less = Net; Fine Weight auto</span></div><div><b>Tax</b><span>Inclusive / Exclusive + per-item GST%</span></div><div><b>Conflict</b><span>Tag / Barcode / HUID duplicate resolver</span></div></div></div>');
 d.getElementById('imExtractBtn').textContent='Extract & Normalize Jewellery';d.getElementById('imExtractBtn').onclick=w.runJewelleryItemImport;d.getElementById('imSampleBtn').onclick=w.downloadJewelleryItemSample;
};
w.runJewelleryItemImport=async function(){
 var box=d.getElementById('imPreview');box.innerHTML='<div class="panel">Reading jewellery source and normalizing purity/weights…</div>';
 try{var r=await extract('jewellery-items');C.jewelRows=(r.rows||[]).map(jewelClean);C.jewelValidation=await api('/api/import/jewellery/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Rows:C.jewelRows})});renderJewelImport()}catch(err){box.innerHTML='<div class="alert">'+e(err.message)+'</div>'}
};
w.premiumJewelResolution=function(i,v){if(C.jewelRows[i])C.jewelRows[i].Resolution=v};
function jewelDecision(i,conflict){return '<select class="select import-decision" onchange="premiumJewelResolution('+i+',this.value)"><option value="SKIP" '+(conflict?'selected':'')+'>Skip</option><option value="UPDATE">Update Existing</option><option value="CREATE" '+(!conflict?'selected':'')+'>Create New Copy</option></select>'}
function renderJewelImport(){
 var box=d.getElementById('imPreview');box.innerHTML='<div class="panel"><div class="panelhead"><h3>REVIEW JEWELLERY TAGS</h3><span class="tag">'+C.jewelRows.length+' ROWS</span></div><div class="tablewrap"><table class="table import-jewel-table"><thead><tr><th>#</th><th>TAG</th><th>ITEM</th><th>METAL</th><th>PURITY</th><th>HUID</th><th>GROSS</th><th>LESS</th><th>NET</th><th>FINE</th><th>WASTE%</th><th>STONE</th><th>MAKING</th><th>GST</th><th>STATUS</th><th>RESOLUTION</th></tr></thead><tbody>'+C.jewelRows.map(function(x,i){var v=C.jewelValidation[i]||{};if(v.conflict&&x.Resolution==='CREATE')x.Resolution='SKIP';return '<tr><td>'+(i+1)+'</td><td><input class="input" value="'+e(x.TagNo)+'" onchange="__premiumCompletion.jewelRows['+i+'].TagNo=this.value"></td><td><input class="input" value="'+e(x.ItemName)+'" onchange="__premiumCompletion.jewelRows['+i+'].ItemName=this.value"></td><td>'+e(x.MetalType)+'</td><td>'+e(x.Purity)+' / '+n(x.PurityPercent).toFixed(2)+'%</td><td>'+e(x.Huid||'-')+'</td><td>'+n(x.GrossWeight).toFixed(3)+'</td><td>'+n(x.LessWeight).toFixed(3)+'</td><td>'+n(x.NetWeight).toFixed(3)+'</td><td>'+n(x.FineWeight).toFixed(3)+'</td><td>'+n(x.WastagePercent)+'</td><td>'+e(x.StoneType||'-')+' '+n(x.StoneCarat)+'ct</td><td>'+e(x.MakingChargeType)+' '+money(x.MakingValue)+'</td><td>'+e(x.GstMode)+' '+n(x.GstRate)+'%</td><td><span class="status '+(v.conflict?'low':'ok')+'">'+e(v.message||'Ready')+'</span></td><td>'+jewelDecision(i,!!v.conflict)+'</td></tr>'}).join('')+'</tbody></table></div><div class="toolbar" style="margin-top:12px"><button class="btn" onclick="commitJewelleryItemImport()">Commit Jewellery Tags</button><button class="btn secondary" onclick="loadJewelleryItemImportMaster()">Discard</button></div></div>';
}
w.commitJewelleryItemImport=async function(){try{var file=d.getElementById('imFile')&&d.getElementById('imFile').files[0];var r=await api('/api/import/jewellery/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({SourceFileName:file?file.name:null,Rows:C.jewelRows})});notify('Jewellery import: '+r.added+' added, '+r.updated+' updated, '+r.skipped+' skipped');w.loadJewelleryItemImportMaster()}catch(err){alert(err.message)}};
w.loadAIImport=function(){return jewel()?w.loadJewelleryItemImportMaster():w.loadNormalItemImportMaster()};

var normalTemplates=[
 ['N01','38×25 Compact','38x25'],['N02','50×25 Standard','50x25'],['N03','50×30 Price','50x30'],['N04','58×40 Thermal','58x40'],['N05','80×50 Thermal','80x50'],
 ['N06','100×50 Shelf','100x50'],['N07','SKU + Price','50x30'],['N08','MRP Focus','50x30'],['N09','Barcode Large','80x40'],['N10','Stock Tag','60x40'],
 ['N11','2 Column A4','70x35'],['N12','3 Column A4','60x30'],['N13','4 Column A4','48x25'],['N14','Carton Label','100x70'],['N15','Rack Label','100x40'],
 ['N16','Batch + Expiry','70x35'],['N17','GST Item Label','70x40'],['N18','Mini SKU','38x20'],['N19','Wide Product','100x35'],['N20','Premium Retail','80x45']
];
var jewelTemplates=[
 ['J01','Mini Jewellery Tag','45x20'],['J02','Standard Jewellery Tag','55x25'],['J03','Wide Jewellery Tag','70x30'],['J04','HUID Tag','60x30'],['J05','Ring Tag','45x18'],
 ['J06','Bangle Slim','80x20'],['J07','Pendant Tag','55x25'],['J08','Necklace / Set','80x35'],['J09','Barcode + HUID','70x35'],['J10','Premium Detail Tag','90x45']
];
var code39={
 '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
 'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
 'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
 'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
};
function barcodeSvg(value){
 var txt=String(value||'NO-CODE').toUpperCase().replace(/[^0-9A-Z\. \-\$\/\+%]/g,'-'),data='*'+txt+'*',x=2,parts=[];
 for(var ci=0;ci<data.length;ci++){var pat=code39[data[ci]]||code39['-'];for(var i=0;i<pat.length;i++){var wdt=pat[i]==='w'?5:2;if(i%2===0)parts.push('<rect x="'+x+'" y="2" width="'+wdt+'" height="42" fill="#000"/>');x+=wdt}x+=2}
 return '<svg viewBox="0 0 '+(x+2)+' 58" preserveAspectRatio="none" aria-label="Barcode '+e(txt)+'"><rect width="100%" height="100%" fill="#fff"/>'+parts.join('')+'<text x="'+(x/2)+'" y="55" text-anchor="middle" font-size="8" font-family="Arial">'+e(txt)+'</text></svg>';
}
function selectedBarcodeItem(){var id=val('bcItem');return C.barcodeItems.find(function(x){return String(x.Id)===String(id)})||C.barcodeItems[0]||{}}
function labelHtml(x,scope,template){
 var code=scope==='JEWELLERY'?(x.Barcode||x.TagNo):(x.Barcode||x.Sku||x.Id||'ITEM'),name=x.ItemName||x.Name||'Item';
 if(scope==='JEWELLERY')return '<div class="barcode-label jewel-label '+template+'"><b>'+e(name)+'</b><span>'+e(x.TagNo||'')+' · '+e(x.MetalType||'')+' '+e(x.Purity||'')+'</span>'+barcodeSvg(code)+'<small>Net '+n(x.NetWeight).toFixed(3)+'g · HUID '+e(x.Huid||'-')+'</small></div>';
 return '<div class="barcode-label normal-label '+template+'"><b>'+e(name)+'</b><span>'+e(x.Sku||x.Category||'')+'</span>'+barcodeSvg(code)+'<small>MRP ₹'+money(x.Mrp)+' · Sale ₹'+money(x.SalePrice)+'</small></div>';
}
w.loadBarcodePrintMaster=async function(){
 if(!enabled('P-03'))return notify('P-03 is disabled');
 C.barcodeScope=jewel()?'JEWELLERY':'NORMAL';head('settings','Barcode Print Master',(C.barcodeScope==='JEWELLERY'?'10 Jewellery':'20 Normal')+' barcode label formats');
 try{C.barcodeItems=C.barcodeScope==='JEWELLERY'?await api('/api/jewellery/item-master'):await api('/api/products?size=1000')}catch(err){return app.innerHTML='<div class="content"><div class="alert">'+e(err.message)+'</div></div>'}
 var templates=C.barcodeScope==='JEWELLERY'?jewelTemplates:normalTemplates;C.barcodeTemplate=templates[0][0];
 app.innerHTML='<div class="content completion-page barcode-master"><div class="panel completion-hero"><div><span class="completion-kicker">P-03 / P-17</span><h2>Barcode Print Master</h2><p>'+e(C.barcodeScope)+' templates are kept separate so jewellery tag fields never appear in normal retail labels.</p></div><span class="tag">'+templates.length+' FORMATS</span></div>'+
 '<div class="barcode-layout"><div class="panel"><div class="formgrid"><label>Item<select id="bcItem" class="select" onchange="premiumBarcodePreview()">'+C.barcodeItems.slice(0,1000).map(function(x){return '<option value="'+x.Id+'">'+e((x.TagNo?x.TagNo+' · ':'')+(x.ItemName||x.Name||'Item'))+'</option>'}).join('')+'</select></label><label>Printer Name<input id="bcPrinter" class="input" placeholder="Windows barcode printer"></label><label>Copies<input id="bcCopies" class="input" type="number" min="1" max="200" value="1"></label><label>DPI<select id="bcDpi" class="select"><option>203</option><option>300</option></select></label><label>Gap mm<input id="bcGap" class="input" type="number" value="2"></label><label>Orientation<select id="bcOrientation" class="select"><option>Portrait</option><option>Landscape</option></select></label></div><div class="barcode-template-grid">'+templates.map(function(t){return '<button class="barcode-template '+(t[0]===C.barcodeTemplate?'selected':'')+'" onclick="premiumChooseBarcodeTemplate(\''+t[0]+'\')"><b>'+t[0]+'</b><span>'+e(t[1])+'</span><small>'+e(t[2])+' mm</small></button>'}).join('')+'</div><div class="toolbar"><button class="btn" onclick="premiumPrintBarcode()">Print Labels</button><button class="btn secondary" onclick="premiumSaveBarcodeDefaults()">Save Printer Defaults</button></div></div><div class="panel"><div class="panelhead"><h3>LIVE LABEL PREVIEW</h3><span class="tag">'+e(C.barcodeScope)+'</span></div><div id="bcPreview" class="barcode-preview-stage"></div></div></div></div>';
 w.premiumBarcodePreview();
};
w.premiumChooseBarcodeTemplate=function(t){C.barcodeTemplate=t;d.querySelectorAll('.barcode-template').forEach(function(x){x.classList.toggle('selected',x.textContent.indexOf(t)===0)});w.premiumBarcodePreview()};
w.premiumBarcodePreview=function(){var b=d.getElementById('bcPreview');if(b)b.innerHTML=labelHtml(selectedBarcodeItem(),C.barcodeScope,C.barcodeTemplate)};
w.premiumSaveBarcodeDefaults=async function(){try{var vals={'Barcode.PrinterName':val('bcPrinter'),'Barcode.Dpi':val('bcDpi'),'Barcode.GapMm':val('bcGap'),'Barcode.Orientation':val('bcOrientation'),['Barcode.Template.'+C.barcodeScope]:C.barcodeTemplate};await Promise.all(Object.keys(vals).map(function(k){return api('/api/app-settings/'+encodeURIComponent(k),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:String(vals[k]||'')})})}));notify('Barcode printer defaults saved')}catch(err){alert(err.message)}};

async function printAction(){try{var x=await api('/api/app-settings/'+encodeURIComponent('Print.ActionMode'));return String(x.Value||x.value||'PREVIEW').toUpperCase()}catch(_){return 'PREVIEW'}}
w.premiumPrintHtml=async function(html,name){
 var mode=await printAction();
 if(w.desktopPrintHtml&&w.desktopPrintHtml(html,mode,name))return true;
 var pw=w.open('','_blank','width=900,height=800');if(!pw)return notify('Popup blocked');
 pw.document.write(html);pw.document.close();pw.addEventListener('load',function(){if(mode==='DIRECT'||mode==='PDF')setTimeout(function(){pw.print()},100)},{once:true});return true;
};
w.premiumPrintBarcode=async function(){
 var x=selectedBarcodeItem(),copies=Math.max(1,Math.min(200,n(val('bcCopies'))||1)),labels='';for(var i=0;i<copies;i++)labels+=labelHtml(x,C.barcodeScope,C.barcodeTemplate);
 var html='<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:4mm}body{margin:0;font-family:Arial;display:flex;gap:'+n(val('bcGap'))+'mm;flex-wrap:wrap;align-content:flex-start}.barcode-label{box-sizing:border-box;border:1px dashed #bbb;padding:2mm;display:flex;flex-direction:column;justify-content:center;overflow:hidden;page-break-inside:avoid}.barcode-label svg{width:100%;height:12mm}.barcode-label b{font-size:9pt}.barcode-label span,.barcode-label small{font-size:7pt}.N01,.J05{width:45mm;height:20mm}.N02,.J02{width:55mm;height:25mm}.N03,.J04,.J07{width:60mm;height:30mm}.N04{width:58mm;height:40mm}.N05{width:80mm;height:50mm}.N06,.N14,.N15,.N19{width:100mm;height:40mm}.N07,.N08{width:50mm;height:30mm}.N09,.N20,.J06,.J08{width:80mm;height:35mm}.N10,.N11,.N16,.N17,.J03,.J09{width:70mm;height:35mm}.N12{width:60mm;height:30mm}.N13{width:48mm;height:25mm}.N18,.J01{width:45mm;height:20mm}.J10{width:90mm;height:45mm}</style></head><body>'+labels+'</body></html>';
 try{await api('/api/barcode-print/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Scope:C.barcodeScope,TemplateCode:C.barcodeTemplate,ItemKey:String(x.TagNo||x.Barcode||x.Id||''),Copies:copies,PrinterName:val('bcPrinter')})});await w.premiumPrintHtml(html,'Barcode-'+C.barcodeTemplate)}catch(err){alert(err.message)}
};

async function syncLicenseOwnership(reason,show){
 var ctrl=new AbortController(),tm=setTimeout(function(){ctrl.abort()},3000);
 try{
  var r=await fetch('/api/license/check',{method:'POST',credentials:'same-origin',cache:'no-store',signal:ctrl.signal,headers:{'Content-Type':'application/json','Accept':'application/json'},body:'{}'});
  var x=await r.json().catch(function(){return {}});
  var st=x.status||x.Status||null;
  if(st&&w.applyLicenseStatus)w.applyLicenseStatus(st);
  if(st&&w.refreshLoginOutlet)await w.refreshLoginOutlet(true);
  if(show&&!r.ok)notify(x.message||x.Message||'License sync failed');
  return {ok:r.ok,status:st,message:x.message||x.Message||''};
 }catch(_){
  if(show)notify('License sync offline — cached validity remains available');
  return {ok:false,offline:true};
 }finally{clearTimeout(tm)}
}

async function sync(direction,reason,show){
 if(String(direction||'PULL').toUpperCase()==='PULL')await syncLicenseOwnership(reason||'sync',false);
 var ctrl=new AbortController(),tm=setTimeout(function(){ctrl.abort()},3000);
 try{var r=await fetch('/api/outlet/sync',{method:'POST',credentials:'same-origin',cache:'no-store',signal:ctrl.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({Direction:direction,Reason:reason})});var x=await r.json().catch(function(){return {}});if(show)notify(x.ok?'Outlet sync completed':(x.message||'Offline mode'));if(x.ok&&direction==='PULL'){if(w.refreshLicenseStatus)await w.refreshLicenseStatus(false);if(w.refreshLoginOutlet)await w.refreshLoginOutlet(true)}return x}catch(_){if(show)notify('Offline mode — billing remains local and fast');return {ok:false,offline:true}}finally{clearTimeout(tm)}
}
w.backgroundOutletSync=function(direction,reason,show){setTimeout(function(){sync(direction||'PULL',reason||'manual',!!show)},0);return true};
w.premiumManualOutletSync=async function(){await sync('PUSH','manual',false);await sync('PULL','manual',true)};

var baseSettings=w.loadSettings;
if(typeof baseSettings==='function')w.loadSettings=async function(){
 await baseSettings.apply(this,arguments);
 try{
  var lic=await fetch('/public/license/status',{cache:'no-store'}).then(function(r){return r.json()}).catch(function(){return {}});
  var type=d.getElementById('otype');if(type){type.readOnly=true;type.disabled=true;type.title='Managed only from suvidhapremium.suvidhapos.in'}
  if(type&&type.parentElement&&!d.getElementById('ovalidity')){
    var lab=d.createElement('label');lab.innerHTML='Validity<input id="ovalidity" class="input" value="'+e(lic.ValidTill||lic.validTill||'Not linked')+'" disabled><small>Website managed · POS locked</small>';type.parentElement.insertAdjacentElement('afterend',lab);
  }
  var panel=d.querySelector('.outlet-master-panel');if(panel&&!d.getElementById('outletSyncNow')){
    var b=d.createElement('button');b.id='outletSyncNow';b.className='btn secondary';b.style.marginLeft='8px';b.textContent='↻ Sync Now';b.onclick=w.premiumManualOutletSync;var save=panel.querySelector('button.btn');if(save)save.insertAdjacentElement('afterend',b);
    var note=d.createElement('p');note.className='muted sync-speed-note';note.textContent='Startup/Login/Save sync runs in background with a 2.5s server timeout. Offline internet never blocks billing, login or print.';panel.appendChild(note);
  }
 }catch(_){}
};
var baseSaveOutlet=w.saveOutlet;
w.saveOutlet=async function(){
 var o={OutletName:val('oname').trim()||'Main Outlet',StoreType:val('otype')||String((w.suvidhaOutlet||{}).StoreType||'Retail Shop'),Address:val('oaddr')||null,Phone:val('ophone')||null,Gstin:val('ogst')||null,RequireBatch:!!(d.getElementById('oreqbatch')&&d.getElementById('oreqbatch').checked),RequireExpiry:!!(d.getElementById('oreqexp')&&d.getElementById('oreqexp').checked),DefaultUnit:'PCS'};
 try{var saved=await api('/api/outlet',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});notify('Outlet saved locally · website sync queued');if(w.refreshLoginOutlet)w.refreshLoginOutlet(true);w.dispatchEvent(new CustomEvent('suvidha:outlet-saved',{detail:saved||o}));w.backgroundOutletSync('PUSH','save',false)}catch(err){alert(err.message)}
};

function startupSync(){if(!enabled('P-04'))return;w.backgroundOutletSync('PULL','startup',false)}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',function(){setTimeout(startupSync,500)});else setTimeout(startupSync,500);
var authSeen=false,lastOwnershipCheck=0;
function ownershipPulse(reason){
 if(!enabled('P-04'))return;
 var now=Date.now();if(now-lastOwnershipCheck<60000)return;lastOwnershipCheck=now;
 w.backgroundOutletSync('PULL',reason||'periodic',false);
}
new MutationObserver(function(){var on=d.body.getAttribute('data-authenticated')==='true';if(on&&!authSeen){authSeen=true;ownershipPulse('login')}if(!on)authSeen=false}).observe(d.body,{attributes:true,attributeFilter:['data-authenticated']});
// Central ownership sync runs only on startup, verified login, manual Sync Now and outlet save.
 // Do not poll every five minutes or on window focus; billing must stay fully local and latency-free.

function enhancePaymentRefs(){
 var box=d.getElementById('jsPayRows');if(!box)return;[].slice.call(box.children).forEach(function(row,i){if(row.querySelector('.payment-reference'))return;var inp=d.createElement('input');inp.className='payment-reference';inp.placeholder='Reference / UTR';inp.value=(w.__jewelSuiteState&&w.__jewelSuiteState.payments[i]&&w.__jewelSuiteState.payments[i].reference)||'';inp.onchange=function(){if(w.JSuitePayment)w.JSuitePayment(i,'reference',this.value)};row.insertBefore(inp,row.lastElementChild)});
}
new MutationObserver(function(){enhancePaymentRefs()}).observe(d.getElementById('app')||d.body,{childList:true,subtree:true});

var baseJewelSave=w.jewelSuiteSaveInvoice;
w.jewelSuiteSaveInvoice=async function(){
 var S=w.__jewelSuiteState;if(!S)return baseJewelSave?baseJewelSave.apply(this,arguments):null;
 if(['retail','wholesale'].indexOf(S.mode)>=0){
   if(!S.cart.length)return notify('Add jewellery item first');
   var discount=n(val('jsJewelDiscount')),overrideReason='';
   if(discount>0){if(!manager())return alert('Discount / rate override requires Admin or Manager permission.');overrideReason=prompt('Override reason (required):','Customer discount')||'';if(!overrideReason.trim())return alert('Override reason is required');}
   try{
    var r=await api('/api/jewellery/sales/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({SaleType:S.mode.toUpperCase(),CustomerName:val('jsCust')||'Walk-in Customer',CustomerId:null,CustomerPan:null,GstRate:n(val('jsJewelGst'))||3,GstMode:'EXCLUSIVE',Discount:discount,OverrideReason:overrideReason,Notes:val('jsJewelNotes')||('SuvidhaPOS Jewellery '+S.mode+' invoice'),Lines:S.cart.map(function(x){var z=(function(){var rates=S.rates||[],rr=rates.find(function(a){return String(a.MetalType).toLowerCase()===String(x.MetalType).toLowerCase()&&String(a.Purity).toLowerCase()===String(x.Purity).toLowerCase()});return n(rr&&rr.RatePerGram)}());return {JewelleryItemId:x.Id,MetalRatePerGram:z,StoneValue:n(x.StoneValue),MakingChargeType:x.MakingChargeType,MakingValue:n(x.MakingValue)}}),Payments:(S.payments||[]).map(function(p){return {Mode:p.mode,Amount:n(p.amount),Reference:p.reference||null}}),OldMetal:(S.oldMetal||[]).map(function(o){return {Metal:o.metal,Gross:n(o.gross),Less:n(o.less),Net:n(o.net),Purity:n(o.purity),Fine:n(o.fine),Rate:n(o.rate),Amount:n(o.amount)}})})});
    notify('Jewellery bill saved: '+r.invoiceNo);setTimeout(function(){if(w.loadJewelInvoices)w.loadJewelInvoices();else w.loadBilling()},500);return r;
   }catch(err){return alert(err.message)}
 }
 var lines=(S.cart||[]).map(function(x){var rate=0;(S.rates||[]).some(function(a){if(String(a.MetalType).toLowerCase()===String(x.MetalType).toLowerCase()&&String(a.Purity).toLowerCase()===String(x.Purity).toLowerCase()){rate=n(a.RatePerGram);return true}});var fine=n(x.FineWeight)||n(x.NetWeight)*n(x.PurityPercent)/100;var make=String(x.MakingChargeType||'').toUpperCase()==='PER_GRAM'?n(x.NetWeight)*n(x.MakingValue):n(x.MakingValue);return {JewelleryItemId:x.Id,TagNo:x.TagNo,ItemName:x.ItemName,MetalType:x.MetalType,Purity:x.Purity,GrossWeight:n(x.GrossWeight),NetWeight:n(x.NetWeight),FineWeight:fine,RatePerGram:rate,MakingAmount:make,StoneAmount:n(x.StoneValue),Amount:n(x.NetWeight)*rate+make+n(x.StoneValue)}});
 try{var v=await api('/api/jewellery/vouchers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({VoucherType:S.mode.toUpperCase(),PartyName:val('jsCust')||'Walk-in Customer',GstRate:n(val('jsJewelGst')),PaymentMode:(S.payments[0]||{}).mode||'Cash',PaidAmount:(S.payments||[]).reduce(function(a,p){return a+n(p.amount)},0),Notes:val('jsJewelNotes'),Lines:lines})});notify(S.mode+' voucher saved: '+v.voucherNo);return v}catch(err){alert(err.message)}
};

var baseMetalSave=w.saveMetalRate;
if(typeof baseMetalSave==='function')w.saveMetalRate=async function(){
 if(!manager())return alert('Metal rate change requires Admin / Manager permission');
 var reason=prompt('Metal rate override reason:','Daily rate update');if(!reason)return;
 try{await api('/api/premium/override/audit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ActionName:'METAL_RATE_UPDATE',Reason:reason,Details:'Metal='+val('mrmetal')+'; Purity='+val('mrpur')+'; Rate='+val('mrrate')})})}catch(err){return alert(err.message)}
 return baseMetalSave.apply(this,arguments);
};

var basePrintSettings=w.loadPrintSettings;
w.premiumSetPrintAction=async function(mode){
 try{await api('/api/app-settings/'+encodeURIComponent('Print.ActionMode'),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:mode})});notify('Print action saved: '+mode)}catch(err){alert(err.message)}
};
if(typeof basePrintSettings==='function')w.loadPrintSettings=async function(){
 await basePrintSettings.apply(this,arguments);
 var controls=d.querySelector('.pm-controls');if(!controls||d.getElementById('premiumPrintActions'))return;
 var mode=await printAction(),box=d.createElement('div');box.id='premiumPrintActions';box.className='premium-print-actions';box.innerHTML='<b>BILL PRINT ACTION</b><label><input type="radio" name="premiumPrintAction" value="DIRECT" '+(mode==='DIRECT'?'checked':'')+' onchange="premiumSetPrintAction(this.value)"> Direct Print <small>No print dialog</small></label><label><input type="radio" name="premiumPrintAction" value="PDF" '+(mode==='PDF'?'checked':'')+' onchange="premiumSetPrintAction(this.value)"> Save to PDF <small>Select PDF file</small></label><label><input type="radio" name="premiumPrintAction" value="PREVIEW" '+(mode==='PREVIEW'?'checked':'')+' onchange="premiumSetPrintAction(this.value)"> Preview & Print <small>Preview before printing</small></label>';
 controls.insertBefore(box,controls.querySelector('#pmStyles')||controls.firstChild);
};

w.premiumPrintJewelleryDraft=async function(){
 var S=w.__jewelSuiteState;if(!S||!S.cart||!S.cart.length)return notify('Add jewellery item first');
 var rows=S.cart.map(function(x){var rr=0;(S.rates||[]).some(function(a){if(String(a.MetalType).toLowerCase()===String(x.MetalType).toLowerCase()&&String(a.Purity).toLowerCase()===String(x.Purity).toLowerCase()){rr=n(a.RatePerGram);return true}});var net=n(x.NetWeight),metal=net*rr,make=String(x.MakingChargeType||'').toUpperCase()==='PER_GRAM'?net*n(x.MakingValue):n(x.MakingValue),waste=metal*n(x.WastagePercent)/100,extra=n(x.LabourCharge)+n(x.HallmarkCharge)+n(x.OtherCharge),amt=metal+n(x.StoneValue)+make+waste+extra;return '<tr><td>'+e(x.TagNo)+'</td><td>'+e(x.ItemName)+'</td><td>'+e(x.MetalType)+' '+e(x.Purity)+'</td><td>'+net.toFixed(3)+'</td><td>₹'+money(rr)+'</td><td>₹'+money(n(x.StoneValue))+'</td><td>₹'+money(make+waste+extra)+'</td><td>₹'+money(amt)+'</td></tr>'}).join('');
 var cur=S.current||{},name=(S.mode||'retail').toUpperCase()+' JEWELLERY BILL';
 var html='<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:10mm}body{font:12px Arial;color:#2e2a22}.head{text-align:center;border-bottom:2px solid #c89b2a;padding-bottom:9px}.head h1{margin:0;color:#8c6417}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:7px;border-bottom:1px solid #ddd7c7;text-align:left}th{background:#fff6dc}.tot{width:340px;margin:15px 0 0 auto}.tot div{display:flex;justify-content:space-between;padding:5px}.grand{font-size:16px;font-weight:800;border-top:2px solid #c89b2a}</style></head><body><div class="head"><h1>SUVIDHAPOS JEWELLERY</h1><b>'+e(name)+'</b></div><p>Customer: <b>'+e(val('jsCust')||'Walk-in Customer')+'</b> &nbsp; Date: '+new Date().toLocaleDateString('en-IN')+'</p><table><thead><tr><th>Tag</th><th>Item</th><th>Metal</th><th>Net g</th><th>Rate/g</th><th>Stone</th><th>Making/Extra</th><th>Amount</th></tr></thead><tbody>'+rows+'</tbody></table><div class="tot"><div><span>Sale Total</span><b>₹'+money(cur.sale)+'</b></div><div><span>Discount</span><b>₹'+money(cur.discount)+'</b></div><div><span>GST</span><b>₹'+money(cur.tax)+'</b></div><div><span>Old Metal</span><b>- ₹'+money(cur.oldCredit)+'</b></div><div class="grand"><span>Net Payable</span><span>₹'+money(cur.balance)+'</span></div></div></body></html>';
 return w.premiumPrintHtml(html,'Jewellery-'+(S.mode||'retail')+'-Draft');
};

setTimeout(function(){loadFlags();ensureNav()},100);
})(window,document);
