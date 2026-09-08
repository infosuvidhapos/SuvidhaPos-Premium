using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;
using System.Globalization;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO.Compression;
using System.Xml.Linq;

var builder=WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<Db>(); builder.Services.AddSingleton<DatabaseInitializer>();
var app=builder.Build();
using(var scope=app.Services.CreateScope()){try{await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();}catch(Exception ex){Console.WriteLine("Database initialization failed: "+ex.Message);}}
app.UseDefaultFiles(); app.UseStaticFiles();
var sessions = new ConcurrentDictionary<string, SessionUser>();
app.Use(async (ctx,next) => {
    if (!ctx.Request.Path.StartsWithSegments("/api") || ctx.Request.Path.StartsWithSegments("/api/health") || ctx.Request.Path.StartsWithSegments("/api/login")) { await next(); return; }

    string? token = null;
    if (ctx.Request.Cookies.TryGetValue("suvidha_session", out var cookieToken))
        token = cookieToken;

    if (string.IsNullOrWhiteSpace(token))
    {
        var auth = ctx.Request.Headers["Authorization"].ToString();
        if (auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            token = auth.Substring(7).Trim();
    }

    if (string.IsNullOrWhiteSpace(token) || !sessions.TryGetValue(token, out var user))
    {
        ctx.Response.StatusCode=401;
        await ctx.Response.WriteAsJsonAsync(new {message="Login required"});
        return;
    }

    ctx.Items["User"] = user;
    if (ctx.Request.Path.StartsWithSegments("/api/users") && user.Role != "Admin") { ctx.Response.StatusCode=403; await ctx.Response.WriteAsJsonAsync(new {message="Admin permission required"}); return; }
    if (ctx.Request.Path.StartsWithSegments("/api/sales") && ctx.Request.Path.Value?.EndsWith("/void") == true && user.Role == "Cashier") { ctx.Response.StatusCode=403; await ctx.Response.WriteAsJsonAsync(new {message="Manager permission required"}); return; }
    await next();
});

app.MapPost("/api/login", async(HttpContext ctx,Db db, LoginRequest x) => {
    var row=await db.QuerySingleAsync("SELECT TOP 1 Id,UserName,DisplayName,PasswordHash,Role,MustChangePassword FROM Users WHERE UserName=@u AND IsActive=1",P("@u",x.UserName?.Trim()));
    if(row.Count==0 || !VerifyPassword(x.Password??"", row["PasswordHash"]?.ToString()??"")) return Results.Unauthorized();

    var token=Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    var su=new SessionUser(Convert.ToInt32(row["Id"]),row["UserName"]?.ToString()??"",row["DisplayName"]?.ToString()??"",row["Role"]?.ToString()??"Cashier");
    sessions[token]=su;

    ctx.Response.Cookies.Append("suvidha_session",token,new CookieOptions{
        HttpOnly=true,
        SameSite=SameSiteMode.Lax,
        IsEssential=true,
        Path="/"
    });

    return Results.Ok(new {
        token,
        user=new {su.Id,su.UserName,su.DisplayName,su.Role,MustChangePassword=Convert.ToBoolean(row["MustChangePassword"]??false)}
    });
});
app.MapPost("/api/logout",(HttpContext ctx)=>{
    string? token=null;
    if(ctx.Request.Cookies.TryGetValue("suvidha_session",out var cookieToken)) token=cookieToken;
    if(string.IsNullOrWhiteSpace(token)){
        var auth=ctx.Request.Headers["Authorization"].ToString();
        if(auth.StartsWith("Bearer ",StringComparison.OrdinalIgnoreCase)) token=auth.Substring(7).Trim();
    }
    if(!string.IsNullOrWhiteSpace(token)) sessions.TryRemove(token,out _);
    ctx.Response.Cookies.Delete("suvidha_session",new CookieOptions{Path="/"});
    return Results.Ok(new{loggedOut=true});
});
app.MapGet("/api/me",(HttpContext ctx)=>Results.Ok(ctx.Items["User"]));
app.MapPost("/api/change-password",async(Db db,HttpContext ctx,PasswordChangeRequest x)=>{var u=(SessionUser)ctx.Items["User"]!; var row=await db.QuerySingleAsync("SELECT PasswordHash FROM Users WHERE Id=@id",P("@id",u.Id)); if(!VerifyPassword(x.CurrentPassword??"",row.GetValueOrDefault("PasswordHash")?.ToString()??"")) return Results.BadRequest(new{message="Current password is incorrect"}); if(string.IsNullOrWhiteSpace(x.NewPassword)||x.NewPassword.Length<6)return Results.BadRequest(new{message="Password must be at least 6 characters"}); await db.ScalarAsync("UPDATE Users SET PasswordHash=@p,MustChangePassword=0 WHERE Id=@id",P("@p",HashPassword(x.NewPassword)),P("@id",u.Id)); return Results.Ok(new{changed=true});});

app.MapGet("/api/health",async(Db db)=>{try{await db.ScalarAsync("SELECT DB_NAME()");return Results.Ok(new{connected=true,database="SuvidhaPOS"});}catch(Exception e){return Results.Problem(e.Message);}});
app.MapGet("/api/dashboard",async(Db db)=>Results.Ok(await db.QuerySingleAsync(@"
SELECT CAST(ISNULL(SUM(CASE WHEN CAST(BillDate AS date)=CAST(GETDATE() AS date) AND Status='Completed' THEN GrandTotal ELSE 0 END),0) AS decimal(18,2)) TodaySales,
COUNT(CASE WHEN CAST(BillDate AS date)=CAST(GETDATE() AS date) AND Status='Completed' THEN 1 END) TodayBills,
CAST(ISNULL(SUM(CASE WHEN CAST(BillDate AS date)=CAST(GETDATE() AS date) AND Status='Completed' THEN GrandTotal-Tax-TotalCost ELSE 0 END),0) AS decimal(18,2)) GrossProfit,
CAST(ISNULL(SUM(CASE WHEN CAST(BillDate AS date)=CAST(GETDATE() AS date) AND Status='Completed' THEN Tax ELSE 0 END),0) AS decimal(18,2)) TodayTax,
(SELECT COUNT(*) FROM Products WHERE IsActive=1) TotalProducts,
(SELECT CAST(ISNULL(SUM(Quantity),0) AS decimal(18,3)) FROM ProductBatches) TotalStock,
(SELECT CAST(ISNULL(SUM(Quantity*CostPrice),0) AS decimal(18,2)) FROM ProductBatches) StockValue,
(SELECT COUNT(*) FROM ProductBatches WHERE ExpiryDate<CAST(GETDATE() AS date) AND Quantity>0) ExpiredBatches,
(SELECT COUNT(*) FROM ProductBatches WHERE ExpiryDate>=CAST(GETDATE() AS date) AND ExpiryDate<=DATEADD(day,30,CAST(GETDATE() AS date)) AND Quantity>0) Expiring30,
(SELECT COUNT(*) FROM Products p WHERE p.IsActive=1 AND p.MinStock>ISNULL((SELECT SUM(b.Quantity) FROM ProductBatches b WHERE b.ProductId=p.Id),0)) LowStock,
(SELECT COUNT(*) FROM Customers WHERE IsActive=1) Customers,
(SELECT COUNT(*) FROM Suppliers WHERE IsActive=1) Suppliers FROM Sales")));
app.MapGet("/api/dashboard/chart",async(Db db,int days=7)=>Results.Ok(await db.QueryAsync(@"SELECT CONVERT(varchar(10),CAST(BillDate AS date),23) [Date],CAST(ISNULL(SUM(GrandTotal),0) AS decimal(18,2)) Sales,COUNT(*) Bills FROM Sales WHERE Status='Completed' AND BillDate>=DATEADD(day,-@days+1,CAST(GETDATE() AS date)) GROUP BY CAST(BillDate AS date) ORDER BY [Date]",new SqlParameter("@days",days))));

app.MapGet("/api/products",async(Db db,string? q,int page=1,int size=200)=>{q??="";page=Math.Max(1,page);return Results.Ok(await db.QueryAsync(@"SELECT p.Id,p.Name,p.Barcode,p.Sku,p.Category,p.Unit,p.Hsn,p.GstRate,p.Mrp,p.PurchasePrice,p.SalePrice,p.MinStock,p.MaxStock,p.LocationCode,p.RackName,p.ShelfName,p.TrackBatch,p.TrackExpiry,CAST(ISNULL((SELECT SUM(b.Quantity) FROM ProductBatches b WHERE b.ProductId=p.Id),0) AS decimal(18,3)) Stock FROM Products p WHERE p.IsActive=1 AND (@q='' OR p.Name LIKE @like OR ISNULL(p.Barcode,'') LIKE @like OR ISNULL(p.Sku,'') LIKE @like OR ISNULL(p.Category,'') LIKE @like) ORDER BY p.Name OFFSET @off ROWS FETCH NEXT @size ROWS ONLY",new SqlParameter("@q",q),new SqlParameter("@like","%"+q+"%"),new SqlParameter("@off",(page-1)*size),new SqlParameter("@size",size)));});
app.MapGet("/api/products/{id:int}",async(Db db,int id)=>Results.Ok(await db.QuerySingleAsync("SELECT * FROM Products WHERE Id=@id",new SqlParameter("@id",id))));
app.MapGet("/api/products/identity-check",async(Db db,string? name,string? barcode,int excludeId=0)=>{
 var n=(name??"").Trim(); var b=(barcode??"").Trim();
 var row=await db.QuerySingleAsync(@"SELECT TOP 1 Id,Name,Barcode,
 CASE WHEN @n<>'' AND UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) THEN 'NAME' ELSE 'BARCODE' END ConflictType
 FROM Products WHERE IsActive=1 AND Id<>@id AND
 ((@n<>'' AND UPPER(LTRIM(RTRIM(Name)))=UPPER(@n)) OR
  (@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b)))
 ORDER BY Id",P("@n",n),P("@b",b),P("@id",excludeId));
 return Results.Ok(new{duplicate=row.Count>0,conflict=row});
});

app.MapPost("/api/products",async(Db db,ProductRequest x)=>{
 var name=(x.Name??"").Trim(); var barcode=string.IsNullOrWhiteSpace(x.Barcode)?null:x.Barcode.Trim();
 if(string.IsNullOrWhiteSpace(name))return Results.BadRequest(new{message="Product name is required"});
 var dup=await db.QuerySingleAsync(@"SELECT TOP 1 Id,Name,Barcode,
 CASE WHEN UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) THEN 'Item Name' ELSE 'Barcode' END ConflictType
 FROM Products WHERE IsActive=1 AND
 (UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) OR (@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b)))",
 P("@n",name),P("@b",barcode??""));
 if(dup.Count>0)return Results.BadRequest(new{message=$"Duplicate {dup["ConflictType"]}: existing item '{dup["Name"]}' already uses this value.",duplicate=true,conflict=dup});
 try{
  var id=await db.ScalarAsync(@"INSERT Products(Name,Barcode,Sku,CategoryId,Category,Unit,Hsn,GstRate,Mrp,PurchasePrice,SalePrice,MinStock,MaxStock,LocationCode,RackName,ShelfName,TrackBatch,TrackExpiry)
 VALUES(@n,@b,@s,@cid,@cat,@u,@h,@g,@m,@pp,@sp,@min,@max,@loc,@rack,@shelf,@tb,@te);
 SELECT CAST(SCOPE_IDENTITY() AS int)",
 P("@n",name),P("@b",barcode),P("@s",string.IsNullOrWhiteSpace(x.Sku)?null:x.Sku.Trim()),P("@cid",x.CategoryId),P("@cat",x.Category),P("@u",x.Unit??"PCS"),P("@h",x.Hsn),P("@g",x.GstRate),P("@m",x.Mrp),P("@pp",x.PurchasePrice),P("@sp",x.SalePrice),P("@min",x.MinStock),P("@max",x.MaxStock),P("@loc",x.LocationCode),P("@rack",x.RackName),P("@shelf",x.ShelfName),P("@tb",x.TrackBatch),P("@te",x.TrackExpiry));
  return Results.Ok(new{id});
 }catch(SqlException e)when(e.Number==2601||e.Number==2627){return Results.BadRequest(new{message="Duplicate barcode is not allowed",duplicate=true});}
});

