const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files={
 hold:'src/SuvidhaPOS-Premium/wwwroot/js/billing-hold.js',
 billing:'src/SuvidhaPOS-Premium/wwwroot/js/billing-actions-6128.js',
 counter:'src/SuvidhaPOS-Premium/wwwroot/js/counter-billing.js',
 print:'src/SuvidhaPOS-Premium/wwwroot/js/print-settings.js',
 purchase:'src/SuvidhaPOS-Premium/wwwroot/js/purchase-ui.js',
 import:'src/SuvidhaPOS-Premium/wwwroot/js/purchase-import-ui.js',
 feature:'src/SuvidhaPOS-Premium/wwwroot/js/sidebar-feature-control.js',
 inventory:'src/SuvidhaPOS-Premium/wwwroot/js/inventory-master.js',
 reports:'src/SuvidhaPOS-Premium/wwwroot/js/reports-suite.js',
 desktop:'src/SuvidhaPOS-Premium/wwwroot/js/desktop-bridge.js'
};
for(const [name,file] of Object.entries(files)){const s=read(file);assert.doesNotThrow(()=>new Function(s),name+' JS must parse')}

const hold=read(files.hold);
assert.ok(hold.includes('Hold Current Bill'),'Hold action missing');
assert.ok(!hold.includes('Hold Current Bill</button><button class="btn secondary" onclick="closeModal()">Close</button>'),'Hold modal must not add a second Close action');

const billing=read(files.billing),counter=read(files.counter);
assert.ok(billing.includes("Print.Normal.ActionMode"),'Normal print action setting missing');
assert.ok(billing.includes("JEWEL_PRINT_KEY='Print.ActionMode'"),'Jewellery legacy action key must remain isolated');
assert.ok(!billing.includes("saveMode('DIRECT',false)"),'New normal bill must not overwrite default print action');
assert.ok(billing.includes('modeOverride'),'Print engine must accept an explicit action override');
assert.ok(counter.includes("await printLastBill(data.id)"),'Billing must await selected print action before opening next bill');

const print=read(files.print);
for(const token of ["['A11','Discount Savings A4'","Print.Normal.ActionMode","Default Bill Print Action","a4Orientation","'A02','A07'","Discount %","You Save","22"])
 assert.ok(print.includes(token),'Print Master missing '+token);
assert.ok(print.includes("jewellery()?A4.filter(x=>x[0]!=='A11'):A4"),'A11 must stay out of Jewellery Print Master');

const purchase=read(files.purchase),imp=read(files.import);
const purchaseModeToken='purchase-mode-'+'$'+'{mode}';
for(const token of ["Bill No is required before saving purchase.",purchaseModeToken,"BARCODE PURCHASE · KEYBOARD READY","rp-keyboard-strip","bpQuickStats"])
 assert.ok(purchase.includes(token),'Purchase UX/validation missing '+token);
assert.ok(imp.includes('purchaseImportDelete'),'Purchase import delete action missing');
assert.ok(imp.includes('Recheck changes before saving'),'Deleting import row must invalidate/recheck preview');

const feature=read(files.feature);
assert.ok(feature.includes("['INVENTORY_MASTER','Inventory Master'"),'Feature Control Inventory Master switch missing');
assert.ok(feature.includes('To disable any option, simply untick it.'),'Feature Control untick guidance missing');
const retailFeaturePage=feature.slice(feature.indexOf('w.loadRetailFeatureControl='),feature.indexOf('w.sidebarFeatureToggle='));
assert.ok(!retailFeaturePage.includes('Jewellery controls stay separate'),'Requested old Feature Control helper must be removed');
assert.ok(retailFeaturePage.includes('← Back'),'Feature Control Back action missing');

const inv=read(files.inventory),backend=read('src/SuvidhaPOS-Premium/InventoryMasterModules.cs'),schema=read('src/SuvidhaPOS-Premium/Database/schema.sql');
const ordered=['Opening Stock','Purchase','Purchase Detail','Sale Return','Purchase Return','Damage Entry','Closing Stock','Stock Receive','Stock Transfer'];
let last=-1;for(const name of ordered){const at=inv.indexOf("['"+name+"'");assert.ok(at>last,'Inventory Master option missing/out of order: '+name);last=at}
for(const token of ['/api/inventory/damage','/api/inventory/receive','/api/inventory/transfer','STOCK_TRANSFER_OUT','IN_TRANSIT','stock-date-wise'])
 assert.ok(backend.includes(token),'Inventory backend missing '+token);
for(const token of ['StockDamageEntries','StockReceipts','StockTransfers','StockTransferLines'])
 assert.ok(schema.includes(token),'Inventory schema missing '+token);
assert.ok(inv.includes("if(jewel())return loadDashboard()"),'Inventory Master must be normal-only');

const reports=read(files.reports);
for(const token of ['Bill No. ','Bill Detail Report From ','desktopSaveTextFile','desktopPrintHtmlBatch','previewBillDetailOriginal','getInvoicePrintArtifact'])
 assert.ok(reports.includes(token)||read(files.print).includes(token)||read(files.desktop).includes(token),'Historical report export missing '+token);
const printSchema=read('src/SuvidhaPOS-Premium/Database/print-schema.sql');
for(const token of ['PrintSnapshotHtml','PrintSnapshotAt'])assert.ok(printSchema.includes(token),'Print snapshot schema missing '+token);
const program=read('src/SuvidhaPOS-Premium/Program.cs');
assert.ok(program.includes('/api/sales/{id:int}/print-snapshot'),'Immutable bill snapshot endpoint missing');
const desktopHost=read('src/SuvidhaPOS.Desktop/MainForm.cs');
for(const token of ['REPORT_PDF','saveTextFile','printHtmlBatch','DesktopDirectory','HandlePrintHtmlBatchAsync'])
 assert.ok(desktopHost.includes(token),'Desktop report save support missing '+token);
for(const token of ["['stock-date-wise-report','Stock Report Date Wise']","['stock-transfer-report','Stock Transfer Report']","21 premium business reports","<b>21</b>"])
 assert.ok(reports.includes(token),'Report Master missing '+token);

const html=read('src/SuvidhaPOS-Premium/wwwroot/index.html');
assert.ok(html.includes('data-page="inventorymaster"'),'Inventory Master sidebar entry missing');
assert.ok(!html.includes('data-page="purchase"'),'Purchase must not remain a top-level sidebar entry');
assert.ok(!html.includes('data-page="returns"'),'Returns must not remain a top-level sidebar entry');

const manual=read('src/SuvidhaPOS-Premium/ManualPurchaseService.cs');
assert.ok(manual.includes('Bill No is required'),'Backend Bill No guard missing');
assert.ok(!manual.includes('?"PUR-"+Guid.NewGuid()'),'Manual purchase must not auto-generate Bill No');

console.log('PASS: hold modal, print action, A4 A11, purchase validation/import delete, Inventory Master, historical bill detail and Desktop exports');
