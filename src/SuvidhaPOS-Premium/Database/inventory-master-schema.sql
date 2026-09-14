IF OBJECT_ID('dbo.StockDamageEntries') IS NULL
CREATE TABLE dbo.StockDamageEntries(
 Id int IDENTITY PRIMARY KEY,
 DamageNo nvarchar(80) NOT NULL UNIQUE,
 DamageDate datetime2 NOT NULL DEFAULT SYSDATETIME(),
 Reason nvarchar(300) NOT NULL,
 Notes nvarchar(500) NULL,
 CreatedBy nvarchar(80) NULL,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
IF OBJECT_ID('dbo.StockDamageLines') IS NULL
CREATE TABLE dbo.StockDamageLines(
 Id bigint IDENTITY PRIMARY KEY,
 DamageId int NOT NULL REFERENCES dbo.StockDamageEntries(Id),
 ProductId int NOT NULL REFERENCES dbo.Products(Id),
 BatchId int NOT NULL REFERENCES dbo.ProductBatches(Id),
 Quantity decimal(18,3) NOT NULL,
 CostPrice decimal(18,6) NOT NULL DEFAULT 0
);
IF OBJECT_ID('dbo.StockReceipts') IS NULL
CREATE TABLE dbo.StockReceipts(
 Id int IDENTITY PRIMARY KEY,
 ReceiptNo nvarchar(80) NOT NULL UNIQUE,
 ReceiptDate datetime2 NOT NULL DEFAULT SYSDATETIME(),
 SourceName nvarchar(200) NULL,
 ReferenceNo nvarchar(100) NULL,
 Notes nvarchar(500) NULL,
 CreatedBy nvarchar(80) NULL,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
IF OBJECT_ID('dbo.StockReceiptLines') IS NULL
CREATE TABLE dbo.StockReceiptLines(
 Id bigint IDENTITY PRIMARY KEY,
 ReceiptId int NOT NULL REFERENCES dbo.StockReceipts(Id),
 ProductId int NOT NULL REFERENCES dbo.Products(Id),
 BatchId int NOT NULL REFERENCES dbo.ProductBatches(Id),
 Quantity decimal(18,3) NOT NULL,
 CostPrice decimal(18,6) NOT NULL DEFAULT 0
);
IF OBJECT_ID('dbo.StockTransfers') IS NULL
CREATE TABLE dbo.StockTransfers(
 Id int IDENTITY PRIMARY KEY,
 TransferNo nvarchar(80) NOT NULL UNIQUE,
 TransferDate datetime2 NOT NULL DEFAULT SYSDATETIME(),
 FromOutlet nvarchar(200) NOT NULL,
 ToOutlet nvarchar(200) NOT NULL,
 Status nvarchar(30) NOT NULL DEFAULT 'IN_TRANSIT',
 Notes nvarchar(500) NULL,
 CreatedBy nvarchar(80) NULL,
 CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
);
IF OBJECT_ID('dbo.StockTransferLines') IS NULL
CREATE TABLE dbo.StockTransferLines(
 Id bigint IDENTITY PRIMARY KEY,
 TransferId int NOT NULL REFERENCES dbo.StockTransfers(Id),
 ProductId int NOT NULL REFERENCES dbo.Products(Id),
 BatchId int NOT NULL REFERENCES dbo.ProductBatches(Id),
 Quantity decimal(18,3) NOT NULL,
 CostPrice decimal(18,6) NOT NULL DEFAULT 0
);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_StockTransfers_Date' AND object_id=OBJECT_ID('dbo.StockTransfers'))
 CREATE INDEX IX_StockTransfers_Date ON dbo.StockTransfers(TransferDate);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_StockTransferLines_Product' AND object_id=OBJECT_ID('dbo.StockTransferLines'))
 CREATE INDEX IX_StockTransferLines_Product ON dbo.StockTransferLines(ProductId,TransferId);
GO