app.MapPut("/api/products/{id:int}",async(Db db,int id,ProductRequest x)=>{
 var name=(x.Name??"").Trim(); var barcode=string.IsNullOrWhiteSpace(x.Barcode)?null:x.Barcode.Trim();
 if(string.IsNullOrWhiteSpace(name))return Results.BadRequest(new{message="Product name is required"});
 var dup=await db.QuerySingleAsync(@"SELECT TOP 1 Id,Name,Barcode,
 CASE WHEN UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) THEN 'Item Name' ELSE 'Barcode' END ConflictType
 FROM Products WHERE IsActive=1 AND Id<>@id AND
 (UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) OR (@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b)))",
 P("@n",name),P("@b",barcode??""),P("@id",id));
 if(dup.Count>0)return Results.BadRequest(new{message=$"Duplicate {dup["ConflictType"]}: existing item '{dup["Name"]}' already uses this value.",duplicate=true,conflict=dup});
 try{
  await db.ScalarAsync(@"UPDATE Products SET Name=@n,Barcode=@b,Sku=@s,CategoryId=@cid,Category=@cat,Unit=@u,Hsn=@h,GstRate=@g,Mrp=@m,PurchasePrice=@pp,SalePrice=@sp,MinStock=@min,MaxStock=@max,LocationCode=@loc,RackName=@rack,ShelfName=@shelf,TrackBatch=@tb,TrackExpiry=@te WHERE Id=@id",
  P("@n",name),P("@b",barcode),P("@s",string.IsNullOrWhiteSpace(x.Sku)?null:x.Sku.Trim()),P("@cid",x.CategoryId),P("@cat",x.Category),P("@u",x.Unit??"PCS"),P("@h",x.Hsn),P("@g",x.GstRate),P("@m",x.Mrp),P("@pp",x.PurchasePrice),P("@sp",x.SalePrice),P("@min",x.MinStock),P("@max",x.MaxStock),P("@loc",x.LocationCode),P("@rack",x.RackName),P("@shelf",x.ShelfName),P("@tb",x.TrackBatch),P("@te",x.TrackExpiry),P("@id",id));
  return Results.Ok(new{updated=true});
 }catch(SqlException e)when(e.Number==2601||e.Number==2627){return Results.BadRequest(new{message="Duplicate barcode is not allowed",duplicate=true});}
});

app.MapPost("/api/products/bulk-edit",async(Db db,ProductBulkEditRequest x)=>{
 if(x.Rows is null||x.Rows.Count==0)return Results.BadRequest(new{message="No item rows supplied"});
 var conflicts=new List<object>();
 var seenNames=new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);
 var seenBarcodes=new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);
 foreach(var r in x.Rows){
   var n=(r.Name??"").Trim();var bc=(r.Barcode??"").Trim();
   if(string.IsNullOrWhiteSpace(n)){conflicts.Add(new{r.Id,type="NAME",value=n,message="Item name is required"});continue;}
   if(seenNames.TryGetValue(n,out var otherName))conflicts.Add(new{r.Id,type="NAME",value=n,message=$"Duplicate item name in bulk edit; also used by row {otherName}"});
   else seenNames[n]=r.Id;
   if(!string.IsNullOrWhiteSpace(bc)){
     if(seenBarcodes.TryGetValue(bc,out var otherBarcode))conflicts.Add(new{r.Id,type="BARCODE",value=bc,message=$"Duplicate barcode in bulk edit; also used by row {otherBarcode}"});
     else seenBarcodes[bc]=r.Id;
   }
 }
 foreach(var r in x.Rows){
   var n=(r.Name??"").Trim();var bc=(r.Barcode??"").Trim();
   if(string.IsNullOrWhiteSpace(n))continue;
   var dup=await db.QuerySingleAsync(@"SELECT TOP 1 Id,Name,Barcode,
    CASE WHEN UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) THEN 'NAME' ELSE 'BARCODE' END ConflictType
    FROM Products WHERE IsActive=1 AND Id<>@id AND
    (UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) OR (@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b)))",
    P("@n",n),P("@b",bc),P("@id",r.Id));
   if(dup.Count>0)conflicts.Add(new{r.Id,type=dup["ConflictType"]?.ToString(),value=dup["ConflictType"]?.ToString()=="NAME"?n:bc,message=$"Conflicts with existing item '{dup["Name"]}' (ID {dup["Id"]})"});
 }
 if(conflicts.Count>0)return Results.BadRequest(new{message=$"Bulk edit blocked: {conflicts.Count} duplicate/invalid row(s). Fix highlighted item names/barcodes first.",duplicate=true,conflicts});
 using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
 try{
   foreach(var r in x.Rows){
     var cmd=new SqlCommand(@"UPDATE Products SET Name=@n,Barcode=@b,Sku=@s,Category=@cat,Unit=@u,Hsn=@h,GstRate=@g,Mrp=@m,PurchasePrice=@pp,SalePrice=@sp,MinStock=@min,MaxStock=@max,LocationCode=@loc,RackName=@rack,ShelfName=@shelf WHERE Id=@id AND IsActive=1",c,tx);
     cmd.Parameters.AddRange(new[]{P("@n",r.Name.Trim()),P("@b",string.IsNullOrWhiteSpace(r.Barcode)?null:r.Barcode.Trim()),P("@s",string.IsNullOrWhiteSpace(r.Sku)?null:r.Sku.Trim()),P("@cat",r.Category),P("@u",r.Unit??"PCS"),P("@h",r.Hsn),P("@g",r.GstRate),P("@m",r.Mrp),P("@pp",r.PurchasePrice),P("@sp",r.SalePrice),P("@min",r.MinStock),P("@max",r.MaxStock),P("@loc",r.LocationCode),P("@rack",r.RackName),P("@shelf",r.ShelfName),P("@id",r.Id)});
     await cmd.ExecuteNonQueryAsync();
   }
   await tx.CommitAsync();return Results.Ok(new{updated=x.Rows.Count});
 }catch(SqlException e)when(e.Number==2601||e.Number==2627){await tx.RollbackAsync();return Results.BadRequest(new{message="Bulk edit blocked because a duplicate barcode was detected.",duplicate=true});}
 catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
});

app.MapDelete("/api/products/{id:int}",async(Db db,int id)=>{await db.ScalarAsync("UPDATE Products SET IsActive=0 WHERE Id=@id",P("@id",id));return Results.Ok(new{deleted=true});});
app.MapGet("/api/categories",async(Db db)=>Results.Ok(await db.QueryAsync("SELECT Id,Name FROM Categories WHERE IsActive=1 ORDER BY Name")));
app.MapPost("/api/categories",async(Db db,NameRequest x)=>Results.Ok(new{id=await db.ScalarAsync("INSERT Categories(Name) VALUES(@n);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@n",x.Name))}));
app.MapGet("/api/batches/{productId:int}",async(Db db,int productId)=>Results.Ok(await db.QueryAsync("SELECT b.*,DATEDIFF(day,CAST(GETDATE() AS date),b.ExpiryDate) DaysLeft FROM ProductBatches b WHERE b.ProductId=@p ORDER BY b.ExpiryDate",P("@p",productId))));
app.MapGet("/api/stock",async(Db db,string? q)=>Results.Ok(await db.QueryAsync(@"SELECT p.Id,p.Name,p.Barcode,p.Category,p.Unit,p.MinStock,CAST(ISNULL(SUM(b.Quantity),0) AS decimal(18,3)) Stock,CAST(ISNULL(SUM(CASE WHEN b.ExpiryDate>=GETDATE() THEN b.Quantity ELSE 0 END),0) AS decimal(18,3)) SaleableStock,CAST(ISNULL(SUM(b.Quantity*b.CostPrice),0) AS decimal(18,2)) StockValue,CASE WHEN ISNULL(SUM(b.Quantity),0)<=0 THEN 'OUT' WHEN ISNULL(SUM(b.Quantity),0)<=p.MinStock THEN 'LOW' ELSE 'OK' END Status FROM Products p LEFT JOIN ProductBatches b ON b.ProductId=p.Id WHERE p.IsActive=1 AND (@q='' OR p.Name LIKE @l OR ISNULL(p.Barcode,'') LIKE @l) GROUP BY p.Id,p.Name,p.Barcode,p.Category,p.Unit,p.MinStock ORDER BY Stock,p.Name",P("@q",q??""),P("@l","%"+(q??"")+"%"))));
app.MapGet("/api/expiry",async(Db db,int days=90)=>Results.Ok(await db.QueryAsync(@"SELECT b.Id,p.Id ProductId,p.Name,p.Barcode,p.Category,b.BatchNo,b.Quantity,b.CostPrice,b.SellingPrice,b.Mrp,b.ManufactureDate,b.ExpiryDate,DATEDIFF(day,CAST(GETDATE() AS date),b.ExpiryDate) DaysLeft FROM ProductBatches b JOIN Products p ON p.Id=b.ProductId WHERE b.Quantity>0 AND b.ExpiryDate<=DATEADD(day,@d,CAST(GETDATE() AS date)) ORDER BY b.ExpiryDate",P("@d",days))));

