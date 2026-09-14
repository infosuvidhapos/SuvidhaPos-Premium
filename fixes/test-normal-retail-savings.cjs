const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const jsFiles=[
 'src/SuvidhaPOS-Premium/wwwroot/js/print-settings.js',
 'src/SuvidhaPOS-Premium/wwwroot/js/counter-billing.js',
 'src/SuvidhaPOS-Premium/wwwroot/js/purchase-ui.js',
 'src/SuvidhaPOS-Premium/wwwroot/js/sidebar-feature-control.js',
 'src/SuvidhaPOS-Premium/wwwroot/js/runtime-fixes-6126.js',
 'src/SuvidhaPOS-Premium/wwwroot/js/premium-completion.js'
];
for(const file of jsFiles){
 const source=read(file);
 assert.doesNotThrow(()=>new Function(source),file+' must parse');
}
const print=read(jsFiles[0]),billing=read(jsFiles[1]),purchase=read(jsFiles[2]),feature=read(jsFiles[3]),runtime=read(jsFiles[4]),completion=read(jsFiles[5]);
const backend=read('src/SuvidhaPOS-Premium/PremiumFeatureModules.cs');
const manualPurchase=read('src/SuvidhaPOS-Premium/ManualPurchaseService.cs');

for(const token of ["['T11','Retail Savings 80mm'","You Save:","YOU SAVED","Print.CurrencyText","Thermal Printer · 11","template==='T11'?z.net:z.amount"])
 assert.ok(print.includes(token),'T11 missing '+token);
assert.ok(print.includes("state.width='80MM'"),'T11 must force 80MM');
assert.ok(print.includes("'Rs. '"),'T11 must support Rs. fallback');

for(const token of ['cbApplyLineEdit','DiscountPer:cbProductDiscount','cb-line-discount','Discount:cbLineDiscount(x).discount','totalDiscount:lineDiscount+d.amount'])
 assert.ok(billing.includes(token),'Billing discount missing '+token);
assert.ok(billing.includes("Discount: ${Number(dl.percent.toFixed(2))}%"),'Billing must show non-zero item discount below item');

for(const token of ['Bill No :','Bill Date :','Supplier Name :','Barcode / Item Name:','purchaseHeaderKey','bpSearchKey','bpPickPurchaseItem','purchaseCellKey','data-purchase-edit'])
 assert.ok(purchase.includes(token),'Purchase keyboard picker missing '+token);
assert.ok(!purchase.includes('list="bpItemSuggestions"'),'Native datalist must not be the purchase picker');

for(const token of ['CATEGORY_MASTER','AI_IMPORT','ITEM_IMPORT','BULK_EDIT','ITEM_RATE_UPDATE','OPENING_STOCK','BARCODE','PRINT_MASTER','DATABASE_BACKUP','loadRetailFeatureControl'])
 assert.ok(feature.includes(token),'Normal Feature Control missing '+token);
assert.ok(!feature.includes('COMMON'),'Normal Feature Control must not show COMMON badges');
assert.ok(!feature.includes("['JEWELLERY_ITEM_MASTER'"),'Retail controller must not own jewellery item master');

assert.ok(runtime.includes("if(isJewel()&&w.loadJewelleryFeatureControl)"),'Jewellery Feature Control routing must remain dedicated');
assert.ok(runtime.includes("loadRetailFeatureControl"),'Runtime must delegate normal Feature Control');
assert.ok(!runtime.includes('SCOPED FEATURE CONTROL'),'Legacy P/Common Feature Control page must be gone');
const normalImportBlock=completion.slice(completion.indexOf('w.loadNormalItemImportMaster='),completion.indexOf('w.runNormalItemImport='));
const barcodeBlock=completion.slice(completion.indexOf('w.loadBarcodePrintMaster='),completion.indexOf('w.premiumChooseBarcodeTemplate='));
assert.ok(!normalImportBlock.includes("enabled('P-05')"),'Legacy P-05 must not gate normal item import');
assert.ok(!barcodeBlock.includes("enabled('P-03')"),'Legacy P-03 must not gate normal barcode master');
assert.ok(completion.includes("if(!jewel()&&!enabled('P-05'))return notify('P-05 is disabled')"),'Jewellery import legacy guard must remain untouched by normal-only scope');

for(const token of ['lineDiscount=Math.Min','a.BaseQty*a.BaseRate-a.Discount','takeDiscount','P("@di",takeDiscount)','itemSavings=resolved.Sum'])
 assert.ok(backend.includes(token),'Server line-discount persistence missing '+token);
for(const token of ['UPDATE Products SET Mrp=@mrp,SalePrice=@sale,Dis_Rate=@disc','RetailItemRules.SyncRates(c,tx,l.ProductId,mrp:true,discount:true)'])
 assert.ok(manualPurchase.includes(token),'Manual purchase discount-to-master sync missing '+token);

const gross=80*2,discount=gross*15/100;
assert.equal(discount,24);
assert.equal(gross-discount,136);
console.log('PASS: normal retail T11, purchase keyboard picker, feature control and line-discount guards');
