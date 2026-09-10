# SuvidhaPOS Premium – 12 Point Review (2026-09-11)

This file is the rollback/review pointer for the retail/BTC/Audit expansion requested in chat.

## Build cancellation fix
- Removed the GitHub Actions `concurrency` group from the app workflow so newer pending runs cannot supersede/cancel older pending runs.
- The same cancellation gate is removed from the website review workflow.
- Builds #143–#155 that show **cancelled** were superseded while the old concurrency group was active; code failures are tracked separately.

## 1. Opening Stock Bulk Update — PASS
- Excel/XLS/CSV preview: `RetailExpansionModules.cs`
- Searchable multi-item picker + selected posting: `wwwroot/js/retail-masters-ui.js`
- Transactional batch/stock-ledger posting: `PremiumFeatureModules.cs`

## 2. Item Master tiles — PASS
Tiles: Item Entry, Category Entry, Item Import, Bulk Edit Update, Item Rate Update, Opening Stock.

## 3. Category Master + quick add — PASS
- Search/add/edit/delete Category Master.
- Category `+` beside Item Entry category input.
- Duplicate-safe create/rename and in-use delete protection.

## 4. Item Import — PASS
- Normal Item Import Master kept separate from AI Import.
- Excel/PDF/CSV/text/image extraction, preview, conflict resolution and commit.

## 5. Bulk Edit Update — PASS
- Search + checkbox multi-select.
- Select Visible / Clear Visible.
- Duplicate name/barcode and Unit Master validation before transaction commit.

## 6. Item Rate Update Excel/PDF — PASS (code review)
- Excel/XLS/CSV and searchable PDF parse locally.
- Scanned/complex PDF can fall back to configured AI extraction.
- Preview/select required before apply.
- Base/inner/pack UOM rates are synchronized.
- Uses PdfPig 0.1.16; final CI restore/build must verify package compilation.

## 7. Outlet State/City + billing default — PASS
- App and website have searchable State/UT + City fields.
- 36 State/UT entries.
- 1,558 deduplicated offline city suggestions plus free-entry for any Indian locality.
- POS profile GET/POST sync includes State/City; Store Type and Validity remain centrally controlled.
- Billing Customer Info State defaults from Outlet Master and remains searchable.

## 8. BTC Advance Receive — PASS
- Cash or Credit/UPI advance receipt.
- Transaction writes BtcAdvances + company ledger + audit log.
- FK + unique receipt integrity.
- Advance totals are reported as received history; they are not silently auto-applied to invoices.

## 9. BTC Settlement/Billing flow — PASS
- Company/GSTIN/phone suggestions.
- New company button says Submit.
- Billing BTC selector uses Advance Amount + Cash/Credit-UPI instead of PO/Reference.
- Full and Partial Settlement.
- Compact desktop layout, wider Payment Detail, compact Reference/UTR/Cheque field, no page-level scroll target.

## 10. BTC Payment Report #20 — PASS
Filters: From, To, Transaction Type, Payment Mode, Company/Mobile/GST/Receipt. Includes CSV export and print/PDF.

## 11. Customer / Company unified master — PASS
- Search/add/edit/delete for Customers and BTC Companies.
- Normal counter-billing named customers are auto-created/updated in Customers using name/mobile/GST match.
- Companies with pending BTC or advance history are protected from unsafe delete.

## 12. Audit Report 80mm thermal — PASS
- Report Master exposes Audit Report tile (reuses an existing Audit tile if one exists).
- Sales, discount, tax, payment breakup, cashier, audit activity, unsettled BTC.
- Inclusive/exclusive GST aware.
- Direct 80mm thermal print + preview/print.

## Final gate
Code review and JavaScript syntax checks: PASS for all 12 points.
Final source restore/build/installer validation is required after this review branch is promoted to the PR branch.