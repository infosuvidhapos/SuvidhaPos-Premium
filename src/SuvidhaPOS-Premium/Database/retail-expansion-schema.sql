USE [SuvidhaPOS];
GO

-- Retail expansion 6.14.x: outlet geography + BTC advance receipts.
IF COL_LENGTH('dbo.OutletMaster','State') IS NULL
 ALTER TABLE dbo.OutletMaster ADD State nvarchar(100) NULL;
IF COL_LENGTH('dbo.OutletMaster','City') IS NULL
 ALTER TABLE dbo.OutletMaster ADD City nvarchar(120) NULL;
GO

IF OBJECT_ID('dbo.BtcAdvances') IS NULL
BEGIN
 CREATE TABLE dbo.BtcAdvances(
  Id bigint IDENTITY PRIMARY KEY,
  ReceiptNo nvarchar(80) NOT NULL,
  CompanyId int NOT NULL,
  Amount decimal(18,2) NOT NULL,
  PaymentMode nvarchar(40) NOT NULL,
  ReferenceNo nvarchar(120) NULL,
  Notes nvarchar(500) NULL,
  CreatedAt datetime2 NOT NULL CONSTRAINT DF_BtcAdvances_CreatedAt DEFAULT SYSDATETIME(),
  CreatedBy nvarchar(80) NULL
 );
END
GO

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_BtcAdvances_CompanyDate' AND object_id=OBJECT_ID('dbo.BtcAdvances'))
 CREATE INDEX IX_BtcAdvances_CompanyDate ON dbo.BtcAdvances(CompanyId,CreatedAt,Id);
GO
