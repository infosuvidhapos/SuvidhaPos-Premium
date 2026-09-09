SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- P-05/P-06: normal item inclusive/exclusive GST ownership
IF COL_LENGTH('dbo.Products','TaxMode') IS NULL ALTER TABLE dbo.Products ADD TaxMode nvarchar(20) NOT NULL CONSTRAINT DF_Products_TaxMode DEFAULT 'EXCLUSIVE';
IF COL_LENGTH('dbo.SaleLines','TaxMode') IS NULL ALTER TABLE dbo.SaleLines ADD TaxMode nvarchar(20) NOT NULL CONSTRAINT DF_SaleLines_TaxMode DEFAULT 'EXCLUSIVE';
GO

-- P-01/P-08/P-09: Premium Jewellery Item Master extension
IF COL_LENGTH('dbo.JewelleryItems','DesignCode') IS NULL ALTER TABLE dbo.JewelleryItems ADD DesignCode nvarchar(80) NULL;
IF COL_LENGTH('dbo.JewelleryItems','SubCategory') IS NULL ALTER TABLE dbo.JewelleryItems ADD SubCategory nvarchar(100) NULL;
IF COL_LENGTH('dbo.JewelleryItems','CollectionName') IS NULL ALTER TABLE dbo.JewelleryItems ADD CollectionName nvarchar(100) NULL;
IF COL_LENGTH('dbo.JewelleryItems','BrandName') IS NULL ALTER TABLE dbo.JewelleryItems ADD BrandName nvarchar(100) NULL;
IF COL_LENGTH('dbo.JewelleryItems','SupplierName') IS NULL ALTER TABLE dbo.JewelleryItems ADD SupplierName nvarchar(200) NULL;
IF COL_LENGTH('dbo.JewelleryItems','KarigarName') IS NULL ALTER TABLE dbo.JewelleryItems ADD KarigarName nvarchar(200) NULL;
IF COL_LENGTH('dbo.JewelleryItems','HallmarkStatus') IS NULL ALTER TABLE dbo.JewelleryItems ADD HallmarkStatus nvarchar(30) NULL;
IF COL_LENGTH('dbo.JewelleryItems','WeightUnit') IS NULL ALTER TABLE dbo.JewelleryItems ADD WeightUnit nvarchar(10) NOT NULL CONSTRAINT DF_JewelleryItems_WeightUnit DEFAULT 'G';
IF COL_LENGTH('dbo.JewelleryItems','LessWeight') IS NULL ALTER TABLE dbo.JewelleryItems ADD LessWeight decimal(18,4) NOT NULL CONSTRAINT DF_JewelleryItems_LessWeight DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','FineWeight') IS NULL ALTER TABLE dbo.JewelleryItems ADD FineWeight decimal(18,4) NOT NULL CONSTRAINT DF_JewelleryItems_FineWeight DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','WastagePercent') IS NULL ALTER TABLE dbo.JewelleryItems ADD WastagePercent decimal(8,4) NOT NULL CONSTRAINT DF_JewelleryItems_Wastage DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','StoneType') IS NULL ALTER TABLE dbo.JewelleryItems ADD StoneType nvarchar(80) NULL;
IF COL_LENGTH('dbo.JewelleryItems','StonePieces') IS NULL ALTER TABLE dbo.JewelleryItems ADD StonePieces int NOT NULL CONSTRAINT DF_JewelleryItems_StonePieces DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','StoneCarat') IS NULL ALTER TABLE dbo.JewelleryItems ADD StoneCarat decimal(18,4) NOT NULL CONSTRAINT DF_JewelleryItems_StoneCarat DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','StoneValue') IS NULL ALTER TABLE dbo.JewelleryItems ADD StoneValue decimal(18,2) NOT NULL CONSTRAINT DF_JewelleryItems_StoneValue DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','CertificateNo') IS NULL ALTER TABLE dbo.JewelleryItems ADD CertificateNo nvarchar(100) NULL;
IF COL_LENGTH('dbo.JewelleryItems','CertificateLab') IS NULL ALTER TABLE dbo.JewelleryItems ADD CertificateLab nvarchar(80) NULL;
IF COL_LENGTH('dbo.JewelleryItems','LabourCharge') IS NULL ALTER TABLE dbo.JewelleryItems ADD LabourCharge decimal(18,2) NOT NULL CONSTRAINT DF_JewelleryItems_Labour DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','HallmarkCharge') IS NULL ALTER TABLE dbo.JewelleryItems ADD HallmarkCharge decimal(18,2) NOT NULL CONSTRAINT DF_JewelleryItems_HallmarkCharge DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','OtherCharge') IS NULL ALTER TABLE dbo.JewelleryItems ADD OtherCharge decimal(18,2) NOT NULL CONSTRAINT DF_JewelleryItems_OtherCharge DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','HsnCode') IS NULL ALTER TABLE dbo.JewelleryItems ADD HsnCode nvarchar(20) NULL;
IF COL_LENGTH('dbo.JewelleryItems','GstMode') IS NULL ALTER TABLE dbo.JewelleryItems ADD GstMode nvarchar(20) NOT NULL CONSTRAINT DF_JewelleryItems_GstMode DEFAULT 'EXCLUSIVE';
IF COL_LENGTH('dbo.JewelleryItems','GstRate') IS NULL ALTER TABLE dbo.JewelleryItems ADD GstRate decimal(8,2) NOT NULL CONSTRAINT DF_JewelleryItems_GstRate DEFAULT 3;
IF COL_LENGTH('dbo.JewelleryItems','Mrp') IS NULL ALTER TABLE dbo.JewelleryItems ADD Mrp decimal(18,2) NOT NULL CONSTRAINT DF_JewelleryItems_Mrp DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','PurchasePrice') IS NULL ALTER TABLE dbo.JewelleryItems ADD PurchasePrice decimal(18,2) NOT NULL CONSTRAINT DF_JewelleryItems_Purchase DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','SalePrice') IS NULL ALTER TABLE dbo.JewelleryItems ADD SalePrice decimal(18,2) NOT NULL CONSTRAINT DF_JewelleryItems_Sale DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','WholesalePrice') IS NULL ALTER TABLE dbo.JewelleryItems ADD WholesalePrice decimal(18,2) NOT NULL CONSTRAINT DF_JewelleryItems_Wholesale DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','MinSalePrice') IS NULL ALTER TABLE dbo.JewelleryItems ADD MinSalePrice decimal(18,2) NOT NULL CONSTRAINT DF_JewelleryItems_MinSale DEFAULT 0;
IF COL_LENGTH('dbo.JewelleryItems','OpeningQty') IS NULL ALTER TABLE dbo.JewelleryItems ADD OpeningQty decimal(18,3) NOT NULL CONSTRAINT DF_JewelleryItems_OpeningQty DEFAULT 1;
IF COL_LENGTH('dbo.JewelleryItems','LocationCode') IS NULL ALTER TABLE dbo.JewelleryItems ADD LocationCode nvarchar(80) NULL;
IF COL_LENGTH('dbo.JewelleryItems','TrayName') IS NULL ALTER TABLE dbo.JewelleryItems ADD TrayName nvarchar(80) NULL;
IF COL_LENGTH('dbo.JewelleryItems','BoxName') IS NULL ALTER TABLE dbo.JewelleryItems ADD BoxName nvarchar(80) NULL;
IF COL_LENGTH('dbo.JewelleryItems','InwardDate') IS NULL ALTER TABLE dbo.JewelleryItems ADD InwardDate date NULL;
IF COL_LENGTH('dbo.JewelleryItems','ImagePath') IS NULL ALTER TABLE dbo.JewelleryItems ADD ImagePath nvarchar(500) NULL;
IF COL_LENGTH('dbo.JewelleryItems','Notes') IS NULL ALTER TABLE dbo.JewelleryItems ADD Notes nvarchar(1000) NULL;
IF COL_LENGTH('dbo.JewelleryItems','UpdatedAt') IS NULL ALTER TABLE dbo.JewelleryItems ADD UpdatedAt datetime2 NOT NULL CONSTRAINT DF_JewelleryItems_UpdatedAt DEFAULT SYSDATETIME();
GO

