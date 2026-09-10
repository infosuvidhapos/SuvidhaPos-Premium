USE [SuvidhaPOS];
GO

-- BTC = Bill To Company (not cryptocurrency). Company-credit invoices are raised unpaid
-- and are later knocked off through BTC Settlement / Company Payment.
IF OBJECT_ID('dbo.BtcCompanies') IS NULL
BEGIN
 CREATE TABLE dbo.BtcCompanies(
  Id int IDENTITY PRIMARY KEY,
  CompanyName nvarchar(200) NOT NULL,
  GstIn nvarchar(30) NULL,
  Phone nvarchar(40) NULL,
  Address nvarchar(500) NULL,
  CreditLimit decimal(18,2) NOT NULL CONSTRAINT DF_BtcCompanies_CreditLimit DEFAULT 0,
  CreditDays int NOT NULL CONSTRAINT DF_BtcCompanies_CreditDays DEFAULT 0,
  IsActive bit NOT NULL CONSTRAINT DF_BtcCompanies_IsActive DEFAULT 1,
  CreatedAt datetime2 NOT NULL CONSTRAINT DF_BtcCompanies_CreatedAt DEFAULT SYSDATETIME(),
  UpdatedAt datetime2 NOT NULL CONSTRAINT DF_BtcCompanies_UpdatedAt DEFAULT SYSDATETIME()
 );
END
GO

IF COL_LENGTH('dbo.Sales','BtcCompanyId') IS NULL ALTER TABLE dbo.Sales ADD BtcCompanyId int NULL;
IF COL_LENGTH('dbo.Sales','BtcReferenceNo') IS NULL ALTER TABLE dbo.Sales ADD BtcReferenceNo nvarchar(120) NULL;
IF COL_LENGTH('dbo.Sales','PaymentStatus') IS NULL ALTER TABLE dbo.Sales ADD PaymentStatus nvarchar(30) NULL;
IF COL_LENGTH('dbo.Sales','PendingAmount') IS NULL ALTER TABLE dbo.Sales ADD PendingAmount decimal(18,2) NOT NULL CONSTRAINT DF_Sales_PendingAmount DEFAULT 0 WITH VALUES;
IF COL_LENGTH('dbo.Sales','BtcDueDate') IS NULL ALTER TABLE dbo.Sales ADD BtcDueDate date NULL;
GO

IF OBJECT_ID('dbo.BtcSettlements') IS NULL
BEGIN
 CREATE TABLE dbo.BtcSettlements(
  Id bigint IDENTITY PRIMARY KEY,
  ReceiptNo nvarchar(80) NOT NULL,
  CompanyId int NOT NULL,
  SettlementDate datetime2 NOT NULL CONSTRAINT DF_BtcSettlements_Date DEFAULT SYSDATETIME(),
  TotalAmount decimal(18,2) NOT NULL,
  PaymentMode nvarchar(40) NOT NULL,
  ReferenceNo nvarchar(120) NULL,
  Notes nvarchar(500) NULL,
  CreatedBy nvarchar(80) NULL
 );
END
GO

IF OBJECT_ID('dbo.BtcSettlementPayments') IS NULL
BEGIN
 CREATE TABLE dbo.BtcSettlementPayments(
  Id bigint IDENTITY PRIMARY KEY,
  SettlementId bigint NOT NULL,
  PaymentMode nvarchar(40) NOT NULL,
  Amount decimal(18,2) NOT NULL,
  ReferenceNo nvarchar(120) NULL
 );
END
GO

IF OBJECT_ID('dbo.BtcSettlementAllocations') IS NULL
BEGIN
 CREATE TABLE dbo.BtcSettlementAllocations(
  Id bigint IDENTITY PRIMARY KEY,
  SettlementId bigint NOT NULL,
  SaleId int NOT NULL,
  Amount decimal(18,2) NOT NULL
 );
END
GO

IF OBJECT_ID('dbo.BtcCompanyLedger') IS NULL
BEGIN
 CREATE TABLE dbo.BtcCompanyLedger(
  Id bigint IDENTITY PRIMARY KEY,
  CompanyId int NOT NULL,
  TxnDate datetime2 NOT NULL CONSTRAINT DF_BtcCompanyLedger_Date DEFAULT SYSDATETIME(),
  EntryType nvarchar(30) NOT NULL,
  ReferenceType nvarchar(30) NULL,
  ReferenceId bigint NULL,
  ReferenceNo nvarchar(120) NULL,
  Debit decimal(18,2) NOT NULL CONSTRAINT DF_BtcCompanyLedger_Debit DEFAULT 0,
  Credit decimal(18,2) NOT NULL CONSTRAINT DF_BtcCompanyLedger_Credit DEFAULT 0,
  Notes nvarchar(500) NULL
 );
END
GO

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_BtcCompanies_Name' AND object_id=OBJECT_ID('dbo.BtcCompanies'))
 CREATE INDEX IX_BtcCompanies_Name ON dbo.BtcCompanies(CompanyName,IsActive);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_Sales_BtcPending' AND object_id=OBJECT_ID('dbo.Sales'))
 CREATE INDEX IX_Sales_BtcPending ON dbo.Sales(BtcCompanyId,PaymentMode,PendingAmount,BillDate);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_BtcSettlementAllocations_Sale' AND object_id=OBJECT_ID('dbo.BtcSettlementAllocations'))
 CREATE INDEX IX_BtcSettlementAllocations_Sale ON dbo.BtcSettlementAllocations(SaleId,SettlementId);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_BtcCompanyLedger_CompanyDate' AND object_id=OBJECT_ID('dbo.BtcCompanyLedger'))
 CREATE INDEX IX_BtcCompanyLedger_CompanyDate ON dbo.BtcCompanyLedger(CompanyId,TxnDate,Id);
GO
