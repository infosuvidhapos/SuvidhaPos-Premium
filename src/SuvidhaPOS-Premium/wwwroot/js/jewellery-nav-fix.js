(function(d){
'use strict';
function fix(){
 if(!d.body.classList.contains('jewel-suite-mode'))return;
 const side=d.getElementById('sidebar');if(!side)return;
 const nav=[...side.querySelectorAll('.js-nav')];
 const stock=nav.find(x=>x.textContent.trim()==='Stock');
 const purchase=nav.find(x=>x.textContent.includes('Purchase Bill'));
 if(stock&&purchase&&purchase.previousElementSibling!==stock)stock.insertAdjacentElement('afterend',purchase);
}
new MutationObserver(fix).observe(d.getElementById('sidebar')||d.documentElement,{childList:true,subtree:true});
fix();
if(typeof window.loadPremiumFeatureControl==='function'&&!window.loadPremiumFeatureControl.__suvidhaPageFix){
 const original=window.loadPremiumFeatureControl;
 const wrapped=async function(){const r=await original.apply(this,arguments);if(typeof setPage==='function')setPage('featurecontrol');if(typeof title!=='undefined')title.textContent='Feature Control';const p=document.querySelector('header p');if(p)p.textContent='Application module switches';return r};
 wrapped.__suvidhaPageFix=true;window.loadPremiumFeatureControl=wrapped;
}
})(document);