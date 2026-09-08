SET QUOTED_IDENTIFIER ON;
GO
USE [SuvidhaPOS];
GO
IF OBJECT_ID('dbo.ProductUoms') IS NULL CREATE TABLE dbo.ProductUoms(Id int IDENTITY PRIMARY KEY,ProductId int NOT NULL UNIQUE REFERENCES dbo.Products(Id),BaseUnit nvarchar(20) NOT NULL DEFAULT 'PCS',PackUnit nvarchar(20) NOT NULL DEFAULT 'BOX',ConversionFactor decimal(18,6) NOT NULL DEFAULT 1,PackPurchaseRate decimal(18,4) NOT NULL DEFAULT 0,PackMrp decimal(18,4) NOT NULL DEFAULT 0,PackSalePrice decimal(18,4) NOT NULL DEFAULT 0,LooseSalePrice decimal(18,4) NOT NULL DEFAULT 0,AllowLoose bit NOT NULL DEFAULT 1,UpdatedAt datetime2 NOT NULL DEFAULT SYSDATETIME());
GO
IF OBJECT_ID('dbo.JewelleryMetalRates') IS NULL CREATE TABLE dbo.JewelleryMetalRates(Id int IDENTITY PRIMARY KEY,MetalType nvarchar(30) NOT NULL,Purity nvarchar(20) NOT NULL,RatePerGram decimal(18,4) NOT NULL,EffectiveAt datetime2 NOT NULL DEFAULT SYSDATETIME(),IsActive bit NOT NULL DEFAULT 1);
GO
IF OBJECT_ID('dbo.JewelleryItems') IS NULL CREATE TABLE dbo.JewelleryItems(Id int IDENTITY PRIMARY KEY,TagNo nvarchar(80) NOT NULL UNIQUE,Barcode nvarchar(80) NULL,ItemName nvarchar(200) NOT NULL,Category nvarchar(100) NULL,MetalType nvarchar(30) NOT NULL,Purity nvarchar(20) NOT NULL,PurityPercent decimal(8,4) NOT NULL DEFAULT 0,Huid nvarchar(80) NULL,GrossWeight decimal(18,4) NOT NULL DEFAULT 0,NetWeight decimal(18,4) NOT NULL DEFAULT 0,StoneWeight decimal(18,4) NOT NULL DEFAULT 0,MakingChargeType nvarchar(20) NOT NULL DEFAULT 'FLAT',MakingValue decimal(18,4) NOT NULL DEFAULT 0,Status nvarchar(30) NOT NULL DEFAULT 'IN_STOCK',RackName nvarchar(80) NULL,CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME());
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_JewelleryItems_Barcode') CREATE UNIQUE INDEX IX_JewelleryItems_Barcode ON dbo.JewelleryItems(Barcode) WHERE Barcode IS NOT NULL AND Barcode<>'';
GO
IF OBJECT_ID('dbo.JewellerySales') IS NULL CREATE TABLE dbo.JewellerySales(Id int IDENTITY PRIMARY KEY,InvoiceNo nvarchar(80) NOT NULL UNIQUE,BillDate datetime2 NOT NULL DEFAULT SYSDATETIME(),CustomerId int NULL REFERENCES dbo.Customers(Id),CustomerName nvarchar(200) NOT NULL,CustomerPan nvarchar(30) NULL,MetalAmount decimal(18,2) NOT NULL DEFAULT 0,StoneAmount decimal(18,2) NOT NULL DEFAULT 0,MakingAmount decimal(18,2) NOT NULL DEFAULT 0,GrossAmount decimal(18,2) NOT NULL DEFAULT 0,GstRate decimal(8,2) NOT NULL DEFAULT 3,Cgst decimal(18,2) NOT NULL DEFAULT 0,Sgst decimal(18,2) NOT NULL DEFAULT 0,OldMetalCredit decimal(18,2) NOT NULL DEFAULT 0,NetPayable decimal(18,2) NOT NULL DEFAULT 0,PaymentMode nvarchar(30) NOT NULL DEFAULT 'Cash',PaidAmount decimal(18,2) NOT NULL DEFAULT 0,Notes nvarchar(500) NULL);
GO
IF OBJECT_ID('dbo.JewellerySaleLines') IS NULL CREATE TABLE dbo.JewellerySaleLines(Id int IDENTITY PRIMARY KEY,SaleId int NOT NULL REFERENCES dbo.JewellerySales(Id),JewelleryItemId int NOT NULL REFERENCES dbo.JewelleryItems(Id),MetalRate decimal(18,4) NOT NULL DEFAULT 0,MetalAmount decimal(18,2) NOT NULL DEFAULT 0,StoneAmount decimal(18,2) NOT NULL DEFAULT 0,MakingAmount decimal(18,2) NOT NULL DEFAULT 0,TotalAmount decimal(18,2) NOT NULL DEFAULT 0);
GO
IF OBJECT_ID('dbo.TaxMaster') IS NULL CREATE TABLE dbo.TaxMaster(Id int IDENTITY PRIMARY KEY,TaxName nvarchar(100) NOT NULL,Rate decimal(8,2) NOT NULL,IsDefault bit NOT NULL DEFAULT 0,IsActive bit NOT NULL DEFAULT 1,CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME());
GO
IF NOT EXISTS(SELECT 1 FROM dbo.TaxMaster WHERE IsDefault=1)
INSERT dbo.TaxMaster(TaxName,Rate,IsDefault,IsActive) VALUES('GST 0%',0,1,1),('GST 3%',3,1,1),('GST 5%',5,1,1),('GST 18%',18,1,1),('GST 40%',40,1,1);
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_TaxMaster_DefaultRate') CREATE UNIQUE INDEX UX_TaxMaster_DefaultRate ON dbo.TaxMaster(Rate) WHERE IsDefault=1 AND IsActive=1;
GO


