/* SuvidhaPOS Premium POS hardening layer. Loaded after app.js so the core UI remains backward compatible. */
(function(){
  const originalLoad=window.load;
  const money=v=>'₹'+Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const esc=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const $=s=>document.querySelector(s);

  window.addCart=async function(id){
    try{
      const products=await fetch('/api/products?q=').then(r=>r.json());
      const p=products.find(a=>a.Id===id);
      if(!p)return;
      const existing=cart.find(a=>a.ProductId===id);
      if(existing){ existing.Quantity=Number(existing.Quantity)+1; }
      else{
        let batchId=null;
        try{
          const rows=await fetch('/api/products/'+id+'/stock').then(r=>r.json());
          const valid=rows.filter(x=>x.BatchId && Number(x.Quantity||0)>0 && (!x.ExpiryDate || new Date(x.ExpiryDate)>=new Date()));
          if(valid.length)batchId=valid[0].BatchId;
        }catch(_){/* non-batch items continue normally */}
        cart.push({ProductId:id,Name:p.Name,Quantity:1,Rate:Number(p.SalePrice||0),GstRate:Number(p.GstRate||0),Discount:0,BatchId:batchId});
      }
      window.renderCart();
    }catch(e){alert(e.message||'Unable to add item.');}
  };

  window.renderCart=function(){
    if(!$('#cart'))return;
    $('#cart').innerHTML=cart.length?cart.map((c,i)=>`<div class="cart-item"><div><b>${esc(c.Name)}</b><small>GST ${Number(c.GstRate||0)}%${c.BatchId?' • Batch selected FEFO':''}</small></div><input aria-label="Quantity" type="number" min="0.001" step="0.001" value="${Number(c.Quantity||0)}" onchange="cart[${i}].Quantity=Math.max(0.001,+this.value||0.001);renderCart()"><input aria-label="Rate" type="number" min="0" step="0.01" value="${Number(c.Rate||0)}" onchange="cart[${i}].Rate=Math.max(0,+this.value||0);renderCart()"><input aria-label="Discount" type="number" min="0" step="0.01" value="${Number(c.Discount||0)}" onchange="cart[${i}].Discount=Math.max(0,+this.value||0);renderCart()"></div>`).join(''):'<div class="empty">Add items to start billing.</div>';
    const sub=cart.reduce((s,c)=>s+Math.max(0,Number(c.Quantity||0)*Number(c.Rate||0)-Number(c.Discount||0)),0);
    const gst=cart.reduce((s,c)=>{const taxable=Math.max(0,Number(c.Quantity||0)*Number(c.Rate||0)-Number(c.Discount||0));return s+Math.round(taxable*Number(c.GstRate||0))/100;},0);
    const grand=Math.round((sub+gst)*100)/100;
    if($('#sub'))$('#sub').textContent=money(sub);
    if($('#gst'))$('#gst').textContent=money(gst);
    if($('#grand'))$('#grand').textContent=money(grand);
  };

  window.saveSale=async function(){
    if(!cart.length){if($('#billMsg'))$('#billMsg').textContent='Add at least one item.';return;}
    try{
      const payload={Items:cart.map(c=>({ProductId:c.ProductId,Quantity:Number(c.Quantity),Rate:Number(c.Rate),GstRate:Number(c.GstRate),Discount:Number(c.Discount||0),BatchId:c.BatchId||null})),CustomerName:$('#cust')?.value||'',PaymentMode:$('#pay')?.value||'CASH',PaymentAmount:0,UserId:window.user?.Id||null};
      const x=await fetch('/api/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Billing failed');return j;});
      if($('#billMsg')){ $('#billMsg').style.color='var(--good)'; $('#billMsg').textContent=`${x.invoiceNo} saved • ${money(x.grandTotal)}`; }
      cart=[];window.renderCart();
      setTimeout(()=>window.print(),150);
    }catch(e){if($('#billMsg'))$('#billMsg').textContent=e.message||'Unable to save bill.';}
  };

  window.posEnhancementsLoaded=true;
})();