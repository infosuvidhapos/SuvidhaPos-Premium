// Run with node fixes/test-sidebar-feature-control.cjs [optional source path].
// Exercise the shipped runtime against representative retail/jewellery DOM labels.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../src/SuvidhaPOS-Premium/wwwroot/js/sidebar-feature-control.js'), 'utf8');
function button(id, text, label, page) {
  return {id, textContent: text, style: {}, dataset: {}, page,
    querySelector: () => label ? {textContent: label} : null};
}
async function scenario(jewellery) {
  const nodes = [button('settings', '⚙ Settings'), button('day', '▣Day Closing', jewellery ? 'Day Closing' : null),
    button('stock', jewellery ? '◇Stock' : '▤Items & Inventory', jewellery ? 'Stock' : 'Items & Inventory', 'products')];
  if (jewellery) nodes.push(button('items', '◆Item Master', 'Item Master', 'jItemMaster'), button('report', '◇Stock Report', 'Stock Report', 'jStockReport'));
  const sidebar = {querySelectorAll: selector => nodes.filter(n => selector === '#' + n.id || selector === `[data-page="${n.page}"]`)};
  const document = {readyState: 'complete', body: {classList: {contains: () => jewellery}},
    getElementById: id => id === 'sidebar' ? sidebar : null, querySelectorAll: () => nodes};
  let onLoad, pulse;
  const calls = [], saved = [];
  const settings = {SETTINGS:false, DAY_CLOSE:false, ITEM_MASTER:false, JEWELLERY_ITEM_MASTER:false, STOCK:true};
  const context = {document, currentUser:{Role:'Admin'}, MutationObserver:class {observe(){}},
    setTimeout: fn => fn(), setInterval: fn => {pulse = fn}, addEventListener: (_, fn) => {onLoad = fn},
    api: async (url, options) => options ? saved.push([url, JSON.parse(options.body)]) : Object.entries(settings).map(([key, value]) => ({Key:'Sidebar.Feature.' + key, Value:String(value)})),
    toast(){}, alert(message){throw Error(message)}, loadSettings: () => calls.push('settings'),
    loadProducts: () => calls.push('stock'), loadJewelleryItemMaster: () => calls.push('items')};
  context.window = context;
  vm.runInNewContext(source, context);
  onLoad();
  await new Promise(resolve => setImmediate(resolve));
  pulse();
  const hidden = id => nodes.find(n => n.id === id).style.display === 'none';
  assert.equal(hidden('settings'), true, 'icon-prefixed Settings must hide');
  assert.equal(hidden('day'), true, 'Day Closing must hide with/without label span');
  assert.equal(hidden('stock'), !jewellery, 'retail Item Master and jewellery Stock use separate switches');
  if (jewellery) assert.equal(hidden('items'), true, 'jewellery Item Master must hide independently');
  context.loadSettings(); context.loadProducts(); context.loadJewelleryItemMaster();
  assert.deepEqual(calls, jewellery ? ['stock'] : [], 'disabled route loaders must be blocked');
  await context.sidebarFeatureToggle('SETTINGS', true);
  assert.equal(hidden('settings'), false, 're-enable restores Settings');
  context.loadSettings();
  assert.equal(calls.at(-1), 'settings');
  assert.equal(saved[0][1].Value, 'true', 'enabled state is persisted');
  if (jewellery) {
    await context.sidebarFeatureToggle('STOCK', false);
    assert.equal(hidden('stock'), true);
    assert.equal(hidden('report'), false, 'Stock switch must not hide Stock Report');
    await context.sidebarFeatureToggle('JEWELLERY_ITEM_MASTER', true);
    assert.equal(hidden('items'), false);
    assert.equal(hidden('stock'), true, 'Item Master switch must not enable Stock');
  }
}
(async () => {await scenario(false); await scenario(true); console.log('PASS: icon labels, independent stock/item access, route gates, persistence and re-enable');})().catch(e => {console.error(e); process.exitCode = 1});