IF COL_LENGTH('dbo.Sales','CashierName') IS NULL ALTER TABLE dbo.Sales ADD CashierName nvarchar(80) NULL;
IF COL_LENGTH('dbo.Sales','DiscountType') IS NULL ALTER TABLE dbo.Sales ADD DiscountType nvarchar(20) NOT NULL CONSTRAINT DF_Sales_DiscountType DEFAULT 'RUPEES';
IF COL_LENGTH('dbo.Sales','DiscountValue') IS NULL ALTER TABLE dbo.Sales ADD DiscountValue decimal(18,4) NOT NULL CONSTRAINT DF_Sales_DiscountValue DEFAULT 0;
GO
IF OBJECT_ID('dbo.SalePayments') IS NULL CREATE TABLE dbo.SalePayments(
 Id bigint IDENTITY PRIMARY KEY,
 SaleId int NOT NULL REFERENCES dbo.Sales(Id),
 PaymentMode nvarchar(30) NOT NULL,
 PaymentType nvarchar(30) NULL,
 Amount decimal(18,2) NOT NULL DEFAULT 0,
 ReferenceNo nvarchar(100) NULL,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_SalePayments_SaleId') CREATE INDEX IX_SalePayments_SaleId ON dbo.SalePayments(SaleId);
GO

-- Normalize legacy jewellery store types to the single supported Outlet Master option.
IF OBJECT_ID('dbo.OutletMaster') IS NOT NULL
BEGIN
    UPDATE dbo.OutletMaster
       SET StoreType='Jewellery Shop', UpdatedAt=SYSDATETIME()
     WHERE StoreType IN ('Gold & Diamond Jewellery','Silver Jewellery');
END
GO

-- Base-unit inventory / three-level UOM (PACK -> INNER -> BASE).
-- Quantity in ProductBatches and StockLedger remains ALWAYS in BaseUnit.
IF COL_LENGTH('dbo.ProductUoms','InnerUnit') IS NULL ALTER TABLE dbo.ProductUoms ADD InnerUnit nvarchar(20) NULL;
IF COL_LENGTH('dbo.ProductUoms','InnerConversionFactor') IS NULL ALTER TABLE dbo.ProductUoms ADD InnerConversionFactor decimal(18,6) NOT NULL CONSTRAINT DF_ProductUoms_InnerFactor DEFAULT 1;
IF COL_LENGTH('dbo.ProductUoms','PackInnerFactor') IS NULL ALTER TABLE dbo.ProductUoms ADD PackInnerFactor decimal(18,6) NOT NULL CONSTRAINT DF_ProductUoms_PackInnerFactor DEFAULT 1;
IF COL_LENGTH('dbo.ProductUoms','InnerPurchaseRate') IS NULL ALTER TABLE dbo.ProductUoms ADD InnerPurchaseRate decimal(18,4) NOT NULL CONSTRAINT DF_ProductUoms_InnerPurchase DEFAULT 0;
IF COL_LENGTH('dbo.ProductUoms','InnerMrp') IS NULL ALTER TABLE dbo.ProductUoms ADD InnerMrp decimal(18,4) NOT NULL CONSTRAINT DF_ProductUoms_InnerMrp DEFAULT 0;
IF COL_LENGTH('dbo.ProductUoms','InnerSalePrice') IS NULL ALTER TABLE dbo.ProductUoms ADD InnerSalePrice decimal(18,4) NOT NULL CONSTRAINT DF_ProductUoms_InnerSale DEFAULT 0;
GO

-- Every normal product has a UOM definition, even single-unit items (factor 1).
INSERT dbo.ProductUoms(ProductId,BaseUnit,PackUnit,ConversionFactor,PackPurchaseRate,PackMrp,PackSalePrice,LooseSalePrice,AllowLoose)
SELECT p.Id,UPPER(ISNULL(NULLIF(p.Unit,''),'PCS')),UPPER(ISNULL(NULLIF(p.Unit,''),'PCS')),1,p.PurchasePrice,p.Mrp,p.SalePrice,p.SalePrice,1
FROM dbo.Products p
WHERE NOT EXISTS(SELECT 1 FROM dbo.ProductUoms u WHERE u.ProductId=p.Id);
GO

IF COL_LENGTH('dbo.PurchaseLines','UnitPurchased') IS NULL ALTER TABLE dbo.PurchaseLines ADD UnitPurchased nvarchar(20) NULL;
IF COL_LENGTH('dbo.PurchaseLines','PurchasedQty') IS NULL ALTER TABLE dbo.PurchaseLines ADD PurchasedQty decimal(18,3) NULL;
IF COL_LENGTH('dbo.PurchaseLines','TotalBaseQty') IS NULL ALTER TABLE dbo.PurchaseLines ADD TotalBaseQty decimal(18,3) NULL;
IF COL_LENGTH('dbo.PurchaseLines','RatePerPurchasedUnit') IS NULL ALTER TABLE dbo.PurchaseLines ADD RatePerPurchasedUnit decimal(18,4) NULL;
GO

IF COL_LENGTH('dbo.SaleLines','UnitSold') IS NULL ALTER TABLE dbo.SaleLines ADD UnitSold nvarchar(20) NULL;
IF COL_LENGTH('dbo.SaleLines','SoldQuantity') IS NULL ALTER TABLE dbo.SaleLines ADD SoldQuantity decimal(18,3) NULL;
IF COL_LENGTH('dbo.SaleLines','TotalBaseQtyDeducted') IS NULL ALTER TABLE dbo.SaleLines ADD TotalBaseQtyDeducted decimal(18,3) NULL;
IF COL_LENGTH('dbo.SaleLines','RatePerSoldUnit') IS NULL ALTER TABLE dbo.SaleLines ADD RatePerSoldUnit decimal(18,4) NULL;
GO

-- Normalize legacy Products rates from old UI, which stored pack rates in Products.
-- Guards compare against ProductUoms pack rates, so this is idempotent after new base-rate saves.
-- Normalize legacy Products rates from old pack-level storage.
UPDATE p SET
 PurchasePrice=CASE WHEN u.ConversionFactor>1 AND ABS(p.PurchasePrice-u.PackPurchaseRate)<0.0001 THEN u.PackPurchaseRate/u.ConversionFactor ELSE p.PurchasePrice END,
 Mrp=CASE WHEN u.ConversionFactor>1 AND ABS(p.Mrp-u.PackMrp)<0.0001 THEN u.PackMrp/u.ConversionFactor ELSE p.Mrp END,
 SalePrice=CASE WHEN u.LooseSalePrice>0 THEN u.LooseSalePrice WHEN u.ConversionFactor>1 AND ABS(p.SalePrice-u.PackSalePrice)<0.0001 THEN u.PackSalePrice/u.ConversionFactor ELSE p.SalePrice END,
 Unit=u.BaseUnit
FROM dbo.Products p JOIN dbo.ProductUoms u ON u.ProductId=p.Id
WHERE u.ConversionFactor>0;
GO

-- Bill Management Master audit metadata.
IF COL_LENGTH('dbo.Sales','ModifiedAt') IS NULL ALTER TABLE dbo.Sales ADD ModifiedAt datetime2 NULL;
IF COL_LENGTH('dbo.Sales','ModifiedBy') IS NULL ALTER TABLE dbo.Sales ADD ModifiedBy nvarchar(80) NULL;
IF COL_LENGTH('dbo.Sales','ModificationCount') IS NULL ALTER TABLE dbo.Sales ADD ModificationCount int NOT NULL CONSTRAINT DF_Sales_ModificationCount DEFAULT 0;
IF COL_LENGTH('dbo.Sales','LastModificationType') IS NULL ALTER TABLE dbo.Sales ADD LastModificationType nvarchar(30) NULL;
GO

-- Unit Master: canonical searchable units used by Item Master / UOM conversion.
IF OBJECT_ID('dbo.UnitMaster') IS NULL CREATE TABLE dbo.UnitMaster(
 Id int IDENTITY PRIMARY KEY,
 UnitName nvarchar(20) NOT NULL,
 UnitCode nvarchar(20) NOT NULL,
 Description nvarchar(120) NULL,
 UnitCategory nvarchar(30) NOT NULL CONSTRAINT DF_UnitMaster_Category DEFAULT 'COUNT',
 SortOrder int NOT NULL CONSTRAINT DF_UnitMaster_Sort DEFAULT 100,
 IsActive bit NOT NULL CONSTRAINT DF_UnitMaster_Active DEFAULT 1,
 IsSystem bit NOT NULL CONSTRAINT DF_UnitMaster_System DEFAULT 0,
 CreatedAt datetime2 NOT NULL CONSTRAINT DF_UnitMaster_Created DEFAULT SYSDATETIME(),
 UpdatedAt datetime2 NOT NULL CONSTRAINT DF_UnitMaster_Updated DEFAULT SYSDATETIME()
);
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_UnitMaster_Name') CREATE UNIQUE INDEX UX_UnitMaster_Name ON dbo.UnitMaster(UnitName);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_UnitMaster_Code') CREATE UNIQUE INDEX UX_UnitMaster_Code ON dbo.UnitMaster(UnitCode);
GO
;WITH U(UnitName,UnitCode,Description,UnitCategory,SortOrder) AS (
 SELECT * FROM (VALUES
 ('PCS','PCS','Pieces / Each','COUNT',10),
 ('NOS','NOS','Numbers','COUNT',11),
 ('UNIT','UNT','Unit / Each','COUNT',12),
 ('PAIR','PAIR','Pair','COUNT',13),
 ('SET','SET','Set','COUNT',14),
 ('DOZEN','DOZ','Dozen (12)','COUNT',15),
 ('TABLET','TAB','Tablet','MEDICAL',20),
 ('CAPSULE','CAP','Capsule','MEDICAL',21),
 ('STRIP','STRIP','Medicine strip','MEDICAL',22),
 ('BLISTER','BLS','Blister pack','MEDICAL',23),
 ('VIAL','VIAL','Vial','MEDICAL',24),
 ('AMPOULE','AMP','Ampoule','MEDICAL',25),
 ('SACHET','SAC','Sachet','PACKAGING',30),
 ('POUCH','PCH','Pouch','PACKAGING',31),
 ('PACKET','PKT','Packet','PACKAGING',32),
 ('PACK','PACK','Pack','PACKAGING',33),
 ('BOX','BOX','Box','PACKAGING',34),
 ('CARTON','CTN','Carton','PACKAGING',35),
 ('CASE','CASE','Case','PACKAGING',36),
 ('BOTTLE','BTL','Bottle','PACKAGING',37),
 ('TUBE','TUBE','Tube','PACKAGING',38),
 ('JAR','JAR','Jar','PACKAGING',39),
 ('CAN','CAN','Can','PACKAGING',40),
 ('BAG','BAG','Bag','PACKAGING',41),
 ('BUNDLE','BDL','Bundle','PACKAGING',42),
 ('TRAY','TRAY','Tray','PACKAGING',43),
 ('ROLL','ROLL','Roll','PACKAGING',44),
 ('SHEET','SHT','Sheet','PACKAGING',45),
 ('DRUM','DRM','Drum','PACKAGING',46),
 ('BUCKET','BKT','Bucket','PACKAGING',47),
 ('KG','KG','Kilogram','WEIGHT',60),
 ('GRAM','GM','Gram','WEIGHT',61),
 ('MG','MG','Milligram','WEIGHT',62),
 ('QUINTAL','QTL','Quintal','WEIGHT',63),
 ('TON','TON','Metric Ton','WEIGHT',64),
 ('LITRE','LTR','Litre','VOLUME',70),
 ('ML','ML','Millilitre','VOLUME',71),
 ('METER','MTR','Meter','LENGTH',80),
 ('CM','CM','Centimetre','LENGTH',81),
 ('MM','MM','Millimetre','LENGTH',82),
 ('FOOT','FT','Foot','LENGTH',83),
 ('INCH','IN','Inch','LENGTH',84)
 )v(UnitName,UnitCode,Description,UnitCategory,SortOrder)
)
INSERT dbo.UnitMaster(UnitName,UnitCode,Description,UnitCategory,SortOrder,IsActive,IsSystem)
SELECT u.UnitName,u.UnitCode,u.Description,u.UnitCategory,u.SortOrder,1,1 FROM U u
WHERE NOT EXISTS(SELECT 1 FROM dbo.UnitMaster m WHERE UPPER(LTRIM(RTRIM(m.UnitName)))=u.UnitName OR UPPER(LTRIM(RTRIM(m.UnitCode)))=u.UnitCode);
GO
-- Preserve any pre-existing custom unit strings by importing them once.
;WITH Legacy(UnitName) AS (
 SELECT DISTINCT UPPER(LTRIM(RTRIM(Unit))) FROM dbo.Products WHERE NULLIF(LTRIM(RTRIM(Unit)),'') IS NOT NULL
 UNION SELECT DISTINCT UPPER(LTRIM(RTRIM(BaseUnit))) FROM dbo.ProductUoms WHERE NULLIF(LTRIM(RTRIM(BaseUnit)),'') IS NOT NULL
 UNION SELECT DISTINCT UPPER(LTRIM(RTRIM(InnerUnit))) FROM dbo.ProductUoms WHERE NULLIF(LTRIM(RTRIM(InnerUnit)),'') IS NOT NULL
 UNION SELECT DISTINCT UPPER(LTRIM(RTRIM(PackUnit))) FROM dbo.ProductUoms WHERE NULLIF(LTRIM(RTRIM(PackUnit)),'') IS NOT NULL
)
INSERT dbo.UnitMaster(UnitName,UnitCode,Description,UnitCategory,SortOrder,IsActive,IsSystem)
SELECT LEFT(l.UnitName,40),LEFT(l.UnitName,20),'Imported from existing item data','CUSTOM',900,1,0
FROM Legacy l
WHERE l.UnitName IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM dbo.UnitMaster m WHERE UPPER(LTRIM(RTRIM(m.UnitName)))=l.UnitName OR UPPER(LTRIM(RTRIM(m.UnitCode)))=LEFT(l.UnitName,20));
GO
