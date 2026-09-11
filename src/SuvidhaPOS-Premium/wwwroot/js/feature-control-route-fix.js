(function(w,d){
'use strict';
const old=w.loadPremiumFeatureControl;
if(typeof old!=='function')return;
w.loadPremiumFeatureControl=async function(){
 const r=await old.apply(this,arguments);
 if(typeof setPage==='function')setPage('featurecontrol');
 if(typeof title!=='undefined')title.textContent='Feature Control';
 const p=d.querySelector('header p');if(p)p.textContent='Application module switches';
 return r;
};
})(window,document);