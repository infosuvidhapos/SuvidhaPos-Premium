# Normal Retail / Canteen 80mm account reports — 2026-09-15

Scope: normal Retail / Canteen reports only. Jewellery report/workspace code is not modified.

- R-01 — Report No.1 is Daily Account Summary / DAILY ACCOUNT REPORT, rendered for 80mm thermal paper.
- R-02 — Sales summary: Gross Sales, Item Discount, Bill Discount, Returns, Net Sales.
- R-03 — Tax summary: Taxable Sale, CGST, SGST, IGST, Total Tax. Current retail schema has no place-of-supply field, so existing local GST tax is split CGST/SGST and IGST remains explicit zero rather than guessed.
- R-04 — Payment summary: Cash, UPI, Card, Credit/BTC, Other, Total Collection. Legacy sales without SalePayments rows fall back to Sales.PaymentMode/GrandTotal.
- R-05 — Cash account: Opening, Cash Sale, Customer Cash Received, Cash Expense, Cash Refund, explicit Cash Withdrawal, Expected, Actual, Short/Excess.
- R-06 — Actual Cash is DayClosings.ClosingCash. If the day is not closed the report prints NOT CLOSED instead of inventing an actual amount.
- R-07 — Cash Withdrawal is explicit 0 until a dedicated cash-withdrawal transaction source exists; the report does not infer/guess withdrawals from supplier payments or expenses.
- R-08 — Other transactions: Purchase, Expenses, Customer Received, Supplier Paid, Credit Sale, Return Amount.
- R-09 — Bill summary: Total, Cancelled, Hold, Return bills, Average Bill Value.
- R-10 — Cashier Closing Report uses cashier sales + tender details and supports legacy tender fallback.
- R-11 — Payment Mode Report, Expense Report, Day Close Report and Audit Trail Report use the same 80mm thermal engine.
- R-12 — All six thermal reports support Direct Print, Preview & Print, Save PDF and Excel with report/date naming.
- R-13 — Report Master contains 25 normal reports; generic non-thermal report behavior is preserved.
- R-14 — Isolated SQL regression executes all six thermal report endpoints against SQL Server schema before installer validation.
