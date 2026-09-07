USE [SuvidhaPOS];
GO
IF COL_LENGTH('dbo.Sales','PrintFormat') IS NULL ALTER TABLE dbo.Sales ADD PrintFormat nvarchar(40) NOT NULL CONSTRAINT DF_Sales_PrintFormat DEFAULT 'Thermal Printer 80MM';
GO
IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]='Print.BillFormat') INSERT dbo.AppSettings([Key],[Value]) VALUES('Print.BillFormat','Thermal Printer 80MM');
GO
CREATE OR ALTER TRIGGER dbo.TR_Sales_SetPrintFormat ON dbo.Sales AFTER INSERT AS
BEGIN
 SET NOCOUNT ON;
 UPDATE s SET PrintFormat=COALESCE(NULLIF(a.[Value],''),'Thermal Printer 80MM')
 FROM dbo.Sales s JOIN inserted i ON i.Id=s.Id
 OUTER APPLY (SELECT TOP 1 [Value] FROM dbo.AppSettings WHERE [Key]='Print.BillFormat') a;
END;
GO