app.MapGet("/api/customers",async(Db db,string? q)=>Results.Ok(await db.QueryAsync("SELECT c.*,CAST(c.OpeningBalance+ISNULL((SELECT SUM(GrandTotal-PaidAmount) FROM Sales s WHERE s.CustomerId=c.Id AND s.Status='Completed'),0)-ISNULL((SELECT SUM(Amount) FROM CustomerPayments cp WHERE cp.CustomerId=c.Id),0) AS decimal(18,2)) Balance FROM Customers c WHERE c.IsActive=1 AND (@q='' OR c.Name LIKE @l OR ISNULL(c.Phone,'') LIKE @l) ORDER BY c.Name",P("@q",q??""),P("@l","%"+(q??"")+"%"))));
app.MapPost("/api/customers",async(Db db,PartyRequest x)=>Results.Ok(new{id=await db.ScalarAsync("INSERT Customers(Name,Phone,Address,GstIn,OpeningBalance) VALUES(@n,@p,@a,@g,@o);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@n",x.Name),P("@p",x.Phone),P("@a",x.Address),P("@g",x.GstIn),P("@o",x.OpeningBalance))}));
app.MapGet("/api/suppliers",async(Db db,string? q)=>Results.Ok(await db.QueryAsync("SELECT s.*,CAST(s.OpeningBalance+ISNULL((SELECT SUM(GrandTotal-PaidAmount) FROM Purchases p WHERE p.SupplierId=s.Id),0)-ISNULL((SELECT SUM(Amount) FROM SupplierPayments sp WHERE sp.SupplierId=s.Id),0) AS decimal(18,2)) Balance FROM Suppliers s WHERE s.IsActive=1 AND (@q='' OR s.Name LIKE @l OR ISNULL(s.Phone,'') LIKE @l) ORDER BY s.Name",P("@q",q??""),P("@l","%"+(q??"")+"%"))));
app.MapPost("/api/suppliers",async(Db db,PartyRequest x)=>Results.Ok(new{id=await db.ScalarAsync("INSERT Suppliers(Name,Phone,Address,GstIn,OpeningBalance) VALUES(@n,@p,@a,@g,@o);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@n",x.Name),P("@p",x.Phone),P("@a",x.Address),P("@g",x.GstIn),P("@o",x.OpeningBalance))}));

app.MapPost("/api/purchases",async(Db db,PurchaseRequest x)=>{if(x.Lines.Count==0)return Results.BadRequest(new{message="Add purchase items"});
var outletProfile=await db.QuerySingleAsync("SELECT TOP 1 StoreType,RequireBatch,RequireExpiry FROM OutletMaster ORDER BY Id");
var purchaseStoreType=outletProfile.GetValueOrDefault("StoreType")?.ToString()??"Retail Shop";
var pharma=purchaseStoreType.Contains("Pharmacy",StringComparison.OrdinalIgnoreCase)||purchaseStoreType.Contains("Medical",StringComparison.OrdinalIgnoreCase);
var requireBatch=pharma||Convert.ToBoolean(outletProfile.GetValueOrDefault("RequireBatch")??false);
if(requireBatch&&x.Lines.Any(l=>string.IsNullOrWhiteSpace(l.BatchNo)))return Results.BadRequest(new{message="Batch No is mandatory for this outlet"});using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();try{decimal sub=x.Lines.Sum(a=>a.Qty*a.Cost);decimal tax=x.Lines.Sum(a=>a.Qty*a.Cost*a.TaxRate/100);decimal total=Math.Max(0,sub-x.Discount+tax);var cmd=new SqlCommand("INSERT Purchases(InvoiceNo,SupplierId,SupplierName,PurchaseDate,SubTotal,Discount,Tax,GrandTotal,PaymentMode,PaidAmount,Notes) OUTPUT INSERTED.Id VALUES(@i,@sid,@sn,GETDATE(),@sub,@d,@t,@g,@pm,@paid,@notes)",c,tx);cmd.Parameters.AddRange(new[]{P("@i",x.InvoiceNo??("PUR-"+DateTime.Now.ToString("yyyyMMddHHmmss"))),P("@sid",x.SupplierId),P("@sn",x.SupplierName??"Walk-in Supplier"),P("@sub",sub),P("@d",x.Discount),P("@t",tax),P("@g",total),P("@pm",x.PaymentMode??"Credit"),P("@paid",x.PaidAmount),P("@notes",x.Notes)});int pid=(int)await cmd.ExecuteScalarAsync();foreach(var l in x.Lines){int bid;cmd=new SqlCommand("INSERT ProductBatches(ProductId,BatchNo,Quantity,CostPrice,SellingPrice,Mrp,ManufactureDate,ExpiryDate) OUTPUT INSERTED.Id VALUES(@p,@b,@q,@c,@s,@m,@md,@ed)",c,tx);cmd.Parameters.AddRange(new[]{P("@p",l.ProductId),P("@b",l.BatchNo??("B-"+Guid.NewGuid().ToString("N")[..10])),P("@q",l.Qty+l.FreeQuantity),P("@c",l.Cost),P("@s",l.SalePrice),P("@m",l.Mrp),P("@md",l.ManufactureDate),P("@ed",l.ExpiryDate)});bid=(int)await cmd.ExecuteScalarAsync();cmd=new SqlCommand("INSERT PurchaseLines(PurchaseId,ProductId,BatchId,Quantity,FreeQuantity,CostPrice,Mrp,SalePrice,TaxRate,TaxAmount,UnitPurchased,PurchasedQty,TotalBaseQty,RatePerPurchasedUnit) VALUES(@i,@p,@b,@q,@f,@c,@m,@s,@r,@t,@up,@pq,@tb,@rpu);INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId) VALUES(@p,@b,'PURCHASE',@stockQty,'PURCHASE',@i)",c,tx);cmd.Parameters.AddRange(new[]{P("@i",pid),P("@p",l.ProductId),P("@b",bid),P("@q",l.Qty),P("@f",l.FreeQuantity),P("@c",l.Cost),P("@m",l.Mrp),P("@s",l.SalePrice),P("@r",l.TaxRate),P("@t",l.Qty*l.Cost*l.TaxRate/100),P("@up",l.UnitPurchased),P("@pq",l.PurchasedQty>0?l.PurchasedQty:l.Qty),P("@tb",l.TotalBaseQty>0?l.TotalBaseQty:l.Qty),P("@rpu",l.RatePerPurchasedUnit>0?l.RatePerPurchasedUnit:l.Cost),P("@stockQty",l.Qty+l.FreeQuantity)});await cmd.ExecuteNonQueryAsync();}await tx.CommitAsync();return Results.Ok(new{id=pid,total});}catch{await tx.RollbackAsync();throw;}});

app.MapPost("/api/sales",async(Db db,SaleRequest x)=>{if(x.Lines.Count==0)return Results.BadRequest(new{message="Add items to bill"});using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();try{foreach(var l in x.Lines){var ck=new SqlCommand("SELECT ISNULL(SUM(Quantity),0) FROM ProductBatches WITH(UPDLOCK) WHERE ProductId=@p AND Quantity>0 AND ExpiryDate>=CAST(GETDATE() AS date)",c,tx);ck.Parameters.Add(P("@p",l.ProductId));if(Convert.ToDecimal(await ck.ExecuteScalarAsync())<l.Qty)return Results.BadRequest(new{message="Insufficient saleable stock for product "+l.ProductId});}decimal sub=x.Lines.Sum(a=>a.Qty*a.SalePrice);decimal tax=x.Lines.Sum(a=>a.Qty*a.SalePrice*a.TaxRate/100);decimal total=Math.Max(0,sub-x.Discount+tax);decimal cost=0;var cmd=new SqlCommand("INSERT Sales(InvoiceNo,BillDate,CustomerId,CustomerName,PaymentMode,SubTotal,Discount,Tax,GrandTotal,TotalCost,PaidAmount,Notes) VALUES(@i,GETDATE(),@cid,@cn,@pm,@sub,@d,@t,@g,0,@paid,@notes);SELECT CAST(SCOPE_IDENTITY() AS int);",c,tx);cmd.Parameters.AddRange(new[]{P("@i","INV-"+DateTime.Now.ToString("yyyyMMddHHmmssfff")),P("@cid",x.CustomerId),P("@cn",x.CustomerName??"Walk-in Customer"),P("@pm",x.PaymentMode??"Cash"),P("@sub",sub),P("@d",x.Discount),P("@t",tax),P("@g",total),P("@paid",x.PaidAmount<=0?total:x.PaidAmount),P("@notes",x.Notes)});int sid=(int)await cmd.ExecuteScalarAsync();foreach(var l in x.Lines){decimal rem=l.Qty;while(rem>0){cmd=new SqlCommand("SELECT TOP 1 Id,Quantity,CostPrice FROM ProductBatches WITH(UPDLOCK,ROWLOCK) WHERE ProductId=@p AND Quantity>0 AND ExpiryDate>=CAST(GETDATE() AS date) ORDER BY ExpiryDate,Id",c,tx);cmd.Parameters.Add(P("@p",l.ProductId));using var r=await cmd.ExecuteReaderAsync();if(!await r.ReadAsync())throw new Exception("Stock changed during billing");int bid=r.GetInt32(0);decimal avail=r.GetDecimal(1),cp=r.GetDecimal(2);await r.CloseAsync();decimal take=Math.Min(rem,avail);cost+=take*cp;cmd=new SqlCommand("UPDATE ProductBatches SET Quantity=Quantity-@q WHERE Id=@b;INSERT SaleLines(SaleId,ProductId,BatchId,Quantity,SalePrice,CostPrice,TaxRate,Discount,UnitSold,SoldQuantity,TotalBaseQtyDeducted,RatePerSoldUnit) VALUES(@s,@p,@b,@q,@sp,@cp,@tr,@di,@us,@sq,@tb,@rsu);INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId) VALUES(@p,@b,'SALE',-@q,'SALE',@s)",c,tx);cmd.Parameters.AddRange(new[]{P("@q",take),P("@b",bid),P("@s",sid),P("@p",l.ProductId),P("@sp",l.SalePrice),P("@cp",cp),P("@tr",l.TaxRate),P("@di",l.Discount),P("@us",l.UnitSold),P("@sq",l.SoldQty>0?l.SoldQty*(take/(l.BaseQty>0?l.BaseQty:l.Qty)):take),P("@tb",take),P("@rsu",l.RatePerSoldUnit>0?l.RatePerSoldUnit:l.SalePrice)});await cmd.ExecuteNonQueryAsync();rem-=take;}}cmd=new SqlCommand("UPDATE Sales SET TotalCost=@c WHERE Id=@id",c,tx);cmd.Parameters.AddRange(new[]{P("@c",cost),P("@id",sid)});await cmd.ExecuteNonQueryAsync();await tx.CommitAsync();cmd=new SqlCommand("SELECT InvoiceNo FROM Sales WHERE Id=@id",c,tx); cmd.Parameters.Add(P("@id",sid)); var inv=await cmd.ExecuteScalarAsync(); return Results.Ok(new{id=sid,total,invoiceNo=inv?.ToString()??""});}catch{await tx.RollbackAsync();throw;}});

