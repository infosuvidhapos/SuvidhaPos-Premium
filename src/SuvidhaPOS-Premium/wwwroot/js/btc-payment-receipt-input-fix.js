(function(w,d){
'use strict';
// Keep settlement typing stable. The screenshot-style flow originally rebuilt the
// complete right panel on every keypress; this patch updates only Balance Payment.
function num(v){return Math.max(0,Number(String(v??'').replace(/[^0-9.-]/g,''))||0)}
function money(v){return Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
var original=w.btcPrRecalc;
function metric(label){return Array.from(d.querySelectorAll('#btcPrPaymentDetail .btcpr-detail-row')).find(function(r){return String(r.querySelector('span')?.textContent||'').trim()===label})}
w.btcPrUpdateBalance=function(){
 var pendingRow=metric('Selected Pending'),balanceRow=metric('Balance Payment'),input=d.querySelector('#btcPrSettlement');
 if(!balanceRow||!input)return;
 var pending=num(pendingRow?.querySelector('b')?.textContent),settle=num(input.value);
 var b=balanceRow.querySelector('b');if(b)b.textContent='₹'+money(Math.max(0,pending-settle));
};
if(typeof original==='function'){
 w.btcPrRecalc=function(resetAmount){
  if(resetAmount===false){w.btcPrUpdateBalance();return}
  var r=original(true);setTimeout(w.btcPrUpdateBalance,0);return r;
 };
}
d.addEventListener('input',function(e){if(e.target&&e.target.id==='btcPrSettlement'){w.btcPrUpdateBalance()}},true);
})(window,document);
