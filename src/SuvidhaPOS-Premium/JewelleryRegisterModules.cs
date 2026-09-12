using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;
using System.Data;
using System.Text.Json;

namespace SuvidhaPOS.Premium;
public static class JewelleryRegisterModules
{
 static readonly JsonSerializerOptions Json=new(){PropertyNameCaseInsensitive=true};
 static SqlParameter P(string n,object? value)=>new(n,value??DBNull.Value);
 static SqlCommand Cmd(SqlConnection c,SqlTransaction tx,string sql,params SqlParameter[] parameters){var cmd=new SqlCommand(sql,c,tx);cmd.Parameters.AddRange(parameters);return cmd;}
 static string User(HttpContext ctx)=>ctx.Items["User"]?.GetType().GetProperty("UserName")?.GetValue(ctx.Items["User"]!)?.ToString()??"Unknown";
 static string Serialize(object value)=>JsonSerializer.Serialize(value,Json);
 static string Kind(string value){value=value.ToUpperInvariant();JewelleryRegisterRules.ValidateKind(value);return value;}
 static async Task<IResult> Safe(Func<Task<IResult>> work){try{return await work();}catch(ArgumentException e){return Results.BadRequest(new{message=e.Message});}catch(DBConcurrencyException e){return Results.Conflict(new{message=e.Message});}}
 public sealed record CreateRequest(Guid RequestId,JewelleryRegisterData Data);
 public static void Map(WebApplication app)
 {
  var group=app.MapGroup("/api/jewellery/registers");
  group.AddEndpointFilter(async (context,next)=>{
   var db=context.HttpContext.RequestServices.GetRequiredService<Db>();
   var type=LicenseGuardModules.GetStatus().StoreType;
   if(string.IsNullOrWhiteSpace(type))type=(await db.QuerySingleAsync("SELECT TOP 1 StoreType FROM OutletMaster ORDER BY Id")).GetValueOrDefault("StoreType")?.ToString();
   if(!new[]{"Jewellery Shop","Gold & Diamond Jewellery","Silver Jewellery"}.Contains(type??"",StringComparer.OrdinalIgnoreCase))return Results.Json(new{message="This register is available in Jewellery mode only"},statusCode:403);
   return await next(context);
  });
  group.MapGet("/{kind}",async (Db db,string kind,string? q,int? page)=>await Safe(async()=>{
   kind=Kind(kind);var number=Math.Max(1,page??1);var query=(q??"").Trim();
   var rows=await db.QueryAsync(@"SELECT Id,Kind,PartyName,Title,RecordDate,Status,Amount,PaidAmount,Details,Revision FROM JewelleryRegisters
WHERE Kind=@k AND (@q='' OR PartyName LIKE @like OR Title LIKE @like OR CAST(Id AS nvarchar(20))=@q)
ORDER BY RecordDate DESC,Id DESC OFFSET @skip ROWS FETCH NEXT 100 ROWS ONLY",P("@k",kind),P("@q",query),P("@like","%"+query+"%"),P("@skip",(number-1)*100));
   var count=await db.ScalarAsync("SELECT COUNT(*) FROM JewelleryRegisters WHERE Kind=@k AND (@q='' OR PartyName LIKE @like OR Title LIKE @like OR CAST(Id AS nvarchar(20))=@q)",P("@k",kind),P("@q",query),P("@like","%"+query+"%"));
   return Results.Ok(new{rows,total=Convert.ToInt32(count),page=number});
  }));
  group.MapGet("/{kind}/{id:int}",async(Db db,string kind,int id)=>await Safe(async()=>{
   var row=await db.QuerySingleAsync("SELECT * FROM JewelleryRegisters WHERE Id=@id AND Kind=@k",P("@id",id),P("@k",Kind(kind)));
   if(row.Count==0)return Results.NotFound(new{message="Entry not found"});
   var data=JsonSerializer.Deserialize<JewelleryRegisterData>(row["Details"]!.ToString()!,Json)!;
   var events=await db.QueryAsync("SELECT Id,EventType,EventDate,Amount,Notes,PaymentMode,ReferenceNo,CreatedBy,CreatedAt FROM JewelleryRegisterEvents WHERE RegisterId=@id ORDER BY Id",P("@id",id));
   var due=kind.Equals("GIRVI",StringComparison.OrdinalIgnoreCase)&&data.Status=="ACTIVE"?JewelleryRegisterRules.LoanDue(data,DateTime.Today):Math.Max(0,data.Amount-data.PaidAmount);
   return Results.Json(new{row,data,events,due},Json);
  }));
  group.MapGet("/ledger/customer/{id:int}",async(Db db,int id)=>{
   var rows=await db.QueryAsync(@"SELECT Id,RecordDate,Title,Status,Amount,JSON_VALUE(Details,'$.Direction') Direction
FROM JewelleryRegisters WHERE Kind='LEDGER' AND TRY_CONVERT(int,JSON_VALUE(Details,'$.CustomerId'))=@id ORDER BY RecordDate,Id",P("@id",id));
   var balance=rows.Where(r=>r["Status"]?.ToString()!="REVERSED").Sum(r=>Convert.ToDecimal(r["Amount"])*(r["Direction"]?.ToString()=="DR"?1:-1));
   return Results.Ok(new{rows,balance});
  });
  group.MapPost("/{kind}",async(Db db,HttpContext ctx,string kind,CreateRequest request)=>await Safe(async()=>{
   kind=Kind(kind);if(request.RequestId==Guid.Empty||request.Data==null)return Results.BadRequest(new{message="Entry/request ID missing"});
   var data=request.Data;JewelleryRegisterRules.Create(kind,data,DateTime.Today);
   using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction(IsolationLevel.Serializable);
   using(var old=Cmd(c,tx,"SELECT Id FROM JewelleryRegisters WITH(UPDLOCK,HOLDLOCK) WHERE RequestId=@r AND Kind=@k",P("@r",request.RequestId),P("@k",kind))){var existing=await old.ExecuteScalarAsync();if(existing!=null){await tx.CommitAsync();return Results.Ok(new{id=Convert.ToInt32(existing),duplicate=true});}}
   if(data.CustomerId>0){using var customer=Cmd(c,tx,"SELECT Name FROM Customers WHERE Id=@id",P("@id",data.CustomerId));var name=await customer.ExecuteScalarAsync();if(name==null)throw new ArgumentException("Customer not found");data.PartyName=name.ToString()!;}
   if(kind=="ISSUE"||kind=="JOB"){
    using var karigar=Cmd(c,tx,"SELECT PartyName FROM JewelleryRegisters WHERE Id=@id AND Kind='KARIGAR' AND Status='ACTIVE'",P("@id",data.KarigarId));
    var name=await karigar.ExecuteScalarAsync();if(name==null)throw new ArgumentException("Select an active Karigar");
    if(kind=="ISSUE")data.PartyName=name.ToString()!;
   }
   if(kind=="ISSUE"){
    using var tag=Cmd(c,tx,"UPDATE JewelleryItems WITH(UPDLOCK) SET Status='WORKSHOP_ISSUED' WHERE Id=@id AND Status='IN_STOCK' AND ABS(GrossWeight-@w)<=0.0001; SELECT @@ROWCOUNT",P("@id",data.ItemId),P("@w",data.Weight));
    if(Convert.ToInt32(await tag.ExecuteScalarAsync())!=1)throw new ArgumentException("Tag must be in stock; issue its full gross weight");
   }
   using var insert=Cmd(c,tx,@"INSERT JewelleryRegisters(Kind,RequestId,PartyName,Title,RecordDate,Status,Amount,PaidAmount,Details,CreatedBy)
VALUES(@k,@r,@p,@t,@d,@s,@a,@paid,@json,@u);SELECT CAST(SCOPE_IDENTITY() AS int)",P("@k",kind),P("@r",request.RequestId),P("@p",data.PartyName),P("@t",data.Title),P("@d",data.Date.Date),P("@s",data.Status),P("@a",data.Amount),P("@paid",data.PaidAmount),P("@json",Serialize(data)),P("@u",User(ctx)));
   var id=Convert.ToInt32(await insert.ExecuteScalarAsync());
   await Event(c,tx,id,request.RequestId,"CREATE",data.Date,data.PaidAmount,data.Notes,data.PaymentMode,data.ReferenceNo,data,User(ctx));
   await tx.CommitAsync();return Results.Ok(new{id,revision=1});
  }));
  group.MapPost("/{kind}/{id:int}/actions",async(Db db,HttpContext ctx,string kind,int id,JewelleryRegisterAction action)=>await Safe(async()=>{
   kind=Kind(kind);if(action.RequestId==Guid.Empty)return Results.BadRequest(new{message="Action request ID missing"});
   using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction(IsolationLevel.Serializable);
   JewelleryRegisterData data;int revision;
   using(var read=Cmd(c,tx,"SELECT Details,Revision FROM JewelleryRegisters WITH(UPDLOCK,HOLDLOCK) WHERE Id=@id AND Kind=@k",P("@id",id),P("@k",kind))){using var r=await read.ExecuteReaderAsync();if(!await r.ReadAsync())return Results.NotFound(new{message="Entry not found"});data=JsonSerializer.Deserialize<JewelleryRegisterData>(r.GetString(0),Json)!;revision=r.GetInt32(1);}
   using(var duplicate=Cmd(c,tx,"SELECT COUNT(*) FROM JewelleryRegisterEvents WHERE RegisterId=@id AND RequestId=@r",P("@id",id),P("@r",action.RequestId))){if(Convert.ToInt32(await duplicate.ExecuteScalarAsync())>0){await tx.CommitAsync();return Results.Ok(new{id,revision,duplicate=true});}}
   if(action.Revision!=revision)throw new DBConcurrencyException("Entry changed on another screen. Refresh before posting this action.");
   JewelleryRegisterRules.Act(kind,data,action,DateTime.Today);
   if(kind=="ISSUE"&&action.Action=="RETURN"){
    using var tag=Cmd(c,tx,"UPDATE JewelleryItems SET Status='IN_STOCK',GrossWeight=@w,NetWeight=@w-ISNULL(LessWeight,0),FineWeight=(@w-ISNULL(LessWeight,0))*PurityPercent/100 WHERE Id=@id AND Status='WORKSHOP_ISSUED' AND @w>=ISNULL(LessWeight,0);SELECT @@ROWCOUNT",P("@id",data.ItemId),P("@w",action.Weight));
    if(Convert.ToInt32(await tag.ExecuteScalarAsync())!=1)throw new DBConcurrencyException("Tag status has changed; return was not posted");
   }
   using var update=Cmd(c,tx,"UPDATE JewelleryRegisters SET PartyName=@p,Title=@t,Status=@s,Amount=@a,PaidAmount=@paid,Details=@json,Revision=Revision+1,UpdatedAt=SYSDATETIME() WHERE Id=@id",P("@p",data.PartyName),P("@t",data.Title),P("@s",data.Status),P("@a",data.Amount),P("@paid",data.PaidAmount),P("@json",Serialize(data)),P("@id",id));await update.ExecuteNonQueryAsync();
   await Event(c,tx,id,action.RequestId,action.Action,action.Date,action.Amount,action.Notes,action.PaymentMode,action.ReferenceNo,data,User(ctx));
   await tx.CommitAsync();return Results.Json(new{id,revision=revision+1,data},Json);
  }));
 }
 static async Task Event(SqlConnection c,SqlTransaction tx,int id,Guid request,string action,DateTime date,decimal amount,string? notes,string mode,string reference,JewelleryRegisterData data,string user){
  using var log=Cmd(c,tx,@"INSERT JewelleryRegisterEvents(RegisterId,RequestId,EventType,EventDate,Amount,Notes,PaymentMode,ReferenceNo,Snapshot,CreatedBy)
VALUES(@id,@r,@act,@date,@a,@n,@mode,@ref,@json,@u);
INSERT AuditLogs(UserName,Action,Entity,EntityId,Details) VALUES(@u,@act,'JewelleryRegister',@id,@n)",P("@id",id),P("@r",request),P("@act",action),P("@date",date.Date),P("@a",amount),P("@n",notes),P("@mode",mode),P("@ref",reference),P("@json",Serialize(data)),P("@u",user));
  await log.ExecuteNonQueryAsync();
 }
}