app.MapGet("/api/sales",async(Db db,string? from,string? to)=>Results.Ok(await db.QueryAsync(@"SELECT TOP 500 s.*,CAST(s.GrandTotal-s.Tax-s.TotalCost AS decimal(18,2)) Profit FROM Sales s WHERE (@f='' OR s.BillDate>=CAST(@f AS date)) AND (@t='' OR s.BillDate<DATEADD(day,1,CAST(@t AS date))) ORDER BY s.Id DESC",P("@f",from??""),P("@t",to??""))));
app.MapGet("/api/purchases",async(Db db,string? from,string? to)=>Results.Ok(await db.QueryAsync(@"SELECT TOP 500 p.*,CAST(p.GrandTotal-p.PaidAmount AS decimal(18,2)) Balance FROM Purchases p WHERE (@f='' OR p.PurchaseDate>=CAST(@f AS date)) AND (@t='' OR p.PurchaseDate<DATEADD(day,1,CAST(@t AS date))) ORDER BY p.Id DESC",P("@f",from??""),P("@t",to??""))));

app.MapPost("/api/sales-return",async(Db db,ReturnRequest x)=>await DoReturn(db,x,false));
app.MapPost("/api/purchase-return",async(Db db,ReturnRequest x)=>await DoReturn(db,x,true));
app.MapGet("/api/expenses",async(Db db)=>Results.Ok(await db.QueryAsync("SELECT TOP 500 * FROM Expenses ORDER BY Id DESC")));
app.MapPost("/api/expenses",async(Db db,ExpenseRequest x)=>Results.Ok(new{id=await db.ScalarAsync("INSERT Expenses(ExpenseDate,Category,Amount,PaymentMode,Notes) VALUES(COALESCE(@d,GETDATE()),@c,@a,@p,@n);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@d",x.Date),P("@c",x.Category),P("@a",x.Amount),P("@p",x.PaymentMode),P("@n",x.Notes))}));

app.MapGet("/api/reports/sales-summary",async(Db db,string? from,string? to)=>Results.Ok(await db.QueryAsync(@"SELECT CONVERT(varchar(10),CAST(BillDate AS date),23) [Date],COUNT(*) Bills,CAST(SUM(SubTotal) AS decimal(18,2)) SubTotal,CAST(SUM(Discount) AS decimal(18,2)) Discount,CAST(SUM(Tax) AS decimal(18,2)) Tax,CAST(SUM(GrandTotal) AS decimal(18,2)) Sales,CAST(SUM(GrandTotal-Tax-TotalCost) AS decimal(18,2)) Profit FROM Sales WHERE Status='Completed' AND (@f='' OR BillDate>=CAST(@f AS date)) AND (@t='' OR BillDate<DATEADD(day,1,CAST(@t AS date))) GROUP BY CAST(BillDate AS date) ORDER BY [Date] DESC",P("@f",from??""),P("@t",to??""))));
app.MapGet("/api/reports/top-items",async(Db db,string? from,string? to)=>Results.Ok(await db.QueryAsync(@"SELECT TOP 30 p.Name,p.Barcode,CAST(SUM(sl.Quantity) AS decimal(18,3)) Qty,CAST(SUM(sl.Quantity*sl.SalePrice) AS decimal(18,2)) Sales,CAST(SUM(sl.Quantity*(sl.SalePrice-sl.CostPrice)) AS decimal(18,2)) Profit FROM SaleLines sl JOIN Sales s ON s.Id=sl.SaleId JOIN Products p ON p.Id=sl.ProductId WHERE s.Status='Completed' AND (@f='' OR s.BillDate>=CAST(@f AS date)) AND (@t='' OR s.BillDate<DATEADD(day,1,CAST(@t AS date))) GROUP BY p.Name,p.Barcode ORDER BY Qty DESC",P("@f",from??""),P("@t",to??""))));
app.MapGet("/api/reports/payment",async(Db db,string? from,string? to)=>Results.Ok(await db.QueryAsync(@"SELECT PaymentMode,COUNT(*) Bills,CAST(SUM(GrandTotal) AS decimal(18,2)) Amount FROM Sales WHERE Status='Completed' AND (@f='' OR BillDate>=CAST(@f AS date)) AND (@t='' OR BillDate<DATEADD(day,1,CAST(@t AS date))) GROUP BY PaymentMode ORDER BY Amount DESC",P("@f",from??""),P("@t",to??""))));
app.MapGet("/api/stock-ledger/{productId:int}",async(Db db,int productId)=>Results.Ok(await db.QueryAsync("SELECT TOP 500 l.*,p.Name,b.BatchNo FROM StockLedger l JOIN Products p ON p.Id=l.ProductId LEFT JOIN ProductBatches b ON b.Id=l.BatchId WHERE l.ProductId=@p ORDER BY l.Id DESC",P("@p",productId))));
app.MapPost("/api/stock-adjustment",async(Db db,AdjustmentRequest x)=>{using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();try{var cmd=new SqlCommand("INSERT ProductBatches(ProductId,BatchNo,Quantity,CostPrice,SellingPrice,Mrp,ExpiryDate) OUTPUT INSERTED.Id VALUES(@p,@b,@q,@c,@s,@m,@e)",c,tx);cmd.Parameters.AddRange(new[]{P("@p",x.ProductId),P("@b",x.BatchNo??("ADJ-"+DateTime.Now.ToString("yyyyMMddHHmmss"))),P("@q",x.Quantity),P("@c",x.CostPrice),P("@s",x.SalePrice),P("@m",x.Mrp),P("@e",x.ExpiryDate??DateTime.Today.AddYears(1))});int bid=(int)await cmd.ExecuteScalarAsync();cmd=new SqlCommand("INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,Notes) VALUES(@p,@b,'ADJUSTMENT',@q,'ADJUSTMENT',@n)",c,tx);cmd.Parameters.AddRange(new[]{P("@p",x.ProductId),P("@b",bid),P("@q",x.Quantity),P("@n",x.Notes)});await cmd.ExecuteNonQueryAsync();await tx.CommitAsync();return Results.Ok(new{bid});}catch{await tx.RollbackAsync();throw;}});

