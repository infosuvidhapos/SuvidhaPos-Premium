USE SuvidhaPOS;
IF NOT EXISTS(SELECT 1 FROM Products) BEGIN
INSERT Products(Name,Barcode,Sku,CategoryId,Category,Unit,Hsn,GstRate,Mrp,PurchasePrice,SalePrice,MinStock,MaxStock) VALUES
('Paracetamol 500mg','890000000001','PCM500',3,'Medicine','PCS','3004',12,30,18,25,10,100),
('Vitamin C 500mg','890000000002','VITC500',3,'Medicine','PCS','3004',12,150,100,125,8,80),
('Mineral Water 1L','890000000003','WAT1L',4,'Beverages','BTL','2201',12,25,12,20,20,200),
('Premium Tea 250g','890000000004','TEA250',2,'Grocery','PKT','0902',5,180,125,160,10,100);
INSERT ProductBatches(ProductId,BatchNo,Quantity,CostPrice,SellingPrice,Mrp,ManufactureDate,ExpiryDate) SELECT Id,'OPEN-001',50,PurchasePrice,SalePrice,Mrp,CAST(GETDATE() AS date),DATEADD(month,12,CAST(GETDATE() AS date)) FROM Products;
INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,Notes) SELECT p.Id,b.Id,'OPENING',b.Quantity,'OPENING','Initial sample stock' FROM Products p JOIN ProductBatches b ON b.ProductId=p.Id;
END
IF OBJECT_ID('dbo.trg_AppSettings_UserEdit','TR') IS NULL EXEC('CREATE TRIGGER dbo.trg_AppSettings_UserEdit ON dbo.AppSettings AFTER INSERT,UPDATE AS BEGIN SET NOCOUNT ON; UPDATE u SET UserName=JSON_VALUE(i.[Value],''$.UserName''),DisplayName=JSON_VALUE(i.[Value],''$.DisplayName''),Role=COALESCE(JSON_VALUE(i.[Value],''$.Role''),u.Role),IsActive=COALESCE(TRY_CONVERT(bit,JSON_VALUE(i.[Value],''$.IsActive'')),u.IsActive) FROM dbo.Users u JOIN inserted i ON i.[Key] LIKE ''UserEdit:%'' AND u.Id=TRY_CONVERT(int,SUBSTRING(i.[Key],10,20)); END');
IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]='Print.Paper') INSERT dbo.AppSettings([Key],[Value]) VALUES('Print.Paper','THERMAL_80MM');
IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]='Print.ThermalTemplate') INSERT dbo.AppSettings([Key],[Value]) VALUES('Print.ThermalTemplate','1');
IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]='Print.A4Template') INSERT dbo.AppSettings([Key],[Value]) VALUES('Print.A4Template','1');
IF NOT EXISTS(SELECT 1 FROM dbo.AppSettings WHERE [Key]='Print.Auto') INSERT dbo.AppSettings([Key],[Value]) VALUES('Print.Auto','1');
