namespace SuvidhaPOS.Premium;

public sealed class JewelleryRegisterData
{
 public string PartyName {get;set;}="";
 public int? CustomerId {get;set;}
 public string Phone {get;set;}="";
 public string Address {get;set;}="";
 public string Title {get;set;}="";
 public string Notes {get;set;}="";
 public DateTime Date {get;set;}=DateTime.Today;
 public DateTime? DueDate {get;set;}
 public int? KarigarId {get;set;}
 public int? ItemId {get;set;}
 public string Metal {get;set;}="Gold";
 public decimal Weight {get;set;}
 public decimal ReturnedWeight {get;set;}
 public decimal Amount {get;set;}
 public decimal PaidAmount {get;set;}
 public decimal AnnualRate {get;set;}
 public decimal PrincipalOutstanding {get;set;}
 public decimal InterestOutstanding {get;set;}
 public DateTime AccruedThrough {get;set;}
 public decimal Instalment {get;set;}
 public int Months {get;set;}=12;
 public string Direction {get;set;}="DR";
 public string PaymentMode {get;set;}="Cash";
 public string ReferenceNo {get;set;}="";
 public string Status {get;set;}="";
 public List<JewelleryEstimateLine> Lines {get;set;}=new();
}
public sealed class JewelleryEstimateLine
{
 public string Name {get;set;}="";
 public decimal Quantity {get;set;}=1;
 public decimal Weight {get;set;}
 public decimal Rate {get;set;}
 public decimal Making {get;set;}
 public decimal GstRate {get;set;}
 public string TaxMode {get;set;}="EXCLUSIVE";
}
public sealed class JewelleryRegisterAction
{
 public Guid RequestId {get;set;}
 public int Revision {get;set;}
 public string? PartyName {get;set;}
 public string? Phone {get;set;}
 public string? Address {get;set;}
 public string? Title {get;set;}
 public string Action {get;set;}="";
 public DateTime Date {get;set;}=DateTime.Today;
 public decimal Amount {get;set;}
 public decimal Weight {get;set;}
 public string Notes {get;set;}="";
 public string PaymentMode {get;set;}="Cash";
 public string ReferenceNo {get;set;}="";
}
public static class JewelleryRegisterRules
{
 public static readonly string[] Kinds={"ESTIMATE","ISSUE","KARIGAR","JOB","REPAIR","GIRVI","LEDGER","SCHEME"};
 public static decimal Money(decimal x)=>decimal.Round(x,2,MidpointRounding.AwayFromZero);
 static void Need(bool condition,string message){if(!condition)throw new ArgumentException(message);}
 public static void ValidateKind(string kind)=>Need(Kinds.Contains(kind),"Unknown jewellery register");
 public static void Create(string kind,JewelleryRegisterData d,DateTime today)
 {
  ValidateKind(kind);
  d.PartyName=(d.PartyName??"").Trim();d.Title=(d.Title??"").Trim();
  d.Phone??="";d.Address??="";d.Notes??="";d.ReferenceNo??="";
  Need(d.PartyName.Length is >0 and <=200,"Enter a party/customer name (up to 200 characters)");
  Need(d.Title.Length is >0 and <=200,"Enter an item/description (up to 200 characters)");
  Need(d.Phone.Length<=40&&d.Address.Length<=500&&d.Notes.Length<=500,"Phone, address or notes are too long");
  Need(d.Date.Date<=today.Date&&d.Date.Year>=2000,"Enter a valid record date, not in the future");
  Need(d.DueDate==null||d.DueDate.Value.Date>=d.Date.Date,"Due date cannot precede the record date");
  Need(d.Amount>=0&&d.Amount<=999999999m&&d.PaidAmount>=0&&d.Weight>=0,"Amounts and weight must not be negative");
  d.Amount=Money(d.Amount);d.PaidAmount=Money(d.PaidAmount);d.ReturnedWeight=0;
  d.PrincipalOutstanding=0;d.InterestOutstanding=0;d.AccruedThrough=d.Date.Date;
  d.Status=kind switch{"KARIGAR"=>"ACTIVE","GIRVI"=>"ACTIVE","SCHEME"=>"ACTIVE","ISSUE"=>"ISSUED","LEDGER"=>"POSTED",_=>"OPEN"};
  if(kind=="ESTIMATE"){
   Need(d.Lines!=null&&d.Lines.Count is >0 and <=100,"Add 1 to 100 estimate items");
   decimal total=0;
   foreach(var l in d.Lines!){
    Need(!string.IsNullOrWhiteSpace(l.Name)&&l.Name.Length<=200,"Every estimate line needs an item name");
    Need(l.Quantity>0&&l.Quantity<=100000&&l.Weight>=0&&l.Weight<=100000&&l.Rate>=0&&l.Rate<=99999999&&l.Making>=0&&l.Making<=99999999,"Invalid estimate quantity, weight or rate");
    Need(l.GstRate>=0&&l.GstRate<=100&&(l.TaxMode=="INCLUSIVE"||l.TaxMode=="EXCLUSIVE"),"Invalid estimate GST settings");
    var net=l.Quantity*(l.Weight>0?l.Weight*l.Rate:l.Rate)+l.Making;
    total+=Money(l.TaxMode=="EXCLUSIVE"?net*(1+l.GstRate/100):net);
   }
   Need(total<=999999999,"Estimate total is too large");d.Amount=total;d.PaidAmount=0;
  }
  if(kind=="KARIGAR"){d.Amount=0;d.PaidAmount=0;}
  if(kind=="ISSUE"){
   Need(d.KarigarId>0&&d.ItemId>0&&d.Weight>0,"Select a Karigar, an in-stock tag and issued weight");
   d.Amount=0;d.PaidAmount=0;
  }
  if(kind=="JOB")Need(d.KarigarId>0,"Select a Karigar for this job");
  if(kind=="GIRVI"){
   Need(d.Amount>0&&d.Weight>0,"Enter principal and collateral weight");
   Need(d.AnnualRate>=0&&d.AnnualRate<=100,"Enter the agreed annual interest rate between 0 and 100%");
   d.PrincipalOutstanding=d.Amount;d.PaidAmount=0;
  }
  if(kind=="SCHEME"){
   Need(d.Instalment>0&&d.Months is >0 and <=120,"Enter a positive instalment and 1 to 120 months");
   d.Instalment=Money(d.Instalment);d.Amount=Money(d.Instalment*d.Months);d.PaidAmount=0;d.DueDate=d.Date.AddMonths(d.Months);
  }
  if(kind=="LEDGER"){
   Need(d.CustomerId>0&&d.Amount>0&&(d.Direction=="DR"||d.Direction=="CR"),"Select customer, DR/CR and a positive amount");d.PaidAmount=0;
  }
  Need(d.PaidAmount<=d.Amount,"Advance cannot exceed the total amount");
 }
 public static decimal LoanDue(JewelleryRegisterData d,DateTime on)
 {
  Need(on.Date>=d.AccruedThrough.Date,"Receipt date cannot precede the last loan transaction");
  return Money(d.PrincipalOutstanding+d.InterestOutstanding+Money(d.PrincipalOutstanding*d.AnnualRate/100*(on.Date-d.AccruedThrough.Date).Days/365));
 }
 public static void Act(string kind,JewelleryRegisterData d,JewelleryRegisterAction a,DateTime today)
 {
  ValidateKind(kind);a.Action=(a.Action??"").ToUpperInvariant();a.Amount=Money(a.Amount);a.Notes??="";a.ReferenceNo??="";
  Need(a.Date.Date>=d.Date.Date&&a.Date.Date<=today.Date,"Transaction date must be between the record date and today");
  Need(a.Notes.Length<=500&&a.ReferenceNo.Length<=100,"Notes or reference are too long");
  Need(a.Amount>=0&&a.Weight>=0,"Amount and returned weight cannot be negative");
  if(a.Action=="PAYMENT")Need(new[]{"Cash","UPI","Card","Bank","Cheque"}.Contains(a.PaymentMode),"Choose a valid payment mode");
  switch(kind){
   case "KARIGAR":
    if(a.Action=="EDIT"){
     Need(!string.IsNullOrWhiteSpace(a.PartyName)&&a.PartyName.Length<=200&&!string.IsNullOrWhiteSpace(a.Title)&&a.Title.Length<=200,"Enter Karigar name and skill");
     Need((a.Phone??"").Length<=40&&(a.Address??"").Length<=500,"Phone or address too long");
     d.PartyName=a.PartyName!.Trim();d.Title=a.Title!.Trim();d.Phone=a.Phone??"";d.Address=a.Address??"";d.Notes=a.Notes;
    }else{Need(a.Action=="ACTIVATE"||a.Action=="DEACTIVATE","Use Edit, Activate or Deactivate");d.Status=a.Action=="ACTIVATE"?"ACTIVE":"INACTIVE";}break;
   case "ESTIMATE":
    Need(d.Status=="OPEN"&&(a.Action=="ACCEPT"||a.Action=="CANCEL"),"Only open estimates can be accepted or cancelled");d.Status=a.Action=="ACCEPT"?"ACCEPTED":"CANCELLED";break;
   case "ISSUE":
    Need(d.Status=="ISSUED"&&a.Action=="RETURN","Only an issued tag can be returned");
    Need(a.Weight>0&&a.Weight<=d.Weight,"Returned weight must be positive and cannot exceed issued weight");
    Need(a.Weight==d.Weight||!string.IsNullOrWhiteSpace(a.Notes),"Record a reason for weight loss");d.ReturnedWeight=a.Weight;d.Status="RETURNED";break;
   case "JOB":case "REPAIR":
    Need(d.Status is "OPEN" or "IN_PROGRESS" or "READY","This job/repair is already closed");
    if(a.Action=="PAYMENT"){Need(a.Amount>0&&a.Amount<=Money(d.Amount-d.PaidAmount),"Payment must be positive and no more than outstanding");d.PaidAmount=Money(d.PaidAmount+a.Amount);}
    else if(a.Action=="REFUND"){Need(a.Amount>0&&a.Amount<=d.PaidAmount&&!string.IsNullOrWhiteSpace(a.ReferenceNo),"Enter a valid refund amount and reference");d.PaidAmount=Money(d.PaidAmount-a.Amount);}
    else if(a.Action=="START"){Need(d.Status=="OPEN","Only open work can be started");d.Status="IN_PROGRESS";}
    else if(a.Action=="READY"){Need(d.Status=="IN_PROGRESS","Start work before marking ready");d.Status="READY";}
    else if(a.Action=="DELIVER"){Need(d.Status=="READY"&&d.PaidAmount==d.Amount,"Mark ready and settle the full balance before delivery");d.Status="DELIVERED";}
    else if(a.Action=="CANCEL"){Need(d.PaidAmount==0,"Paid work cannot be cancelled without a recorded refund");d.Status="CANCELLED";}
    else throw new ArgumentException("Invalid workshop action");break;
   case "GIRVI":
    Need(d.Status=="ACTIVE"&&a.Action=="PAYMENT","Only active loans accept receipts");
    var due=LoanDue(d,a.Date);Need(a.Amount>0&&a.Amount<=due,"Receipt must be positive and no more than the current due");
    var interest=Money(due-d.PrincipalOutstanding);var paidInterest=Math.Min(a.Amount,interest);
    d.InterestOutstanding=Money(interest-paidInterest);d.PrincipalOutstanding=Money(d.PrincipalOutstanding-(a.Amount-paidInterest));
    d.PaidAmount=Money(d.PaidAmount+a.Amount);d.AccruedThrough=a.Date.Date;
    if(d.PrincipalOutstanding==0&&d.InterestOutstanding==0)d.Status="CLOSED";break;
   case "SCHEME":
    Need(d.Status=="ACTIVE","This saving account is already closed");
    if(a.Action=="PAYMENT"){Need(a.Amount>0&&a.Amount<=Money(d.Amount-d.PaidAmount),"Instalment receipt exceeds the remaining target");d.PaidAmount=Money(d.PaidAmount+a.Amount);}
    else if(a.Action=="REDEEM"){Need(d.PaidAmount==d.Amount&&a.Date.Date>=d.DueDate!.Value.Date,"Reach the full target and maturity date before redemption");Need(!string.IsNullOrWhiteSpace(a.ReferenceNo),"Enter a redemption bill/payment reference");a.Amount=d.PaidAmount;d.Status="REDEEMED";}
    else if(a.Action=="REFUND"){Need(d.PaidAmount>0&&!string.IsNullOrWhiteSpace(a.ReferenceNo),"Enter the refund reference; there must be a collected balance");a.Amount=d.PaidAmount;d.Status="REFUNDED";}
    else throw new ArgumentException("Invalid scheme action");break;
   case "LEDGER":
    Need(d.Status=="POSTED"&&a.Action=="REVERSE"&&!string.IsNullOrWhiteSpace(a.Notes),"A posted entry can be reversed once with a reason");d.Status="REVERSED";break;
  }
 }
}