app.MapPost("/api/backup",async(Db db,BackupRequest x)=>{var folder=string.IsNullOrWhiteSpace(x.Folder)?Path.Combine(AppContext.BaseDirectory,"Backups"):x.Folder;Directory.CreateDirectory(folder);var file=Path.Combine(folder,$"SuvidhaPOS_{DateTime.Now:yyyyMMdd_HHmmss}.bak");await db.ScalarAsync($"BACKUP DATABASE [SuvidhaPOS] TO DISK=N'{file.Replace("'","''")}' WITH INIT,COMPRESSION");return Results.Ok(new{file});});
app.MapGet("/api/settings",async(Db db)=>Results.Ok(await db.QuerySingleAsync("SELECT TOP 1 * FROM Settings ORDER BY Id")));
app.MapPut("/api/settings",async(Db db,SettingsRequest x)=>{await db.ScalarAsync("UPDATE Settings SET CompanyName=@n,Address=@a,Phone=@p,Gstin=@g,InvoicePrefix=@i,UpdatedAt=SYSDATETIME() WHERE Id=(SELECT TOP 1 Id FROM Settings)",P("@n",x.CompanyName),P("@a",x.Address),P("@p",x.Phone),P("@g",x.Gstin),P("@i",x.InvoicePrefix));return Results.Ok(new{updated=true});});


app.MapGet("/api/sales/{id:int}",async(Db db,int id)=>Results.Ok(await db.QuerySingleAsync("SELECT s.*,CAST(s.GrandTotal-s.Tax-s.TotalCost AS decimal(18,2)) Profit FROM Sales s WHERE s.Id=@id",P("@id",id))));
app.MapGet("/api/sales/{id:int}/lines",async(Db db,int id)=>Results.Ok(await db.QueryAsync("SELECT sl.*,p.Name,p.Barcode,b.BatchNo,b.ExpiryDate FROM SaleLines sl JOIN Products p ON p.Id=sl.ProductId JOIN ProductBatches b ON b.Id=sl.BatchId WHERE sl.SaleId=@id",P("@id",id))));
app.MapPost("/api/sales/{id:int}/void",async(Db db,HttpContext ctx,int id,VoidRequest x)=>{var u=(SessionUser)ctx.Items["User"]!;using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();try{var cmd=new SqlCommand("SELECT Status FROM Sales WITH(UPDLOCK) WHERE Id=@id",c,tx);cmd.Parameters.Add(P("@id",id));var status=(await cmd.ExecuteScalarAsync())?.ToString();if(status!="Completed")return Results.BadRequest(new{message="Only completed bills can be cancelled"});cmd=new SqlCommand("SELECT ProductId,BatchId,Quantity FROM SaleLines WHERE SaleId=@id",c,tx);cmd.Parameters.Add(P("@id",id));using var r=await cmd.ExecuteReaderAsync();var lines=new List<(int p,int b,decimal q)>();while(await r.ReadAsync())lines.Add((r.GetInt32(0),r.GetInt32(1),r.GetDecimal(2)));await r.CloseAsync();foreach(var l in lines){cmd=new SqlCommand("UPDATE ProductBatches SET Quantity=Quantity+@q WHERE Id=@b;INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes) VALUES(@p,@b,'VOID_SALE',@q,'SALE',@id,@n)",c,tx);cmd.Parameters.AddRange(new[]{P("@q",l.q),P("@b",l.b),P("@p",l.p),P("@id",id),P("@n",x.Reason)});await cmd.ExecuteNonQueryAsync();}cmd=new SqlCommand("UPDATE Sales SET Status='Cancelled',CancelledAt=SYSDATETIME(),CancelledBy=@u WHERE Id=@id",c,tx);cmd.Parameters.AddRange(new[]{P("@u",u.UserName),P("@id",id)});await cmd.ExecuteNonQueryAsync();cmd=new SqlCommand("INSERT AuditLogs(UserName,Action,Entity,EntityId,Details) VALUES(@u,'BILL_CANCELLED','Sale',@id,@d)",c,tx);cmd.Parameters.AddRange(new[]{P("@u",u.UserName),P("@id",id),P("@d",x.Reason??"Bill cancelled; stock restored batch-wise")});await cmd.ExecuteNonQueryAsync();await tx.CommitAsync();return Results.Ok(new{cancelled=true,stockRestored=true});}catch{await tx.RollbackAsync();throw;}});
app.MapGet("/api/customers/{id:int}/ledger",async(Db db,int id)=>Results.Ok(await db.QueryAsync(@"SELECT 'SALE' Type,InvoiceNo RefNo,BillDate TxnDate,GrandTotal Debit,CAST(0 AS decimal(18,2)) Credit FROM Sales WHERE CustomerId=@id AND Status='Completed' UNION ALL SELECT 'RECEIPT',CONCAT('REC-',Id),PaymentDate,CAST(0 AS decimal(18,2)),Amount FROM CustomerPayments WHERE CustomerId=@id ORDER BY TxnDate DESC",P("@id",id))));
app.MapPost("/api/customers/{id:int}/payments",async(Db db,int id,PartyPaymentRequest x)=>Results.Ok(new{id=await db.ScalarAsync("INSERT CustomerPayments(CustomerId,Amount,PaymentMode,ReferenceNo,Notes) VALUES(@id,@a,@m,@r,@n);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@id",id),P("@a",x.Amount),P("@m",x.PaymentMode),P("@r",x.ReferenceNo),P("@n",x.Notes))}));
app.MapGet("/api/suppliers/{id:int}/ledger",async(Db db,int id)=>Results.Ok(await db.QueryAsync(@"SELECT 'PURCHASE' Type,InvoiceNo RefNo,PurchaseDate TxnDate,GrandTotal Debit,CAST(0 AS decimal(18,2)) Credit FROM Purchases WHERE SupplierId=@id UNION ALL SELECT 'PAYMENT',CONCAT('PAY-',Id),PaymentDate,CAST(0 AS decimal(18,2)),Amount FROM SupplierPayments WHERE SupplierId=@id ORDER BY TxnDate DESC",P("@id",id))));
app.MapPost("/api/suppliers/{id:int}/payments",async(Db db,int id,PartyPaymentRequest x)=>Results.Ok(new{id=await db.ScalarAsync("INSERT SupplierPayments(SupplierId,Amount,PaymentMode,ReferenceNo,Notes) VALUES(@id,@a,@m,@r,@n);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@id",id),P("@a",x.Amount),P("@m",x.PaymentMode),P("@r",x.ReferenceNo),P("@n",x.Notes))}));
app.MapGet("/api/day-closing",async(Db db)=>Results.Ok(await db.QuerySingleAsync(@"SELECT CAST(GETDATE() AS date) BusinessDate,CAST(ISNULL((SELECT SUM(GrandTotal) FROM Sales WHERE CAST(BillDate AS date)=CAST(GETDATE() AS date) AND Status='Completed' AND PaymentMode='Cash'),0) AS decimal(18,2)) CashSales,CAST(ISNULL((SELECT SUM(Amount) FROM CustomerPayments WHERE CAST(PaymentDate AS date)=CAST(GETDATE() AS date) AND PaymentMode='Cash'),0) AS decimal(18,2)) CashIn,CAST(ISNULL((SELECT SUM(Amount) FROM Expenses WHERE CAST(ExpenseDate AS date)=CAST(GETDATE() AS date) AND PaymentMode='Cash'),0) AS decimal(18,2)) CashOut")));
app.MapPost("/api/day-closing",async(Db db,HttpContext ctx,DayClosingRequest x)=>{var u=(SessionUser)ctx.Items["User"]!;return Results.Ok(new{id=await db.ScalarAsync("IF EXISTS(SELECT 1 FROM DayClosings WHERE BusinessDate=CAST(GETDATE() AS date)) BEGIN UPDATE DayClosings SET OpeningCash=@o,CashSales=@s,CashIn=@i,CashOut=@out,ClosingCash=@c,ClosedBy=@u,ClosedAt=SYSDATETIME(),Notes=@n WHERE BusinessDate=CAST(GETDATE() AS date); SELECT Id FROM DayClosings WHERE BusinessDate=CAST(GETDATE() AS date); END ELSE BEGIN INSERT DayClosings(BusinessDate,OpeningCash,CashSales,CashIn,CashOut,ClosingCash,ClosedBy,ClosedAt,Notes) VALUES(CAST(GETDATE() AS date),@o,@s,@i,@out,@c,@u,SYSDATETIME(),@n); SELECT CAST(SCOPE_IDENTITY() AS int); END",P("@o",x.OpeningCash),P("@s",x.CashSales),P("@i",x.CashIn),P("@out",x.CashOut),P("@c",x.ClosingCash),P("@u",u.UserName),P("@n",x.Notes))});});
app.MapGet("/api/users",async(Db db)=>Results.Ok(await db.QueryAsync("SELECT Id,UserName,DisplayName,Role,IsActive,MustChangePassword,CreatedAt FROM Users ORDER BY UserName")));
app.MapPost("/api/users",async(Db db,CreateUserRequest x)=>{if(string.IsNullOrWhiteSpace(x.UserName)||string.IsNullOrWhiteSpace(x.Password))return Results.BadRequest(new{message="Username and password are required"});return Results.Ok(new{id=await db.ScalarAsync("INSERT Users(UserName,DisplayName,PasswordHash,Role,MustChangePassword) VALUES(@u,@d,@p,@r,1);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@u",x.UserName.Trim()),P("@d",x.DisplayName??x.UserName),P("@p",HashPassword(x.Password)),P("@r",x.Role??"Cashier"))});});
app.MapPost("/api/users/{id:int}/toggle",async(Db db,int id)=>{await db.ScalarAsync("UPDATE Users SET IsActive=1-IsActive WHERE Id=@id",P("@id",id));return Results.Ok(new{updated=true});});
app.MapGet("/api/app-settings",async(Db db)=>Results.Ok(await db.QueryAsync("SELECT [Key],[Value] FROM AppSettings ORDER BY [Key]")));
app.MapGet("/api/app-settings/{key}",async(Db db,string key)=>{
 var row=await db.QuerySingleAsync("SELECT TOP 1 [Key],[Value] FROM AppSettings WHERE [Key]=@k",P("@k",key));
 return row.Count==0?Results.Ok(new{Key=key,Value=(string?)null}):Results.Ok(row);
});
app.MapPut("/api/app-settings/{key}",async(Db db,string key,SettingRequest x)=>{await db.ScalarAsync("MERGE AppSettings AS t USING (SELECT @k [Key],@v [Value]) s ON t.[Key]=s.[Key] WHEN MATCHED THEN UPDATE SET [Value]=s.[Value] WHEN NOT MATCHED THEN INSERT([Key],[Value]) VALUES(s.[Key],s.[Value]);",P("@k",key),P("@v",x.Value));return Results.Ok(new{saved=true});});
app.MapGet("/api/reports/stock-movement",async(Db db,string? from,string? to)=>Results.Ok(await db.QueryAsync(@"SELECT l.MovementType,COUNT(*) Transactions,CAST(SUM(CASE WHEN l.Quantity>0 THEN l.Quantity ELSE 0 END) AS decimal(18,3)) InQty,CAST(SUM(CASE WHEN l.Quantity<0 THEN -l.Quantity ELSE 0 END) AS decimal(18,3)) OutQty FROM StockLedger l WHERE (@f='' OR l.CreatedAt>=CAST(@f AS date)) AND (@t='' OR l.CreatedAt<DATEADD(day,1,CAST(@t AS date))) GROUP BY l.MovementType ORDER BY Transactions DESC",P("@f",from??""),P("@t",to??""))));
app.MapGet("/api/reports/gst",async(Db db,string? from,string? to)=>Results.Ok(await db.QueryAsync(@"SELECT CAST(BillDate AS date) Date,CAST(SUM(SubTotal) AS decimal(18,2)) Taxable,CAST(SUM(Tax) AS decimal(18,2)) Tax,CAST(SUM(GrandTotal) AS decimal(18,2)) Total FROM Sales WHERE Status='Completed' AND (@f='' OR BillDate>=CAST(@f AS date)) AND (@t='' OR BillDate<DATEADD(day,1,CAST(@t AS date))) GROUP BY CAST(BillDate AS date) ORDER BY Date DESC",P("@f",from??""),P("@t",to??""))));


app.MapGet("/api/outlet",async(Db db)=>Results.Ok(await db.QuerySingleAsync("SELECT TOP 1 * FROM OutletMaster ORDER BY Id")));
app.MapPut("/api/outlet",async(Db db,OutletRequest x)=>{
 var storeType=(x.StoreType??"").Trim();
 if(storeType.Equals("Gold & Diamond Jewellery",StringComparison.OrdinalIgnoreCase)||storeType.Equals("Silver Jewellery",StringComparison.OrdinalIgnoreCase)) storeType="Jewellery Shop";
 if(string.IsNullOrWhiteSpace(storeType)) storeType="Retail Shop";
 var row=await db.QuerySingleAsync("SELECT TOP 1 Id FROM OutletMaster ORDER BY Id");
 if(row.Count==0) return Results.Ok(new{id=await db.ScalarAsync("INSERT OutletMaster(OutletName,StoreType,Address,Phone,Gstin,RequireBatch,RequireExpiry,DefaultUnit) VALUES(@n,@t,@a,@p,@g,@b,@e,@u);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@n",x.OutletName),P("@t",storeType),P("@a",x.Address),P("@p",x.Phone),P("@g",x.Gstin),P("@b",x.RequireBatch),P("@e",x.RequireExpiry),P("@u",x.DefaultUnit??"PCS"))});
 var id=Convert.ToInt32(row["Id"]); await db.ScalarAsync("UPDATE OutletMaster SET OutletName=@n,StoreType=@t,Address=@a,Phone=@p,Gstin=@g,RequireBatch=@b,RequireExpiry=@e,DefaultUnit=@u,UpdatedAt=SYSDATETIME() WHERE Id=@id",P("@n",x.OutletName),P("@t",storeType),P("@a",x.Address),P("@p",x.Phone),P("@g",x.Gstin),P("@b",x.RequireBatch),P("@e",x.RequireExpiry),P("@u",x.DefaultUnit??"PCS"),P("@id",id)); return Results.Ok(new{saved=true,id});
});
app.MapGet("/api/outlet-types",()=>Results.Ok(new[]{
 "Retail Shop","Pharmacy / Medical Store","Agriculture Product Store","Seeds & Fertilizer Store","Pesticide / Crop Care Store","General Store","Grocery Store","Supermarket","Wholesale Store","Distributor","FMCG Store","Cosmetics & Beauty Store","Personal Care Store","Stationery Store","Hardware Store","Electrical Store","Electronics Store","Mobile & Accessories Store","Garments Store","Footwear Store","Hardware & Sanitary Store","Auto Parts Store","Pet / Veterinary Store","Dairy Store","Bakery","Restaurant / Cafe","Sweet Shop","Department Store","Jewellery Shop","Other"
}));
app.MapGet("/api/products/location-search",async(Db db,string? q)=>Results.Ok(await db.QueryAsync(@"SELECT TOP 50 p.Id,p.Name,p.Barcode,p.Sku,p.Category,p.LocationCode,p.RackName,p.ShelfName,CAST(ISNULL((SELECT SUM(b.Quantity) FROM ProductBatches b WHERE b.ProductId=p.Id AND b.ExpiryDate>=CAST(GETDATE() AS date)),0) AS decimal(18,3)) Stock FROM Products p WHERE p.IsActive=1 AND (@q='' OR p.Name LIKE @l OR ISNULL(p.Barcode,'') LIKE @l OR ISNULL(p.Sku,'') LIKE @l OR ISNULL(p.LocationCode,'') LIKE @l) ORDER BY CASE WHEN p.Barcode=@q THEN 0 WHEN p.Sku=@q THEN 1 ELSE 2 END,p.Name",P("@q",q??""),P("@l","%"+(q??"")+"%"))));

