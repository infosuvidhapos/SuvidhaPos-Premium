using System.Data;
using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;
using static SuvidhaPOS.Premium.PurchasePostingService;

namespace SuvidhaPOS.Premium;

internal static class ManualPurchaseService
{
    internal static async Task<IResult> Commit(Db db,global::PurchaseRequest x,string user)
    {
        if(x.Lines is null||x.Lines.Count==0)return Results.BadRequest(new{message="Add purchase items"});
        if(string.IsNullOrWhiteSpace(x.InvoiceNo))return Results.BadRequest(new{message="Bill No is required"});
        if(x.Discount<0||x.PaidAmount<0||(x.RequestId?.Length??0)>100)return Results.BadRequest(new{message="Invalid bill discount, paid amount or request ID"});
        var requestId=string.IsNullOrWhiteSpace(x.RequestId)?Guid.NewGuid().ToString("N"):x.RequestId.Trim();var digest=PurchaseImportRules.Hash(x);
        using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction(IsolationLevel.Serializable);
        try{
            await Lock(c,tx);var replay=await Replay(c,tx,requestId,digest);if(replay!=null){await tx.CommitAsync();return replay;}
            var data=await PurchaseImportRules.Load(c,tx,true);var prepared=new List<(global::PurchaseLine Line,string Unit,string Mode,decimal PurchasedQty,decimal PurchasedRate,decimal Sale,decimal Tax)>();decimal sub=0,tax=0;
            foreach(var l in x.Lines){
                var master=data.Masters.SingleOrDefault(m=>m.Id==l.ProductId&&m.Active)??throw new InvalidOperationException("Purchase item is inactive or missing");
                if(l.Qty<=0||l.FreeQuantity<0||l.Cost<0||l.Mrp<0||l.SalePrice<0||l.TaxRate<0||l.TaxRate>100||l.DiscountPer is <0 or >100||l.PurchasedQty<0||l.RatePerPurchasedUnit<0||l.TotalBaseQty<0)throw new InvalidOperationException("Invalid quantity, cost, MRP, GST or discount");
                if(data.Batch&&string.IsNullOrWhiteSpace(l.BatchNo))throw new InvalidOperationException("Batch No is mandatory for this outlet");
                if(data.Expiry&&!l.ExpiryDate.HasValue)throw new InvalidOperationException("Expiry Date is mandatory for this outlet");
                if(l.ExpiryDate.HasValue&&l.ExpiryDate.Value.Year<1900||l.ManufactureDate.HasValue&&l.ManufactureDate.Value.Year<1900)throw new InvalidOperationException("Invalid manufacture or expiry date");
                if(l.ExpiryDate.HasValue&&l.ManufactureDate.HasValue&&l.ExpiryDate<l.ManufactureDate)throw new InvalidOperationException("Expiry Date precedes manufacture date");
                var mode=string.IsNullOrWhiteSpace(l.TaxMode)?"INCLUSIVE":PurchaseImportRules.Key(l.TaxMode);if(mode is not ("INCLUSIVE" or "EXCLUSIVE"))throw new InvalidOperationException("Invalid tax mode");
                if(l.Qty!=Math.Round(l.Qty,3)||l.FreeQuantity!=Math.Round(l.FreeQuantity,3))throw new InvalidOperationException("Stock quantity supports up to 3 decimal places");
                var unit=PurchaseImportRules.ResolveUnit(l.UnitPurchased??master.BaseUnit,data.Units)??throw new InvalidOperationException("Unit is not in active Unit Master");
                var key=PurchaseImportRules.UnitKey(unit);var factor=key==PurchaseImportRules.UnitKey(master.BaseUnit)?1:key==PurchaseImportRules.UnitKey(master.PackUnit)?master.PackFactor:key==PurchaseImportRules.UnitKey(master.InnerUnit)?master.InnerFactor:0;
                if(factor<=0)throw new InvalidOperationException("Purchased unit is incompatible with item conversion");
                var pq=l.PurchasedQty>0?l.PurchasedQty:l.Qty/factor;var pr=l.RatePerPurchasedUnit>0?l.RatePerPurchasedUnit:l.Cost*factor;
                if(Math.Abs(pq*factor-l.Qty)>0.0000005m||(l.TotalBaseQty>0&&Math.Abs(l.TotalBaseQty-l.Qty)>0.0000005m)||Math.Abs(pr/factor-l.Cost)>0.0000005m)throw new InvalidOperationException("Purchased quantity/rate does not match the existing unit conversion");
                if(pq!=Math.Round(pq,3))throw new InvalidOperationException("Purchased quantity supports up to 3 decimal places");
                var purchasedMrp=l.MrpPerPurchasedUnit??l.Mrp*factor;if(purchasedMrp<0||Math.Abs(purchasedMrp/factor-l.Mrp)>0.0000005m)throw new InvalidOperationException("Purchased MRP does not match unit conversion");
                var amount=Math.Round(pq*pr,2,MidpointRounding.AwayFromZero);var lineTax=PurchaseImportRules.Tax(amount,l.TaxRate,mode);tax+=lineTax;sub+=mode=="INCLUSIVE"?amount-lineTax:amount;
                prepared.Add((l,unit,mode,pq,pr,l.DiscountPer.HasValue?PurchaseImportRules.Sale(purchasedMrp,l.DiscountPer.Value)/factor:l.SalePrice,lineTax));
            }
            var total=sub+tax-x.Discount;if(total<0||x.PaidAmount>total)throw new InvalidOperationException("Discount or paid amount exceeds bill total");
            var invoice=PurchaseImportRules.Name(x.InvoiceNo);var date=(x.PurchaseDate??DateTime.Today).Date;var supplier=PurchaseImportRules.Name(x.SupplierName??"Walk-in Supplier");
            if(date.Year<1900)throw new InvalidOperationException("Invalid purchase date");
            if(x.SupplierId.HasValue){using var supplierCmd=Command(c,tx,"SELECT Name FROM Suppliers WHERE Id=@id AND IsActive=1",PurchasePostingService.P("@id",x.SupplierId));var found=(await supplierCmd.ExecuteScalarAsync())?.ToString()??throw new InvalidOperationException("Supplier is inactive or missing");if(!string.IsNullOrWhiteSpace(x.SupplierName)&&PurchaseImportRules.Key(x.SupplierName)!=PurchaseImportRules.Key(found))throw new InvalidOperationException("Selected supplier does not match supplier name");supplier=found;}
            var invoiceKey=PurchaseImportRules.Hash(new{Supplier=PurchaseImportRules.Key(supplier),Invoice=PurchaseImportRules.Key(invoice),Date=date});await CheckInvoice(c,tx,invoiceKey,supplier,invoice,date);await SaveRequest(c,tx,requestId,digest,"{}");
            var id=await Head(c,tx,invoice,x.SupplierId,supplier,date,sub,x.Discount,tax,total,x.PaymentMode,x.PaidAmount,x.Notes);
            foreach(var p in prepared)
            {
                var l=p.Line;
                if(l.DiscountPer.HasValue)
                {
                    using var rates=Command(c,tx,@"UPDATE Products SET Mrp=@mrp,SalePrice=@sale,Dis_Rate=@disc WHERE Id=@id AND IsActive=1",
                        PurchasePostingService.P("@mrp",l.Mrp),PurchasePostingService.P("@sale",p.Sale),PurchasePostingService.P("@disc",l.DiscountPer.Value),PurchasePostingService.P("@id",l.ProductId));
                    if(await rates.ExecuteNonQueryAsync()!=1)throw new InvalidOperationException("Item became inactive while updating purchase discount");
                    await RetailItemRules.SyncRates(c,tx,l.ProductId,mrp:true,discount:true);
                }
                await Line(c,tx,id,l.ProductId,l.BatchNo,l.Qty+l.FreeQuantity,l.Qty,l.FreeQuantity,l.Cost,l.Mrp,p.Sale,l.TaxRate,p.Tax,l.DiscountPer,p.Mode,l.ManufactureDate,l.ExpiryDate,p.Unit,p.PurchasedQty,p.PurchasedRate);
            }
            await Invoice(c,tx,invoiceKey,digest,id,requestId);var result=new{id,invoiceNo=invoice,total,alreadyImported=false,requestId};await Finish(c,tx,requestId,result,user,"PURCHASE",id);await tx.CommitAsync();return Results.Ok(result);
        }catch(Exception ex)when(ex is InvalidOperationException or SqlException or OverflowException){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
    }
}
