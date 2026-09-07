(function(){
 'use strict';
 const K={mode:'Print.BillMode',width:'Print.ThermalWidth',template:'Print.BillTemplate',format:'Print.BillFormat'};
 const THERMAL=[
  ['T01','Classic Compact','Fast mono receipt'],
  ['T02','GST Compact','GST-focused compact bill'],
  ['T03','Bold Total','Large payable total'],
  ['T04','Item Code','Barcode / item-code layout'],
  ['T05','Customer Copy','Customer details highlighted'],
  ['T06','Pharma Batch','Batch & expiry focused'],
  ['T07','Minimal','Very clean short receipt'],
  ['T08','Detailed Tax','Tax details with summary'],
  ['T09','Quick Counter','Large qty/rate for counter'],
  ['T10','Premium Border','Double-border premium receipt']
 ];
 const A4=[
  ['A01','Classic Tax Invoice','Traditional GST invoice'],
  ['A02','GST Detailed','Tax / HSN detailed A4'],
  ['A03','Modern Corporate','Modern business header'],
  ['A04','Compact A4','More rows per page'],
  ['A05','Retail Invoice','Retail customer invoice'],
  ['A06','Pharma Invoice','Batch & expiry A4'],
  ['A07','Wholesale Invoice','Wide wholesale columns'],
  ['A08','Letterhead','Large company letterhead'],
  ['A09','Clean Mono','Black & white clean invoice'],
  ['A10','Premium Border','Premium framed A4 invoice']
 ];
 const state={mode:'Thermal',width:'80MM',template:'T01'};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const num=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:3});
 async function setting(key,fallback){try{const x=await api('/api/app-settings/'+encodeURIComponent(key));return x.Value??x.value??fallback}catch{return fallback}}
 async function loadState(){
   state.mode=await setting(K.mode,'Thermal');
   state.width=await setting(K.width,'80MM');
   state.template=await setting(K.template,state.mode==='A4'?'A01':'T01');
   if(state.mode==='Thermal'&&!/^T\d\d$/.test(state.template))state.template='T01';
   if(state.mode==='A4'&&!/^A\d\d$/.test(state.template))state.template='A01';
 }
 function sample(){
   return {
    h:{InvoiceNo:'INV-20260908-001',BillDate:new Date(),CustomerName:'Walk-in Customer',PaymentMode:'Cash',SubTotal:865,Discount:25,Tax:43.20,GrandTotal:883.20,PaidAmount:883.20,PrintTemplate:state.template,PrintFormat:state.mode==='A4'?'A4 Printer':'Thermal Printer '+state.width},
    l:[
     {Name:'Paracetamol 650mg',Barcode:'890000000001',BatchNo:'PCM2408',ExpiryDate:'2027-12-31',Quantity:2,UnitSold:'STRIP',SoldQuantity:2,RatePerSoldUnit:30,SalePrice:3,TaxRate:5},
     {Name:'Premium Tea 250g',Barcode:'890000000004',BatchNo:'TEA26',ExpiryDate:'2027-06-30',Quantity:3,UnitSold:'PKT',SoldQuantity:3,RatePerSoldUnit:160,SalePrice:160,TaxRate:5},
     {Name:'Vitamin C 500mg',Barcode:'890000000002',BatchNo:'VC25',ExpiryDate:'2028-03-31',Quantity:1,UnitSold:'PCS',SoldQuantity:1,RatePerSoldUnit:125,SalePrice:125,TaxRate:18}
    ],
    company:{CompanyName:'SUVIDHA POS PREMIUM',Address:'Main Market, Your City',Phone:'+91 90000 00000',Gstin:'09ABCDE1234F1Z5'},
    outlet:{OutletName:'Main Outlet',StoreType:'Retail Shop'}
   };
 }
 function lineInfo(x){
   const unit=x.UnitSold||'';
   const qty=(x.SoldQuantity&&unit)?Number(x.SoldQuantity):Number(x.Quantity||0);
   const rate=(x.RatePerSoldUnit&&unit)?Number(x.RatePerSoldUnit):Number(x.SalePrice||0);
   return {qty,unit,rate,amount:qty*rate};
 }
 function commonCss(mode,template,width){
   const thermal=mode==='Thermal';
   const page=thermal?(width==='58MM'?'54mm':'72mm'):'A4 portrait';
   const bodyWidth=thermal?(width==='58MM'?'54mm':'72mm'):'190mm';
   return `
@page{size:${page};margin:${thermal?'2.5mm':'10mm'}}
*{box-sizing:border-box}body{margin:0 auto;width:${bodyWidth};font-family:Arial,sans-serif;color:#111;background:#fff;font-size:${thermal?'10px':'11px'};line-height:1.3}
.bill{width:100%;padding:${thermal?'2mm 0':'0'};position:relative}.center{text-align:center}.right{text-align:right}.muted{color:#555}.strong{font-weight:800}.mono{font-family:Consolas,monospace}
.head h1{margin:0;font-size:${thermal?'16px':'25px'}}.head p{margin:2px 0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;margin:8px 0}.meta>div:nth-child(even){text-align:right}
.items{width:100%;border-collapse:collapse;margin-top:6px}.items th,.items td{padding:${thermal?'3px 1px':'6px 5px'};vertical-align:top;border-bottom:1px solid #ddd}.items th{font-size:${thermal?'8px':'10px'};text-transform:uppercase}.items .amt{text-align:right;white-space:nowrap}
.totals{margin-left:auto;margin-top:8px;width:${thermal?'100%':'46%'}}.totals div{display:flex;justify-content:space-between;padding:2px 0}.totals .grand{font-size:${thermal?'15px':'17px'};font-weight:900;border-top:2px solid #111;border-bottom:2px solid #111;padding:6px 0}
.footer{margin-top:10px;padding-top:6px;text-align:center;border-top:1px dashed #555;font-size:${thermal?'9px':'10px'}}
.batch{font-size:${thermal?'8px':'9px'};color:#444}.taxsum{margin-top:6px;font-size:${thermal?'8px':'9px'};border-top:1px dashed #777;padding-top:4px}
${styleCss(template,thermal)}
`;
 }
 function styleCss(t,thermal){
   const map={
    T01:'.bill{font-family:Consolas,monospace}.items th,.items td{border-bottom:1px dashed #555}',
    T02:'.head{border:2px solid #111;padding:5px}.items th{background:#111;color:#fff}.taxsum{border:1px solid #111;padding:5px}',
    T03:'.head h1{font-size:19px}.totals .grand{background:#111;color:#fff;padding:8px}.items th{border-top:2px solid #111;border-bottom:2px solid #111}',
    T04:'.items td:first-child{font-family:Consolas,monospace}.items th{background:#eee}.bill{font-size:9px}',
    T05:'.head{border-bottom:3px double #111;padding-bottom:5px}.meta{border:1px solid #777;padding:5px}.footer{border:0;background:#eee;padding:6px}',
    T06:'.batch{font-weight:700;color:#000}.items th{background:#eee}.items td{border-bottom:1px solid #aaa}.head:after{content:"PHARMA / BATCH COPY";display:block;text-align:center;font-weight:800;margin-top:4px}',
    T07:'.items th,.items td{border:0;padding:2px 1px}.head h1{font-size:14px}.meta{margin:4px 0}.footer{border:0}',
    T08:'.taxsum{border:1px solid #111;padding:5px}.items th{border-bottom:2px solid #111}.totals{border-top:1px solid #111;padding-top:4px}',
    T09:'.items td:nth-child(2),.items td:nth-child(3){font-size:12px;font-weight:700}.totals .grand{font-size:18px}.head{background:#eee;padding:5px}',
    T10:'.bill{border:3px double #111;padding:5px}.head{border-bottom:1px solid #111;padding-bottom:5px}.totals .grand{border:2px double #111;padding:6px}',
    A01:'.bill{border:1px solid #aaa;padding:10mm}.head{border-bottom:2px solid #222;padding-bottom:8px}.items th{background:#eee}',
    A02:'.head{background:#f2f2f2;padding:12px;border-left:6px solid #111}.items{border:1px solid #777}.items th,.items td{border:1px solid #bbb}.taxsum{border:1px solid #aaa;padding:8px}',
    A03:'.head{background:#17324d;color:#fff;padding:15px}.items th{background:#eaf0f5}.totals .grand{background:#17324d;color:#fff;padding:8px}.bill{border:1px solid #cbd5df}',
    A04:'.bill{font-size:9px}.items th,.items td{padding:3px}.head h1{font-size:20px}.meta{margin:5px 0}.totals{margin-top:4px}',
    A05:'.head{border-bottom:4px solid #2f6f44;padding-bottom:10px}.items th{background:#edf6ef}.totals .grand{color:#205b34;border-color:#205b34}',
    A06:'.head:after{content:"PHARMACY / BATCH TAX INVOICE";display:block;font-weight:800;margin-top:5px}.items th{background:#e9f4ff}.batch{font-weight:700;color:#000}.bill{border-top:5px solid #286090}',
    A07:'.items th{background:#f4ead8}.bill{border-top:6px solid #8a641f}.totals{width:55%}.meta{background:#fffaf0;padding:8px}',
    A08:'.head{min-height:42mm;padding:8mm 5mm;border-bottom:1px solid #aaa}.head h1{font-size:30px;letter-spacing:1px}.items{margin-top:12px}',
    A09:'.bill{font-family:Georgia,serif}.head{text-align:left!important}.items th{border-top:1px solid #111;border-bottom:1px solid #111}.items td{border-bottom:0}.footer{border-top:1px solid #111}',
    A10:'.bill{border:4px double #8a6b1f;padding:8mm}.head{color:#6b5116;border-bottom:2px solid #8a6b1f;padding-bottom:8px}.items th{background:#f6efd9}.totals .grand{border-color:#8a6b1f;color:#6b5116}'
   };return map[t]||'';
 }
 function buildHtml(d,mode=state.mode,template=state.template,width=state.width,autoPrint=false){
   const h=d.h||{},lines=d.l||[],c=d.company||{},o=d.outlet||{};
   const isPharma=/pharmacy|medical/i.test(o.StoreType||'')||template==='T06'||template==='A06';
   const cancelledMark=String(h.Status||'Completed').toLowerCase()!=='completed'?'<div style="border:3px double #900;color:#900;font-weight:900;text-align:center;padding:6px;margin:6px 0">CANCELLED BILL</div>':'';
   const showCode=['T04','A02','A07'].includes(template);
   const detailed=['T06','T08','A02','A06','A07'].includes(template);
   const rows=lines.map((x,i)=>{const z=lineInfo(x);return `<tr>
    <td>${showCode?'<span class="mono">'+esc(x.Barcode||'')+'</span><br>':''}<b>${esc(x.Name||'Item')}</b>${(detailed||isPharma)?`<div class="batch">Batch: ${esc(x.BatchNo||'-')} ${x.ExpiryDate?' · Exp: '+new Date(x.ExpiryDate).toLocaleDateString('en-IN'):''}</div>`:''}</td>
    <td>${num(z.qty)} ${esc(z.unit)}</td><td class="amt">₹${money(z.rate)}</td><td class="amt">₹${money(z.amount)}</td></tr>`}).join('');
   const taxRows={};lines.forEach(x=>{const r=Number(x.TaxRate||0),z=lineInfo(x);taxRows[r]=(taxRows[r]||0)+z.amount});
   const taxSummary=Object.entries(taxRows).map(([r,v])=>`GST ${r}% on ₹${money(v)}`).join(' &nbsp; | &nbsp; ');
   return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(h.InvoiceNo||'Bill Preview')}</title><style>${commonCss(mode,template,width)}</style></head><body><div class="bill ${template}">
    ${cancelledMark}<div class="head center"><h1>${esc(c.CompanyName||o.OutletName||'SUVIDHA POS')}</h1><p>${esc(c.Address||'')}</p><p>${esc(c.Phone||'')} ${c.Gstin?' · GSTIN: '+esc(c.Gstin):''}</p><p class="strong">TAX INVOICE</p></div>
    <div class="meta"><div>Invoice: <b>${esc(h.InvoiceNo||'')}</b></div><div>Date: ${new Date(h.BillDate||Date.now()).toLocaleString('en-IN')}</div><div>Customer: ${esc(h.CustomerName||'Walk-in Customer')}</div><div>Payment: ${esc(h.PaymentMode||'Cash')}</div><div>Outlet: ${esc(o.OutletName||'Main Outlet')}</div><div>${esc(o.StoreType||'Retail Shop')}</div></div>
    <table class="items"><thead><tr><th>Item</th><th>Qty</th><th class="amt">Rate</th><th class="amt">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    ${detailed?'<div class="taxsum">'+taxSummary+'</div>':''}
    <div class="totals"><div><span>Subtotal</span><b>₹${money(h.SubTotal)}</b></div><div><span>Discount</span><b>₹${money(h.Discount)}</b></div><div><span>Tax</span><b>₹${money(h.Tax)}</b></div><div class="grand"><span>PAYABLE</span><span>₹${money(h.GrandTotal)}</span></div><div><span>Paid</span><b>₹${money(h.PaidAmount)}</b></div></div>
    <div class="footer">Thank you for shopping with us.<br><span class="muted">Computer generated invoice · ${esc(template)}</span></div>
   </div>${autoPrint?'<script>window.onload=function(){setTimeout(function(){window.print()},100)}<\/script>':''}</body></html>`;
 }
 function stylesFor(mode){return mode==='A4'?A4:THERMAL}
 function cards(){
   const list=stylesFor(state.mode),box=document.querySelector('#pmStyles');if(!box)return;
   box.innerHTML=list.map(x=>`<button class="pm-style ${state.template===x[0]?'selected':''}" onclick="selectPrintTemplate('${x[0]}')"><span>${x[0]}</span><b>${esc(x[1])}</b><small>${esc(x[2])}</small></button>`).join('');
 }
 function preview(){
   const f=document.querySelector('#pmPreview');if(!f)return;
   f.className='pm-preview '+(state.mode==='A4'?'a4':'thermal');
   f.srcdoc=buildHtml(sample(),state.mode,state.template,state.width,false);
   const label=document.querySelector('#pmSelected');if(label)label.textContent=state.template+' · '+(stylesFor(state.mode).find(x=>x[0]===state.template)?.[1]||'')+' · '+(state.mode==='Thermal'?state.width:'A4');
 }
 window.selectPrintTemplate=function(id){state.template=id;cards();preview()};
 window.setPrintMode=function(mode){
   state.mode=mode;
   if(mode==='Thermal'&&!/^T/.test(state.template))state.template='T01';
   if(mode==='A4'&&!/^A/.test(state.template))state.template='A01';
   document.querySelectorAll('.pm-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
   const width=document.querySelector('#pmWidthWrap');if(width)width.style.display=mode==='Thermal'?'grid':'none';
   cards();preview()
 };
 window.setThermalWidth=function(v){state.width=v;preview()};
 window.savePrintMaster=async function(){
   const format=state.mode==='A4'?'A4 Printer':'Thermal Printer '+state.width;
   try{
    await Promise.all([
     api('/api/app-settings/'+encodeURIComponent(K.mode),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:state.mode})}),
     api('/api/app-settings/'+encodeURIComponent(K.width),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:state.width})}),
     api('/api/app-settings/'+encodeURIComponent(K.template),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:state.template})}),
     api('/api/app-settings/'+encodeURIComponent(K.format),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:format})})
    ]);
    document.querySelector('#pmStatus').textContent='Saved default: '+state.template+' · '+format;
    toast('Print Master saved');
   }catch(e){alert(e.message)}
 };
 window.printMasterTest=function(){
   const w=window.open('','_blank',state.mode==='Thermal'?'width=460,height=760':'width=950,height=760');
   if(!w)return toast('Popup blocked');
   w.document.write(buildHtml(sample(),state.mode,state.template,state.width,true));w.document.close()
 };
 window.loadPrintSettings=async function(){
   setPage('settings');title.textContent='Print Master';document.querySelector('header p').textContent='10 Thermal + 10 A4 bill styles with live preview';
   await loadState();
   app.innerHTML=`<div class="content print-master"><div class="panel pm-head"><div><h2>🖨 BILL PRINT MASTER</h2><p class="muted">Choose a default bill layout. New bills remember the selected paper and style for reprint.</p></div><div id="pmStatus" class="tag">20 Styles Available</div></div>
    <div class="pm-layout"><div class="panel pm-controls">
      <div class="pm-tabs"><button class="pm-tab ${state.mode==='Thermal'?'active':''}" data-mode="Thermal" onclick="setPrintMode('Thermal')">Thermal Printer · 10</button><button class="pm-tab ${state.mode==='A4'?'active':''}" data-mode="A4" onclick="setPrintMode('A4')">A4 Printer · 10</button></div>
      <div id="pmWidthWrap" class="pm-width" style="display:${state.mode==='Thermal'?'grid':'none'}"><label>Thermal Paper Width<select class="select" onchange="setThermalWidth(this.value)"><option ${state.width==='80MM'?'selected':''}>80MM</option><option ${state.width==='58MM'?'selected':''}>58MM</option></select></label></div>
      <div id="pmStyles" class="pm-styles"></div>
      <div class="toolbar"><button class="btn" onclick="savePrintMaster()">Save as Default</button><button class="btn secondary" onclick="printMasterTest()">Print Test</button></div>
    </div><div class="panel pm-preview-panel"><div class="panelhead"><div><h3>LIVE PREVIEW</h3><p id="pmSelected" class="muted"></p></div><span class="tag">Actual print proportions</span></div><div class="pm-preview-stage"><iframe id="pmPreview" title="Bill print preview"></iframe></div></div></div></div>`;
   cards();preview()
 };
 async function currentPrintConfig(){
   await loadState();return {mode:state.mode,width:state.width,template:state.template}
 }
 async function saleData(id){
   const [h,l,c,o]=await Promise.all([api('/api/sales/'+id),api('/api/sales/'+id+'/lines'),api('/api/settings').catch(()=>({})),api('/api/outlet').catch(()=>({}))]);
   let cfg=await currentPrintConfig();
   const saved=String(h.PrintTemplate||'');
   if(/^T\d\d$/.test(saved)){cfg.mode='Thermal';cfg.template=saved}
   else if(/^A\d\d$/.test(saved)){cfg.mode='A4';cfg.template=saved}
   if(/58MM/i.test(h.PrintFormat||''))cfg.width='58MM';
   else if(/80MM/i.test(h.PrintFormat||''))cfg.width='80MM';
   if(/A4/i.test(h.PrintFormat||''))cfg.mode='A4';
   return {d:{h,l,company:c,outlet:o},cfg}
 }
 window.printInvoice=async function(id){
   try{
    const x=await saleData(id),w=window.open('','_blank',x.cfg.mode==='Thermal'?'width=460,height=760':'width=1000,height=800');
    if(!w)return toast('Popup blocked');
    w.document.write(buildHtml(x.d,x.cfg.mode,x.cfg.template,x.cfg.width,true));w.document.close()
   }catch(e){alert('Print failed: '+e.message)}
 };
 window.printLastBill=window.printInvoice;
 window.printTestReceipt=window.printMasterTest;
 window.savePrintSettings=window.savePrintMaster;
})();
