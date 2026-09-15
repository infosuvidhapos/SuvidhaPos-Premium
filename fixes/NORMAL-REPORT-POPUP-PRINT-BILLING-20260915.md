# Normal Retail/Canteen report popup, print and billing fixes — 2026-09-15

Baseline: main Build #258 / commit 8d2755a5b7461dbd5959504b64bf7b67d6c50c28.
Scope: normal Retail/Canteen only. Jewellery workspace, bill templates and Feature Control remain isolated.

- X-01 Reports: normal report tiles open an in-app modal popup. From/To default to the current date and no query runs until Generate Report.
- X-02 Exports: Excel/PDF actions stay hidden until report results are generated.
- X-03 Excel style: Outlet, Report Name, Reporting For and Printed On heading rows follow the uploaded DateWiseStockReport / ItemWiseSaleReport examples, followed by an aligned print-ready table.
- X-04 PDF style: A4 reports choose portrait for compact reports and landscape for wide reports; headers repeat and rows avoid page breaks where practical.
- X-05 Filenames: existing report-name + searched-date naming and Desktop direct-save behavior remain in use.
- X-06 Thermal reports: the six 80mm account/closing reports use the same popup / Generate-first / post-generate export workflow.
- X-07 Inventory: Suppliers is removed from the normal top-level sidebar and added inside Inventory Master next to Purchase. Inventory tiles use equal grid sizing.
- X-08 Print Master: Default Bill Print Action remains. Any redundant injected Bill Print Action radio panel is removed/hidden on Print Master.
- X-09 T11: per-item Discount % remains; per-item You Save amount is removed; total YOU SAVED at bill bottom remains.
- X-10 Quantity: count units use spinner step 1. KG/GM/LTR/ML/MTR-style measured units allow decimal quantities and continue using Qty × selected-unit rate.
- X-11 Bill printing: the selected Direct/PDF/Preview mode is captured before sale posting and explicitly passed to invoice printing.
- X-12 Print race: a cashier's current-bill choice cannot be overwritten by a late asynchronous Print Master default load.
- X-13 Cache: modified report/inventory/print/billing assets use v=6260.
