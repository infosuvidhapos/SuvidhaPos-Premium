# Normal Retail / Canteen continuation pointers — Inventory / Print / Purchase — 2026-09-14

Scope: normal Retail / Canteen only. Jewellery navigation, billing, item master, print templates and Feature Control remain on their dedicated jewellery paths.

- N-13 Hold Bill: remove the duplicate footer Close button; the shared modal supplies one Close action plus the top-right X.
- N-14 Normal print default: Print Master persists Print.Normal.ActionMode. New normal bills load it instead of forcing Direct Print.
- N-15 Bill print override: Direct Print / Save As PDF / Print & Preview on New Billing apply to the current bill. The next bill returns to the Print Master default.
- N-16 Print race: sale completion awaits print/preview/PDF dispatch before resetting the invoice screen.
- N-17 A4 layouts: normal A4 preview/print uses suitable portrait or landscape page size with fixed tables, wrapping and page-break-safe rows.
- N-18 A11 Discount Savings A4: add a normal-only A4 format with Discount %, You Save and Net Amount columns plus total savings.
- N-19 Jewellery print isolation: A11 is hidden/fallback in jewellery; jewellery retains its existing 10 A4 and 10 thermal templates.
- N-20 Feature Control: add Back, replace the old scope explanation with simple untick/tick guidance, and add Inventory Master switch.
- N-21 Purchase Bill No: both UI and backend reject manual purchase save without Bill No.
- N-22 Purchase Import: correction review rows can be deleted; deletion invalidates the preview token and requires recheck before save.
- N-23 Purchase layouts: Standard Purchase and Barcode Purchase share one protected posting engine but have distinct professional headings; Barcode mode is compact/keyboard-first with hints and aligned summary cards.
- N-24 Inventory Master order: Opening Stock, Purchase, Purchase Detail, Sale Return, Purchase Return, Damage Entry, Closing Stock, Stock Receive, Stock Transfer.
- N-25 Inventory ledger: Damage, Receive and Transfer are SQL transactions with document rows + StockLedger movement. Transfer is IN_TRANSIT and deducts source stock batch-wise.
- N-26 Stock reports: add Stock Report Date Wise and Stock Transfer Report to normal Report Master.
- N-27 SQL validation: existing isolated retail transaction test now maps InventoryMasterModules and verifies damage, receive, transfer and date-wise stock behavior.
