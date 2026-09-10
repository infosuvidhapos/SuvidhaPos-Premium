USE [SuvidhaPOS];
GO

-- Counter billing Hold / Unhold queue. A maximum of 10 active held bills is enforced
-- by the API; the database keeps the complete draft JSON so a bill survives app restart.
IF OBJECT_ID('dbo.HeldBills','U') IS NULL
BEGIN
 CREATE TABLE dbo.HeldBills(
  Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_HeldBills PRIMARY KEY,
  HoldNo nvarchar(40) NOT NULL,
  HeldAt datetime2 NOT NULL CONSTRAINT DF_HeldBills_HeldAt DEFAULT SYSDATETIME(),
  CustomerName nvarchar(200) NULL,
  CustomerMobile nvarchar(50) NULL,
  ItemCount int NOT NULL CONSTRAINT DF_HeldBills_ItemCount DEFAULT 0,
  GrandTotal decimal(18,2) NOT NULL CONSTRAINT DF_HeldBills_GrandTotal DEFAULT 0,
  DraftJson nvarchar(max) NOT NULL,
  CreatedBy nvarchar(100) NULL
 );
END
GO

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_HeldBills_HeldAt' AND object_id=OBJECT_ID('dbo.HeldBills'))
 CREATE INDEX IX_HeldBills_HeldAt ON dbo.HeldBills(HeldAt DESC,Id DESC);
GO