IF OBJECT_ID('dbo.JewelleryItemStones') IS NULL
CREATE TABLE dbo.JewelleryItemStones(
 Id int IDENTITY PRIMARY KEY,
 JewelleryItemId int NOT NULL REFERENCES dbo.JewelleryItems(Id),
 StoneType nvarchar(80) NULL,
 Pieces int NOT NULL DEFAULT 0,
 Weight decimal(18,4) NOT NULL DEFAULT 0,
 Carat decimal(18,4) NOT NULL DEFAULT 0,
 Rate decimal(18,2) NOT NULL DEFAULT 0,
 Amount decimal(18,2) NOT NULL DEFAULT 0,
 CertificateNo nvarchar(100) NULL,
 Lab nvarchar(80) NULL
);
GO

-- P-02/P-12/P-13: jewellery sale snapshot extensions
IF COL_LENGTH('dbo.JewellerySales','SaleType') IS NULL ALTER TABLE dbo.JewellerySales ADD SaleType nvarchar(20) NOT NULL CONSTRAINT DF_JewellerySales_SaleType DEFAULT 'RETAIL';
IF COL_LENGTH('dbo.JewellerySales','Discount') IS NULL ALTER TABLE dbo.JewellerySales ADD Discount decimal(18,2) NOT NULL CONSTRAINT DF_JewellerySales_Discount DEFAULT 0;
IF COL_LENGTH('dbo.JewellerySaleLines','NetWeight') IS NULL ALTER TABLE dbo.JewellerySaleLines ADD NetWeight decimal(18,4) NOT NULL CONSTRAINT DF_JewellerySaleLines_NetWeight DEFAULT 0;
IF COL_LENGTH('dbo.JewellerySaleLines','FineWeight') IS NULL ALTER TABLE dbo.JewellerySaleLines ADD FineWeight decimal(18,4) NOT NULL CONSTRAINT DF_JewellerySaleLines_FineWeight DEFAULT 0;
IF COL_LENGTH('dbo.JewellerySaleLines','WastagePercent') IS NULL ALTER TABLE dbo.JewellerySaleLines ADD WastagePercent decimal(8,4) NOT NULL CONSTRAINT DF_JewellerySaleLines_Wastage DEFAULT 0;
IF COL_LENGTH('dbo.JewellerySaleLines','GstMode') IS NULL ALTER TABLE dbo.JewellerySaleLines ADD GstMode nvarchar(20) NOT NULL CONSTRAINT DF_JewellerySaleLines_GstMode DEFAULT 'EXCLUSIVE';
IF COL_LENGTH('dbo.JewellerySaleLines','GstRate') IS NULL ALTER TABLE dbo.JewellerySaleLines ADD GstRate decimal(8,2) NOT NULL CONSTRAINT DF_JewellerySaleLines_GstRate DEFAULT 3;
GO

