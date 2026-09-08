using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

public static class UnitMasterModules
{
    static SqlParameter P(string n,object? v)=>new(n,v??DBNull.Value);

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/unit-master",async(Db db,bool includeInactive=false,string? q=null)=>{
            var term=(q??"").Trim();
            return Results.Ok(await db.QueryAsync(@"SELECT Id,UnitName,UnitCode,Description,UnitCategory,SortOrder,IsActive,IsSystem,CreatedAt,UpdatedAt,
(SELECT COUNT(*) FROM Products p WHERE UPPER(LTRIM(RTRIM(ISNULL(p.Unit,''))))=UPPER(LTRIM(RTRIM(u.UnitName))))+
(SELECT COUNT(*) FROM ProductUoms pu WHERE UPPER(LTRIM(RTRIM(ISNULL(pu.BaseUnit,''))))=UPPER(LTRIM(RTRIM(u.UnitName))) OR UPPER(LTRIM(RTRIM(ISNULL(pu.InnerUnit,''))))=UPPER(LTRIM(RTRIM(u.UnitName))) OR UPPER(LTRIM(RTRIM(ISNULL(pu.PackUnit,''))))=UPPER(LTRIM(RTRIM(u.UnitName)))) UsageCount
FROM UnitMaster u
WHERE (@all=1 OR IsActive=1)
AND (@q='' OR UnitName LIKE @like OR UnitCode LIKE @like OR ISNULL(Description,'') LIKE @like OR ISNULL(UnitCategory,'') LIKE @like)
ORDER BY SortOrder,UnitName",P("@all",includeInactive),P("@q",term),P("@like","%"+term+"%")));
        });

        app.MapGet("/api/unit-master/resolve",async(Db db,string? value)=>{
            var name=await ResolveActiveNameAsync(db,value);
            return name is null?Results.NotFound(new{message="Unit not found in Unit Master"}):Results.Ok(new{unit=name});
        });

        app.MapPost("/api/unit-master",async(Db db,UnitMasterRequest x)=>{
            var name=Clean(x.UnitName,40);var code=Clean(x.UnitCode,20);
            if(string.IsNullOrWhiteSpace(name)||string.IsNullOrWhiteSpace(code))return Results.BadRequest(new{message="Unit Name and Unit Code are required"});
            var dup=await Duplicate(db,name,code,0);
            if(dup.Count>0)return Results.BadRequest(new{message=$"Duplicate unit blocked: '{dup["UnitName"]}' / '{dup["UnitCode"]}' already exists.",duplicate=true,conflict=dup});
            try{
                var id=await db.ScalarAsync(@"INSERT UnitMaster(UnitName,UnitCode,Description,UnitCategory,SortOrder,IsActive,IsSystem)
VALUES(@n,@c,@d,@cat,@s,1,0);SELECT CAST(SCOPE_IDENTITY() AS int)",
                    P("@n",name),P("@c",code),P("@d",CleanNullable(x.Description,120)),P("@cat",Category(x.UnitCategory)),P("@s",Math.Max(1,x.SortOrder)));
                return Results.Ok(new{id,unitName=name,unitCode=code});
            }catch(SqlException e)when(e.Number==2601||e.Number==2627){
                return Results.BadRequest(new{message="Duplicate Unit Name or Unit Code is not allowed",duplicate=true});
            }
        });

