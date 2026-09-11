using Microsoft.Data.SqlClient;
using SuvidhaPOS.Premium.Data;

namespace SuvidhaPOS.Premium;

public static class BtcPartyBridgeModules
{
    static SqlParameter P(string n, object? v) => new(n, v ?? DBNull.Value);

    public static void Map(WebApplication app)
    {
        app.MapPost("/api/btc/companies/from-customer/{customerId:int}", async (Db db, int customerId) =>
        {
            if (customerId <= 0) return Results.BadRequest(new { message = "Invalid customer" });

            var customer = await db.QuerySingleAsync(
                "SELECT TOP 1 Id,Name,Phone,GstIn,Address FROM Customers WHERE Id=@id AND IsActive=1",
                P("@id", customerId));
            if (customer.Count == 0) return Results.NotFound(new { message = "Customer not found" });

            string S(string key) => customer.GetValueOrDefault(key)?.ToString()?.Trim() ?? "";
            var name = S("Name");
            var phone = S("Phone");
            var gst = S("GstIn");
            var address = S("Address");

            var existing = await db.QuerySingleAsync(
                @"SELECT TOP 1 Id FROM BtcCompanies
                  WHERE IsActive=1 AND ((@p<>'' AND Phone=@p) OR (@g<>'' AND GstIn=@g) OR UPPER(LTRIM(RTRIM(CompanyName)))=UPPER(@n))
                  ORDER BY CASE WHEN @p<>'' AND Phone=@p THEN 0 WHEN @g<>'' AND GstIn=@g THEN 1 ELSE 2 END,Id",
                P("@p", phone), P("@g", gst), P("@n", name));

            if (existing.Count > 0)
                return Results.Ok(new { id = Convert.ToInt32(existing.GetValueOrDefault("Id")), created = false });

            var id = await db.ScalarAsync(
                @"INSERT BtcCompanies(CompanyName,GstIn,Phone,Address,CreditLimit,CreditDays,IsActive)
                  VALUES(@n,NULLIF(@g,''),NULLIF(@p,''),NULLIF(@a,''),0,0,1);
                  SELECT CAST(SCOPE_IDENTITY() AS int)",
                P("@n", name), P("@g", gst), P("@p", phone), P("@a", address));

            return Results.Ok(new { id = Convert.ToInt32(id), created = true });
        });
    }
}
