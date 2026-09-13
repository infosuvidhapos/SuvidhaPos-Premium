/* Run: NODE_PATH=<directory containing jsdom> node fixes/retail-purchase-ui.cjs
   Real UI scripts, with only SQL/HTTP responses replaced by deterministic fixtures. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../src/SuvidhaPOS-Premium/wwwroot');
const product={Id:7,ItemCode:7,Name:'QA Existing',Barcode:'QA-001',Sku:'KEPT',Category:'General',Unit:'PCS',Hsn:'1234',GstRate:5,TaxMode:'EXCLUSIVE',Dis_Rate:0,Mrp:100,PurchasePrice:70,SalePrice:93,MinStock:11,MaxStock:99,LocationCode:'L1',RackName:'R1',ShelfName:'S1',TrackBatch:false,TrackExpiry:false};
const units=['PCS','BOX','STRIP'].map((v,i)=>({Id:i+1,UnitName:v,UnitCode:v}));
const simple={ProductId:7,BaseUnit:'PCS',PackUnit:'PCS',ConversionFactor:1,InnerUnit:null,InnerConversionFactor:1,PackInnerFactor:1,PackPurchaseRate:70,PackMrp:100,PackSalePrice:93,LooseSalePrice:93,AllowLoose:true};
const multi={...simple,InnerUnit:'STRIP',PackUnit:'BOX',ConversionFactor:100,InnerConversionFactor:10,PackInnerFactor:10,PackPurchaseRate:7000,PackMrp:10000,PackSalePrice:9300,InnerPurchaseRate:700,InnerMrp:1000,InnerSalePrice:930};
function harness(uom=simple){
 const dom=new JSDOM('<body><header><h1 id="title"></h1><p></p></header><main id="app"></main><div id="toast"></div></body>',{url:'http://qa.localhost',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,calls=[],messages=[],routes=new Map();
 Object.assign(w,{state:{},setPage:()=>{},loadDashboard:async()=>{},fmt:x=>String(x||''),errorBox:e=>String(e),toast:s=>messages.push(s),alert:s=>messages.push(s),confirm:()=>true});
 w.api=async(url,opt={})=>{
  const body=opt.body?JSON.parse(opt.body):null;calls.push({url,method:opt.method||'GET',body});
  if(routes.has(url))return routes.get(url)(body,opt);
  if(opt.method==='POST'||opt.method==='PUT')return {id:8,updated:1,saved:true,total:100};
  if(url.startsWith('/api/products/identity-check'))return {duplicate:false};
  if(url.includes('/uom'))return {...uom};
  if(url==='/api/products/7')return {...product};
  if(url.startsWith('/api/products'))return [{...product}];
  if(url==='/api/unit-master')return units;
  if(url==='/api/specialization')return {IsJewellery:false,StoreType:'Retail'};
  if(url==='/api/suppliers')return [{Id:1,Name:'QA Supplier'}];
  if(url==='/api/categories')return [{Id:1,Name:'General'}];
  if(url==='/api/purchases')return [];
  throw Error('Unexpected API '+url);
 };
 const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
 for(const name of ['modal','closeModal'])w.eval(app.split('\n').find(l=>l.startsWith('function '+name+'(')));
 w.eval(fs.readFileSync(path.join(root,'js/specialized-pos.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'js/purchase-ui.js'),'utf8'));
 if(fs.existsSync(path.join(root,'js/purchase-import-ui.js')))w.eval(fs.readFileSync(path.join(root,'js/purchase-import-ui.js'),'utf8'));
 const input=(id,value)=>{const e=w.document.getElementById(id);assert.ok(e,`Expected ${id} input`);e.value=String(value);e.dispatchEvent(new w.Event('input',{bubbles:true}));return e};
 return {w,calls,messages,input,routes,close:()=>dom.window.close()};
}
const tests=[];const test=(name,run)=>tests.push({name,run});
test('new item has simple save, inclusive tax and MRP discount calculation',async()=>{
 const h=harness();try{await h.w.openUomProduct();const d=h.w.document;
 assert.equal(d.querySelector('#umulti')?.checked,false,'New item must have multi-unit OFF');
 assert.equal(d.querySelector('#uomDetails')?.hidden,true,'Conversion panel stays hidden until enabled');
 assert.equal(d.querySelector('input[name="uTaxMode"]:checked')?.value,'INCLUSIVE');
 h.input('unm','QA New');h.input('ubm',100);h.input('udiscount',10);
 assert.equal(Number(d.querySelector('#ubs').value),90,'10% of MRP100 means sale90');
 await h.w.saveUomProduct(0);
 const p=h.calls.find(x=>x.url==='/api/products'&&x.method==='POST').body;
 assert.equal(p.Mrp,100);assert.equal(p.DiscountPer,10);assert.equal(p.SalePrice,90);assert.equal(p.TaxMode,'INCLUSIVE');
 assert.equal(p.Uom?.ConversionFactor,1,'Simple item saves conversion atomically as1');
 assert.equal(p.Uom?.PackUnit,'PCS');
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
test('unrelated existing item edits retain rates, tax, inventory settings and SKU',async()=>{
 const h=harness();try{await h.w.openUomProduct(7);h.input('urack','R2');await h.w.saveUomProduct(7);
 const p=h.calls.find(x=>x.url==='/api/products/7'&&x.method==='PUT').body;
 assert.equal(p.DiscountPer,undefined,'Unedited discount must not force a sale-price replacement');
 for(const k of ['SalePrice','Mrp','TaxMode','MinStock','MaxStock','Sku','TrackBatch','TrackExpiry','ShelfName'])assert.equal(p[k],product[k],k+' must survive unrelated edit');
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
test('an existing zero price and custom zero unit rates remain zero',async()=>{
 const h=harness({...multi,PackMrp:0,PackPurchaseRate:0,PackSalePrice:0});try{
 h.routes.set('/api/products/7',()=>({...product,Mrp:0,PurchasePrice:0}));await h.w.openUomProduct(7);h.input('urack','R2');await h.w.saveUomProduct(7);
 const p=h.calls.find(x=>x.url==='/api/products/7'&&x.method==='PUT').body;assert.equal(p.Mrp,0);assert.equal(p.PurchasePrice,0);assert.equal(p.Uom.PackMrp,0);assert.equal(p.Uom.PackPurchaseRate,0);assert.equal(p.Uom.PackSalePrice,0);
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
test('existing pack/inner configuration reopens enabled and keeps conversion',async()=>{
 const h=harness(multi);try{await h.w.openUomProduct(7);assert.equal(h.w.document.querySelector('#umulti')?.checked,true);
 await h.w.saveUomProduct(7);const p=h.calls.find(x=>x.url==='/api/products/7'&&x.method==='PUT').body;
 assert.equal(p.Uom?.ConversionFactor,100);assert.equal(p.Uom?.InnerConversionFactor,10);assert.equal(p.Uom?.PackInnerFactor,10);
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
test('purchase allows batch discount and inclusive cost without product master writes',async()=>{
 const h=harness();try{await h.w.loadPurchase();await h.w.openBarcodePurchase();h.input('bpScan','QA-001');await h.w.barcodePurchaseScan();
 assert.equal(h.w.S.barPurLines[0].TaxMode,'INCLUSIVE');
 h.w.barcodePurchaseSet(0,'Mrp','100');h.w.barcodePurchaseSet(0,'DiscountPer','10');
 assert.equal(h.w.S.barPurLines[0].SalePrice,90);
 h.w.barcodePurchaseSet(0,'Cost','105');h.w.barcodePurchaseSet(0,'GstRate','5');
 assert.match(h.w.document.querySelector('#bpTotals')?.textContent||'',/105\.00/,'Inclusive payable105');
 await h.w.saveBarcodePurchase();const p=h.calls.find(x=>x.url==='/api/purchases'&&x.method==='POST').body;
 assert.equal(p.Lines[0].DiscountPer,10);assert.equal(p.Lines[0].TaxMode,'INCLUSIVE');assert.ok(p.RequestId);
 assert.equal(h.calls.some(x=>x.url.startsWith('/api/products')&&x.method!=='GET'),false);
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
test('uncertain purchase save retries same payload and cannot double-submit',async()=>{
 const h=harness();try{await h.w.loadPurchase();await h.w.openBarcodePurchase();h.input('bpScan','QA-001');await h.w.barcodePurchaseScan();
 let attempts=0;h.routes.set('/api/purchases',async()=>{attempts++;if(attempts===1)throw Error('Connection lost');return {id:3,total:70,alreadyImported:true}});
 await h.w.saveBarcodePurchase();assert.equal(h.w.document.querySelector('#bpi').disabled,true,'Unknown outcome freezes edits');
 await Promise.all([h.w.saveBarcodePurchase(),h.w.saveBarcodePurchase()]);
 const posts=h.calls.filter(x=>x.url==='/api/purchases'&&x.method==='POST');assert.equal(posts.length,2);assert.deepEqual(posts[0].body,posts[1].body);
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
test('unconfirmed purchase cannot be replaced with another draft or edited',async()=>{
 const h=harness();try{await h.w.openBarcodePurchase();h.input('bpScan','QA-001');await h.w.barcodePurchaseScan();
 h.input('bpi','EARLIER-DRAFT');h.w.barcodePurchaseTempSave();h.input('bpi','PENDING-SAVE');
 h.routes.set('/api/purchases',()=>{throw Error('Connection lost')});await h.w.saveBarcodePurchase();
 const attempt=h.w.S.purchaseAttempt;await h.w.barcodePurchaseTempLoad();h.w.barcodePurchaseSet(0,'Qty','9');
 assert.equal(h.w.document.querySelector('#bpi').value,'PENDING-SAVE');assert.equal(h.w.S.barPurLines[0].Qty,1);assert.equal(h.w.S.purchaseAttempt,attempt);
 assert.equal(h.w.document.querySelector('[onclick="barcodePurchaseTempLoad()"]').disabled,true);
 h.w.barcodePurchaseTempSave();await h.w.openBarcodePurchase();await h.w.barcodePurchaseTempLoad();
 assert.equal(h.w.document.querySelector('#bpi').disabled,true,'Restored uncertain attempt stays frozen for exact retry');
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
test('normal item import defaults inclusive and offers no overwrite resolution',async()=>{
 const h=harness();try{h.w.eval(fs.readFileSync(path.join(root,'js/premium-completion.js'),'utf8'));h.w.loadNormalItemImportMaster();
 assert.equal(h.w.document.querySelector('#nimGstMode').value,'INCLUSIVE');
 assert.doesNotMatch(h.w.document.querySelector('#app').textContent,/Update Existing|Create Copy/);
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
test('import preview blocks invalid rows and revalidates corrections before commit',async()=>{
 const h=harness();try{assert.equal(typeof h.w.openPurchaseImport,'function','Dedicated import workspace is available');
 const preview={requestId:'22222222-2222-4222-8222-222222222222',previewToken:'v1',sourceToken:'A'.repeat(64),summary:{total:1,newItems:1,matched:0,errors:1,warnings:0},totals:{subTotal:0,tax:0,total:0},groups:[],rows:[{RowNo:2,ItemName:'QA New',Barcode:'QAB',Qty:-1,Unit:'PCS',PurchaseRate:10,Mrp:12,Discount:10,GstRate:0,TaxMode:'INCLUSIVE',InvoiceNo:'QA-IMPORT',PurchaseDate:'2026-09-12',SupplierName:'QA Supplier',Errors:['Quantity must be positive'],Warnings:[],Status:'ERROR'}]};
 h.w.fetch=async()=>({ok:true,json:async()=>preview});await h.w.openPurchaseImport();await h.w.barcodePurchaseImportPreview(new h.w.File(['fixture'],'fixture.xls'));
 assert.equal(h.w.document.querySelector('#piCommit').disabled,true);await h.w.barcodePurchaseCommitImport();assert.equal(h.calls.some(x=>x.url==='/api/purchase-import/commit'),false);
 h.w.purchaseImportEdit(0);h.input('piEditQty',5);h.w.savePurchaseImportRow();
 h.routes.set('/api/purchase-import/validate',body=>({...preview,previewToken:'v2',summary:{...preview.summary,errors:0},rows:body.Rows.map(x=>({...x,Errors:[],Status:'NEW'})),totals:{subTotal:50,tax:0,total:50}}));
 await h.w.purchaseImportValidate();assert.equal(h.w.document.querySelector('#piCommit').disabled,false);
 await h.w.barcodePurchaseCommitImport();const body=h.calls.find(x=>x.url==='/api/purchase-import/commit').body;assert.equal(body.Rows[0].Qty,5);assert.equal(body.Rows[0].Barcode,'QAB');assert.equal(body.PreviewToken,'v2');assert.ok(body.RequestId);assert.equal(body.SourceToken,'A'.repeat(64));
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
test('item rate update submits an explicit zero discount without losing it',async()=>{
 const h=harness();try{h.w.eval(fs.readFileSync(path.join(root,'js/retail-masters-ui.js'),'utf8'));await h.w.loadItemRateUpdate();
 h.w.fetch=async()=>({ok:true,json:async()=>({rows:[{RowNo:1,ProductId:7,ItemName:product.Name,Barcode:product.Barcode,CurrentMrp:100,CurrentPurchase:70,CurrentSale:93,CurrentDiscountPer:7,Mrp:120,PurchasePrice:null,SalePrice:null,DiscountPer:10,Selected:true,Error:''}]})});
 Object.defineProperty(h.w.document.querySelector('#rirFile'),'files',{value:[new h.w.File(['fixture'],'rate.csv')]});await h.w.retailRatePreview();
 const discount=h.w.document.querySelector('[data-rate-discount]');assert.ok(discount,'Discount Per must be editable in rate update');discount.value='0';discount.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.w.retailRateApply();
 const body=h.calls.find(x=>x.url==='/api/retail/item-rates/apply').body;assert.equal(body.Rows[0].DiscountPer,0);
 }finally{await new Promise(r=>setTimeout(r,0));h.close()}
});
(async()=>{let failures=0;for(const {name,run} of tests){try{await run();console.log('PASS',name)}catch(e){failures++;console.error('FAIL',name,'\n ',e.message)}}console.log(`${tests.length-failures}/${tests.length} UI checks passed`);process.exitCode=failures?1:0;})();