        app.MapPut("/api/unit-master/{id:int}",async(Db db,int id,UnitMasterRequest x)=>{
            var name=Clean(x.UnitName,40);var code=Clean(x.UnitCode,20);
            if(string.IsNullOrWhiteSpace(name)||string.IsNullOrWhiteSpace(code))return Results.BadRequest(new{message="Unit Name and Unit Code are required"});
            var current=await db.QuerySingleAsync("SELECT Id,UnitName,UnitCode,IsSystem FROM UnitMaster WHERE Id=@id",P("@id",id));
            if(current.Count==0)return Results.NotFound(new{message="Unit not found"});
            var dup=await Duplicate(db,name,code,id);
            if(dup.Count>0)return Results.BadRequest(new{message=$"Duplicate unit blocked: '{dup["UnitName"]}' / '{dup["UnitCode"]}' already exists.",duplicate=true,conflict=dup});
            var oldName=current["UnitName"]?.ToString()??"";
            if(!x.IsActive){
                var used=Convert.ToInt32(await db.ScalarAsync(@"SELECT
(SELECT COUNT(*) FROM Products WHERE UPPER(LTRIM(RTRIM(ISNULL(Unit,''))))=UPPER(@u))+
(SELECT COUNT(*) FROM ProductUoms WHERE UPPER(LTRIM(RTRIM(ISNULL(BaseUnit,''))))=UPPER(@u) OR UPPER(LTRIM(RTRIM(ISNULL(InnerUnit,''))))=UPPER(@u) OR UPPER(LTRIM(RTRIM(ISNULL(PackUnit,''))))=UPPER(@u))",P("@u",oldName))??0);
                if(used>0)return Results.BadRequest(new{message=$"Unit '{oldName}' is used by {used} product/UOM reference(s). Change those items before deactivating it."});
            }
            using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
            try{
                var cmd=new SqlCommand(@"UPDATE UnitMaster SET UnitName=@n,UnitCode=@c,Description=@d,UnitCategory=@cat,SortOrder=@s,IsActive=@a,UpdatedAt=SYSDATETIME() WHERE Id=@id;
UPDATE Products SET Unit=@n WHERE UPPER(LTRIM(RTRIM(ISNULL(Unit,''))))=UPPER(@old);
UPDATE ProductUoms SET
 BaseUnit=CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(BaseUnit,''))))=UPPER(@old) THEN @n ELSE BaseUnit END,
 InnerUnit=CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(InnerUnit,''))))=UPPER(@old) THEN @n ELSE InnerUnit END,
 PackUnit=CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(PackUnit,''))))=UPPER(@old) THEN @n ELSE PackUnit END,
 UpdatedAt=SYSDATETIME()
WHERE UPPER(LTRIM(RTRIM(ISNULL(BaseUnit,''))))=UPPER(@old)
   OR UPPER(LTRIM(RTRIM(ISNULL(InnerUnit,''))))=UPPER(@old)
   OR UPPER(LTRIM(RTRIM(ISNULL(PackUnit,''))))=UPPER(@old);",c,tx);
                cmd.Parameters.AddRange(new[]{P("@n",name),P("@c",code),P("@d",CleanNullable(x.Description,120)),P("@cat",Category(x.UnitCategory)),P("@s",Math.Max(1,x.SortOrder)),P("@a",x.IsActive),P("@id",id),P("@old",oldName)});
                await cmd.ExecuteNonQueryAsync();await tx.CommitAsync();
                return Results.Ok(new{updated=true,unitName=name,unitCode=code,referencesUpdated=!name.Equals(oldName,StringComparison.OrdinalIgnoreCase)});
            }catch(SqlException e)when(e.Number==2601||e.Number==2627){await tx.RollbackAsync();return Results.BadRequest(new{message="Duplicate Unit Name or Unit Code is not allowed",duplicate=true});}
            catch(Exception ex){await tx.RollbackAsync();return Results.BadRequest(new{message=ex.Message});}
        });
    }

    public static async Task<string?> ResolveActiveNameAsync(Db db,string? raw)
    {
        var v=(raw??"").Trim();
        if(string.IsNullOrWhiteSpace(v))return null;
        var r=await db.QuerySingleAsync(@"SELECT TOP 1 UnitName FROM UnitMaster
WHERE IsActive=1 AND (UPPER(LTRIM(RTRIM(UnitName)))=UPPER(@v) OR UPPER(LTRIM(RTRIM(UnitCode)))=UPPER(@v))
ORDER BY CASE WHEN UPPER(LTRIM(RTRIM(UnitName)))=UPPER(@v) THEN 0 ELSE 1 END,SortOrder,Id",P("@v",v));
        return r.GetValueOrDefault("UnitName")?.ToString();
    }

    static Task<Dictionary<string,object?>> Duplicate(Db db,string name,string code,int excludeId)=>db.QuerySingleAsync(@"SELECT TOP 1 Id,UnitName,UnitCode FROM UnitMaster
WHERE Id<>@id AND (UPPER(LTRIM(RTRIM(UnitName)))=UPPER(@n) OR UPPER(LTRIM(RTRIM(UnitCode)))=UPPER(@c))",P("@id",excludeId),P("@n",name),P("@c",code));
    static string Clean(string? v,int max){var x=(v??"").Trim().ToUpperInvariant();return x.Length>max?x[..max]:x;}
    static string? CleanNullable(string? v,int max){var x=(v??"").Trim();if(x.Length==0)return null;return x.Length>max?x[..max]:x;}
    static string Category(string? v){var x=(v??"COUNT").Trim().ToUpperInvariant();return new[]{"COUNT","PACKAGING","MEDICAL","WEIGHT","VOLUME","LENGTH","CUSTOM"}.Contains(x)?x:"CUSTOM";}
    public record UnitMasterRequest(string UnitName,string UnitCode,string? Description,string? UnitCategory,int SortOrder=100,bool IsActive=true);
}
