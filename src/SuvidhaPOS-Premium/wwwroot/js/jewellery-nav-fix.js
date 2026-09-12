(function(d){
'use strict';
if(typeof window.loadPremiumFeatureControl==='function'&&!window.loadPremiumFeatureControl.__suvidhaPageFix){
 const original=window.loadPremiumFeatureControl;
 const wrapped=async function(){if(d.body.classList.contains('jewel-suite-mode')&&window.loadJewelleryFeatureControl)return window.loadJewelleryFeatureControl();const r=await original.apply(this,arguments);if(typeof setPage==='function')setPage('featurecontrol');if(typeof title!=='undefined')title.textContent='Feature Control';const p=document.querySelector('header p');if(p)p.textContent='Application module switches';const names={'P-01':'Jewellery Item Master','P-02':'Jewellery Billing','P-03':'Barcode Print Master','P-04':'Outlet Website Sync','P-05':'Item Import Master','P-06':'AI Import','P-08':'HUID / Hallmark','P-11':'Jewellery Menus','P-12':'Metal Rates','P-13':'Multi Payment','P-14':'Old Metal Register','P-15':'Reports','P-16':'Bill Management / Audit','P-17':'Print Master','P-20':'Feature Control'};document.querySelectorAll('.feature-flag').forEach(x=>{const code=x.querySelector('b')?.textContent?.trim(),s=x.querySelector('strong');if(s&&names[code])s.textContent=names[code]});return r};
 wrapped.__suvidhaPageFix=true;window.loadPremiumFeatureControl=wrapped;
}
})(document);
