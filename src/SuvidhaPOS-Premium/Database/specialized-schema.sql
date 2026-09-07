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
