USE SuvidhaPOS;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF EXISTS(SELECT 1 FROM Users WHERE UserName='admin' AND MustChangePassword=1)
BEGIN
    UPDATE Users
    SET PasswordHash='PBKDF2$120000$kUAz5qw3w7g7JkxBMs1e7w==$HHayZpXwLGN8Q1eQfH9AqPS91FotlaQFyC+E6lCAeuk=',
        MustChangePassword=1,
        IsActive=1
    WHERE UserName='admin';
END

IF NOT EXISTS(SELECT 1 FROM Products) BEGIN
INSERT Products(Name,Barcode,Sku,CategoryId,Category,Unit,Hsn,GstRate,Mrp,PurchasePrice,SalePrice,MinStock,MaxStock) VALUES
('Paracetamol 500mg','890000000001','PCM500',3,'Medicine','PCS','3004',12,30,18,25,10,100),
('Vitamin C 500mg','890000000002','VITC500',3,'Medicine','PCS','3004',12,150,100,125,8,80),
('Mineral Water 1L','890000000003','WAT1L',4,'Beverages','BTL','2201',12,25,12,20,200,500),
('Premium Tea 250g','890000000004','TEA250',2,'Grocery','PKT','0902',5,180,125,160,10,100);
INSERT ProductBatches(ProductId,BatchNo,Quantity,CostPrice,SellingPrice,Mrp,ManufactureDate,ExpiryDate) SELECT Id,'OPEN-001',50,PurchasePrice,SalePrice,Mrp,CAST(GETDATE() AS date),DATEADD(month,12,CAST(GETDATE() AS date)) FROM Products;
INSERT StockLedger(ProductId,BatchId,MovementType,Quantity,ReferenceType,Notes) SELECT p.Id,b.Id,'OPENING',b.Quantity,'OPENING','Initial sample stock' FROM Products p JOIN ProductBatches b ON b.ProductId=p.Id;
END
