const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const suite=read('src/SuvidhaPOS-Premium/wwwroot/js/reports-suite.js');
const thermal=read('src/SuvidhaPOS-Premium/wwwroot/js/retail-thermal-reports.js');
const backend=read('src/SuvidhaPOS-Premium/RetailThermalReportModules.cs');
const html=read('src/SuvidhaPOS-Premium/wwwroot/index.html');
for(const [name,src] of [['reports-suite',suite],['retail-thermal-reports',thermal]])assert.doesNotThrow(()=>new Function(src),name+' must parse');

const ordered=[
"['account-report','Daily Account Summary']",
"['daily-sale-bill-wise','Daily Sale Report Bill Wise']",
"['cashier-report','Cashier Closing Report']",
"['payment-mode-report','Payment Mode Report']",
"['expense-report','Expense Report']",
"['day-close-report','Day Close Report']",
"['audit-trail-report','Audit Trail Report']"
];
let last=-1;for(const token of ordered){const at=suite.indexOf(token);assert.ok(at>last,'Report order missing/out of order: '+token);last=at}
assert.ok(suite.includes('25 premium business reports with filters and export'),'Report count subtitle must be 25');
assert.ok(suite.includes('<b>25</b><span>Reports Ready</span>'),'Report count badge must be 25');
for(const token of ['account-report','cashier-report','payment-mode-report','expense-report','day-close-report','audit-trail-report'])
 assert.ok(suite.includes(token)&&thermal.includes(token),'Thermal report route missing '+token);

for(const token of [
 'SALES SUMMARY','Gross Sales','(-) Item Discount','(-) Bill Discount','(-) Returns','NET SALES',
 'TAX SUMMARY','Taxable Sale','CGST','SGST','IGST','Total Tax',
 'PAYMENT SUMMARY','Cash','UPI','Card','Credit','Other','Total Collection',
 'CASH ACCOUNT','Opening Cash','Cash Sale','Cash Received','Cash Expense','Cash Refund','Cash Withdrawal','Expected Cash','Actual Cash','SHORT / EXCESS',
 'OTHER TRANSACTIONS','Purchase','Expenses','Customer Received','Supplier Paid','Credit Sale','Return Amount',
 'BILL SUMMARY','Total Bills','Cancelled Bills','Hold Bills','Return Bills','Average Bill Value',
 'Cashier Sign: ______________','Manager Sign: ______________'
]) assert.ok(thermal.includes(token),'Daily Account receipt token missing: '+token);
assert.ok(thermal.includes('@page{size:80mm auto'),'Thermal report must be 80mm compatible');
for(const token of ['DIRECT','PREVIEW','REPORT_PDF','desktopSaveTextFile','desktopSaveReportXlsx','.xlsx',' Form '])assert.ok(thermal.includes(token),'Print/export mode missing '+token);

for(const token of [
 '/api/reports/thermal/{type}','SalesReturns','SalePayments','CustomerPayments','SupplierPayments','DayClosings','HeldBills','AuditLogs','Expenses',
 'grossSales','itemDiscount','billDiscount','netSales','cgst','sgst','expectedCash','actualCash','averageBillValue'
]) assert.ok(backend.includes(token),'Backend thermal report data missing '+token);
assert.ok(backend.includes('cashWithdrawal=0m'),'Cash withdrawal must be explicit zero instead of guessed data');
assert.ok(html.includes('/js/retail-thermal-reports.js?v=6290'),'Thermal report JS not loaded');
assert.ok(html.includes('/css/retail-thermal-reports.css?v=6290'),'Thermal report CSS not loaded');

console.log('PASS: 25-report master and six 80mm thermal account/closing reports');
