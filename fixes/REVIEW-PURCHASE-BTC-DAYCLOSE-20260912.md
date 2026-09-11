# 2026-09-12 Purchase / BTC / Bill / Feature Control / Day Close Fix Pointers

Source screenshots: BTC receipt, BTC settlement, Barcode Purchase.
Source purchase sample: uploaded legacy Excel with columns Date, Vch/Bill No, Particulars, Group, Item Details, TAX RATE, HSN CODE, BCN, MRP, Disc., Qty., Unit, Price, Amount, Pcs.

- P01 BTC receipt: remove duplicate Close; Print Receipt must direct-print and close receipt modal after print request.
- P02 BTC settlement: Card / UPI must open detail input instead of only selecting a mode.
- P03 Barcode Purchase: open full-page workspace, not small modal.
- P04 Barcode Purchase search: barcode, SKU and item-name search/suggestions.
- P05 Barcode Purchase temporary save + restore/get temp data.
- P06 Barcode Purchase Excel import + uploaded supplier bill import + downloadable sample formats.
- P07 Purchase bill import: match Barcode first, then exact normalized Item Name; block conflicts/duplicates; create genuinely new items and post purchase in one transaction.
- P08 Bill reprint: use active Print Master and direct print reliably.
- P09 Modify Bill: item edits + payment mode change must be committed together; Save & Print afterwards.
- P10 Feature Control: switches must represent actual sidebar masters/modules only; remove validity/sync/internal technical switches from UI.
- P11 Day Close: normal confirmation text exactly "Confirm Day Close & Shift End ?".
- P12 Auto Day Close setting: optional, when enabled close previous business day automatically after local midnight/date rollover.
- P13 Item Master navigation: AI Import, Item Import, Opening Stock stay inside Item Master; no top-level duplicate menu.
- P14 GitHub Actions: no cancellation/supersede concurrency rule; add targeted validation before merge.

All changes are kept on this branch until CI is green.