app.MapGet("/api/ai/config",async(Db db)=>{
 var envKey=Environment.GetEnvironmentVariable("OPENAI_API_KEY");
 var saved=(await db.QuerySingleAsync("SELECT [Value] FROM AppSettings WHERE [Key]='OpenAI.ApiKey'")).GetValueOrDefault("Value")?.ToString();
 var key=!string.IsNullOrWhiteSpace(envKey)?envKey:saved;
 var modelSetting=(await db.QuerySingleAsync("SELECT [Value] FROM AppSettings WHERE [Key]='OpenAI.Model'")).GetValueOrDefault("Value")?.ToString();
 var model=Environment.GetEnvironmentVariable("OPENAI_MODEL")??modelSetting??"gpt-5.6-luna";
 string? masked=null;
 if(!string.IsNullOrWhiteSpace(key)) masked=key.Length<=8?"••••••••":key[..3]+"••••••"+key[^4..];
 return Results.Ok(new{configured=!string.IsNullOrWhiteSpace(key),model,source=!string.IsNullOrWhiteSpace(envKey)?"Environment":"AppSettings",maskedKey=masked});
});

app.MapPost("/api/ai/test",async(Db db)=>{
 var envKey=Environment.GetEnvironmentVariable("OPENAI_API_KEY");
 var saved=(await db.QuerySingleAsync("SELECT [Value] FROM AppSettings WHERE [Key]='OpenAI.ApiKey'")).GetValueOrDefault("Value")?.ToString();
 var apiKey=!string.IsNullOrWhiteSpace(envKey)?envKey:saved;
 var modelSetting=(await db.QuerySingleAsync("SELECT [Value] FROM AppSettings WHERE [Key]='OpenAI.Model'")).GetValueOrDefault("Value")?.ToString();
 var model=Environment.GetEnvironmentVariable("OPENAI_MODEL")??modelSetting??"gpt-5.6-luna";
 if(string.IsNullOrWhiteSpace(apiKey)) return Results.BadRequest(new{message="OpenAI API key is not configured"});
 try{
  using var http=new HttpClient{Timeout=TimeSpan.FromSeconds(45)};
  http.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",apiKey);
  var payload=new{model,input="Reply with exactly: OK"};
  var resp=await http.PostAsJsonAsync("https://api.openai.com/v1/responses",payload);
  var raw=await resp.Content.ReadAsStringAsync();
  if(!resp.IsSuccessStatusCode) return Results.BadRequest(new{message=OpenAiErrorMessage(raw,(int)resp.StatusCode),status=(int)resp.StatusCode,model});
  return Results.Ok(new{ok=true,model});
 }catch(TaskCanceledException){return Results.BadRequest(new{message="OpenAI connection timed out. Check internet/firewall/proxy."});}
 catch(HttpRequestException ex){return Results.BadRequest(new{message="Cannot reach OpenAI API: "+ex.Message});}
});

app.MapPost("/api/ai/import",async(HttpRequest req,Db db,HttpContext ctx)=>{
 if(!req.HasFormContentType) return Results.BadRequest(new{message="Use multipart/form-data"});
 var form=await req.ReadFormAsync();
 var mode=(form["mode"].ToString()??"items").ToLowerInvariant();
 var message=form["message"].ToString();
 var file=form.Files.FirstOrDefault();

 var envKey=Environment.GetEnvironmentVariable("OPENAI_API_KEY");
 var savedKey=(await db.QuerySingleAsync("SELECT [Value] FROM AppSettings WHERE [Key]='OpenAI.ApiKey'")).GetValueOrDefault("Value")?.ToString();
 var apiKey=!string.IsNullOrWhiteSpace(envKey)?envKey:savedKey;
 if(string.IsNullOrWhiteSpace(apiKey)) return Results.BadRequest(new{message="OpenAI API key is not configured. Open Settings → AI Configuration and save a key."});

 string? filename=file?.FileName;
 string mime=file?.ContentType??"";
 byte[]? bytes=null;
 string extracted="";
 if(file is not null){
   if(file.Length<=0) return Results.BadRequest(new{message="Selected file is empty"});
   if(file.Length>20*1024*1024) return Results.BadRequest(new{message="File is too large. Maximum 20 MB."});
   using var ms=new MemoryStream(); await file.CopyToAsync(ms); bytes=ms.ToArray();
   var ext=Path.GetExtension(filename??"").ToLowerInvariant();
   if(mime.Contains("spreadsheet")||mime.Contains("excel")||ext==".xlsx") extracted=ExtractXlsx(bytes);
   else if(mime.StartsWith("text/")||ext==".csv"||ext==".txt") extracted=Encoding.UTF8.GetString(bytes);
   else if(string.IsNullOrWhiteSpace(mime)){
      mime=ext switch{".pdf"=>"application/pdf",".png"=>"image/png",".jpg" or ".jpeg"=>"image/jpeg",".webp"=>"image/webp",_=>"application/octet-stream"};
   }
 }
 if(file is null && string.IsNullOrWhiteSpace(message)) return Results.BadRequest(new{message="Choose a file or enter a message/notes first"});

 var prompt = "You are an inventory data extraction assistant for a billing/POS system. Convert the supplied source into clean JSON only. Mode: " + mode + ". Store data may contain product master rows or a purchase invoice. Extract as many rows as confidently possible. Never invent barcode, batch, expiry, price, quantity or GST; use null/0 when missing. Preserve exact rack/location codes. For medicines preserve batch and expiry exactly when visible. Return a JSON object with a rows array. Each row should contain name, barcode, sku, category, unit, hsn, gstRate, mrp, purchasePrice, salePrice, minStock, locationCode, rackName, shelfName, batchNo, manufactureDate, expiryDate, quantity, freeQuantity, confidence and notes. Dates must be YYYY-MM-DD. JSON only, no markdown.\nUser message: " + message + "\nExtracted spreadsheet/text content: " + extracted;

 using var http=new HttpClient{Timeout=TimeSpan.FromMinutes(3)};
 http.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",apiKey);
 string? openAiFileId=null;
 try{
   object? contentPart=null;
   if(bytes is not null){
     var ext=Path.GetExtension(filename??"").ToLowerInvariant();
     if(mime.StartsWith("image/")){
       var dataUrl=$"data:{mime};base64,{Convert.ToBase64String(bytes)}";
       contentPart=new{type="input_image",image_url=dataUrl,detail="high"};
     }else if(ext==".pdf"||mime.Equals("application/pdf",StringComparison.OrdinalIgnoreCase)){
       using var upload=new MultipartFormDataContent();
       upload.Add(new StringContent("user_data"),"purpose");
       var fc=new ByteArrayContent(bytes);
       fc.Headers.ContentType=new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
       upload.Add(fc,"file",string.IsNullOrWhiteSpace(filename)?"import.pdf":filename);
       var ur=await http.PostAsync("https://api.openai.com/v1/files",upload);
       var uraw=await ur.Content.ReadAsStringAsync();
       if(!ur.IsSuccessStatusCode) return Results.BadRequest(new{message="PDF upload to OpenAI failed: "+OpenAiErrorMessage(uraw,(int)ur.StatusCode),status=(int)ur.StatusCode});
       using var ud=JsonDocument.Parse(uraw);
       openAiFileId=ud.RootElement.TryGetProperty("id",out var fid)?fid.GetString():null;
       if(string.IsNullOrWhiteSpace(openAiFileId)) return Results.BadRequest(new{message="OpenAI accepted the PDF but did not return a file id"});
       contentPart=new{type="input_file",file_id=openAiFileId};
     }else if(string.IsNullOrWhiteSpace(extracted)){
       contentPart=new{type="input_file",filename=filename??"import.dat",file_data=Convert.ToBase64String(bytes)};
     }
   }

   object[] content=contentPart is null
     ? new object[]{new{type="input_text",text=prompt}}
     : new object[]{new{type="input_text",text=prompt},contentPart};

   var modelSetting=(await db.QuerySingleAsync("SELECT [Value] FROM AppSettings WHERE [Key]='OpenAI.Model'")).GetValueOrDefault("Value")?.ToString();
   var model=Environment.GetEnvironmentVariable("OPENAI_MODEL")??modelSetting??"gpt-5.6-luna";
   var payload=new{model,input=new[]{new{role="user",content}}};
   var resp=await http.PostAsJsonAsync("https://api.openai.com/v1/responses",payload);
   var raw=await resp.Content.ReadAsStringAsync();
   if(!resp.IsSuccessStatusCode) return Results.BadRequest(new{message=OpenAiErrorMessage(raw,(int)resp.StatusCode),status=(int)resp.StatusCode,model});

   using var doc=JsonDocument.Parse(raw);
   var output=doc.RootElement.TryGetProperty("output_text",out var ot)?ot.GetString():ExtractResponseText(doc.RootElement);
   if(string.IsNullOrWhiteSpace(output)) return Results.BadRequest(new{message="OpenAI returned no text. Try another PDF/image or use Test AI Connection."});
   var json=CleanJson(output);
   using var rowsDoc=JsonDocument.Parse(json);
   if(!rowsDoc.RootElement.TryGetProperty("rows",out var rows)||rows.ValueKind!=JsonValueKind.Array) return Results.BadRequest(new{message="AI response did not contain a rows array"});
   var list=JsonSerializer.Deserialize<List<AiImportRow>>(rows.GetRawText(),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??new();

   var u=(SessionUser)ctx.Items["User"]!;
   await db.ScalarAsync("INSERT AIImportLogs(ImportType,FileName,RowsFound,RowsAccepted,UserName,Notes) VALUES(@t,@f,@rf,@ra,@u,@n)",P("@t",mode),P("@f",filename),P("@rf",list.Count),P("@ra",list.Count),P("@u",u.UserName),P("@n","AI extraction preview; not auto-posted"));
   return Results.Ok(new{mode,fileName=filename,rows=list,model,warning="Review every row before posting. AI extraction is a draft and must not be treated as authoritative for medicines, prices, batch or expiry."});
 }catch(JsonException ex){return Results.BadRequest(new{message="AI returned invalid JSON: "+ex.Message});}
 catch(TaskCanceledException){return Results.BadRequest(new{message="AI extraction timed out. Try a smaller PDF/image or check internet connection."});}
 catch(HttpRequestException ex){return Results.BadRequest(new{message="Cannot reach OpenAI API: "+ex.Message});}
 finally{
   if(!string.IsNullOrWhiteSpace(openAiFileId)){
     try{await http.DeleteAsync("https://api.openai.com/v1/files/"+Uri.EscapeDataString(openAiFileId));}catch{}
   }
 }
});

app.MapPost("/api/ai/import/items/commit",async(Db db,HttpContext ctx,AiCommitRequest x)=>{
 if(x.Rows.Count==0)return Results.BadRequest(new{message="No rows to import"});
 int added=0,skipped=0;var conflicts=new List<object>();
 var seenNames=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
 var seenBarcodes=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
 foreach(var r in x.Rows){
   var name=(r.Name??"").Trim();var barcode=(r.Barcode??"").Trim();
   if(string.IsNullOrWhiteSpace(name)){skipped++;conflicts.Add(new{type="NAME",value=name,message="Blank item name skipped"});continue;}
   if(!seenNames.Add(name)){skipped++;conflicts.Add(new{type="NAME",value=name,message="Duplicate item name inside AI import skipped"});continue;}
   if(!string.IsNullOrWhiteSpace(barcode)&&!seenBarcodes.Add(barcode)){skipped++;conflicts.Add(new{type="BARCODE",value=barcode,message=$"Duplicate barcode inside AI import skipped: {barcode}"});continue;}
   var existing=await db.QuerySingleAsync(@"SELECT TOP 1 Id,Name,Barcode,
    CASE WHEN UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) THEN 'NAME' ELSE 'BARCODE' END ConflictType
    FROM Products WHERE IsActive=1 AND
    (UPPER(LTRIM(RTRIM(Name)))=UPPER(@n) OR (@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b)))",
    P("@n",name),P("@b",barcode));
   if(existing.Count>0){
     skipped++;conflicts.Add(new{type=existing["ConflictType"]?.ToString(),value=existing["ConflictType"]?.ToString()=="NAME"?name:barcode,message=$"Skipped duplicate: '{name}' conflicts with existing item '{existing["Name"]}'",existingId=existing["Id"]});continue;
   }
   try{
    await db.ScalarAsync(@"INSERT Products(Name,Barcode,Sku,Category,Unit,Hsn,GstRate,Mrp,PurchasePrice,SalePrice,MinStock,LocationCode,RackName,ShelfName)
     VALUES(@n,@b,@s,@cat,@u,@h,@g,@m,@pp,@sp,@min,@loc,@rack,@shelf)",
     P("@n",name),P("@b",string.IsNullOrWhiteSpace(barcode)?null:barcode),P("@s",string.IsNullOrWhiteSpace(r.Sku)?null:r.Sku.Trim()),P("@cat",r.Category),P("@u",r.Unit??"PCS"),P("@h",r.Hsn),P("@g",r.GstRate),P("@m",r.Mrp),P("@pp",r.PurchasePrice),P("@sp",r.SalePrice),P("@min",r.MinStock),P("@loc",r.LocationCode),P("@rack",r.RackName),P("@shelf",r.ShelfName));
    added++;
   }catch(SqlException e)when(e.Number==2601||e.Number==2627){skipped++;conflicts.Add(new{type="BARCODE",value=barcode,message=$"Duplicate barcode skipped: {barcode}"});}
 }
 return Results.Ok(new{added,updated=0,skipped,conflicts,message=$"Imported {added}; skipped {skipped} duplicate/invalid row(s)."});
});

