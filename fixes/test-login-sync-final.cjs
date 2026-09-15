const fs=require('fs');
const assert=require('assert');
const read=p=>fs.readFileSync(p,'utf8');

const html=read('src/SuvidhaPOS-Premium/wwwroot/index.html');
const css=read('src/SuvidhaPOS-Premium/wwwroot/css/login-premium.css');
const auth=read('src/SuvidhaPOS-Premium/wwwroot/js/login-authfix7.js');
const sync=read('src/SuvidhaPOS-Premium/wwwroot/js/outlet-login-sync.js');
const completion=read('src/SuvidhaPOS-Premium/wwwroot/js/premium-completion.js');
const jewel=read('src/SuvidhaPOS-Premium/wwwroot/js/jewellery-suite.js');
const program=read('src/SuvidhaPOS-Premium/Program.cs');
const webproj=read('src/SuvidhaPOS-Premium/SuvidhaPOS.Premium.csproj');
const desktop=read('src/SuvidhaPOS.Desktop/MainForm.cs');

assert.strictEqual((html.match(/class="login-feature"/g)||[]).length,6,'login must show exactly six feature cards');
for(const t of [
  'POS Billing','Fast &amp; Easy','Inventory','Complete Control','Purchase','Smart Procurement',
  'Reports','Insightful Reports','Multi Store','Manage All Outlets','Secure &amp; Fast','Your Data is Safe'
]) assert.ok(html.includes(t),'missing login feature text: '+t);

assert.ok(!html.includes('Change Database'),'Change Database must not be visible on login');
assert.ok(!html.includes('Login with Biometrics (Optional)'),'old biometric wording must be removed');
assert.ok(html.includes('Login with Windows Hello'),'Windows Hello wording missing');
for(const t of ['id="aboutBtn"','id="loginOutletRefresh"','id="loginStoreBadge"','id="aboutModal"','id="aboutVersion"','id="aboutEdition"','id="aboutStoreType"'])
  assert.ok(html.includes(t),'missing login/about element: '+t);
assert.ok(html.includes('www.suvidhapos.com'),'About website must be www.suvidhapos.com');
assert.ok(html.includes('support@suvidhapos.in'),'About support email missing');
assert.ok(!html.includes('Version 6.12.0-complete'),'internal version label must not be shown');
assert.ok(!/id="aboutVersion"[^>]*>\s*6\.12\.0/i.test(html),'About version must not be hardcoded');

assert.ok(css.includes('.login-screen{')&&css.includes('overflow:hidden'),'login viewport must be scrollbar-free');
assert.ok(!/\.login-card\{[^}]*overflow:auto/s.test(css),'login card must not scroll');
assert.ok(css.includes('@media(max-width:1366px)')||css.includes('@media (max-width:1366px)'),'1366 responsive breakpoint missing');
assert.ok(css.includes('125%')||css.includes('max-height:720px')||css.includes('max-height:768px'),'compact scaling/height guard missing');

for(const t of ['Caps Lock is ON','Signing in...','login-spinner','User ID not found.','Incorrect password.','No internet connection. Local login is available.','Unable to connect to server. Please try again.','/public/app-info','showAboutModal','Exit SuvidhaPOS?'])
  assert.ok(auth.includes(t),'login UX behavior missing: '+t);
for(const forbidden of ['LOGIN-1:','LOGIN-2:','LOGIN-1 failed: HTTP','verification failed: HTTP'])
  assert.ok(!auth.includes(forbidden),'technical login error leaked: '+forbidden);

for(const t of ['loginStoreBadge','aboutStoreType','loginOutletRefresh','suvidha:outlet-synced'])
  assert.ok(sync.includes(t),'live outlet UI sync missing: '+t);
assert.ok(completion.includes('/public/outlet/profile-sync'),'pre-login pull must use public profile-sync');
assert.ok(completion.includes('data-authenticated'),'sync path must distinguish pre/post login authentication');
assert.ok(!jewel.includes('setTimeout(()=>location.reload(),80)'),'StoreType change must not require app reload');

assert.ok(program.includes('app.MapGet("/public/app-info"'),'dynamic public app-info endpoint missing');
assert.ok(program.includes('USER_NOT_FOUND'),'login API must distinguish unknown User ID');
assert.ok(program.includes('WRONG_PASSWORD'),'login API must distinguish wrong password');
assert.ok(webproj.includes('<Version>6.12.0</Version>'),'current build version metadata missing');
assert.ok(desktop.includes('DataProtectionScope.CurrentUser'),'Remember Me must remain Windows user encrypted');

console.log('PASS: final login design, dynamic About, live StoreType/Validity sync and friendly auth contract');
