// Run with node fixes/test-sidebar-feature-control.cjs [optional source path].
// Regression for the normal-retail Feature Control runtime. Jewellery has its own controller.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  process.argv[2] || path.join(__dirname, '../src/SuvidhaPOS-Premium/wwwroot/js/sidebar-feature-control.js'),
  'utf8'
);

function button(id, text, label, page) {
  return {
    id, textContent:text, style:{}, dataset:{}, page,
    querySelector: selector => label && selector === 'span:not(.js-icon)' ? {textContent:label} : null
  };
}
function sidebarFor(nodes) {
  return {
    querySelectorAll(selector) {
      if (selector.startsWith('#')) return nodes.filter(n => n.id === selector.slice(1));
      const page = selector.match(/^\[data-page="([^"]+)"\]$/);
      return page ? nodes.filter(n => n.page === page[1]) : [];
    }
  };
}
async function boot({jewellery=false, settings={}, nodes=[]}) {
  const sidebar = sidebarFor(nodes);
  const document = {
    readyState:'complete',
    body:{classList:{contains:name => name === 'jewel-suite-mode' ? jewellery : false}},
    documentElement:{},
    getElementById:id => id === 'sidebar' ? sidebar : null,
    querySelectorAll:selector => selector === '#sidebar button,#sidebar .nav,#sidebar .plain' ? nodes : []
  };
  let onLoad = () => {}, pulse = () => {};
  const calls = [], saved = [];
  const context = {
    document,
    currentUser:{Role:'Admin'},
    MutationObserver:class { observe(){} },
    setTimeout:fn => fn(),
    setInterval:fn => { pulse = fn; },
    addEventListener:(name,fn) => { if(name === 'load') onLoad = fn; },
    api:async (url, options) => {
      if(options){
        saved.push([url, JSON.parse(options.body)]);
        return {};
      }
      return Object.entries(settings).map(([key,value]) => ({
        Key:'Sidebar.Feature.'+key,
        Value:String(value)
      }));
    },
    toast(){},
    alert(message){ throw Error(message); },
    loadSettings:() => calls.push('settings'),
    loadDayClosing:() => calls.push('day'),
    loadUsers:() => calls.push('users'),
    loadProducts:() => calls.push('products'),
    loadReports:() => calls.push('reports')
  };
  context.window = context;
  vm.runInNewContext(source, context);
  onLoad();
  await new Promise(resolve => setImmediate(resolve));
  pulse();
  return {context,calls,saved,nodes};
}
function hidden(nodes,id){ return nodes.find(n => n.id === id).style.display === 'none'; }

(async () => {
  const nodes = [
    button('settings','⚙ Settings'),
    button('day','▣ Day Closing'),
    button('users','👤 Users'),
    button('products','▤Items & Inventory','Items & Inventory','products'),
    button('reports','▥Reports','Reports','reports'),
    button('stockReport','◇Stock Report','Stock Report','stockReport')
  ];
  const normal = await boot({
    nodes,
    settings:{SETTINGS:false,DAY_CLOSE:false,USERS:false,ITEM_MASTER:false,STOCK:false,REPORTS:true}
  });

  assert.equal(hidden(nodes,'settings'), true, 'icon-prefixed Settings must hide');
  assert.equal(hidden(nodes,'day'), true, 'icon-prefixed Day Closing must hide');
  assert.equal(hidden(nodes,'users'), true, 'icon-prefixed Users must hide');
  assert.equal(hidden(nodes,'products'), true, 'Item Master selector must hide its retail navigation');
  assert.equal(hidden(nodes,'reports'), false, 'enabled Reports must remain visible');
  assert.equal(hidden(nodes,'stockReport'), false, 'Stock must not accidentally match Stock Report');

  normal.context.loadSettings();
  normal.context.loadDayClosing();
  normal.context.loadUsers();
  normal.context.loadProducts();
  normal.context.loadReports();
  assert.deepEqual(normal.calls, ['reports'], 'disabled retail routes must be blocked while enabled routes work');

  await normal.context.sidebarFeatureToggle('SETTINGS', true);
  assert.equal(hidden(nodes,'settings'), false, 're-enabling Settings restores its button');
  normal.context.loadSettings();
  assert.equal(normal.calls.at(-1), 'settings', 're-enabled route must work immediately');
  assert.equal(normal.saved[0][1].Value, 'true', 'Feature Control state must persist');

  const jewelNodes = [button('settings','⚙ Settings')];
  const jewellery = await boot({jewellery:true,nodes:jewelNodes,settings:{SETTINGS:false}});
  assert.equal(hidden(jewelNodes,'settings'), false, 'retail controller must not alter jewellery sidebar');
  jewellery.context.loadSettings();
  assert.deepEqual(jewellery.calls, ['settings'], 'retail route gates must stay inactive in jewellery mode');

  console.log('PASS: retail icon labels, exact matching, route gates, persistence and jewellery isolation');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
