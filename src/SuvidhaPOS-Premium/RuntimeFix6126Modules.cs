using Microsoft.Data.SqlClient;
using NPOI.SS.UserModel;
using NPOI.XSSF.UserModel;
using SuvidhaPOS.Premium.Data;
using System.Globalization;
using System.Text;

namespace SuvidhaPOS.Premium;

/// <summary>
/// Runtime 6.12.6 backend fixes:
/// - quantity-aware Jewellery billing with transactional stock decrement
/// - direct local Excel/CSV Item Import parsing (never calls OpenAI)
/// - real XLSX sample files with mandatory columns marked
/// </summary>
public static class RuntimeFix6126Modules
{
    static readonly SemaphoreSlim SchemaGate = new(1, 1);
    static bool SchemaReady;
    static SqlParameter P(string name, object? value) => new(name, value ?? DBNull.Value);

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/jewellery/quantity-catalog", async (Db db, string? q) =>
        {
            await EnsureQuantitySchema(db);
            q = (q ?? "").Trim();
            var rows = await db.QueryAsync(@"
SELECT j.*,
       CAST(COALESCE(j.AvailableQty,NULLIF(j.OpeningQty,0),1) AS decimal(18,3)) QuantityAvailable
FROM JewelleryItems j
WHERE j.Status IN ('IN_STOCK','APPROVAL','KARIGAR_WORK')
  AND COALESCE(j.AvailableQty,NULLIF(j.OpeningQty,0),1) > 0
  AND (@q='' OR j.TagNo LIKE @like OR ISNULL(j.Barcode,'') LIKE @like OR
       j.ItemName LIKE @like OR ISNULL(j.Huid,'') LIKE @like OR ISNULL(j.DesignCode,'') LIKE @like)
ORDER BY j.ItemName,j.TagNo",
                P("@q", q), P("@like", "%" + q + "%"));
            return Results.Ok(rows);
        });

        app.MapPost("/api/jewellery/sales/quantity-complete", async (Db db, HttpContext ctx, QuantityJewellerySaleRequest x) =>
        {
            await EnsureQuantitySchema(db);
            if (x.Lines is null || x.Lines.Count == 0)
                return Results.BadRequest(new { message = "Add jewellery item first" });

            var grouped = x.Lines
                .Where(z => z.JewelleryItemId > 0)
                .GroupBy(z => z.JewelleryItemId)
                .Select(g =>
                {
                    var first = g.First();
                    return new QuantityJewellerySaleLine
                    {
                        JewelleryItemId = g.Key,
                        Quantity = g.Sum(v => v.Quantity <= 0 ? 1 : decimal.Truncate(v.Quantity)),
                        MetalRatePerGram = first.MetalRatePerGram,
                        StoneValue = first.StoneValue,
                        MakingChargeType = first.MakingChargeType,
                        MakingValue = first.MakingValue
                    };
                }).ToList();

            if (grouped.Count == 0)
                return Results.BadRequest(new { message = "Add jewellery item first" });

            using var c = db.CreateConnection();
            await c.OpenAsync();
            using var tx = c.BeginTransaction();
            try
            {
                decimal metal = 0, stone = 0, making = 0, extras = 0;
                var prepared = new List<QtyPrepared>();
                var overrideNeeded = x.Discount > 0;

                foreach (var r in grouped)
                {
                    var cmd = new SqlCommand(@"
SELECT TOP 1 TagNo,ItemName,MetalType,Purity,PurityPercent,NetWeight,FineWeight,WastagePercent,
       MakingChargeType,MakingValue,StoneValue,LabourCharge,HallmarkCharge,OtherCharge,GstMode,GstRate,Status,
       CAST(COALESCE(AvailableQty,NULLIF(OpeningQty,0),1) AS decimal(18,3)) QtyAvailable
FROM JewelleryItems WITH(UPDLOCK,ROWLOCK)
WHERE Id=@id", c, tx);
                    cmd.Parameters.Add(P("@id", r.JewelleryItemId));
                    await using var rd = await cmd.ExecuteReaderAsync();
                    if (!await rd.ReadAsync()) throw new Exception("Jewellery item not found");

                    var tag = rd.GetString(0);
                    var name = rd.GetString(1);
                    var metalType = rd.GetString(2);
                    var purity = rd.GetString(3);
                    var purityPct = rd.GetDecimal(4);
                    var netWeight = rd.GetDecimal(5);
                    var savedFine = rd.GetDecimal(6);
                    var wastage = rd.GetDecimal(7);
                    var makingType = rd.GetString(8);
                    var makingValue = rd.GetDecimal(9);
                    var savedStone = rd.GetDecimal(10);
                    var labour = rd.GetDecimal(11);
                    var hallmark = rd.GetDecimal(12);
                    var other = rd.GetDecimal(13);
                    var gstMode = rd.GetString(14);
                    var itemGst = rd.GetDecimal(15);
                    var status = rd.GetString(16);
                    var available = rd.GetDecimal(17);
                    await rd.CloseAsync();

                    if (status is not ("IN_STOCK" or "APPROVAL" or "KARIGAR_WORK"))
                        throw new Exception($"Tag {tag} is not available");

                    var qty = Math.Max(1m, decimal.Truncate(r.Quantity <= 0 ? 1 : r.Quantity));
                    if (qty > available)
                        throw new Exception($"Tag {tag}: only {available:0.###} quantity available");

                    var liveRate = await LatestRate(c, tx, metalType, purity);
                    var useRate = r.MetalRatePerGram > 0 ? r.MetalRatePerGram : liveRate;
                    if (liveRate > 0 && Math.Abs(useRate - liveRate) > 0.01m) overrideNeeded = true;

                    var finePerPiece = savedFine > 0 ? savedFine : netWeight * purityPct / 100m;
                    var metalPerPiece = netWeight * useRate;
                    var stonePerPiece = r.StoneValue >= 0 ? r.StoneValue : savedStone;
                    var effectiveMakingType = string.IsNullOrWhiteSpace(r.MakingChargeType) ? makingType : r.MakingChargeType!;
                    var effectiveMakingValue = r.MakingValue >= 0 ? r.MakingValue : makingValue;
                    var makingPerPiece = effectiveMakingType.Equals("PER_GRAM", StringComparison.OrdinalIgnoreCase)
                        ? netWeight * effectiveMakingValue
                        : effectiveMakingType.Equals("PERCENTAGE", StringComparison.OrdinalIgnoreCase)
                            ? metalPerPiece * effectiveMakingValue / 100m
                            : effectiveMakingValue;
                    var extraPerPiece = labour + hallmark + other;
                    var wastePerPiece = metalPerPiece * wastage / 100m;

                    metal += metalPerPiece * qty;
                    stone += stonePerPiece * qty;
                    making += (makingPerPiece + wastePerPiece) * qty;
                    extras += extraPerPiece * qty;

                    prepared.Add(new QtyPrepared(
                        r.JewelleryItemId, tag, name, metalType, purity, qty, available,
                        netWeight, finePerPiece, wastage, useRate,
                        metalPerPiece * qty, stonePerPiece * qty,
                        (makingPerPiece + wastePerPiece) * qty, extraPerPiece * qty,
                        gstMode, itemGst));
                }

                if (overrideNeeded)
                {
                    if (!IsManager(ctx))
                        return Results.Json(new { message = "Admin/Manager permission required for discount or rate override" }, statusCode: 403);
                    if (string.IsNullOrWhiteSpace(x.OverrideReason))
                        return Results.BadRequest(new { message = "Override reason is required for discount/rate change" });
                }

                var subtotal = metal + stone + making + extras;
                var discount = Math.Min(Math.Max(0, x.Discount), subtotal);
                var taxable = Math.Max(0, subtotal - discount);
                var gstRate = Math.Max(0, x.GstRate);
                var inclusive = string.Equals(x.GstMode, "INCLUSIVE", StringComparison.OrdinalIgnoreCase);
                var gst = inclusive && gstRate > 0 ? taxable * gstRate / (100m + gstRate) : taxable * gstRate / 100m;
                var gross = inclusive ? taxable : taxable + gst;
                var oldCredit = (x.OldMetal ?? new()).Sum(z => Math.Max(0, z.Amount));
                var net = Math.Max(0, gross - oldCredit);
                var paid = (x.Payments ?? new()).Sum(z => Math.Max(0, z.Amount));
                var invoiceNo = (string.Equals(x.SaleType, "WHOLESALE", StringComparison.OrdinalIgnoreCase) ? "WS-" : "JB-") + DateTime.Now.ToString("yyyyMMddHHmmssfff");

                var header = new SqlCommand(@"
INSERT JewellerySales(InvoiceNo,CustomerId,CustomerName,CustomerPan,MetalAmount,StoneAmount,MakingAmount,GrossAmount,
 GstRate,Cgst,Sgst,OldMetalCredit,NetPayable,PaymentMode,PaidAmount,Notes,SaleType,Discount)
OUTPUT INSERTED.Id
VALUES(@inv,@cid,@cn,@pan,@metal,@stone,@making,@gross,@rate,@cg,@sg,@old,@net,@pm,@paid,@notes,@stype,@disc)", c, tx);
                header.Parameters.AddRange(new[]
                {
                    P("@inv", invoiceNo), P("@cid", x.CustomerId), P("@cn", x.CustomerName ?? "Walk-in Customer"), P("@pan", x.CustomerPan),
                    P("@metal", metal), P("@stone", stone), P("@making", making + extras), P("@gross", subtotal), P("@rate", gstRate),
                    P("@cg", gst / 2), P("@sg", gst / 2), P("@old", oldCredit), P("@net", net),
                    P("@pm", (x.Payments ?? new()).FirstOrDefault()?.Mode ?? "Cash"), P("@paid", paid), P("@notes", x.Notes),
                    P("@stype", x.SaleType ?? "RETAIL"), P("@disc", discount)
                });
                var saleId = (int)(await header.ExecuteScalarAsync() ?? 0);

                foreach (var z in prepared)
                {
                    var line = new SqlCommand(@"
INSERT JewellerySaleLines(SaleId,JewelleryItemId,MetalRate,MetalAmount,StoneAmount,MakingAmount,TotalAmount,
 NetWeight,FineWeight,WastagePercent,GstMode,GstRate,Quantity)
VALUES(@s,@i,@r,@m,@st,@mk,@t,@nw,@fw,@wp,@gm,@gr,@qty);

UPDATE JewelleryItems
SET AvailableQty = CASE WHEN COALESCE(AvailableQty,NULLIF(OpeningQty,0),1)-@qty < 0 THEN 0
                        ELSE COALESCE(AvailableQty,NULLIF(OpeningQty,0),1)-@qty END,
    Status = CASE WHEN COALESCE(AvailableQty,NULLIF(OpeningQty,0),1)-@qty <= 0 THEN 'SOLD' ELSE 'IN_STOCK' END,
    UpdatedAt = SYSDATETIME()
WHERE Id=@i;", c, tx);
                    line.Parameters.AddRange(new[]
                    {
                        P("@s", saleId), P("@i", z.ItemId), P("@r", z.Rate), P("@m", z.MetalAmount), P("@st", z.StoneAmount),
                        P("@mk", z.MakingAmount + z.Extras), P("@t", z.MetalAmount + z.StoneAmount + z.MakingAmount + z.Extras),
                        P("@nw", z.NetWeightPerPiece * z.Quantity), P("@fw", z.FineWeightPerPiece * z.Quantity), P("@wp", z.WastagePercent),
                        P("@gm", x.GstMode ?? z.GstMode), P("@gr", gstRate > 0 ? gstRate : z.ItemGstRate), P("@qty", z.Quantity)
                    });
                    await line.ExecuteNonQueryAsync();
                }

                foreach (var payment in x.Payments ?? new())
                {
                    if (payment.Amount <= 0) continue;
                    var pc = new SqlCommand("INSERT JewellerySalePayments(SaleId,PaymentMode,Amount,ReferenceNo) VALUES(@s,@m,@a,@r)", c, tx);
                    pc.Parameters.AddRange(new[] { P("@s", saleId), P("@m", payment.Mode ?? "Cash"), P("@a", payment.Amount), P("@r", payment.Reference) });
                    await pc.ExecuteNonQueryAsync();
                }

                foreach (var old in x.OldMetal ?? new())
                {
                    if (old.Amount <= 0) continue;
                    var oc = new SqlCommand(@"
INSERT JewelleryOldMetalEntries(SaleId,MetalType,GrossWeight,LessWeight,NetWeight,PurityPercent,FineWeight,RatePerGram,Amount)
VALUES(@s,@m,@g,@l,@n,@p,@f,@r,@a)", c, tx);
                    oc.Parameters.AddRange(new[]
                    {
                        P("@s", saleId), P("@m", old.Metal ?? "Gold"), P("@g", old.Gross), P("@l", old.Less), P("@n", old.Net),
                        P("@p", old.Purity), P("@f", old.Fine), P("@r", old.Rate), P("@a", old.Amount)
                    });
                    await oc.ExecuteNonQueryAsync();
                }

                if (overrideNeeded)
                {
                    var audit = new SqlCommand(@"
INSERT PremiumOverrideAudit(ActionName,Reason,UserName,RoleName,Details)
VALUES('JEWELLERY_BILL_OVERRIDE',@r,@u,@role,@d)", c, tx);
                    audit.Parameters.AddRange(new[]
                    {
                        P("@r", x.OverrideReason), P("@u", UserName(ctx)), P("@role", UserRole(ctx)),
                        P("@d", $"Invoice={invoiceNo}; Discount={discount}; GST={gstRate}; SaleType={x.SaleType}; QuantitySafe=true")
                    });
                    await audit.ExecuteNonQueryAsync();
                }

                await tx.CommitAsync();
                return Results.Ok(new
                {
                    id = saleId,
                    invoiceNo,
                    subtotal,
                    discount,
                    gst,
                    oldMetalCredit = oldCredit,
                    netPayable = net,
                    paid,
                    balance = Math.Max(0, net - paid),
                    lines = prepared.Select(z => new { z.ItemId, z.Tag, quantity = z.Quantity })
                });
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync();
                return Results.BadRequest(new { message = ex.Message });
            }
        });

        // Direct Item Import parser. This endpoint only reads the local uploaded file.
        // It never calls /api/ai/import or any OpenAI service.
        app.MapPost("/api/item-import/direct/parse", async (HttpRequest request) =>
        {
            if (!request.HasFormContentType)
                return Results.BadRequest(new { message = "Excel/CSV file upload required" });

            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { message = "Excel/CSV file browse karein" });

            var scope = (form["scope"].ToString() ?? "NORMAL").Trim().ToUpperInvariant();
            if (scope is not ("NORMAL" or "JEWELLERY"))
                return Results.BadRequest(new { message = "Invalid import scope" });

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext is not (".xlsx" or ".xls" or ".csv"))
                return Results.BadRequest(new { message = "Only Excel (.xlsx/.xls) or CSV files are supported in Item Import Master" });

            List<List<string>> matrix;
            await using (var source = file.OpenReadStream())
            {
                matrix = ext == ".csv" ? await ReadCsv(source) : ReadWorkbook(source);
            }

            var rows = ToObjects(matrix);
            if (rows.Count == 0)
                return Results.BadRequest(new { message = "No item rows found. First row must contain column headers." });

            return Results.Ok(new { scope, fileName = file.FileName, rows });
        });

        app.MapGet("/api/item-import/direct/sample/{scope}", (string scope) =>
        {
            var jewellery = string.Equals(scope, "JEWELLERY", StringComparison.OrdinalIgnoreCase);
            var normal = string.Equals(scope, "NORMAL", StringComparison.OrdinalIgnoreCase);
            if (!jewellery && !normal) return Results.NotFound();

            var data = CreateSampleWorkbook(jewellery);
            var name = jewellery ? "SuvidhaPOS-Jewellery-Item-Import-Sample.xlsx" : "SuvidhaPOS-Normal-Item-Import-Sample.xlsx";
            return Results.File(data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name);
        });
    }

    static async Task EnsureQuantitySchema(Db db)
    {
        if (SchemaReady) return;
        await SchemaGate.WaitAsync();
        try
        {
            if (SchemaReady) return;
            await db.ScalarAsync(@"
IF COL_LENGTH('dbo.JewelleryItems','AvailableQty') IS NULL
    ALTER TABLE dbo.JewelleryItems ADD AvailableQty decimal(18,3) NULL;
IF COL_LENGTH('dbo.JewellerySaleLines','Quantity') IS NULL
    ALTER TABLE dbo.JewellerySaleLines ADD Quantity decimal(18,3) NOT NULL CONSTRAINT DF_JewellerySaleLines_Quantity_6126 DEFAULT 1;
SELECT 1;");
            SchemaReady = true;
        }
        finally { SchemaGate.Release(); }
    }

    static async Task<decimal> LatestRate(SqlConnection c, SqlTransaction tx, string metal, string purity)
    {
        var cmd = new SqlCommand("SELECT TOP 1 RatePerGram FROM JewelleryMetalRates WHERE IsActive=1 AND MetalType=@m AND Purity=@p ORDER BY EffectiveAt DESC,Id DESC", c, tx);
        cmd.Parameters.AddRange(new[] { P("@m", metal), P("@p", purity) });
        var v = await cmd.ExecuteScalarAsync();
        return v is null || v is DBNull ? 0 : Convert.ToDecimal(v, CultureInfo.InvariantCulture);
    }

    static string UserName(HttpContext c) => Prop(c.Items["User"], "UserName") ?? "System";
    static string UserRole(HttpContext c) => Prop(c.Items["User"], "Role") ?? "Cashier";
    static bool IsManager(HttpContext c) => UserRole(c) is var r &&
        (r.Equals("Admin", StringComparison.OrdinalIgnoreCase) || r.Equals("Administrator", StringComparison.OrdinalIgnoreCase) || r.Equals("Manager", StringComparison.OrdinalIgnoreCase));
    static string? Prop(object? o, string n) => o?.GetType().GetProperty(n)?.GetValue(o)?.ToString();

    static List<List<string>> ReadWorkbook(Stream stream)
    {
        using var wb = WorkbookFactory.Create(stream);
        var formatter = new DataFormatter();
        var matrix = new List<List<string>>();
        if (wb.NumberOfSheets <= 0) return matrix;
        var sheet = wb.GetSheetAt(0);
        for (var r = sheet.FirstRowNum; r <= sheet.LastRowNum; r++)
        {
            var row = sheet.GetRow(r);
            if (row is null) { matrix.Add(new List<string>()); continue; }
            var cells = new List<string>();
            var last = Math.Max(0, row.LastCellNum);
            for (var c = 0; c < last; c++)
                cells.Add(formatter.FormatCellValue(row.GetCell(c)).Trim());
            matrix.Add(cells);
        }
        return matrix;
    }

    static async Task<List<List<string>>> ReadCsv(Stream stream)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, true, 4096, leaveOpen: true);
        var text = await reader.ReadToEndAsync();
        var result = new List<List<string>>();
        var row = new List<string>();
        var cell = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (ch == '"')
            {
                if (quoted && i + 1 < text.Length && text[i + 1] == '"') { cell.Append('"'); i++; }
                else quoted = !quoted;
            }
            else if (ch == ',' && !quoted) { row.Add(cell.ToString().Trim()); cell.Clear(); }
            else if ((ch == '\r' || ch == '\n') && !quoted)
            {
                if (ch == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                row.Add(cell.ToString().Trim()); cell.Clear();
                result.Add(row); row = new List<string>();
            }
            else cell.Append(ch);
        }
        if (cell.Length > 0 || row.Count > 0) { row.Add(cell.ToString().Trim()); result.Add(row); }
        return result;
    }

    static List<Dictionary<string, string>> ToObjects(List<List<string>> matrix)
    {
        var headerIndex = -1;
        for (var i = 0; i < matrix.Count; i++)
        {
            var nonBlank = matrix[i].Count(v => !string.IsNullOrWhiteSpace(v));
            if (nonBlank >= 2) { headerIndex = i; break; }
        }
        if (headerIndex < 0) return new();

        var headers = matrix[headerIndex].Select((h, i) =>
        {
            var key = (h ?? "").Replace("*", "").Trim();
            return string.IsNullOrWhiteSpace(key) ? $"Column{i + 1}" : key;
        }).ToArray();

        var rows = new List<Dictionary<string, string>>();
        for (var r = headerIndex + 1; r < matrix.Count; r++)
        {
            var source = matrix[r];
            if (source.All(string.IsNullOrWhiteSpace)) continue;
            var item = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var c = 0; c < headers.Length; c++)
            {
                var key = headers[c];
                if (item.ContainsKey(key)) key += "_" + (c + 1);
                item[key] = c < source.Count ? source[c] : "";
            }
            rows.Add(item);
        }
        return rows;
    }

    static byte[] CreateSampleWorkbook(bool jewellery)
    {
        using var wb = new XSSFWorkbook();
        var sheet = wb.CreateSheet(jewellery ? "Jewellery Items" : "Normal Items");
        var note = sheet.CreateRow(0);
        note.CreateCell(0).SetCellValue("* = Mandatory field. Do not rename mandatory columns.");

        string[] headers;
        string[] sample;
        if (jewellery)
        {
            headers = new[] { "TagNo *", "Barcode", "ItemName *", "Category", "DesignCode", "Metal *", "Purity *", "PurityPercent", "HUID", "GrossWeight *", "LessWeight", "NetWeight", "FineWeight", "Wastage%", "StoneType", "StoneWeight", "StonePieces", "StoneCarat", "StoneValue", "MakingType *", "MakingValue", "HSN", "GSTMode *", "GST% *", "PurchasePrice", "SalePrice", "OpeningQty *", "Rack", "Notes" };
            sample = new[] { "TG001", "890100000001", "Gold Ring", "Ring", "RG-001", "Gold", "22K", "91.6", "HUID001", "6.250", "0.150", "6.100", "5.588", "2.5", "Diamond", "0.150", "1", "0.75", "12000", "PER_GRAM", "850", "7113", "EXCLUSIVE", "3", "32500", "0", "1", "R1", "Opening stock" };
        }
        else
        {
            headers = new[] { "ItemName *", "Barcode", "SKU", "Category", "Unit *", "HSN", "GSTMode *", "GST% *", "MRP", "PurchasePrice", "SalePrice", "MinStock", "Location", "Rack", "Shelf" };
            sample = new[] { "Premium Tea 250g", "890000000004", "TEA250", "Grocery", "PCS", "0902", "EXCLUSIVE", "5", "180", "140", "160", "5", "A-1", "Rack A", "Shelf 1" };
        }

        var headerRow = sheet.CreateRow(1);
        var sampleRow = sheet.CreateRow(2);
        for (var i = 0; i < headers.Length; i++)
        {
            headerRow.CreateCell(i).SetCellValue(headers[i]);
            sampleRow.CreateCell(i).SetCellValue(sample[i]);
            sheet.SetColumnWidth(i, Math.Min(40, Math.Max(12, headers[i].Length + 3)) * 256);
        }
        sheet.CreateFreezePane(0, 2);

        using var ms = new MemoryStream();
        wb.Write(ms, true);
        return ms.ToArray();
    }

    sealed record QtyPrepared(
        int ItemId, string Tag, string Name, string Metal, string Purity,
        decimal Quantity, decimal AvailableBefore, decimal NetWeightPerPiece, decimal FineWeightPerPiece,
        decimal WastagePercent, decimal Rate, decimal MetalAmount, decimal StoneAmount,
        decimal MakingAmount, decimal Extras, string GstMode, decimal ItemGstRate);
}

