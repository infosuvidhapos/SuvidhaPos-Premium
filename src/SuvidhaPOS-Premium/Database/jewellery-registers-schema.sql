SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF OBJECT_ID('dbo.JewelleryRegisters') IS NULL
BEGIN
 CREATE TABLE dbo.JewelleryRegisters(
  Id int IDENTITY PRIMARY KEY,
  Kind nvarchar(20) NOT NULL,
  RequestId uniqueidentifier NOT NULL UNIQUE,
  PartyName nvarchar(200) NOT NULL,
  Title nvarchar(200) NOT NULL,
  RecordDate date NOT NULL,
  Status nvarchar(30) NOT NULL,
  Amount decimal(18,2) NOT NULL,
  PaidAmount decimal(18,2) NOT NULL,
  Details nvarchar(max) NOT NULL CHECK(ISJSON(Details)=1),
  Revision int NOT NULL DEFAULT 1,
  CreatedBy nvarchar(80) NOT NULL,
  CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME(),
  UpdatedAt datetime2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT CK_JewelleryRegisters_Kind CHECK(Kind IN ('ESTIMATE','ISSUE','KARIGAR','JOB','REPAIR','GIRVI','LEDGER','SCHEME'))
 );
 CREATE INDEX IX_JewelleryRegisters_KindDate ON dbo.JewelleryRegisters(Kind,RecordDate DESC,Id DESC);
END;
GO
IF OBJECT_ID('dbo.JewelleryRegisterEvents') IS NULL
BEGIN
 CREATE TABLE dbo.JewelleryRegisterEvents(
  Id int IDENTITY PRIMARY KEY,
  RegisterId int NOT NULL REFERENCES dbo.JewelleryRegisters(Id),
  RequestId uniqueidentifier NOT NULL,
  EventType nvarchar(30) NOT NULL,
  EventDate date NOT NULL,
  Amount decimal(18,2) NOT NULL DEFAULT 0,
  Notes nvarchar(500) NULL,
  PaymentMode nvarchar(30) NULL,
  ReferenceNo nvarchar(100) NULL,
  Snapshot nvarchar(max) NOT NULL CHECK(ISJSON(Snapshot)=1),
  CreatedBy nvarchar(80) NOT NULL,
  CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT UQ_JewelleryRegisterEvent UNIQUE(RegisterId,RequestId)
 );
END;
GO
