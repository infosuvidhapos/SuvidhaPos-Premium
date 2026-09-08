using System.Globalization;
using System.Text.Json;
using Microsoft.Data.SqlClient;

namespace SuvidhaPOS.Premium;

public static class JewelleryLiveRateModules
{
    static readonly HttpClient Http=new(){Timeout=TimeSpan.FromSeconds(12)};
    const decimal TroyOunceGrams=31.1034768m;

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/jewellery/live-rates", async (Db db,bool? save) =>
        {
            try
            {
                using var req=new HttpRequestMessage(HttpMethod.Get,"https://xaus.com/api/v1/spot?currency=INR&unit=gram&compact=1");
                req.Headers.UserAgent.ParseAdd("SuvidhaPOS-Premium/6.11");
                using var res=await Http.SendAsync(req);
                var raw=await res.Content.ReadAsStringAsync();
                if(!res.IsSuccessStatusCode) return Results.Json(new{message="Live metal rate provider returned HTTP "+(int)res.StatusCode},statusCode:502);
                using var doc=JsonDocument.Parse(raw);
                var root=doc.RootElement;
                var gold=root.GetProperty("xau").GetProperty("price").GetDecimal();
                var fx=root.TryGetProperty("fx_rate",out var fxEl)?fxEl.GetDecimal():0m;
                var silverUsdOz=root.TryGetProperty("silver_usd_oz",out var sEl)?sEl.GetDecimal():0m;
                if(gold<=0||fx<=0||silverUsdOz<=0) return Results.Json(new{message="Live provider response did not contain usable INR gold/silver rates."},statusCode:502);
                var silver=silverUsdOz*fx/TroyOunceGrams;
                var updated=root.TryGetProperty("updated_at",out var uEl)?uEl.GetString():DateTime.UtcNow.ToString("O",CultureInfo.InvariantCulture);
                var stale=root.TryGetProperty("stale",out var stEl)&&stEl.ValueKind==JsonValueKind.True;
                var rates=new[]{
                    new LiveMetalRate("Gold","24K",gold),
                    new LiveMetalRate("Gold","22K",gold*22m/24m),
                    new LiveMetalRate("Gold","18K",gold*18m/24m),
                    new LiveMetalRate("Gold","14K",gold*14m/24m),
                    new LiveMetalRate("Silver","999",silver*.999m),
                    new LiveMetalRate("Silver","925",silver*.925m)
                };
                if(save==true)
                {
                    using var c=db.CreateConnection();await c.OpenAsync();using var tx=c.BeginTransaction();
                    try
                    {
                        foreach(var r in rates)
                        {
                            using var cmd=new SqlCommand(@"UPDATE JewelleryMetalRates SET IsActive=0 WHERE MetalType=@m AND Purity=@p AND IsActive=1;
INSERT JewelleryMetalRates(MetalType,Purity,RatePerGram,EffectiveAt,IsActive) VALUES(@m,@p,@r,SYSDATETIME(),1);",c,tx);
                            cmd.Parameters.AddRange(new[]{P("@m",r.MetalType),P("@p",r.Purity),P("@r",decimal.Round(r.RatePerGram,4))});
                            await cmd.ExecuteNonQueryAsync();
                        }
                        await tx.CommitAsync();
                    }
                    catch{await tx.RollbackAsync();throw;}
                }
                return Results.Ok(new{source="XAUS indicative spot",currency="INR",unit="gram",updatedAt=updated,stale,saved=save==true,rates=rates.Select(x=>new{x.MetalType,x.Purity,RatePerGram=decimal.Round(x.RatePerGram,4)})});
            }
            catch(Exception ex)
            {
                var fallback=await db.QueryAsync(@"WITH r AS(
SELECT Id,MetalType,Purity,RatePerGram,EffectiveAt,ROW_NUMBER() OVER(PARTITION BY MetalType,Purity ORDER BY EffectiveAt DESC,Id DESC) rn
FROM JewelleryMetalRates WHERE IsActive=1)
SELECT Id,MetalType,Purity,RatePerGram,EffectiveAt FROM r WHERE rn=1 ORDER BY MetalType,Purity");
                return Results.Ok(new{source="Saved rate fallback",currency="INR",unit="gram",updatedAt=(string?)null,stale=true,saved=false,warning=ex.Message,rates=fallback});
            }
        });
    }

    static SqlParameter P(string n,object? v)=>new(n,v??DBNull.Value);
    public record LiveMetalRate(string MetalType,string Purity,decimal RatePerGram);
}
