(function(d){
'use strict';
function fix(){
 if(!d.body.classList.contains('jewel-suite-mode'))return;
 const side=d.getElementById('sidebar');if(!side)return;
 const nav=[...side.querySelectorAll('.js-nav')];
 const stock=nav.find(x=>x.textContent.trim()==='Stock');
 const purchase=nav.find(x=>x.textContent.includes('Purchase Bill'));
 if(stock&&purchase&&purchase.previousElementSibling!==stock)stock.insertAdjacentElement('afterend',purchase);
 const flags=(window.__premiumCompletion&&window.__premiumCompletion.flags)||{};const on=k=>flags[k]===undefined?true:!!flags[k];
 nav.forEach(b=>{const t=b.textContent.trim();if((t.includes('Item Master')||t.includes('Item Entry'))&&!on('P-01'))b.style.display='none';if(t.includes('Item Import Master')&&!on('P-05'))b.style.display='none';if(t.includes('Barcode Print Master')&&!on('P-03'))b.style.display='none';if(t.includes('Jewellery Billing')&&!on('P-02'))b.style.display='none'});
 const system=[...side.querySelectorAll('.js-section')].find(x=>x.textContent.trim()==='SYSTEM');
 if(system&&!d.getElementById('jFeatureControlNav')){const b=d.createElement('button');b.id='jFeatureControlNav';b.className='nav js-nav';b.innerHTML='⚑<span>Feature Control</span>';b.onclick=()=>window.loadPremiumFeatureControl&&window.loadPremiumFeatureControl();system.insertAdjacentElement('afterend',b)}
}
new MutationObserver(fix).observe(d.getElementById('sidebar')||d.documentElement,{childList:true,subtree:true});
fix();
if(typeof window.loadPremiumFeatureControl==='function'&&!window.loadPremiumFeatureControl.__suvidhaPageFix){
 const original=window.loadPremiumFeatureControl;
 const wrapped=async function(){const r=await original.apply(this,arguments);if(typeof setPage==='function')setPage('featurecontrol');if(typeof title!=='undefined')title.textContent='Feature Control';const p=document.querySelector('header p');if(p)p.textContent='Application module switches';const names={'P-01':'Jewellery Item Master','P-02':'Jewellery Billing','P-03':'Barcode Print Master','P-04':'Outlet Website Sync','P-05':'Item Import Master','P-06':'AI Import','P-08':'HUID / Hallmark','P-11':'Jewellery Menus','P-12':'Metal Rates','P-13':'Multi Payment','P-14':'Old Metal Register','P-15':'Reports','P-16':'Bill Management / Audit','P-17':'Print Master','P-20':'Feature Control'};document.querySelectorAll('.feature-flag').forEach(x=>{const code=x.querySelector('b')?.textContent?.trim(),s=x.querySelector('strong');if(s&&names[code])s.textContent=names[code]});return r};
 wrapped.__suvidhaPageFix=true;window.loadPremiumFeatureControl=wrapped;
}
})(document);