app.MapPost("/api/ai/import/purchase/commit",async(Db db,HttpContext ctx,AiPurchaseCommitRequest x)=>{
 if(x.Rows.Count==0)return Results.BadRequest(new{message="No purchase rows to import"});
 var outlet=await db.QuerySingleAsync("SELECT TOP 1 RequireBatch,RequireExpiry,DefaultUnit FROM OutletMaster ORDER BY Id"); bool reqBatch=Convert.ToBoolean(outlet.GetValueOrDefault("RequireBatch")??false), reqExpiry=Convert.ToBoolean(outlet.GetValueOrDefault("RequireExpiry")??false);
 using var c=db.CreateConnection(); await c.OpenAsync(); using var tx=c.BeginTransaction();
 try{
  decimal sub=0,tax=0; var prepared=new List<(AiImportRow r,int pid,int bid)>();
  foreach(var r in x.Rows){if(string.IsNullOrWhiteSpace(r.Name)||r.Quantity<=0)continue; var prod=await FindProduct(c,tx,r); int pid;
   if(prod is null){var cmd0=new SqlCommand("INSERT Products(Name,Barcode,Sku,Category,Unit,Hsn,GstRate,Mrp,PurchasePrice,SalePrice,MinStock,LocationCode,RackName,ShelfName) OUTPUT INSERTED.Id VALUES(@n,@b,@s,@cat,@u,@h,@g,@m,@pp,@sp,0,@loc,@rack,@shelf)",c,tx);cmd0.Parameters.AddRange(new[]{P("@n",r.Name),P("@b",r.Barcode),P("@s",r.Sku),P("@cat",r.Category),P("@u",r.Unit??(outlet.GetValueOrDefault("DefaultUnit")?.ToString()??"PCS")),P("@h",r.Hsn),P("@g",r.GstRate),P("@m",r.Mrp),P("@pp",r.PurchasePrice),P("@sp",r.SalePrice),P("@loc",r.LocationCode),P("@rack",r.RackName),P("@shelf",r.ShelfName)});pid=(int)await cmd0.ExecuteScalarAsync();}else pid=Convert.ToInt32(prod["Id"]);
   if(reqBatch && string.IsNullOrWhiteSpace(r.BatchNo))throw new Exception("Batch number required for outlet type"); if(reqExpiry && string.IsNullOrWhiteSpace(r.ExpiryDate))throw new Exception("Expiry date required for outlet type");
   var batch=r.BatchNo??("AI-"+Guid.NewGuid().ToString("N")[..10]); DateTime expiry=DateTime.TryParse(r.ExpiryDate,out var ed)?ed:new DateTime(2099,12,31); DateTime? mfg=DateTime.TryParse(r.ManufactureDate,out var md)?md:null;
   var cmd=new SqlCommand("INSERT ProductBatches(ProductId,BatchNo,Quantity,CostPrice,SellingPrice,Mrp,ManufactureDate,ExpiryDate) OUTPUT INSERTED.Id VALUES(@p,@b,@q,@c,@s,@m,@md,@ed)",c,tx);cmd.Parameters.AddRange(new[]{P("@p",pid),P("@b",batch),P("@q",r.Quantity+r.FreeQuantity),P("@c",r.PurchasePrice),P("@s",r.SalePrice),P("@m",r.Mrp),P("@md",mfg),P("@ed",expiry)});int bid=(int)await cmd.ExecuteScalarAsync();prepared.Add((r,pid,bid)); sub+=r.Quantity*r.PurchasePrice; tax+=r.Quantity*r.PurchasePrice*r.GstRate/100;
  }
  decimal total=Math.Max(0,sub+tax-x.Discount); var cmdh=new SqlCommand("INSERT Purchases(InvoiceNo,SupplierId,SupplierName,PurchaseDate,SubTotal,Discount,Tax,GrandTotal,PaymentMode,PaidAmount,Notes) OUTPUT INSERTED.Id VALUES(@i,@sid,@sn,GETDATE(),@sub,@d,@t,@g,@pm,@paid,@n)",c,tx);cmdh.Parameters.AddRange(new[]{P("@i",x.InvoiceNo??("AI-PUR-"+DateTime.Now.ToString("yyyyMMddHHmmss"))),P("@sid",x.SupplierId),P("@sn",x.SupplierName??"AI Import"),P("@sub",sub),P("@d",x.Discount),P("@t",tax),P("@g",total),P("@pm",x.PaymentMode??"Credit"),P("@paid",x.PaidAmount),P("@n","Created from AI import preview")});int purId=(int)await cmdh.ExecuteScalarAsync();
  foreach(var z in prepared){var r=z.r;var lc=new SqlCommand("INSERT PurchaseLines(PurchaseId,ProductId,BatchId,Quantity,FreeQuantity,CostPrice,Mrp,SalePrice,TaxRate,TaxAmount) VALUES(@i,@p,@b,@q,@f,@c,@m,@s,@r,@t);INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes) VALUES(@p,@b,'PURCHASE',@stock,'PURCHASE',@i,'AI import')",c,tx);lc.Parameters.AddRange(new[]{P("@i",purId),P("@p",z.pid),P("@b",z.bid),P("@q",r.Quantity),P("@f",r.FreeQuantity),P("@c",r.PurchasePrice),P("@m",r.Mrp),P("@s",r.SalePrice),P("@r",r.GstRate),P("@t",r.Quantity*r.PurchasePrice*r.GstRate/100),P("@stock",r.Quantity+r.FreeQuantity)});await lc.ExecuteNonQueryAsync();}
  await tx.CommitAsync(); return Results.Ok(new{id=purId,total,rows=prepared.Count});
 }catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
});

SuvidhaPOS.Premium.UnitMasterModules.Map(app);
SuvidhaPOS.Premium.BackupMasterModules.Map(app);
SuvidhaPOS.Premium.SpecializedModules.Map(app);
SuvidhaPOS.Premium.ReportTaxModules.Map(app);
SuvidhaPOS.Premium.BillManagementModules.Map(app);
SuvidhaPOS.Premium.PremiumFeatureModules.Map(app);

app.Run();



