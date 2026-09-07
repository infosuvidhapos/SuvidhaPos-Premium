USE [SuvidhaPOS];
GO
IF COL_LENGTH('dbo.Sales','PrintFormat') IS NULL ALTER TABLE dbo.Sales ADD PrintFormat nvarchar(40) NOT NULL CONSTRAINT DF_Sales_PrintFormat DEFAULT 'Thermal Printer 80MM';
GO
IF COL_LENGTH('dbo.Sales','PrintTemplate') IS NULL ALTER TABLE dbo.Sales ADD PrintTemplate nvarchar(40) NOT NULL CONSTRAINT DF_Sales_PrintTemplate DEFAULT 'T01';
GO
IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]='Print.BillFormat') INSERT dbo.AppSettings([Key],[Value]) VALUES('Print.BillFormat','Thermal Printer 80MM');
IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]='Print.BillMode') INSERT dbo.AppSettings([Key],[Value]) VALUES('Print.BillMode','Thermal');
IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]='Print.ThermalWidth') INSERT dbo.AppSettings([Key],[Value]) VALUES('Print.ThermalWidth','80MM');
IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]='Print.BillTemplate') INSERT dbo.AppSettings([Key],[Value]) VALUES('Print.BillTemplate','T01');
GO
CREATE OR ALTER TRIGGER dbo.TR_Sales_SetPrintFormat ON dbo.Sales AFTER INSERT AS
BEGIN
 SET NOCOUNT ON;
 UPDATE s SET
  PrintFormat=COALESCE(NULLIF(fmt.[Value],''),'Thermal Printer 80MM'),
  PrintTemplate=COALESCE(NULLIF(tpl.[Value],''),'T01')
 FROM dbo.Sales s
 JOIN inserted i ON i.Id=s.Id
 OUTER APPLY (SELECT TOP 1 [Value] FROM dbo.AppSettings WHERE [Key]='Print.BillFormat') fmt
 OUTER APPLY (SELECT TOP 1 [Value] FROM dbo.AppSettings WHERE [Key]='Print.BillTemplate') tpl;
END;
GO
