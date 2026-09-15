const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const print=read('src/SuvidhaPOS-Premium/wwwroot/js/print-settings.js');
const billing=read('src/SuvidhaPOS-Premium/wwwroot/js/billing-actions-6128.js');
const app=read('src/SuvidhaPOS-Premium/wwwroot/js/app.js');
const audit=read('src/SuvidhaPOS-Premium/wwwroot/js/audit-report-thermal.js');
const thermal=read('src/SuvidhaPOS-Premium/wwwroot/js/retail-thermal-reports.js');
const jewel=read('src/SuvidhaPOS-Premium/wwwroot/js/jewellery-suite.js');
const init=read('src/SuvidhaPOS-Premium/Data/DatabaseInitializer.cs');
const iss=read('installer/SuvidhaPOS.iss');

for(const [name,src] of [['print-settings',print],['billing-actions',billing],['app',app],['audit',audit],['thermal',thermal],['jewellery-suite',jewel]])
 assert.doesNotThrow(()=>new Function(src),name+' must parse');

// 1. Print Master: exactly one default selector, no injected Bill Print Action panel.
assert.equal((print.match(/Default Bill Print Action/g)||[]).length,1,'Print Master must contain exactly one Default Bill Print Action selector');
assert.ok(!print.includes('id="billingPrintActions"'),'Print Master source must not contain billingPrintActions radio panel');
assert.ok(print.includes('purgePrintActionPanels'),'Print Master must purge any late injected bill-action panel');
assert.ok(billing.includes("if(q('.print-master'))"),'Billing action injector must exit on Print Master');
assert.ok(billing.includes('/css/audit-report-thermal.css?v=6300'),'Audit thermal CSS cache must be v6300');
assert.ok(billing.includes('/js/audit-report-thermal.js?v=6300'),'Audit thermal JS cache must be v6300');
assert.ok(billing.includes("qa('#billingPrintActions,.billing-print-actions,#printMasterBillPrintAction')"),'Print Master duplicate purge guard missing');

// 2. Settings: Local Database/Create Backup card removed, dedicated Backup Master remains.
assert.ok(!app.includes('LOCAL DATABASE'),'Settings must not render LOCAL DATABASE backup card');
assert.ok(!app.includes('Create Backup Now'),'Settings must not render Create Backup Now button');
assert.ok(jewel.includes('loadBackupMaster()'),'Jewellery must expose working Database Backup route');
assert.ok(jewel.includes('loadPrintSettings()'),'Jewellery must expose Print Master route');

// 3. All common 80mm reports: same Thermal Print + Preview pattern.
for(const token of ['Thermal Print 80mm','Preview / Print']) {
 assert.ok(audit.includes(token),'Audit thermal action missing '+token);
 assert.ok(thermal.includes(token),'Common thermal report action missing '+token);
}
assert.ok(audit.includes('<div class="atr-head">'),'Audit receipt header must be isolated from global app header CSS');
assert.ok(!audit.includes('Audit Report - Account Summary'),'Audit receipt must not print Account Summary side title');
assert.ok(audit.includes('<h3>AUDIT REPORT</h3>'),'Audit receipt must show clean AUDIT REPORT title');
assert.ok(thermal.includes("text(z,'outlet')||'SUVIDHA POS'"),'Common thermal receipt must print outlet name at top');

// Fixed MDF/LDF policy.
for(const token of ['@"D:\\",@"E:\\"','Suvidha Pos\\Database','CREATE DATABASE','FILENAME=N'])assert.ok(init.includes(token),'Database initializer path policy missing '+token);
for(const token of ["'D:\\Suvidha Pos\\Database'","'E:\\Suvidha Pos\\Database'",'EnsureDatabaseFolder'])assert.ok(iss.includes(token),'Installer database path policy missing '+token);

console.log('PASS: Print Master duplicate removal, Settings backup cleanup, unified 80mm actions, Jewellery backup route and D/E database path');
