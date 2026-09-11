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
})(document);