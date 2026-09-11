# 2026-09-11 UI/BTC/Feature-Control Fix Pointers

Requested after Build #167. Each pointer is intentionally separated so it can be reverted independently.

- F-01 BTC Settlement customer/company search must show both normal Customers and BTC Companies.
- F-02 BTC Settlement must open blank; no customer/mobile/telephone number may be auto-selected.
- F-03 Counter Billing BTC dialog must be centered, selectable, and use Submit + Close.
- F-04 BTC Submit must select the party and immediately save + print the BTC invoice.
- F-05 Credit/UPI must always open its payment detail dialog.
- F-06 Any Bill Management payment-mode change to BTC must require Customer/Company selection.
- F-07 Counter Billing layout must remain aligned/responsive as invoice rows grow.
- F-08 Category Add/Edit modal must have only one Close/Cancel control.
- F-09 Feature Control must display real app masters/modules and enable/disable their access.
- F-10 Bill Reprint must call the active Print Master reliably from desktop.
- F-11 Remove top-level Opening Stock and Item Import Master navigation; both stay inside Item Master.
- F-12 Jewellery Inventory navigation must contain Stock + Purchase only; Item Master stays under Masters.
- F-13 Jewellery Item Master/detail form sizing/alignment must fit desktop viewport cleanly.
- F-14 Jewellery Feature Control must use the same working enable/disable system.
- F-15 Replace Windows desktop/taskbar icon with the supplied Suvidha POS icon using safe padding so it is not cropped.
- F-16 GitHub Actions must not use a cancellation/supersede concurrency group.

Build gate: compile + JS syntax + targeted source validations + installer validation before merge.
- F-17 Remove top-level AI Import navigation and dashboard quick action; keep AI Import inside Item Master (normal + jewellery) alongside Item Import and Opening Stock.
