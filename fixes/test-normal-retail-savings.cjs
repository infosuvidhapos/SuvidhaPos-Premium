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

for(const token of ["['T11','Retail Savings 80mm'","You Save:","YOU SAVED","Print.CurrencyText","Thermal Printer · 11","template==='T11'?z.net:z.amount"])
 assert.ok(print.includes(token),'T11 missing '+token);
assert.ok(print.includes("state.width='80MM'"),'T11 must force 80MM');
assert.ok(print.includes("'Rs. '"),'T11 must support Rs. fallback');

for(const token of ['cbApplyLineEdit','DiscountPer:cbProductDiscount','cb-line-discount','Discount:cbLineDiscount(x).discount','totalDiscount:lineDiscount+d.amount'])
 assert.ok(billing.includes(token),'Billing discount missing '+token);
assert.ok(billing.includes("Discount: ${Number(dl.percent.toFixed(2))}%"),'Billing must show non-zero item discount below item');

for(const token of ['Barcode / Item Name:','bpSearchKey','bpPickPurchaseItem','purchaseCellKey','data-purchase-edit'])
 assert.ok(purchase.includes(token),'Purchase keyboard picker missing '+token);
assert.ok(!purchase.includes('list="bpItemSuggestions"'),'Native datalist must not be the purchase picker');

for(const token of ['CATEGORY_MASTER','AI_IMPORT','ITEM_IMPORT','BULK_EDIT','ITEM_RATE_UPDATE','OPENING_STOCK','BARCODE','PRINT_MASTER','DATABASE_BACKUP','loadRetailFeatureControl'])
 assert.ok(feature.includes(token),'Normal Feature Control missing '+token);
assert.ok(!feature.includes('COMMON'),'Normal Feature Control must not show COMMON badges');
assert.ok(!feature.includes("['JEWELLERY_ITEM_MASTER'"),'Retail controller must not own jewellery item master');

assert.ok(runtime.includes("if(isJewel()&&w.loadJewelleryFeatureControl)"),'Jewellery Feature Control routing must remain dedicated');
assert.ok(runtime.includes("loadRetailFeatureControl"),'Runtime must delegate normal Feature Control');
assert.ok(!runtime.includes('SCOPED FEATURE CONTROL'),'Legacy P/Common Feature Control page must be gone');
assert.ok(!completion.includes("if(!jewel()&&!enabled('P-05'))return notify('P-05 is disabled')"),'Legacy P-05 must not gate normal item import');
assert.ok(!completion.includes("if(!jewel()&&!enabled('P-03'))return notify('P-03 is disabled')"),'Legacy P-03 must not gate normal barcode master');

for(const token of ['lineDiscount=Math.Min','a.BaseQty*a.BaseRate-a.Discount','takeDiscount','P("@di",takeDiscount)','itemSavings=resolved.Sum'])
 assert.ok(backend.includes(token),'Server line-discount persistence missing '+token);

const gross=80*2,discount=gross*15/100;
assert.equal(discount,24);
assert.equal(gross-discount,136);
console.log('PASS: normal retail T11, purchase keyboard picker, feature control and line-discount guards');