static async Task<Dictionary<string,object?>?> FindProduct(SqlConnection c,SqlTransaction tx,AiImportRow r){var cmd=new SqlCommand(@"SELECT TOP 1 Id FROM Products WHERE IsActive=1 AND ((@b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b)) OR (@s<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Sku,''))))=UPPER(@s)) OR UPPER(LTRIM(RTRIM(Name)))=UPPER(@n)) ORDER BY CASE WHEN @b<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Barcode,''))))=UPPER(@b) THEN 0 WHEN @s<>'' AND UPPER(LTRIM(RTRIM(ISNULL(Sku,''))))=UPPER(@s) THEN 1 ELSE 2 END,Id",c,tx);cmd.Parameters.AddRange(new[]{P("@b",(r.Barcode??"").Trim()),P("@s",(r.Sku??"").Trim()),P("@n",(r.Name??"").Trim())});using var rd=await cmd.ExecuteReaderAsync();if(!await rd.ReadAsync())return null;return new Dictionary<string,object?>{{"Id",rd.GetValue(0)}};}
static string OpenAiErrorMessage(string raw,int status)
{
 try{
  using var d=JsonDocument.Parse(raw);
  if(d.RootElement.TryGetProperty("error",out var e)){
    var msg=e.TryGetProperty("message",out var m)?m.GetString():null;
    var code=e.TryGetProperty("code",out var c)?c.ToString():null;
    if(!string.IsNullOrWhiteSpace(msg)) return $"OpenAI API {status}: {msg}"+(string.IsNullOrWhiteSpace(code)?"":$" ({code})");
  }
  if(d.RootElement.TryGetProperty("message",out var top)) return $"OpenAI API {status}: {top.GetString()}";
 }catch{}
 return $"OpenAI API request failed with HTTP {status}";
}
static string CleanJson(string s){var a=s.IndexOf('{');var b=s.LastIndexOf('}');return a>=0&&b>a?s[a..(b+1)]:s;}
static string ExtractResponseText(JsonElement root){var sb=new StringBuilder();if(root.TryGetProperty("output",out var output)&&output.ValueKind==JsonValueKind.Array){foreach(var item in output.EnumerateArray())if(item.TryGetProperty("content",out var c)&&c.ValueKind==JsonValueKind.Array)foreach(var part in c.EnumerateArray())if(part.TryGetProperty("text",out var t))sb.Append(t.GetString());}return sb.ToString();}
static string ExtractXlsx(byte[] bytes){using var ms=new MemoryStream(bytes);using var zip=new ZipArchive(ms,ZipArchiveMode.Read);var shared=new List<string>();var ss=zip.GetEntry("xl/sharedStrings.xml");if(ss is not null){using var sr=new StreamReader(ss.Open());var x=XDocument.Load(sr);XNamespace ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";foreach(var si in x.Descendants(ns+"si"))shared.Add(string.Concat(si.Descendants(ns+"t").Select(t=>t.Value)));}var sh=zip.GetEntry("xl/worksheets/sheet1.xml");if(sh is null)return "";using var rd=new StreamReader(sh.Open());var doc=XDocument.Load(rd);XNamespace n="http://schemas.openxmlformats.org/spreadsheetml/2006/main";var sb=new StringBuilder();foreach(var row in doc.Descendants(n+"row")){var cells=new List<string>();foreach(var c in row.Elements(n+"c")){var v=c.Element(n+"v")?.Value??"";if((string?)c.Attribute("t")=="s"&&int.TryParse(v,out var i)&&i<shared.Count)v=shared[i];cells.Add(v);}sb.AppendLine(string.Join(" | ",cells));}return sb.ToString();}
static SqlParameter P(string name,object? value)=>new(name,value??DBNull.Value);
static async Task<IResult> DoReturn(Db db,ReturnRequest x,bool purchase){
 if(x.Lines.Count==0)return Results.BadRequest(new{message="Add return items"});
 using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
 try{
  var total=x.Lines.Sum(a=>a.Qty*a.Rate);var head=purchase?"PurchaseReturns":"SalesReturns";var lines=purchase?"PurchaseReturnLines":"SalesReturnLines";var movement=purchase?"PURCHASE_RETURN":"SALES_RETURN";var no=(purchase?"PRT-":"SRT-")+DateTime.Now.ToString("yyyyMMddHHmmssfff");
  var cmd=new SqlCommand($"INSERT {head}(ReturnNo,ReturnDate,{(purchase?"SupplierName":"CustomerName")},GrandTotal,Reason) OUTPUT INSERTED.Id VALUES(@no,GETDATE(),@party,@t,@r)",c,tx);cmd.Parameters.AddRange(new[]{P("@no",no),P("@party",x.PartyName),P("@t",total),P("@r",x.Reason)});int rid=(int)await cmd.ExecuteScalarAsync();
  foreach(var l in x.Lines){
   if(l.Qty<=0)throw new Exception("Return quantity must be positive");
   cmd=new SqlCommand("SELECT Quantity FROM ProductBatches WITH(UPDLOCK,ROWLOCK) WHERE Id=@b AND ProductId=@p",c,tx);cmd.Parameters.AddRange(new[]{P("@b",l.BatchId),P("@p",l.ProductId)});var obj=await cmd.ExecuteScalarAsync();if(obj is null)throw new Exception("Invalid batch");var qty=Convert.ToDecimal(obj);
   if(purchase && qty<l.Qty)throw new Exception("Purchase return exceeds available batch stock");
   var delta=purchase?-l.Qty:l.Qty;
   cmd=new SqlCommand("UPDATE ProductBatches SET Quantity=Quantity+@delta WHERE Id=@b;INSERT "+lines+"(ReturnId,ProductId,BatchId,Quantity,Rate) VALUES(@r,@p,@b,@q,@rate);INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,ReferenceId,Notes) VALUES(@p,@b,@m,@q,@rt,@r,@n)",c,tx);
   cmd.Parameters.AddRange(new[]{P("@delta",delta),P("@b",l.BatchId),P("@r",rid),P("@p",l.ProductId),P("@q",l.Qty),P("@rate",l.Rate),P("@m",movement),P("@rt",purchase?"PURCHASE_RETURN":"SALES_RETURN"),P("@n",x.Reason)});await cmd.ExecuteNonQueryAsync();
  }
  await tx.CommitAsync();return Results.Ok(new{id=rid,no,total});
 }catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
}

static string HashPassword(string password){var salt=RandomNumberGenerator.GetBytes(16);var hash=Rfc2898DeriveBytes.Pbkdf2(password,salt,120000,HashAlgorithmName.SHA256,32);return $"PBKDF2$120000${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";}
static bool VerifyPassword(string password,string stored){try{var a=stored.Split('$');if(a.Length!=4||a[0]!="PBKDF2")return false;var it=int.Parse(a[1]);var salt=Convert.FromBase64String(a[2]);var expected=Convert.FromBase64String(a[3]);var actual=Rfc2898DeriveBytes.Pbkdf2(password,salt,it,HashAlgorithmName.SHA256,expected.Length);return CryptographicOperations.FixedTimeEquals(actual,expected);}catch{return false;}}
record SessionUser(int Id,string UserName,string DisplayName,string Role);
record LoginRequest(string? UserName,string? Password);
record PasswordChangeRequest(string? CurrentPassword,string? NewPassword);
record VoidRequest(string? Reason);
record PartyPaymentRequest(decimal Amount,string PaymentMode,string? ReferenceNo,string? Notes);
record DayClosingRequest(decimal OpeningCash,decimal CashSales,decimal CashIn,decimal CashOut,decimal ClosingCash,string? Notes);
record CreateUserRequest(string UserName,string? DisplayName,string Password,string? Role);
record SettingRequest(string? Value);
record ProductRequest(string Name,string? Barcode,string? Sku,int? CategoryId,string? Category,string? Unit,string? Hsn,decimal GstRate,decimal Mrp,decimal PurchasePrice,decimal SalePrice,decimal MinStock,decimal MaxStock,string? LocationCode=null,string? RackName=null,string? ShelfName=null,bool TrackBatch=true,bool TrackExpiry=true);
record ProductBulkEditRow(int Id,string Name,string? Barcode,string? Sku,string? Category,string? Unit,string? Hsn,decimal GstRate,decimal Mrp,decimal PurchasePrice,decimal SalePrice,decimal MinStock,decimal MaxStock,string? LocationCode,string? RackName,string? ShelfName);
record ProductBulkEditRequest(List<ProductBulkEditRow> Rows);
record OutletRequest(string OutletName,string StoreType,string? Address,string? Phone,string? Gstin,bool RequireBatch,bool RequireExpiry,string? DefaultUnit);
record AiImportRow(string? Name,string? Barcode,string? Sku,string? Category,string? Unit,string? Hsn,decimal GstRate,decimal Mrp,decimal PurchasePrice,decimal SalePrice,decimal MinStock,string? LocationCode,string? RackName,string? ShelfName,string? BatchNo,string? ManufactureDate,string? ExpiryDate,decimal Quantity,decimal FreeQuantity,decimal Confidence,string? Notes);
record AiCommitRequest(List<AiImportRow> Rows);
record AiPurchaseCommitRequest(string? InvoiceNo,int? SupplierId,string? SupplierName,string? PaymentMode,decimal PaidAmount,decimal Discount,List<AiImportRow> Rows);
record NameRequest(string Name); record PartyRequest(string Name,string? Phone,string? Address,string? GstIn,decimal OpeningBalance);
record PurchaseRequest(string? InvoiceNo,int? SupplierId,string? SupplierName,string? PaymentMode,decimal PaidAmount,decimal Discount,string? Notes,List<PurchaseLine> Lines);
record PurchaseLine(int ProductId,string? BatchNo,decimal Qty,decimal FreeQuantity,decimal Cost,decimal SalePrice,decimal Mrp,decimal TaxRate,DateTime? ManufactureDate,DateTime ExpiryDate,string? UnitPurchased=null,decimal PurchasedQty=0m,decimal TotalBaseQty=0m,decimal RatePerPurchasedUnit=0m);
record SaleRequest(int? CustomerId,string? CustomerName,string? PaymentMode,decimal PaidAmount,decimal Discount,string? Notes,List<SaleLine> Lines);
record SaleLine(int ProductId,decimal Qty,decimal SalePrice,decimal TaxRate,decimal Discount,string? UnitSold=null,decimal SoldQty=0m,decimal BaseQty=0m,decimal RatePerSoldUnit=0m);
record ReturnRequest(string? PartyName,string? Reason,List<ReturnLine> Lines); record ReturnLine(int ProductId,int BatchId,decimal Qty,decimal Rate);
record ExpenseRequest(DateTime? Date,string Category,decimal Amount,string PaymentMode,string? Notes); record AdjustmentRequest(int ProductId,string? BatchNo,decimal Quantity,decimal CostPrice,decimal SalePrice,decimal Mrp,DateTime? ExpiryDate,string? Notes);
record BackupRequest(string? Folder); record SettingsRequest(string CompanyName,string? Address,string? Phone,string? Gstin,string InvoicePrefix);
