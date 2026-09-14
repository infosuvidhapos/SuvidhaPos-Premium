# Normal Retail / Canteen continuation pointers — 2026-09-14

These changes are intentionally scoped to normal Retail / Canteen billing. Jewellery navigation, item master, billing and feature-control behavior remain on their dedicated jewellery implementation.

- N-01 — Print Master T11: add an 80mm Retail Savings receipt. Each discounted item prints its Discount % and exact You Save amount on a full-width line below the item; 0% prints nothing.
- N-02 — T11 totals: aggregate per-item savings plus optional bill-level discount and print a prominent YOU SAVED total. Long names wrap and T11 is fixed to 80MM.
- N-03 — Thermal currency compatibility: Print.CurrencyText selects the ₹ symbol or an Rs. fallback while keeping Direct Print / Preview & Print / Save PDF on the same HTML layout.
- N-04 — T11 isolation: normal Retail / Canteen sees T11; Jewellery retains its existing 10 thermal templates and a saved T11 falls back to T01 in jewellery mode.
- N-05 — New Billing line discount: carry Product.Dis_Rate into a new cart line, allow Discount % editing from the row Edit action, show the percentage beneath the item only when > 0, and submit the exact rupee saving to the backend.
- N-06 — Sale calculation: apply item discount before tax, persist it to SaleLines, preserve it across FEFO batch splits, and expose itemSavings in the sale result.
- N-07 — Purchase keyboard flow: use one Barcode / Item Name field for scanner input and partial item-name/SKU search; Arrow Up/Down + Enter and mouse click select the same results.
- N-08 — Purchase data entry: Enter moves Bill No → Bill Date → Supplier Name → Barcode / Item Name and then through editable row fields; F4 search and F10 save remain.
- N-09 — Manual Purchase rate update: an explicitly changed Discount % updates normal Item Master MRP, Discount % and derived Sale Price transactionally, then synchronizes multi-unit rates. Protected import workflows remain unchanged.
- N-10 — Normal Feature Control: replace the P-xx / COMMON screen with switches for actual normal masters/modules, including Item Master children (Category, AI Import, Item Import, Bulk Edit, Rate Update, Opening Stock), Purchase, Billing, Reports, Barcode/Print Master, users, backup and other normal modules.
- N-11 — Legacy guard cleanup: normal billing no longer depends on hidden PremiumFeatureFlags P-03/P-05/P-04 state. Sidebar.Feature.* is authoritative for user-visible normal module access.
- N-12 — Jewellery isolation: normal feature controller exits immediately in jewel-suite-mode; runtime delegates jewellery Feature Control to loadJewelleryFeatureControl and no normal-only T11/purchase/billing discount UI is injected into jewellery flows.

Validation gate: JavaScript syntax + normal-retail targeted regression + existing retail UI behavior + .NET compile + jewellery workflow rules + SQL Server 2019 retail/jewellery transaction checks + Program Files/admin installer + installer validation.
