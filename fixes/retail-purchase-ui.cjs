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
 const w=dom.window,calls=[],messages=[];
 Object.assign(w,{state:{},setPage:()=>{},loadDashboard:async()=>{},fmt:x=>String(x||''),errorBox:e=>String(e),toast:s=>messages.push(s),alert:s=>messages.push(s),confirm:()=>true});
 w.api=async(url,opt={})=>{
  const body=opt.body?JSON.parse(opt.body):null;calls.push({url,method:opt.method||'GET',body});
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
 const input=(id,value)=>{const e=w.document.getElementById(id);assert.ok(e,`Expected ${id} input`);e.value=String(value);e.dispatchEvent(new w.Event('input',{bubbles:true}));return e};
 return {w,calls,messages,input,close:()=>dom.window.close()};
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
(async()=>{let failures=0;for(const {name,run} of tests){try{await run();console.log('PASS',name)}catch(e){failures++;console.error('FAIL',name,'\n ',e.message)}}console.log(`${tests.length-failures}/${tests.length} UI checks passed`);process.exitCode=failures?1:0;})();
