(function(){
  let open=false;
  const money=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const total=()=>Math.max(0,(state.cart||[]).reduce((s,x)=>s+Number(x.Qty||0)*Number(x.Rate||0),0)-Number(document.querySelector('#cbDiscountValue')?.value||0)+(state.cart||[]).reduce((s,x)=>s+Number(x.Qty||0)*Number(x.Rate||0)*Number(x.Gst||0)/100,0));
  function ensure(){
    if(document.querySelector('#multiPayDialog'))return;
    const d=document.createElement('div');d.id='multiPayDialog';d.className='multi-pay-backdrop';
    d.innerHTML=`<div class="multi-pay-dialog" role="dialog" aria-modal="true">
      <div class="multi-pay-title">▦ <b>Multi Mode Payment</b></div>
      <div class="multi-pay-amount">Payable Amount : <strong id="mpDue">₹ 0.00</strong></div>
      <div class="multi-pay-type"><b>Card Type :</b><select id="mpType"><option>Card</option><option>UPI</option><option>PhonePe</option><option>Paytm</option></select></div>
      <div class="multi-pay-fields"><label>Invoice No. :<input id="mpInvoice"></label><label>Card Amount :<input id="mpCard" type="number" min="0" step="0.01"></label><label>Cash Amount :<input id="mpCash" type="number" min="0" step="0.01" value="0"></label></div>
      <div class="multi-pay-qr"><button id="mpQr">QR</button></div>
      <div class="multi-pay-actions"><button id="mpSubmit">✓ <b>Submit</b></button><button id="mpKeypad">▣ <b>Keypad</b></button><button id="mpCancel">✕ <b>Cancel</b></button></div>
    </div>`;
    document.body.appendChild(d);
    d.querySelector('#mpCancel').onclick=close;
    d.querySelector('#mpKeypad').onclick=()=>{d.querySelector('#mpCard').focus();d.querySelector('#mpCard').select()};
    d.querySelector('#mpQr').onclick=()=>{d.querySelector('#mpType').value='UPI';d.querySelector('#mpCard').focus()};
    d.querySelector('#mpSubmit').onclick=submit;
  }
  function show(){ensure();open=true;const d=document.querySelector('#multiPayDialog'),t=total();d.classList.add('open');d.querySelector('#mpDue').textContent='₹ '+money(t);d.querySelector('#mpInvoice').value=document.querySelector('#cbBillNo')?.textContent||'';d.querySelector('#mpCard').value=t.toFixed(2);d.querySelector('#mpCash').value='0';d.querySelector('#mpType').value='Card';d.querySelector('#mpCard').focus();d.querySelector('#mpCard').select()}
  function close(){document.querySelector('#multiPayDialog')?.classList.remove('open');open=false;document.querySelector('#cbSearch')?.focus()}
  async function submit(){const d=document.querySelector('#multiPayDialog'),due=total(),card=Math.max(0,Number(d.querySelector('#mpCard').value)||0),cash=Math.max(0,Number(d.querySelector('#mpCash').value)||0);if(Math.abs(card+cash-due)>0.01)return alert('Card Amount + Cash Amount must equal ₹'+money(due));window.__selectedPayment='Mixed';window.__multiPayment={type:d.querySelector('#mpType').value,invoice:d.querySelector('#mpInvoice').value,cardAmount:card,cashAmount:cash};close();await cbComplete()}
  window.openMultiPayment=show;
  document.addEventListener('click',e=>{const b=e.target.closest('.cb-pay button');if(b&&b.textContent.replace(/\s+/g,' ').trim().toLowerCase()==='multi mode'){e.preventDefault();show()}});
  document.addEventListener('keydown',e=>{if(!document.querySelector('.counter-billing'))return;if(open){if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Enter'){e.preventDefault();submit()}return}if(!e.ctrlKey&&!e.altKey&&!document.activeElement.matches('input,textarea,select')&&e.key.toLowerCase()==='m'){e.preventDefault();show()}});
})();