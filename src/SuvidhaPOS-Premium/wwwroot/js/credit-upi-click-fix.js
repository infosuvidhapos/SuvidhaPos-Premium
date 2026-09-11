(function(w,d){
'use strict';
d.addEventListener('click',function(e){
 const b=e.target.closest&&e.target.closest('.counter-billing .cb-pay button[data-mode="Credit/UPI"]');
 if(!b)return;
 e.preventDefault();
 e.stopImmediatePropagation();
 if(typeof w.cbOpenCreditUpi==='function')w.cbOpenCreditUpi();
},true);
})(window,document);