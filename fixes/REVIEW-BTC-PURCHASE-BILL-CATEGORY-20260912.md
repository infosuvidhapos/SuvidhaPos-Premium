# 2026-09-12 BTC / Purchase / Bill Management / Category Fix Pointers

All changes in this branch are scoped so they can be reversed independently.

- N-01 Remove duplicate Close button from BTC Company Master.
- N-02 After creating a BTC company, return to BTC selection/advance step with the new company selected.
- N-03 Show Advance Amount only after a party is selected; Cash/Credit-UPI appear only when advance > 0.
- N-04 Credit/UPI advance opens the payment detail/options page before BTC Submit.
- N-05 BTC Submit performs party selection + BTC save + selected print flow.
- N-06 Keep BTC/new-company dialogs centered, compact and responsive.
- N-07 Bill Management must include newly created normal and BTC bills.
- N-08 Modify Bill / Change Payment Mode: Credit and BTC must use complete selection/detail flows.
- N-09 New Purchase modal: aligned desktop layout, no accidental horizontal overflow, keyboard-first.
- N-10 Add Barcode Purchase mode under Purchases; keyboard-scannable barcode -> qty/rate -> stock posting.
- N-11 Inline Category create in Item Entry must stay on Item Entry and auto-select the new category.
- N-12 AI Import, Item Import and Opening Stock remain inside Item Master only; no top-level duplicate navigation.
- N-13 GitHub Actions: no cancellation/supersede concurrency group; validation updated to current navigation model.
- N-14 Barcode Purchase design: use supplied screenshot only as layout reference; dense scanner grid, supplier/invoice header, editable rates/batch/expiry, totals and keyboard shortcuts.
- N-15 Current Stock Report design: use supplied screenshot only as layout reference; As-On/category/status/search filters, item-wise qty/rates/valuation/location grid, summary totals and print/export.

Final gate: restore + build + JS syntax + targeted validations + installer validation before merge.