public sealed class QuantityJewellerySaleRequest
{
    public string? SaleType { get; set; } = "RETAIL";
    public int? CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerPan { get; set; }
    public decimal GstRate { get; set; } = 3;
    public string? GstMode { get; set; } = "EXCLUSIVE";
    public decimal Discount { get; set; }
    public string? OverrideReason { get; set; }
    public string? Notes { get; set; }
    public List<QuantityJewellerySaleLine>? Lines { get; set; }
    public List<QuantityJewelleryPayment>? Payments { get; set; }
    public List<QuantityJewelleryOldMetal>? OldMetal { get; set; }
}

public sealed class QuantityJewellerySaleLine
{
    public int JewelleryItemId { get; set; }
    public decimal Quantity { get; set; } = 1;
    public decimal MetalRatePerGram { get; set; }
    public decimal StoneValue { get; set; } = -1;
    public string? MakingChargeType { get; set; }
    public decimal MakingValue { get; set; } = -1;
}

public sealed class QuantityJewelleryPayment
{
    public string? Mode { get; set; }
    public decimal Amount { get; set; }
    public string? Reference { get; set; }
}

public sealed class QuantityJewelleryOldMetal
{
    public string? Metal { get; set; }
    public decimal Gross { get; set; }
    public decimal Less { get; set; }
    public decimal Net { get; set; }
    public decimal Purity { get; set; }
    public decimal Fine { get; set; }
    public decimal Rate { get; set; }
    public decimal Amount { get; set; }
}
