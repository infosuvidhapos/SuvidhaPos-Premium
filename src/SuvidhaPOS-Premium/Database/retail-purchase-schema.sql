-- Additive retail fields. Historic tax modes and SQL identity values are untouched.
IF COL_LENGTH('dbo.Products','Dis_Rate') IS NULL
 ALTER TABLE dbo.Products ADD Dis_Rate decimal(8,4) NOT NULL CONSTRAINT DF_Products_Dis_Rate DEFAULT 0;
IF COL_LENGTH('dbo.ProductBatches','Dis_Rate') IS NULL
 ALTER TABLE dbo.ProductBatches ADD Dis_Rate decimal(8,4) NULL;
IF COL_LENGTH('dbo.ProductBatches','TaxMode') IS NULL
 ALTER TABLE dbo.ProductBatches ADD TaxMode nvarchar(20) NULL;
IF COL_LENGTH('dbo.PurchaseLines','Dis_Rate') IS NULL
 ALTER TABLE dbo.PurchaseLines ADD Dis_Rate decimal(8,4) NULL;
IF COL_LENGTH('dbo.PurchaseLines','TaxMode') IS NULL
 ALTER TABLE dbo.PurchaseLines ADD TaxMode nvarchar(20) NULL;
GO
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_Products_RetailDiscount')
 ALTER TABLE dbo.Products WITH NOCHECK ADD CONSTRAINT CK_Products_RetailDiscount CHECK(Dis_Rate BETWEEN 0 AND 100);
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_ProductBatches_RetailDiscount')
 ALTER TABLE dbo.ProductBatches WITH NOCHECK ADD CONSTRAINT CK_ProductBatches_RetailDiscount CHECK(Dis_Rate IS NULL OR Dis_Rate BETWEEN 0 AND 100);
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_PurchaseLines_RetailDiscount')
 ALTER TABLE dbo.PurchaseLines WITH NOCHECK ADD CONSTRAINT CK_PurchaseLines_RetailDiscount CHECK(Dis_Rate IS NULL OR Dis_Rate BETWEEN 0 AND 100);
GO
IF OBJECT_ID('dbo.RetailPurchaseRequests') IS NULL
 CREATE TABLE dbo.RetailPurchaseRequests(RequestId nvarchar(100) NOT NULL PRIMARY KEY,PayloadDigest char(64) NOT NULL,ResultJson nvarchar(max) NOT NULL,CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME());
IF OBJECT_ID('dbo.RetailPurchaseInvoices') IS NULL
 CREATE TABLE dbo.RetailPurchaseInvoices(InvoiceKey char(64) NOT NULL PRIMARY KEY,ContentDigest char(64) NOT NULL,PurchaseId int NOT NULL REFERENCES dbo.Purchases(Id),RequestId nvarchar(100) NOT NULL REFERENCES dbo.RetailPurchaseRequests(RequestId));
GO
-- Change only the default used for future product inserts, never historic values.
DECLARE @taxDefault sysname,@dropTaxDefaultSql nvarchar(max);
SELECT @taxDefault=dc.name FROM sys.default_constraints dc JOIN sys.columns col ON col.object_id=dc.parent_object_id AND col.column_id=dc.parent_column_id WHERE dc.parent_object_id=OBJECT_ID('dbo.Products') AND col.name='TaxMode';
IF @taxDefault IS NOT NULL
BEGIN
 SET @dropTaxDefaultSql=N'ALTER TABLE dbo.Products DROP CONSTRAINT '+QUOTENAME(@taxDefault);
 EXEC sys.sp_executesql @dropTaxDefaultSql;
END;
ALTER TABLE dbo.Products ADD CONSTRAINT DF_Products_TaxMode DEFAULT 'INCLUSIVE' FOR TaxMode;
GO
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_ProductBatches_RetailTaxMode')
 ALTER TABLE dbo.ProductBatches WITH NOCHECK ADD CONSTRAINT CK_ProductBatches_RetailTaxMode CHECK(TaxMode IS NULL OR TaxMode IN ('INCLUSIVE','EXCLUSIVE'));
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_PurchaseLines_RetailTaxMode')
 ALTER TABLE dbo.PurchaseLines WITH NOCHECK ADD CONSTRAINT CK_PurchaseLines_RetailTaxMode CHECK(TaxMode IS NULL OR TaxMode IN ('INCLUSIVE','EXCLUSIVE'));
GO

IF OBJECT_ID('dbo.RetailPurchaseSources') IS NULL
 CREATE TABLE dbo.RetailPurchaseSources(SourceDigest char(64) NOT NULL PRIMARY KEY,RequestId nvarchar(100) NOT NULL REFERENCES dbo.RetailPurchaseRequests(RequestId));
GO

-- Preserve the full historic integer range and add sub-paise precision for box/base rates.
-- Existing numeric values are unchanged; only the storage capacity is widened.
DECLARE @rateTable sysname,@rateColumn sysname,@rateNullable bit,@rateSql nvarchar(max);
DECLARE rate_columns CURSOR LOCAL FAST_FORWARD FOR
 SELECT t.name,c.name,c.is_nullable FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
 WHERE t.schema_id=SCHEMA_ID('dbo') AND c.scale<6 AND (
 (t.name='Products' AND c.name IN ('PurchasePrice','Mrp','SalePrice')) OR
 (t.name='ProductBatches' AND c.name IN ('CostPrice','SellingPrice','Mrp')) OR
 (t.name='PurchaseLines' AND c.name IN ('CostPrice','Mrp','SalePrice')) OR
 (t.name='SaleLines' AND c.name IN ('CostPrice','SalePrice')) OR
 (t.name IN ('SalesReturnLines','PurchaseReturnLines') AND c.name='Rate'));
OPEN rate_columns;FETCH NEXT FROM rate_columns INTO @rateTable,@rateColumn,@rateNullable;
WHILE @@FETCH_STATUS=0
BEGIN
 SET @rateSql=N'ALTER TABLE dbo.'+QUOTENAME(@rateTable)+N' ALTER COLUMN '+QUOTENAME(@rateColumn)+N' decimal(22,6) '+CASE WHEN @rateNullable=1 THEN N'NULL' ELSE N'NOT NULL' END;
 EXEC sys.sp_executesql @rateSql;
 FETCH NEXT FROM rate_columns INTO @rateTable,@rateColumn,@rateNullable;
END;
CLOSE rate_columns;DEALLOCATE rate_columns;
GO