-- P-13/P-14: settlement and old-metal audit
IF OBJECT_ID('dbo.JewellerySalePayments') IS NULL
CREATE TABLE dbo.JewellerySalePayments(
 Id bigint IDENTITY PRIMARY KEY,
 SaleId int NOT NULL REFERENCES dbo.JewellerySales(Id),
 PaymentMode nvarchar(40) NOT NULL,
 Amount decimal(18,2) NOT NULL DEFAULT 0,
 ReferenceNo nvarchar(100) NULL,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
IF OBJECT_ID('dbo.JewelleryOldMetalEntries') IS NULL
CREATE TABLE dbo.JewelleryOldMetalEntries(
 Id bigint IDENTITY PRIMARY KEY,
 SaleId int NOT NULL REFERENCES dbo.JewellerySales(Id),
 MetalType nvarchar(30) NOT NULL,
 GrossWeight decimal(18,4) NOT NULL DEFAULT 0,
 LessWeight decimal(18,4) NOT NULL DEFAULT 0,
 NetWeight decimal(18,4) NOT NULL DEFAULT 0,
 PurityPercent decimal(8,4) NOT NULL DEFAULT 0,
 FineWeight decimal(18,4) NOT NULL DEFAULT 0,
 RatePerGram decimal(18,4) NOT NULL DEFAULT 0,
 Amount decimal(18,2) NOT NULL DEFAULT 0,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- P-02: dedicated non-sale Jewellery registers
IF OBJECT_ID('dbo.JewelleryVouchers') IS NULL
CREATE TABLE dbo.JewelleryVouchers(
 Id int IDENTITY PRIMARY KEY,
 VoucherNo nvarchar(80) NOT NULL UNIQUE,
 VoucherType nvarchar(30) NOT NULL,
 VoucherDate datetime2 NOT NULL DEFAULT SYSDATETIME(),
 PartyName nvarchar(200) NULL,
 GrossAmount decimal(18,2) NOT NULL DEFAULT 0,
 GstRate decimal(8,2) NOT NULL DEFAULT 0,
 GstAmount decimal(18,2) NOT NULL DEFAULT 0,
 NetAmount decimal(18,2) NOT NULL DEFAULT 0,
 PaymentMode nvarchar(40) NULL,
 PaidAmount decimal(18,2) NOT NULL DEFAULT 0,
 Notes nvarchar(1000) NULL,
 CreatedBy nvarchar(100) NULL
);
IF OBJECT_ID('dbo.JewelleryVoucherLines') IS NULL
CREATE TABLE dbo.JewelleryVoucherLines(
 Id bigint IDENTITY PRIMARY KEY,
 VoucherId int NOT NULL REFERENCES dbo.JewelleryVouchers(Id),
 JewelleryItemId int NULL REFERENCES dbo.JewelleryItems(Id),
 TagNo nvarchar(80) NULL,
 ItemName nvarchar(200) NOT NULL,
 MetalType nvarchar(30) NULL,
 Purity nvarchar(20) NULL,
 GrossWeight decimal(18,4) NOT NULL DEFAULT 0,
 NetWeight decimal(18,4) NOT NULL DEFAULT 0,
 FineWeight decimal(18,4) NOT NULL DEFAULT 0,
 RatePerGram decimal(18,4) NOT NULL DEFAULT 0,
 MakingAmount decimal(18,2) NOT NULL DEFAULT 0,
 StoneAmount decimal(18,2) NOT NULL DEFAULT 0,
 Amount decimal(18,2) NOT NULL DEFAULT 0
);
GO

-- P-03/P-17: Barcode Print Master audit
IF OBJECT_ID('dbo.BarcodePrintJobs') IS NULL
CREATE TABLE dbo.BarcodePrintJobs(
 Id bigint IDENTITY PRIMARY KEY,
 Scope nvarchar(20) NOT NULL,
 TemplateCode nvarchar(30) NOT NULL,
 ItemKey nvarchar(100) NULL,
 Copies int NOT NULL DEFAULT 1,
 PrinterName nvarchar(200) NULL,
 CreatedBy nvarchar(100) NULL,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- P-05/P-06/P-07/P-18/P-19: import job and conflict audit
IF OBJECT_ID('dbo.ItemImportJobs') IS NULL
CREATE TABLE dbo.ItemImportJobs(
 Id bigint IDENTITY PRIMARY KEY,
 Scope nvarchar(20) NOT NULL,
 SourceFileName nvarchar(260) NULL,
 SourceType nvarchar(40) NULL,
 RowsFound int NOT NULL DEFAULT 0,
 RowsAccepted int NOT NULL DEFAULT 0,
 RowsRejected int NOT NULL DEFAULT 0,
 Status nvarchar(30) NOT NULL DEFAULT 'PREVIEW',
 UserName nvarchar(100) NULL,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME(),
 CompletedAt datetime2 NULL
);
IF OBJECT_ID('dbo.ItemImportConflicts') IS NULL
CREATE TABLE dbo.ItemImportConflicts(
 Id bigint IDENTITY PRIMARY KEY,
 JobId bigint NULL REFERENCES dbo.ItemImportJobs(Id),
 RowNumber int NOT NULL DEFAULT 0,
 ConflictType nvarchar(40) NULL,
 FieldName nvarchar(80) NULL,
 RawValue nvarchar(500) NULL,
 Resolution nvarchar(30) NULL,
 Message nvarchar(1000) NULL,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- P-04/P-10: two-way sync audit
IF OBJECT_ID('dbo.OutletSyncLog') IS NULL
CREATE TABLE dbo.OutletSyncLog(
 Id bigint IDENTITY PRIMARY KEY,
 Direction nvarchar(20) NOT NULL,
 Reason nvarchar(40) NULL,
 Status nvarchar(20) NOT NULL,
 Message nvarchar(1000) NULL,
 DurationMs int NOT NULL DEFAULT 0,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- P-16: privileged override audit
IF OBJECT_ID('dbo.PremiumOverrideAudit') IS NULL
CREATE TABLE dbo.PremiumOverrideAudit(
 Id bigint IDENTITY PRIMARY KEY,
 ActionName nvarchar(100) NOT NULL,
 Reason nvarchar(500) NOT NULL,
 UserName nvarchar(100) NULL,
 RoleName nvarchar(40) NULL,
 Details nvarchar(max) NULL,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- P-20: reversible feature flags
IF OBJECT_ID('dbo.PremiumFeatureFlags') IS NULL
CREATE TABLE dbo.PremiumFeatureFlags(
 PointerCode nvarchar(10) NOT NULL PRIMARY KEY,
 FeatureName nvarchar(160) NOT NULL,
 IsEnabled bit NOT NULL DEFAULT 1,
 UpdatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
GO

MERGE dbo.PremiumFeatureFlags AS t
USING (VALUES
('P-01','Premium Jewellery Item Master'),('P-02','Premium Jewellery Billing & Registers'),
('P-03','Barcode Print Master'),('P-04','Outlet 2-way Website Sync'),
('P-05','Split Item Import Masters'),('P-06','Messy Data Cleanup'),
('P-07','Sample Excel Downloads'),('P-08','HUID / Hallmark Controls'),
('P-09','Jewellery Extended DB Schema'),('P-10','Website-owned StoreType / Validity'),
('P-11','Jewellery-only Menu Visibility'),('P-12','Live Rate Snapshot'),
('P-13','Jewellery Multi-payment Settlement'),('P-14','Old Metal Register'),
('P-15','Normal + Jewellery Report Integration'),('P-16','Admin Override Audit'),
('P-17','Barcode Printer Configuration'),('P-18','Import Audit Log'),
('P-19','Import Conflict Resolver'),('P-20','Revert-safe Feature Flags')
) AS s(PointerCode,FeatureName)
ON t.PointerCode=s.PointerCode
WHEN NOT MATCHED THEN INSERT(PointerCode,FeatureName,IsEnabled) VALUES(s.PointerCode,s.FeatureName,1);
GO

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_JewelleryItems_Huid_Completion' AND object_id=OBJECT_ID('dbo.JewelleryItems'))
CREATE INDEX IX_JewelleryItems_Huid_Completion ON dbo.JewelleryItems(Huid) WHERE Huid IS NOT NULL AND Huid<>'';
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_JewelleryItems_DesignCode_Completion' AND object_id=OBJECT_ID('dbo.JewelleryItems'))
CREATE INDEX IX_JewelleryItems_DesignCode_Completion ON dbo.JewelleryItems(DesignCode) WHERE DesignCode IS NOT NULL AND DesignCode<>'';
GO
