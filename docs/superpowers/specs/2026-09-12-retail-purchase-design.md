# Retail item entry and deterministic purchase import

The user authorized implementation and installer delivery. This extends the existing normal retail flow. Jewellery screens and completed workflows remain intact.

## Invariants

- Import never overwrites an existing product's identity, rates, tax mode, unit conversion, category or other master data. Existing products receive purchase batches and stock movements only. Master/rate edits require the corresponding explicit edit action.
- Match normalized item name first (trim, collapse whitespace, case insensitive; retain punctuation and pack-size distinctions). Same-name rows use the first identity in the file. Different-name barcode collisions create a new product with a null barcode; existing barcode ownership always wins. Ambiguous pre-existing duplicate names, inactive matches and incompatible units are correction errors, never arbitrary matches.
- For a new product, purchase price is the arithmetic mean of its source purchase rates; MRP and discount are their maxima. Every original purchase line remains a separate batch, with its original cost, quantity and invoice.
- Discount is the retail discount from MRP: sale price = MRP × (1 − DiscountPer / 100). It is independent of invoice purchase cost and the bill-level discount amount. Purchase entry can set the new batch's discount without editing the existing master.
- Products.Dis_Rate persists the percentage (0–100). ItemCode exposes the existing SQL identity Id as a read-only code; fresh databases start at 1. Never reseed, renumber or allocate MAX+1. The existing primary key enforces uniqueness; gaps after rollback are acceptable.
- New item, normal item import and purchase default to INCLUSIVE. Explicit EXCLUSIVE input and historic records retain their meaning. Inclusive purchase tax is extracted from the entered cost, not added again.

## Import pipeline

Use the existing NPOI dependency for XLS/XLSX and deterministic CSV parsing, without AI/network calls. Detect the supplied header aliases, carry invoice/date/supplier metadata down blank cells, retain invoice/barcode text, understand Excel date cells and serials plus common day-first/ISO dates. Exempt means GST 0. Recognize numeric currency/percent decorations without merging multiple numbers or silently turning invalid numbers into zero. Preserve percent-cell semantics.

Preview must show every candidate line, normalized values, new/existing/merged/barcode-cleared statuses, validation errors and reconciled totals. User corrections rerun server validation. Blank rows and total rows are excluded. Unknown/malformed values block commit rather than guessing. The sample workbook contains 116 source item rows and 90 normalized names; its real customer data must never enter this public repository.

Commit revalidates database matches inside one transaction. Group invoices by supplier, invoice number and date, keep batch rows, and post matching stock movements. Guard retries with a persisted request key and payload digest; guard duplicate source invoices/content across uploads. A failed row rolls back the whole commit. Return existing results for an identical retry and reject a changed payload using the same key. Audit the completed import. Do not reset existing data as part of migration.

## UI

Compact normal item modal: Item Name, Barcode, Price/MRP, Discount %, Category, HSN, GST followed by Inclusive/Exclusive radios, Location, Rack, small SKU, then multi-unit toggle. Toggle defaults off for a new item. Existing multi-unit configurations reopen on and are preserved. Simple mode shows Save immediately. Sale-price preview updates on MRP/discount input. Existing master sale price is preserved when unrelated fields are edited.

Purchase inward page: readable full-page workspace, strong heading and primary actions, invoice/supplier/date fields, search/scanner entry, editable quantity/cost/MRP/discount/tax, live totals, sticky save controls and clear empty/loading/error states. Import is available directly from Purchase, with preview filters, row errors and double-submit protection. Preserve practical pack/inner/base entry and pharmacy requirements. AI Import stays inside Item Master only.

Item Rate Update includes Discount Per with current/new values, supports zero, validates before mutation, recalculates selling price and synchronizes unit rates.

## Validation and release

Behavioral frontend tests exercise the real scripts against API fixtures. C# tests use synthetic BIFF/XLSX/CSV fixtures and isolated SQL databases to cover parsing, matching, master preservation, batch sums, averaging, highest MRP/discount, inclusive tax, retry safety, rollback and unique codes. Run the existing jewellery checks. Validate the actual uploaded workbook locally without publishing it. Compile Windows installer in the existing pipeline after checks pass; release only the verified commit.
