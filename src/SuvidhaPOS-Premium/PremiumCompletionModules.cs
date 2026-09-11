using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;
using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;

namespace SuvidhaPOS.Premium;

public static class PremiumCompletionModules
{
    static SqlParameter P(string n, object? v) => new(n, v ?? DBNull.Value);

    public static void Map(WebApplication app)
    {
        // P-20: reversible feature flags.
        app.MapGet("/api/premium/features", async (Db db) =>
            Results.Ok(await db.QueryAsync("SELECT PointerCode,FeatureName,IsEnabled,UpdatedAt FROM PremiumFeatureFlags ORDER BY PointerCode")));

        app.MapPut("/api/premium/features/{code}", async (Db db, HttpContext ctx, string code, FeatureFlagRequest x) =>
        {
            if (!IsAdmin(ctx)) return Results.Json(new { message = "Admin permission required" }, statusCode: 403);
            code=(code??"").Trim().ToUpperInvariant();
            if(!System.Text.RegularExpressions.Regex.IsMatch(code,@"^P-(0[1-9]|1[0-9]|20)$"))
                return Results.BadRequest(new{message="Invalid pointer code"});
            var n=await db.ScalarAsync("UPDATE PremiumFeatureFlags SET IsEnabled=@e,UpdatedAt=SYSDATETIME() WHERE PointerCode=@c;SELECT @@ROWCOUNT",P("@e",x.IsEnabled),P("@c",code));
            return Convert.ToInt32(n)==0?Results.NotFound(new{message="Feature flag not found"}):Results.Ok(new{code,isEnabled=x.IsEnabled});
        });

        // Real application Feature Control: actual masters/modules, not developer pointer labels.
        app.MapGet("/api/feature-access", async (Db db) =>
        {
            await EnsureFeatureAccess(db);
            return Results.Ok(await db.QueryAsync("SELECT FeatureKey,DisplayName,Scope,IsEnabled,SortOrder,UpdatedAt FROM AppFeatureAccess ORDER BY Scope,SortOrder,DisplayName"));
        });

        app.MapPut("/api/feature-access/{key}", async (Db db,HttpContext ctx,string key,FeatureFlagRequest x) =>
        {
            if(!IsAdmin(ctx)) return Results.Json(new{message="Admin permission required"},statusCode:403);
            await EnsureFeatureAccess(db); key=(key??"").Trim().ToUpperInvariant();
            var n=await db.ScalarAsync("UPDATE AppFeatureAccess SET IsEnabled=@e,UpdatedAt=SYSDATETIME() WHERE FeatureKey=@k;SELECT @@ROWCOUNT",P("@e",x.IsEnabled),P("@k",key));
            return Convert.ToInt32(n)==0?Results.NotFound(new{message="Feature not found"}):Results.Ok(new{featureKey=key,isEnabled=x.IsEnabled});
        });

        // P-01/P-08: full Jewellery Item Master.
        app.MapGet("/api/jewellery/item-master", async (Db db, string? q) =>
        {
            if(!await Enabled(db,"P-01")) return Results.Ok(Array.Empty<object>());
            q=(q??"").Trim();
            return Results.Ok(await db.QueryAsync(@"SELECT j.*,
 (SELECT COUNT(*) FROM JewelleryItemStones s WHERE s.JewelleryItemId=j.Id) StoneRows
 FROM JewelleryItems j
 WHERE @q='' OR j.TagNo LIKE @l OR ISNULL(j.Barcode,'') LIKE @l OR j.ItemName LIKE @l
 OR ISNULL(j.Huid,'') LIKE @l OR ISNULL(j.DesignCode,'') LIKE @l OR ISNULL(j.CertificateNo,'') LIKE @l
 ORDER BY CASE WHEN j.Status='IN_STOCK' THEN 0 ELSE 1 END,j.ItemName,j.TagNo",P("@q",q),P("@l","%"+q+"%")));
        });

        app.MapGet("/api/jewellery/item-master/{id:int}", async (Db db, int id) =>
        {
            var item=await db.QuerySingleAsync("SELECT * FROM JewelleryItems WHERE Id=@id",P("@id",id));
            if(item.Count==0)return Results.NotFound(new{message="Jewellery item not found"});
            var stones=await db.QueryAsync("SELECT Id,StoneType,Pieces,Weight,Carat,Rate,Amount,CertificateNo,Lab FROM JewelleryItemStones WHERE JewelleryItemId=@id ORDER BY Id",P("@id",id));
            return Results.Ok(new{item,stones});
        });

        app.MapGet("/api/jewellery/item-master/identity-check", async (Db db,string? tagNo,string? barcode,string? huid,int excludeId=0) =>
        {
            var row=await FindJewelleryConflict(db,tagNo,barcode,huid,excludeId);
            return Results.Ok(new{duplicate=row.Count>0,conflict=row.Count>0?row:null});
        });

        app.MapPost("/api/jewellery/item-master", async (Db db, HttpContext ctx, PremiumJewelleryItemRequest x) =>
            await SaveJewelleryItem(db,ctx,0,x));

        app.MapPut("/api/jewellery/item-master/{id:int}", async (Db db, HttpContext ctx, int id, PremiumJewelleryItemRequest x) =>
            await SaveJewelleryItem(db,ctx,id,x));

        // P-02/P-12/P-13/P-14/P-16: complete retail/wholesale jewellery sale with rate snapshot,
        // discount permission, multi-payment and old-metal rows in one transaction.
        app.MapPost("/api/jewellery/sales/complete", async (Db db,HttpContext ctx,CompleteJewellerySaleRequest x) =>
        {
            if(!await Enabled(db,"P-02"))return Results.BadRequest(new{message="P-02 Jewellery Billing is disabled"});
            if(x.Lines is null||x.Lines.Count==0)return Results.BadRequest(new{message="Add jewellery item first"});
            var role=UserRole(ctx);var user=UserName(ctx);
            var overrideNeeded=x.Discount>0;
            using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
            try
            {
                decimal metal=0,stone=0,making=0,extras=0;
                var prepared=new List<SalePrepared>();
                foreach(var r in x.Lines)
                {
                    var cmd=new SqlCommand(@"SELECT TOP 1 TagNo,ItemName,MetalType,Purity,PurityPercent,NetWeight,FineWeight,WastagePercent,
 MakingChargeType,MakingValue,StoneValue,LabourCharge,HallmarkCharge,OtherCharge,GstMode,GstRate,Status
 FROM JewelleryItems WITH(UPDLOCK,ROWLOCK) WHERE Id=@id",c,tx);
                    cmd.Parameters.Add(P("@id",r.JewelleryItemId));
                    await using var rd=await cmd.ExecuteReaderAsync();
                    if(!await rd.ReadAsync())throw new Exception("Jewellery item not found");
                    var tag=rd.GetString(0);var name=rd.GetString(1);var mt=rd.GetString(2);var purity=rd.GetString(3);
                    var purityPct=rd.GetDecimal(4);var netWt=rd.GetDecimal(5);var savedFine=rd.GetDecimal(6);var waste=rd.GetDecimal(7);
                    var makingType=rd.GetString(8);var makingValue=rd.GetDecimal(9);var savedStone=rd.GetDecimal(10);
                    var labour=rd.GetDecimal(11);var hallmark=rd.GetDecimal(12);var other=rd.GetDecimal(13);
                    var gstMode=rd.GetString(14);var itemGst=rd.GetDecimal(15);var status=rd.GetString(16);
                    await rd.CloseAsync();
                    if(status!="IN_STOCK"&&status!="APPROVAL")throw new Exception($"Tag {tag} is not available");

                    var live=await LatestRateAsync(c,tx,mt,purity);
                    var useRate=r.MetalRatePerGram>0?r.MetalRatePerGram:live;
                    if(live>0&&Math.Abs(useRate-live)>0.01m)overrideNeeded=true;
                    var fine=savedFine>0?savedFine:netWt*purityPct/100m;
                    var metalValue=netWt*useRate;
                    var stoneValue=r.StoneValue>=0?r.StoneValue:savedStone;
                    var effectiveMakingType=string.IsNullOrWhiteSpace(r.MakingChargeType)?makingType:r.MakingChargeType!;
                    var effectiveMaking=r.MakingValue>=0?r.MakingValue:makingValue;
                    var makingAmount=effectiveMakingType.Equals("PER_GRAM",StringComparison.OrdinalIgnoreCase)?netWt*effectiveMaking:
                       effectiveMakingType.Equals("PERCENTAGE",StringComparison.OrdinalIgnoreCase)?metalValue*effectiveMaking/100m:effectiveMaking;
                    metal+=metalValue;stone+=stoneValue;making+=makingAmount;extras+=labour+hallmark+other;
                    prepared.Add(new(r,tag,name,mt,purity,netWt,fine,waste,useRate,metalValue,stoneValue,makingAmount,gstMode,itemGst,labour+hallmark+other));
                }

                if(overrideNeeded)
                {
                    if(!IsManager(ctx))return Results.Json(new{message="Admin/Manager permission required for discount or rate override"},statusCode:403);
                    if(string.IsNullOrWhiteSpace(x.OverrideReason))return Results.BadRequest(new{message="Override reason is required for discount/rate change"});
                }

                var subtotal=metal+stone+making+extras;
                var discount=Math.Min(Math.Max(0,x.Discount),subtotal);
                var taxable=Math.Max(0,subtotal-discount);
                var gstRate=Math.Max(0,x.GstRate);
                var inclusive=string.Equals(x.GstMode,"INCLUSIVE",StringComparison.OrdinalIgnoreCase);
                var gst=inclusive&&gstRate>0?taxable*gstRate/(100m+gstRate):taxable*gstRate/100m;
                var gross=inclusive?taxable:taxable+gst;
                var oldCredit=(x.OldMetal??new()).Sum(z=>Math.Max(0,z.Amount));
                var net=Math.Max(0,gross-oldCredit);
                var paid=(x.Payments??new()).Sum(z=>Math.Max(0,z.Amount));
                var inv=(string.Equals(x.SaleType,"WHOLESALE",StringComparison.OrdinalIgnoreCase)?"WS-":"JB-")+DateTime.Now.ToString("yyyyMMddHHmmssfff");

                var h=new SqlCommand(@"INSERT JewellerySales(InvoiceNo,CustomerId,CustomerName,CustomerPan,MetalAmount,StoneAmount,MakingAmount,GrossAmount,GstRate,Cgst,Sgst,OldMetalCredit,NetPayable,PaymentMode,PaidAmount,Notes,SaleType,Discount)
 OUTPUT INSERTED.Id VALUES(@inv,@cid,@cn,@pan,@metal,@stone,@making,@gross,@rate,@cg,@sg,@old,@net,@pm,@paid,@notes,@stype,@disc)",c,tx);
                h.Parameters.AddRange(new[]{P("@inv",inv),P("@cid",x.CustomerId),P("@cn",x.CustomerName??"Walk-in Customer"),P("@pan",x.CustomerPan),
                    P("@metal",metal),P("@stone",stone),P("@making",making+extras),P("@gross",subtotal),P("@rate",gstRate),P("@cg",gst/2),P("@sg",gst/2),
                    P("@old",oldCredit),P("@net",net),P("@pm",(x.Payments??new()).FirstOrDefault()?.Mode??"Cash"),P("@paid",paid),P("@notes",x.Notes),P("@stype",x.SaleType??"RETAIL"),P("@disc",discount)});
                var saleId=(int)(await h.ExecuteScalarAsync()??0);

                foreach(var z in prepared)
                {
                    var l=new SqlCommand(@"INSERT JewellerySaleLines(SaleId,JewelleryItemId,MetalRate,MetalAmount,StoneAmount,MakingAmount,TotalAmount,NetWeight,FineWeight,WastagePercent,GstMode,GstRate)
 VALUES(@s,@i,@r,@m,@st,@mk,@t,@nw,@fw,@wp,@gm,@gr);
 UPDATE JewelleryItems SET Status='SOLD',UpdatedAt=SYSDATETIME() WHERE Id=@i",c,tx);
                    l.Parameters.AddRange(new[]{P("@s",saleId),P("@i",z.Input.JewelleryItemId),P("@r",z.Rate),P("@m",z.MetalAmount),P("@st",z.StoneAmount),P("@mk",z.MakingAmount+z.Extras),
                        P("@t",z.MetalAmount+z.StoneAmount+z.MakingAmount+z.Extras),P("@nw",z.NetWeight),P("@fw",z.FineWeight),P("@wp",z.WastagePercent),P("@gm",x.GstMode??z.GstMode),P("@gr",gstRate>0?gstRate:z.ItemGstRate)});
                    await l.ExecuteNonQueryAsync();
                }

                foreach(var p in x.Payments??new())
                {
                    if(p.Amount<=0)continue;
                    var pc=new SqlCommand("INSERT JewellerySalePayments(SaleId,PaymentMode,Amount,ReferenceNo) VALUES(@s,@m,@a,@r)",c,tx);
                    pc.Parameters.AddRange(new[]{P("@s",saleId),P("@m",p.Mode??"Cash"),P("@a",p.Amount),P("@r",p.Reference)});await pc.ExecuteNonQueryAsync();
                }
                foreach(var o in x.OldMetal??new())
                {
                    if(o.Amount<=0)continue;
                    var oc=new SqlCommand(@"INSERT JewelleryOldMetalEntries(SaleId,MetalType,GrossWeight,LessWeight,NetWeight,PurityPercent,FineWeight,RatePerGram,Amount)
 VALUES(@s,@m,@g,@l,@n,@p,@f,@r,@a)",c,tx);
                    oc.Parameters.AddRange(new[]{P("@s",saleId),P("@m",o.Metal??"Gold"),P("@g",o.Gross),P("@l",o.Less),P("@n",o.Net),P("@p",o.Purity),P("@f",o.Fine),P("@r",o.Rate),P("@a",o.Amount)});await oc.ExecuteNonQueryAsync();
                }
                if(overrideNeeded)
                {
                    var ac=new SqlCommand("INSERT PremiumOverrideAudit(ActionName,Reason,UserName,RoleName,Details) VALUES('JEWELLERY_BILL_OVERRIDE',@r,@u,@role,@d)",c,tx);
                    ac.Parameters.AddRange(new[]{P("@r",x.OverrideReason),P("@u",user),P("@role",role),P("@d",$"Invoice={inv}; Discount={discount}; GST={gstRate}; SaleType={x.SaleType}")});await ac.ExecuteNonQueryAsync();
                }
                await tx.CommitAsync();
                return Results.Ok(new{id=saleId,invoiceNo=inv,subtotal,discount,gst,oldMetalCredit=oldCredit,netPayable=net,paid,balance=Math.Max(0,net-paid)});
            }
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });

        // Dedicated Purchase/Karigar/Exchange/Repair registers.
        app.MapPost("/api/jewellery/vouchers", async (Db db,HttpContext ctx,JewelleryVoucherRequest x) =>
        {
            var type=(x.VoucherType??"").Trim().ToUpperInvariant();
            if(type is not ("PURCHASE" or "KARIGAR" or "EXCHANGE" or "REPAIR"))return Results.BadRequest(new{message="Unsupported jewellery voucher type"});
            using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
            try
            {
                var lines=x.Lines??new();if(lines.Count==0&&type!="EXCHANGE")throw new Exception("Add at least one jewellery line");
                var gross=lines.Sum(z=>Math.Max(0,z.Amount));var gst=gross*Math.Max(0,x.GstRate)/100m;var net=gross+gst;
                var prefix=type switch{"PURCHASE"=>"JP","KARIGAR"=>"JK","EXCHANGE"=>"JE","REPAIR"=>"JR",_=>"JV"};
                var no=prefix+"-"+DateTime.Now.ToString("yyyyMMddHHmmssfff");
                var h=new SqlCommand(@"INSERT JewelleryVouchers(VoucherNo,VoucherType,PartyName,GrossAmount,GstRate,GstAmount,NetAmount,PaymentMode,PaidAmount,Notes,CreatedBy)
 OUTPUT INSERTED.Id VALUES(@n,@t,@p,@g,@gr,@ga,@net,@pm,@paid,@notes,@u)",c,tx);
                h.Parameters.AddRange(new[]{P("@n",no),P("@t",type),P("@p",x.PartyName),P("@g",gross),P("@gr",x.GstRate),P("@ga",gst),P("@net",net),P("@pm",x.PaymentMode),P("@paid",x.PaidAmount),P("@notes",x.Notes),P("@u",UserName(ctx))});
                var id=(int)(await h.ExecuteScalarAsync()??0);
                foreach(var z in lines)
                {
                    var l=new SqlCommand(@"INSERT JewelleryVoucherLines(VoucherId,JewelleryItemId,TagNo,ItemName,MetalType,Purity,GrossWeight,NetWeight,FineWeight,RatePerGram,MakingAmount,StoneAmount,Amount)
 VALUES(@v,@i,@tag,@name,@m,@p,@gw,@nw,@fw,@r,@mk,@st,@a)",c,tx);
                    l.Parameters.AddRange(new[]{P("@v",id),P("@i",z.JewelleryItemId),P("@tag",z.TagNo),P("@name",z.ItemName??"Jewellery Item"),P("@m",z.MetalType),P("@p",z.Purity),
                        P("@gw",z.GrossWeight),P("@nw",z.NetWeight),P("@fw",z.FineWeight),P("@r",z.RatePerGram),P("@mk",z.MakingAmount),P("@st",z.StoneAmount),P("@a",z.Amount)});await l.ExecuteNonQueryAsync();
                    if(z.JewelleryItemId.HasValue&&type=="KARIGAR")await UpdateItemStatus(c,tx,z.JewelleryItemId.Value,"KARIGAR_WORK");
                    if(z.JewelleryItemId.HasValue&&type=="REPAIR")await UpdateItemStatus(c,tx,z.JewelleryItemId.Value,"REPAIR");
                }
                await tx.CommitAsync();return Results.Ok(new{id,voucherNo=no,gross,gst,net});
            }catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });
        app.MapGet("/api/jewellery/vouchers",async(Db db,string? type,string? q)=>Results.Ok(await db.QueryAsync(@"SELECT TOP 500 * FROM JewelleryVouchers
 WHERE (@t='' OR VoucherType=@t) AND (@q='' OR VoucherNo LIKE @l OR ISNULL(PartyName,'') LIKE @l) ORDER BY VoucherDate DESC,Id DESC",
 P("@t",(type??"").ToUpperInvariant()),P("@q",q??""),P("@l","%"+(q??"")+"%"))));

        // P-04/P-10: background-only website sync. No caller needs to wait on internet.
        // Public startup endpoint is pull-only and can never mutate Central.
        app.MapGet("/public/outlet/profile-sync", async (Db db,IConfiguration cfg) =>
            await PullCentralProfile(db,cfg,"startup"));

        app.MapPost("/api/outlet/sync", async (Db db,IConfiguration cfg,OutletSyncRequest x) =>
        {
            var sw=Stopwatch.StartNew();var direction=(x.Direction??"PULL").Trim().ToUpperInvariant();var reason=x.Reason??"manual";
            var status=LicenseGuardModules.GetStatus();
            if(string.IsNullOrWhiteSpace(status.OutletCode))return Results.Ok(new{ok=false,offline=false,message="POS is not activated"});
            using var cts=new CancellationTokenSource(TimeSpan.FromMilliseconds(2500));
            try
            {
                using var http=CentralClient(cfg);
                if(direction=="PUSH")
                {
                    var o=await db.QuerySingleAsync("SELECT TOP 1 OutletName,Address,Phone,Gstin,State,City FROM OutletMaster ORDER BY Id");
                    using var resp=await http.PostAsJsonAsync("api/pos/profile",new{
                        outletCode=status.OutletCode,deviceFingerprint=status.DeviceId,
                        outletName=o.GetValueOrDefault("OutletName")?.ToString()??"Main Outlet",
                        address=o.GetValueOrDefault("Address")?.ToString(),mobile=o.GetValueOrDefault("Phone")?.ToString(),gstNo=o.GetValueOrDefault("Gstin")?.ToString(),state=o.GetValueOrDefault("State")?.ToString(),city=o.GetValueOrDefault("City")?.ToString()
                    },cts.Token);
                    var msg=await resp.Content.ReadAsStringAsync(cts.Token);
                    await SyncLog(db,"POS_TO_WEB",reason,resp.IsSuccessStatusCode?"OK":"ERROR",TrimMessage(msg),sw.ElapsedMilliseconds);
                    return Results.Ok(new{ok=resp.IsSuccessStatusCode,direction,message=resp.IsSuccessStatusCode?"Outlet profile pushed":"Central sync failed"});
                }
                var url="api/pos/profile?outletCode="+Uri.EscapeDataString(status.OutletCode!)+"&deviceFingerprint="+Uri.EscapeDataString(status.DeviceId);
                using var pull=await http.GetAsync(url,cts.Token);var raw=await pull.Content.ReadAsStringAsync(cts.Token);
                if(!pull.IsSuccessStatusCode){await SyncLog(db,"WEB_TO_POS",reason,"ERROR",TrimMessage(raw),sw.ElapsedMilliseconds);return Results.Ok(new{ok=false,offline=false,direction,message="Central profile pull failed"});}
                using var doc=JsonDocument.Parse(raw);var root=doc.RootElement;
                string S(string n)=>root.TryGetProperty(n,out var v)&&v.ValueKind!=JsonValueKind.Null?v.ToString():"";
                var webType=CanonicalStoreType(S("storeType"));var valid=S("validUntilUtc");
                var existing=await db.QuerySingleAsync("SELECT TOP 1 Id FROM OutletMaster ORDER BY Id");
                if(existing.Count==0)
                    await db.ScalarAsync("INSERT OutletMaster(OutletName,StoreType,Address,Phone,Gstin,State,City) VALUES(@n,@t,@a,@p,@g,@s,@c)",P("@n",S("outletName")),P("@t",webType),P("@a",S("address")),P("@p",S("mobile")),P("@g",S("gstNo")),P("@s",S("state")),P("@c",S("city")));
                else
                    await db.ScalarAsync("UPDATE OutletMaster SET OutletName=@n,StoreType=@t,Address=@a,Phone=@p,Gstin=@g,State=@s,City=@c,UpdatedAt=SYSDATETIME() WHERE Id=@id",
                        P("@n",S("outletName")),P("@t",webType),P("@a",S("address")),P("@p",S("mobile")),P("@g",S("gstNo")),P("@s",S("state")),P("@c",S("city")),P("@id",existing["Id"]));
                await SyncLog(db,"WEB_TO_POS",reason,"OK","Profile pulled; StoreType/Validity remain website-owned",sw.ElapsedMilliseconds);
                return Results.Ok(new{ok=true,direction,outletName=S("outletName"),storeType=webType,validUntilUtc=valid,address=S("address"),mobile=S("mobile"),gstNo=S("gstNo"),state=S("state"),city=S("city")});
            }
            catch(OperationCanceledException){await SyncLog(db,direction=="PUSH"?"POS_TO_WEB":"WEB_TO_POS",reason,"OFFLINE","2500ms timeout",sw.ElapsedMilliseconds);return Results.Ok(new{ok=false,offline=true,direction,message="Offline/timeout; local billing remains active"});}
            catch(Exception ex){await SyncLog(db,direction=="PUSH"?"POS_TO_WEB":"WEB_TO_POS",reason,"OFFLINE",ex.Message,sw.ElapsedMilliseconds);return Results.Ok(new{ok=false,offline=true,direction,message="Central unavailable; local billing remains active"});}
        });
        app.MapGet("/api/outlet/sync-log",async(Db db)=>Results.Ok(await db.QueryAsync("SELECT TOP 100 * FROM OutletSyncLog ORDER BY Id DESC")));

        // P-05/P-06/P-18/P-19: deterministic validation + conflict-aware import commits.
        app.MapPost("/api/import/normal/validate", async (Db db,NormalImportRequest x) =>
            Results.Ok(await ValidateNormal(db,x.Rows??new())));
        app.MapPost("/api/import/jewellery/validate", async (Db db,JewelleryImportRequest x) =>
            Results.Ok(await ValidateJewellery(db,x.Rows??new())));
        app.MapPost("/api/import/normal/commit", async (Db db,HttpContext ctx,NormalImportRequest x) =>
            await CommitNormal(db,ctx,x));
        app.MapPost("/api/import/jewellery/commit", async (Db db,HttpContext ctx,JewelleryImportRequest x) =>
            await CommitJewellery(db,ctx,x));
        app.MapGet("/api/import/jobs",async(Db db)=>Results.Ok(await db.QueryAsync("SELECT TOP 100 * FROM ItemImportJobs ORDER BY Id DESC")));

        // P-03/P-17 barcode print audit.
        app.MapPost("/api/barcode-print/log",async(Db db,HttpContext ctx,BarcodePrintLogRequest x)=>{
            var id=await db.ScalarAsync("INSERT BarcodePrintJobs(Scope,TemplateCode,ItemKey,Copies,PrinterName,CreatedBy) VALUES(@s,@t,@i,@c,@p,@u);SELECT CAST(SCOPE_IDENTITY() AS bigint)",
                P("@s",x.Scope??"NORMAL"),P("@t",x.TemplateCode??"N01"),P("@i",x.ItemKey),P("@c",Math.Max(1,x.Copies)),P("@p",x.PrinterName),P("@u",UserName(ctx)));
            return Results.Ok(new{id});
        });
        app.MapGet("/api/barcode-print/recent",async(Db db)=>Results.Ok(await db.QueryAsync("SELECT TOP 100 * FROM BarcodePrintJobs ORDER BY Id DESC")));

        // P-16 explicit override audit helper for master/rate changes.
        app.MapPost("/api/premium/override/audit",async(Db db,HttpContext ctx,OverrideAuditRequest x)=>{
            if(!IsManager(ctx))return Results.Json(new{message="Admin/Manager permission required"},statusCode:403);
            if(string.IsNullOrWhiteSpace(x.Reason))return Results.BadRequest(new{message="Reason is required"});
            var id=await db.ScalarAsync("INSERT PremiumOverrideAudit(ActionName,Reason,UserName,RoleName,Details) VALUES(@a,@r,@u,@role,@d);SELECT CAST(SCOPE_IDENTITY() AS bigint)",
                P("@a",x.ActionName??"MANUAL_OVERRIDE"),P("@r",x.Reason),P("@u",UserName(ctx)),P("@role",UserRole(ctx)),P("@d",x.Details));
            return Results.Ok(new{id});
        });
    }

    static async Task<IResult> SaveJewelleryItem(Db db,HttpContext ctx,int id,PremiumJewelleryItemRequest x)
    {
        if(string.IsNullOrWhiteSpace(x.TagNo)||string.IsNullOrWhiteSpace(x.ItemName))return Results.BadRequest(new{message="Tag No and Item Name are required"});
        var conflict=await FindJewelleryConflict(db,x.TagNo,x.Barcode,x.Huid,id);
        if(conflict.Count>0)return Results.BadRequest(new{message="Duplicate Tag No, Barcode or HUID is not allowed",duplicate=true,conflict});
        var purity=NormalizePurity(x.Purity,x.PurityPercent);var less=Math.Max(0,x.LessWeight);var gross=Math.Max(0,x.GrossWeight);
        var net=x.NetWeight>0?x.NetWeight:Math.Max(0,gross-less);var fine=x.FineWeight>0?x.FineWeight:net*purity.Percent/100m;
        using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
        try
        {
            int itemId=id;
            if(id==0)
            {
                var cmd=new SqlCommand(@"INSERT JewelleryItems(TagNo,Barcode,ItemName,Category,DesignCode,SubCategory,CollectionName,BrandName,SupplierName,KarigarName,
 MetalType,Purity,PurityPercent,HallmarkStatus,Huid,WeightUnit,GrossWeight,LessWeight,NetWeight,FineWeight,WastagePercent,StoneWeight,StoneType,StonePieces,StoneCarat,StoneValue,
 CertificateNo,CertificateLab,MakingChargeType,MakingValue,LabourCharge,HallmarkCharge,OtherCharge,HsnCode,GstMode,GstRate,Mrp,PurchasePrice,SalePrice,WholesalePrice,MinSalePrice,
 OpeningQty,LocationCode,RackName,TrayName,BoxName,InwardDate,ImagePath,Notes,Status)
 OUTPUT INSERTED.Id VALUES(@tag,@bc,@name,@cat,@design,@sub,@col,@brand,@supplier,@karigar,@metal,@purity,@pp,@hall,@huid,@wu,@gross,@less,@net,@fine,@waste,@sw,@st,@sp,@sc,@sv,
 @cert,@lab,@mct,@mv,@lc,@hc,@oc,@hsn,@gm,@gst,@mrp,@purchase,@sale,@wholesale,@minsale,@oq,@loc,@rack,@tray,@box,@inward,@img,@notes,@status)",c,tx);
                AddItemParams(cmd,x,purity.Name,purity.Percent,gross,less,net,fine);itemId=(int)(await cmd.ExecuteScalarAsync()??0);
            }
            else
            {
                var cmd=new SqlCommand(@"UPDATE JewelleryItems SET TagNo=@tag,Barcode=@bc,ItemName=@name,Category=@cat,DesignCode=@design,SubCategory=@sub,CollectionName=@col,BrandName=@brand,
 SupplierName=@supplier,KarigarName=@karigar,MetalType=@metal,Purity=@purity,PurityPercent=@pp,HallmarkStatus=@hall,Huid=@huid,WeightUnit=@wu,GrossWeight=@gross,LessWeight=@less,
 NetWeight=@net,FineWeight=@fine,WastagePercent=@waste,StoneWeight=@sw,StoneType=@st,StonePieces=@sp,StoneCarat=@sc,StoneValue=@sv,CertificateNo=@cert,CertificateLab=@lab,
 MakingChargeType=@mct,MakingValue=@mv,LabourCharge=@lc,HallmarkCharge=@hc,OtherCharge=@oc,HsnCode=@hsn,GstMode=@gm,GstRate=@gst,Mrp=@mrp,PurchasePrice=@purchase,
 SalePrice=@sale,WholesalePrice=@wholesale,MinSalePrice=@minsale,OpeningQty=@oq,LocationCode=@loc,RackName=@rack,TrayName=@tray,BoxName=@box,InwardDate=@inward,ImagePath=@img,
 Notes=@notes,Status=@status,UpdatedAt=SYSDATETIME() WHERE Id=@id",c,tx);
                AddItemParams(cmd,x,purity.Name,purity.Percent,gross,less,net,fine);cmd.Parameters.Add(P("@id",id));if(await cmd.ExecuteNonQueryAsync()==0)throw new Exception("Jewellery item not found");
                await new SqlCommand("DELETE JewelleryItemStones WHERE JewelleryItemId=@id",c,tx){Parameters={P("@id",id)}}.ExecuteNonQueryAsync();
            }
            foreach(var stone in x.Stones??new())
            {
                var sc=new SqlCommand("INSERT JewelleryItemStones(JewelleryItemId,StoneType,Pieces,Weight,Carat,Rate,Amount,CertificateNo,Lab) VALUES(@i,@t,@p,@w,@c,@r,@a,@n,@l)",c,tx);
                sc.Parameters.AddRange(new[]{P("@i",itemId),P("@t",stone.StoneType),P("@p",stone.Pieces),P("@w",stone.Weight),P("@c",stone.Carat),P("@r",stone.Rate),P("@a",stone.Amount),P("@n",stone.CertificateNo),P("@l",stone.Lab)});await sc.ExecuteNonQueryAsync();
            }
            await tx.CommitAsync();return Results.Ok(new{id=itemId,netWeight=net,fineWeight=fine,purity=purity.Name,purityPercent=purity.Percent});
        }
        catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
    }

    static void AddItemParams(SqlCommand cmd,PremiumJewelleryItemRequest x,string purity,decimal purityPct,decimal gross,decimal less,decimal net,decimal fine)
    {
        cmd.Parameters.AddRange(new[]{
            P("@tag",x.TagNo.Trim()),P("@bc",Blank(x.Barcode)),P("@name",x.ItemName.Trim()),P("@cat",Blank(x.Category)),P("@design",Blank(x.DesignCode)),P("@sub",Blank(x.SubCategory)),
            P("@col",Blank(x.CollectionName)),P("@brand",Blank(x.BrandName)),P("@supplier",Blank(x.SupplierName)),P("@karigar",Blank(x.KarigarName)),P("@metal",Blank(x.MetalType)??"Gold"),
            P("@purity",purity),P("@pp",purityPct),P("@hall",Blank(x.HallmarkStatus)),P("@huid",Blank(x.Huid)),P("@wu","G"),P("@gross",gross),P("@less",less),P("@net",net),P("@fine",fine),
            P("@waste",Math.Max(0,x.WastagePercent)),P("@sw",Math.Max(0,x.StoneWeight)),P("@st",Blank(x.StoneType)),P("@sp",Math.Max(0,x.StonePieces)),P("@sc",Math.Max(0,x.StoneCarat)),
            P("@sv",Math.Max(0,x.StoneValue)),P("@cert",Blank(x.CertificateNo)),P("@lab",Blank(x.CertificateLab)),P("@mct",Blank(x.MakingChargeType)??"PER_GRAM"),P("@mv",Math.Max(0,x.MakingValue)),
            P("@lc",Math.Max(0,x.LabourCharge)),P("@hc",Math.Max(0,x.HallmarkCharge)),P("@oc",Math.Max(0,x.OtherCharge)),P("@hsn",Blank(x.HsnCode)??"7113"),
            P("@gm",string.Equals(x.GstMode,"INCLUSIVE",StringComparison.OrdinalIgnoreCase)?"INCLUSIVE":"EXCLUSIVE"),P("@gst",Math.Max(0,x.GstRate)),P("@mrp",Math.Max(0,x.Mrp)),
            P("@purchase",Math.Max(0,x.PurchasePrice)),P("@sale",Math.Max(0,x.SalePrice)),P("@wholesale",Math.Max(0,x.WholesalePrice)),P("@minsale",Math.Max(0,x.MinSalePrice)),
            P("@oq",x.OpeningQty<=0?1:x.OpeningQty),P("@loc",Blank(x.LocationCode)),P("@rack",Blank(x.RackName)),P("@tray",Blank(x.TrayName)),P("@box",Blank(x.BoxName)),
            P("@inward",x.InwardDate),P("@img",Blank(x.ImagePath)),P("@notes",Blank(x.Notes)),P("@status",Blank(x.Status)??"IN_STOCK")
        });
    }

    static async Task<Dictionary<string,object?>> FindJewelleryConflict(Db db,string? tag,string? barcode,string? huid,int excludeId)
    {
        return await db.QuerySingleAsync(@"SELECT TOP 1 Id,TagNo,Barcode,Huid,ItemName,
 CASE WHEN UPPER(TagNo)=UPPER(@tag) THEN 'TAG' WHEN @bc<>'' AND UPPER(ISNULL(Barcode,''))=UPPER(@bc) THEN 'BARCODE' ELSE 'HUID' END ConflictType
 FROM JewelleryItems WHERE Id<>@id AND (UPPER(TagNo)=UPPER(@tag) OR (@bc<>'' AND UPPER(ISNULL(Barcode,''))=UPPER(@bc)) OR (@huid<>'' AND UPPER(ISNULL(Huid,''))=UPPER(@huid)))",
            P("@id",excludeId),P("@tag",(tag??"").Trim()),P("@bc",(barcode??"").Trim()),P("@huid",(huid??"").Trim()));
    }

    static async Task<List<object>> ValidateNormal(Db db,List<NormalImportRow> rows)
    {
        var result=new List<object>();var i=0;
        foreach(var r in rows){i++;var name=(r.Name??"").Trim();var bc=(r.Barcode??"").Trim();var ex=await db.QuerySingleAsync(@"SELECT TOP 1 Id,Name,Barcode FROM Products WHERE IsActive=1 AND (UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) OR (@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b)))",P("@n",name),P("@b",bc));result.Add(new{rowNumber=i,valid=!string.IsNullOrWhiteSpace(name),conflict=ex.Count>0,existingId=ex.GetValueOrDefault("Id"),message=string.IsNullOrWhiteSpace(name)?"Item name is required":ex.Count>0?"Existing item/barcode found":"Ready"});}
        return result;
    }
    static async Task<List<object>> ValidateJewellery(Db db,List<JewelleryImportRow> rows)
    {
        var result=new List<object>();var i=0;
        foreach(var r in rows){i++;var ex=await FindJewelleryConflict(db,r.TagNo,r.Barcode,r.Huid,0);result.Add(new{rowNumber=i,valid=!string.IsNullOrWhiteSpace(r.TagNo)&&!string.IsNullOrWhiteSpace(r.ItemName),conflict=ex.Count>0,existingId=ex.GetValueOrDefault("Id"),conflictType=ex.GetValueOrDefault("ConflictType"),message=string.IsNullOrWhiteSpace(r.TagNo)||string.IsNullOrWhiteSpace(r.ItemName)?"Tag and Item Name required":ex.Count>0?"Tag/Barcode/HUID conflict":"Ready"});}
        return result;
    }

    static async Task<IResult> CommitNormal(Db db,HttpContext ctx,NormalImportRequest x)
    {
        var rows=x.Rows??new();var job=await NewImportJob(db,"NORMAL",x.SourceFileName,rows.Count,UserName(ctx));int added=0,updated=0,skipped=0;var conflicts=new List<object>();var i=0;
        foreach(var r in rows){i++;var name=(r.Name??"").Trim();if(string.IsNullOrWhiteSpace(name)){skipped++;await Conflict(db,job,i,"REQUIRED","Name",name,"SKIP","Blank item name");continue;}
            var bc=(r.Barcode??"").Trim();var ex=await db.QuerySingleAsync(@"SELECT TOP 1 Id,Name,Barcode FROM Products WHERE IsActive=1 AND (UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) OR (@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b)))",P("@n",name),P("@b",bc));
            var resolution=(r.Resolution??"SKIP").ToUpperInvariant();
            if(ex.Count>0&&resolution=="SKIP"){skipped++;conflicts.Add(new{rowNumber=i,type="DUPLICATE",value=name});await Conflict(db,job,i,"DUPLICATE","Name/Barcode",name,"SKIP","Existing item/barcode");continue;}
            var unit=await UnitMasterModules.ResolveActiveNameAsync(db,string.IsNullOrWhiteSpace(r.Unit)?"PCS":r.Unit!);
            if(ex.Count>0&&resolution=="UPDATE"){await db.ScalarAsync(@"UPDATE Products SET Name=@n,Sku=@s,Category=@cat,Unit=@u,Hsn=@h,GstRate=@g,TaxMode=@tm,Mrp=@m,PurchasePrice=@pp,SalePrice=@sp,MinStock=@min,LocationCode=@loc,RackName=@rack,ShelfName=@shelf WHERE Id=@id",
                P("@n",name),P("@s",Blank(r.Sku)),P("@cat",Blank(r.Category)),P("@u",unit),P("@h",Blank(r.Hsn)),P("@g",r.GstRate),P("@tm",string.Equals(r.GstMode,"INCLUSIVE",StringComparison.OrdinalIgnoreCase)?"INCLUSIVE":"EXCLUSIVE"),P("@m",r.Mrp),P("@pp",r.PurchasePrice),P("@sp",r.SalePrice),P("@min",r.MinStock),P("@loc",Blank(r.LocationCode)),P("@rack",Blank(r.RackName)),P("@shelf",Blank(r.ShelfName)),P("@id",ex["Id"]));updated++;continue;}
            if(ex.Count>0&&resolution=="CREATE"){name=name+" (Import "+DateTime.Now.ToString("HHmmss")+"-"+i+")";bc="";await Conflict(db,job,i,"DUPLICATE","Name/Barcode",r.Name,"CREATE","Created as separate copy; conflicting barcode cleared");}
            try{await db.ScalarAsync(@"INSERT Products(Name,Barcode,Sku,Category,Unit,Hsn,GstRate,TaxMode,Mrp,PurchasePrice,SalePrice,MinStock,LocationCode,RackName,ShelfName) VALUES(@n,@b,@s,@cat,@u,@h,@g,@tm,@m,@pp,@sp,@min,@loc,@rack,@shelf)",
                P("@n",name),P("@b",Blank(bc)),P("@s",Blank(r.Sku)),P("@cat",Blank(r.Category)),P("@u",unit),P("@h",Blank(r.Hsn)),P("@g",r.GstRate),P("@tm",string.Equals(r.GstMode,"INCLUSIVE",StringComparison.OrdinalIgnoreCase)?"INCLUSIVE":"EXCLUSIVE"),P("@m",r.Mrp),P("@pp",r.PurchasePrice),P("@sp",r.SalePrice),P("@min",r.MinStock),P("@loc",Blank(r.LocationCode)),P("@rack",Blank(r.RackName)),P("@shelf",Blank(r.ShelfName)));added++;}
            catch(SqlException e)when(e.Number is 2601 or 2627){skipped++;await Conflict(db,job,i,"UNIQUE","Barcode",bc,"SKIP","Unique barcode conflict");}
        }
        await FinishImportJob(db,job,added+updated,skipped);return Results.Ok(new{jobId=job,added,updated,skipped,conflicts});
    }

    static async Task<IResult> CommitJewellery(Db db,HttpContext ctx,JewelleryImportRequest x)
    {
        var rows=x.Rows??new();var job=await NewImportJob(db,"JEWELLERY",x.SourceFileName,rows.Count,UserName(ctx));int added=0,updated=0,skipped=0;var i=0;
        foreach(var r in rows){i++;if(string.IsNullOrWhiteSpace(r.TagNo)||string.IsNullOrWhiteSpace(r.ItemName)){skipped++;await Conflict(db,job,i,"REQUIRED","Tag/Item",r.TagNo,"SKIP","Tag and Item Name required");continue;}
            var ex=await FindJewelleryConflict(db,r.TagNo,r.Barcode,r.Huid,0);var resolution=(r.Resolution??"SKIP").ToUpperInvariant();var targetId=0;
            if(ex.Count>0&&resolution=="SKIP"){skipped++;await Conflict(db,job,i,"DUPLICATE","Tag/Barcode/HUID",r.TagNo,"SKIP","Existing jewellery identity");continue;}
            if(ex.Count>0&&resolution=="UPDATE")targetId=Convert.ToInt32(ex["Id"]);
            var req=r.ToMaster();
            if(ex.Count>0&&resolution=="CREATE"){req.TagNo=(r.TagNo??"TAG")+"-I"+DateTime.Now.ToString("HHmmss")+"-"+i;req.Barcode=null;req.Huid=null;await Conflict(db,job,i,"DUPLICATE","Tag/Barcode/HUID",r.TagNo,"CREATE","Created copy with new tag; conflicting Barcode/HUID cleared");}
            var result=await SaveJewelleryItem(db,ctx,targetId,req);
            var code=(result as IStatusCodeHttpResult)?.StatusCode??200;if(code>=400){skipped++;await Conflict(db,job,i,"SAVE","Row",r.TagNo,"SKIP","Save failed");}else if(targetId>0)updated++;else added++;
        }
        await FinishImportJob(db,job,added+updated,skipped);return Results.Ok(new{jobId=job,added,updated,skipped});
    }

    static async Task<long> NewImportJob(Db db,string scope,string? file,int found,string user)
    {
        var id=await db.ScalarAsync("INSERT ItemImportJobs(Scope,SourceFileName,SourceType,RowsFound,Status,UserName) VALUES(@s,@f,@t,@r,'COMMITTING',@u);SELECT CAST(SCOPE_IDENTITY() AS bigint)",
            P("@s",scope),P("@f",Blank(file)),P("@t",Path.GetExtension(file??"").TrimStart('.').ToUpperInvariant()),P("@r",found),P("@u",user));return Convert.ToInt64(id);
    }
    static Task FinishImportJob(Db db,long id,int accepted,int rejected)=>db.ScalarAsync("UPDATE ItemImportJobs SET RowsAccepted=@a,RowsRejected=@r,Status='COMPLETED',CompletedAt=SYSDATETIME() WHERE Id=@id",P("@a",accepted),P("@r",rejected),P("@id",id));
    static Task Conflict(Db db,long job,int row,string type,string field,string? raw,string resolution,string message)=>db.ScalarAsync("INSERT ItemImportConflicts(JobId,RowNumber,ConflictType,FieldName,RawValue,Resolution,Message) VALUES(@j,@r,@t,@f,@v,@x,@m)",P("@j",job),P("@r",row),P("@t",type),P("@f",field),P("@v",raw),P("@x",resolution),P("@m",message));

    static async Task<IResult> PullCentralProfile(Db db,IConfiguration cfg,string reason)
    {
        var sw=Stopwatch.StartNew();var status=LicenseGuardModules.GetStatus();
        if(string.IsNullOrWhiteSpace(status.OutletCode))return Results.Ok(new{ok=false,message="POS is not activated"});
        using var cts=new CancellationTokenSource(TimeSpan.FromMilliseconds(2500));
        try
        {
            using var http=CentralClient(cfg);
            var url="api/pos/profile?outletCode="+Uri.EscapeDataString(status.OutletCode!)+"&deviceFingerprint="+Uri.EscapeDataString(status.DeviceId);
            using var pull=await http.GetAsync(url,cts.Token);var raw=await pull.Content.ReadAsStringAsync(cts.Token);
            if(!pull.IsSuccessStatusCode){await SyncLog(db,"WEB_TO_POS",reason,"ERROR",TrimMessage(raw),sw.ElapsedMilliseconds);return Results.Ok(new{ok=false,offline=false,message="Central profile pull failed"});}
            using var doc=JsonDocument.Parse(raw);var root=doc.RootElement;
            string S(string n)=>root.TryGetProperty(n,out var v)&&v.ValueKind!=JsonValueKind.Null?v.ToString():"";
            var webType=CanonicalStoreType(S("storeType"));var existing=await db.QuerySingleAsync("SELECT TOP 1 Id FROM OutletMaster ORDER BY Id");
            if(existing.Count==0)
                await db.ScalarAsync("INSERT OutletMaster(OutletName,StoreType,Address,Phone,Gstin,State,City) VALUES(@n,@t,@a,@p,@g,@s,@c)",P("@n",S("outletName")),P("@t",webType),P("@a",S("address")),P("@p",S("mobile")),P("@g",S("gstNo")),P("@s",S("state")),P("@c",S("city")));
            else
                await db.ScalarAsync("UPDATE OutletMaster SET OutletName=@n,StoreType=@t,Address=@a,Phone=@p,Gstin=@g,State=@s,City=@c,UpdatedAt=SYSDATETIME() WHERE Id=@id",P("@n",S("outletName")),P("@t",webType),P("@a",S("address")),P("@p",S("mobile")),P("@g",S("gstNo")),P("@s",S("state")),P("@c",S("city")),P("@id",existing["Id"]));
            await SyncLog(db,"WEB_TO_POS",reason,"OK","Profile pulled; StoreType/Validity remain website-owned",sw.ElapsedMilliseconds);
            return Results.Ok(new{ok=true,outletName=S("outletName"),storeType=webType,validUntilUtc=S("validUntilUtc"),address=S("address"),mobile=S("mobile"),gstNo=S("gstNo"),state=S("state"),city=S("city")});
        }
        catch(OperationCanceledException){await SyncLog(db,"WEB_TO_POS",reason,"OFFLINE","2500ms timeout",sw.ElapsedMilliseconds);return Results.Ok(new{ok=false,offline=true,message="Offline/timeout; local billing remains active"});}
        catch(Exception ex){await SyncLog(db,"WEB_TO_POS",reason,"OFFLINE",ex.Message,sw.ElapsedMilliseconds);return Results.Ok(new{ok=false,offline=true,message="Central unavailable; local billing remains active"});}
    }

    static readonly (string Key,string Name,string Scope,int Sort)[] AppFeatures = new[]{
        ("BILLING","New Billing","Normal",10),("ITEM_MASTER","Item Master","Normal",20),("AI_IMPORT","AI Import","Normal",30),("ITEM_IMPORT","Item Import Master","Normal",40),
        ("PURCHASES","Purchases","Shared",50),("SALES_HISTORY","Sales History","Normal",60),("BILL_MANAGEMENT","Bill Management / Reprint","Normal",70),("BTC_SETTLEMENT","BTC / Credit Settlement","Normal",80),
        ("CUSTOMER_COMPANY","Customer / Company","Shared",90),("SUPPLIERS","Suppliers","Shared",100),("EXPIRY","Expiry","Normal",110),("RETURNS","Returns","Normal",120),("EXPENSES","Expenses","Normal",130),
        ("TAX_MASTER","Tax Master","Normal",140),("UNIT_MASTER","Unit Master","Normal",150),("REPORTS","Reports","Shared",160),("BARCODE_PRINT","Barcode Print Master","Shared",170),("PRINT_MASTER","Print Master","Shared",180),("DATABASE_BACKUP","Database Backup","Shared",190),
        ("JEWELLERY_BILLING","Jewellery Billing","Jewellery",210),("JEWELLERY_STOCK","Jewellery Stock","Jewellery",220),("JEWELLERY_PURCHASE","Jewellery Purchase","Jewellery",230),
        ("JEWELLERY_ITEM_MASTER","Jewellery Item Master","Jewellery",240),("JEWELLERY_ITEM_ENTRY","Jewellery Item Entry","Jewellery",250),("JEWELLERY_ITEM_IMPORT","Jewellery Item Import Master","Jewellery",260),
        ("JEWELLERY_BARCODE","Jewellery Barcode Print","Jewellery",270),("JEWELLERY_REPORTS","Jewellery Reports","Jewellery",280),("JEWELLERY_RATES","Gold / Silver Rates","Jewellery",290),("JEWELLERY_CUSTOMERS","Jewellery Customers","Jewellery",300),("JEWELLERY_DAY_CLOSE","Jewellery Day Closing","Jewellery",310)
    };
    static async Task EnsureFeatureAccess(Db db)
    {
        foreach(var f in AppFeatures)
            await db.ScalarAsync(@"IF NOT EXISTS(SELECT 1 FROM AppFeatureAccess WHERE FeatureKey=@k)
INSERT AppFeatureAccess(FeatureKey,DisplayName,Scope,IsEnabled,SortOrder) VALUES(@k,@n,@s,1,@o);
ELSE UPDATE AppFeatureAccess SET DisplayName=@n,Scope=@s,SortOrder=@o WHERE FeatureKey=@k",
                P("@k",f.Key),P("@n",f.Name),P("@s",f.Scope),P("@o",f.Sort));
    }

    static async Task<bool> Enabled(Db db,string code){var x=await db.ScalarAsync("SELECT TOP 1 IsEnabled FROM PremiumFeatureFlags WHERE PointerCode=@c",P("@c",code));return x is null||x is DBNull||Convert.ToBoolean(x);}
    static string? Blank(string? x)=>string.IsNullOrWhiteSpace(x)?null:x.Trim();
    static string UserName(HttpContext c)=>Prop(c.Items["User"],"UserName")??"System";
    static string UserRole(HttpContext c)=>Prop(c.Items["User"],"Role")??"Cashier";
    static bool IsAdmin(HttpContext c){var r=UserRole(c);return r.Equals("Admin",StringComparison.OrdinalIgnoreCase)||r.Equals("Administrator",StringComparison.OrdinalIgnoreCase)||r.Equals("Super Admin",StringComparison.OrdinalIgnoreCase);}
    static bool IsManager(HttpContext c)=>IsAdmin(c)||UserRole(c).Equals("Manager",StringComparison.OrdinalIgnoreCase)||UserRole(c).Equals("Administrator",StringComparison.OrdinalIgnoreCase);
    static string? Prop(object? o,string n)=>o?.GetType().GetProperty(n)?.GetValue(o)?.ToString();
    static (string Name,decimal Percent) NormalizePurity(string? p,decimal pct){var s=(p??"").Trim().ToUpperInvariant().Replace(" ","");if(s is "916" or "22CT" or "22K")return("22K",pct>0?pct:91.6m);if(s is "750" or "18CT" or "18K")return("18K",pct>0?pct:75m);if(s is "585" or "14CT" or "14K")return("14K",pct>0?pct:58.5m);if(s is "999" or "24CT" or "24K")return("24K",pct>0?pct:99.9m);if(s=="925")return("925",pct>0?pct:92.5m);return(string.IsNullOrWhiteSpace(s)?"22K":s,pct>0?pct:91.6m);}
    static string CanonicalStoreType(string? t)=>System.Text.RegularExpressions.Regex.IsMatch((t??"").Trim(),"^(Gold & Diamond Jewellery|Silver Jewellery)$",System.Text.RegularExpressions.RegexOptions.IgnoreCase)?"Jewellery Shop":(string.IsNullOrWhiteSpace(t)?"Retail Shop":t!.Trim());
    static HttpClient CentralClient(IConfiguration cfg){var raw=cfg["CentralLicense:BaseUrl"]??"http://suvidhapremium.suvidhapos.in/";var u=new Uri(raw.EndsWith("/")?raw:raw+"/");return new HttpClient(new HttpClientHandler{AllowAutoRedirect=true}){BaseAddress=u,Timeout=TimeSpan.FromMilliseconds(2800)};}
    static string TrimMessage(string x)=>x.Length>900?x[..900]:x;
    static Task SyncLog(Db db,string dir,string reason,string status,string message,long ms)=>db.ScalarAsync("INSERT OutletSyncLog(Direction,Reason,Status,Message,DurationMs) VALUES(@d,@r,@s,@m,@ms)",P("@d",dir),P("@r",reason),P("@s",status),P("@m",message),P("@ms",(int)Math.Min(int.MaxValue,ms)));
    static async Task<decimal> LatestRateAsync(SqlConnection c,SqlTransaction tx,string metal,string purity){var cmd=new SqlCommand("SELECT TOP 1 RatePerGram FROM JewelleryMetalRates WHERE IsActive=1 AND MetalType=@m AND Purity=@p ORDER BY EffectiveAt DESC,Id DESC",c,tx);cmd.Parameters.AddRange(new[]{P("@m",metal),P("@p",purity)});var v=await cmd.ExecuteScalarAsync();return v is null||v is DBNull?0:Convert.ToDecimal(v);}
    static async Task UpdateItemStatus(SqlConnection c,SqlTransaction tx,int id,string status){var cmd=new SqlCommand("UPDATE JewelleryItems SET Status=@s,UpdatedAt=SYSDATETIME() WHERE Id=@id",c,tx);cmd.Parameters.AddRange(new[]{P("@s",status),P("@id",id)});await cmd.ExecuteNonQueryAsync();}

    sealed record SalePrepared(JewellerySaleLineInput Input,string Tag,string Name,string Metal,string Purity,decimal NetWeight,decimal FineWeight,decimal WastagePercent,decimal Rate,decimal MetalAmount,decimal StoneAmount,decimal MakingAmount,string GstMode,decimal ItemGstRate,decimal Extras);
}

public sealed class FeatureFlagRequest{public bool IsEnabled{get;set;}}
public sealed class PremiumJewelleryItemRequest
{
    public string TagNo{get;set;}="";public string? Barcode{get;set;}public string ItemName{get;set;}="";
    public string? Category{get;set;}public string? DesignCode{get;set;}public string? SubCategory{get;set;}public string? CollectionName{get;set;}public string? BrandName{get;set;}
    public string? SupplierName{get;set;}public string? KarigarName{get;set;}public string? MetalType{get;set;}="Gold";public string? Purity{get;set;}="22K";public decimal PurityPercent{get;set;}=91.6m;
    public string? HallmarkStatus{get;set;}public string? Huid{get;set;}public decimal GrossWeight{get;set;}public decimal LessWeight{get;set;}public decimal NetWeight{get;set;}public decimal FineWeight{get;set;}
    public decimal WastagePercent{get;set;}public decimal StoneWeight{get;set;}public string? StoneType{get;set;}public int StonePieces{get;set;}public decimal StoneCarat{get;set;}public decimal StoneValue{get;set;}
    public string? CertificateNo{get;set;}public string? CertificateLab{get;set;}public string? MakingChargeType{get;set;}="PER_GRAM";public decimal MakingValue{get;set;}public decimal LabourCharge{get;set;}
    public decimal HallmarkCharge{get;set;}public decimal OtherCharge{get;set;}public string? HsnCode{get;set;}="7113";public string? GstMode{get;set;}="EXCLUSIVE";public decimal GstRate{get;set;}=3;
    public decimal Mrp{get;set;}public decimal PurchasePrice{get;set;}public decimal SalePrice{get;set;}public decimal WholesalePrice{get;set;}public decimal MinSalePrice{get;set;}public decimal OpeningQty{get;set;}=1;
    public string? LocationCode{get;set;}public string? RackName{get;set;}public string? TrayName{get;set;}public string? BoxName{get;set;}public DateTime? InwardDate{get;set;}public string? ImagePath{get;set;}public string? Notes{get;set;}public string? Status{get;set;}="IN_STOCK";
    public List<JewelleryStoneInput>? Stones{get;set;}
}
public sealed class JewelleryStoneInput{public string? StoneType{get;set;}public int Pieces{get;set;}public decimal Weight{get;set;}public decimal Carat{get;set;}public decimal Rate{get;set;}public decimal Amount{get;set;}public string? CertificateNo{get;set;}public string? Lab{get;set;}}
public sealed class CompleteJewellerySaleRequest{public string? SaleType{get;set;}="RETAIL";public int? CustomerId{get;set;}public string? CustomerName{get;set;}public string? CustomerPan{get;set;}public decimal GstRate{get;set;}=3;public string? GstMode{get;set;}="EXCLUSIVE";public decimal Discount{get;set;}public string? OverrideReason{get;set;}public string? Notes{get;set;}public List<JewellerySaleLineInput>? Lines{get;set;}public List<JewelleryPaymentInput>? Payments{get;set;}public List<JewelleryOldMetalInput>? OldMetal{get;set;}}
public sealed class JewellerySaleLineInput{public int JewelleryItemId{get;set;}public decimal MetalRatePerGram{get;set;}public decimal StoneValue{get;set;}=-1;public string? MakingChargeType{get;set;}public decimal MakingValue{get;set;}=-1;}
public sealed class JewelleryPaymentInput{public string? Mode{get;set;}public decimal Amount{get;set;}public string? Reference{get;set;}}
public sealed class JewelleryOldMetalInput{public string? Metal{get;set;}public decimal Gross{get;set;}public decimal Less{get;set;}public decimal Net{get;set;}public decimal Purity{get;set;}public decimal Fine{get;set;}public decimal Rate{get;set;}public decimal Amount{get;set;}}
public sealed class JewelleryVoucherRequest{public string? VoucherType{get;set;}public string? PartyName{get;set;}public decimal GstRate{get;set;}public string? PaymentMode{get;set;}public decimal PaidAmount{get;set;}public string? Notes{get;set;}public List<JewelleryVoucherLineInput>? Lines{get;set;}}
public sealed class JewelleryVoucherLineInput{public int? JewelleryItemId{get;set;}public string? TagNo{get;set;}public string? ItemName{get;set;}public string? MetalType{get;set;}public string? Purity{get;set;}public decimal GrossWeight{get;set;}public decimal NetWeight{get;set;}public decimal FineWeight{get;set;}public decimal RatePerGram{get;set;}public decimal MakingAmount{get;set;}public decimal StoneAmount{get;set;}public decimal Amount{get;set;}}
public sealed class OutletSyncRequest{public string? Direction{get;set;}="PULL";public string? Reason{get;set;}="manual";}
public sealed class BarcodePrintLogRequest{public string? Scope{get;set;}public string? TemplateCode{get;set;}public string? ItemKey{get;set;}public int Copies{get;set;}=1;public string? PrinterName{get;set;}}
public sealed class OverrideAuditRequest{public string? ActionName{get;set;}public string? Reason{get;set;}public string? Details{get;set;}}
public sealed class NormalImportRequest{public string? SourceFileName{get;set;}public List<NormalImportRow>? Rows{get;set;}}
public sealed class NormalImportRow{public string? Name{get;set;}public string? Barcode{get;set;}public string? Sku{get;set;}public string? Category{get;set;}public string? Unit{get;set;}public string? Hsn{get;set;}public decimal GstRate{get;set;}public string? GstMode{get;set;}="EXCLUSIVE";public decimal Mrp{get;set;}public decimal PurchasePrice{get;set;}public decimal SalePrice{get;set;}public decimal MinStock{get;set;}public string? LocationCode{get;set;}public string? RackName{get;set;}public string? ShelfName{get;set;}public string? Resolution{get;set;}="SKIP";}
public sealed class JewelleryImportRequest{public string? SourceFileName{get;set;}public List<JewelleryImportRow>? Rows{get;set;}}
public sealed class JewelleryImportRow
{
    public string? TagNo{get;set;}public string? Barcode{get;set;}public string? ItemName{get;set;}public string? Category{get;set;}public string? DesignCode{get;set;}public string? MetalType{get;set;}public string? Purity{get;set;}public decimal PurityPercent{get;set;}
    public string? Huid{get;set;}public decimal GrossWeight{get;set;}public decimal LessWeight{get;set;}public decimal NetWeight{get;set;}public decimal FineWeight{get;set;}public decimal WastagePercent{get;set;}public decimal StoneWeight{get;set;}public string? StoneType{get;set;}public int StonePieces{get;set;}public decimal StoneCarat{get;set;}public decimal StoneValue{get;set;}
    public string? MakingChargeType{get;set;}public decimal MakingValue{get;set;}public string? HsnCode{get;set;}="7113";public string? GstMode{get;set;}="EXCLUSIVE";public decimal GstRate{get;set;}=3;public decimal PurchasePrice{get;set;}public decimal SalePrice{get;set;}public string? RackName{get;set;}public string? Notes{get;set;}public string? Resolution{get;set;}="SKIP";
    public PremiumJewelleryItemRequest ToMaster()=>new(){TagNo=TagNo??"",Barcode=Barcode,ItemName=ItemName??"",Category=Category,DesignCode=DesignCode,MetalType=MetalType??"Gold",Purity=Purity??"22K",PurityPercent=PurityPercent,Huid=Huid,GrossWeight=GrossWeight,LessWeight=LessWeight,NetWeight=NetWeight,FineWeight=FineWeight,WastagePercent=WastagePercent,StoneWeight=StoneWeight,StoneType=StoneType,StonePieces=StonePieces,StoneCarat=StoneCarat,StoneValue=StoneValue,MakingChargeType=MakingChargeType??"PER_GRAM",MakingValue=MakingValue,HsnCode=HsnCode,GstMode=GstMode,GstRate=GstRate,PurchasePrice=PurchasePrice,SalePrice=SalePrice,RackName=RackName,Notes=Notes,Status="IN_STOCK"};
}
