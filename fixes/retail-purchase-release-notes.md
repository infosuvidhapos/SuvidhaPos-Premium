# Retail item entry and purchase import changes

## Review status

Draft implementation. Do not distribute an installer from this branch until the C# parser checks, isolated SQL transaction checks, existing jewellery checks and Windows installer workflow pass on the exact revision.

Build208 compiled the solution successfully with zero build warnings/errors, passed the C# XLS/XLSX/CSV parser and purchase-rule checks, all 10 UI behavior scenarios, and the jewellery calculation checks. It then stopped on a stale source-text assertion expecting the previous duplicate-conflict labels. That assertion now checks the current route wiring; transaction and collision behavior remains covered by the SQL checks. SQL integration and installer completion still require a successful subsequent workflow. Build206's earlier account allocation error no longer prevents runners from starting. The connected browser blocks the local preview URL, so visual rendering has not been certified in this session.

Continuation instructions and release gates: [resume-suvidhapos.md](resume-suvidhapos.md).

## Change pointers

- R01 — Compact normal Item Entry: barcode, MRP and Discount%; inclusive tax by default; small SKU; optional unit conversion section. Existing configured units reopen enabled. Unrelated edits preserve historical tax, sale and inventory settings, including explicit zero rates.
- R02 — Discount storage: Products.Dis_Rate and per-batch/per-purchase-line discount/tax. Explicit rate updates allow zero discount and change only requested price families. Supplied custom pack/inner rates remain intact.
- R03 — Deterministic local XLS/XLSX/CSV purchase parsing: typed dates, plain numeric barcode digits, percentage text/cells, Exempt tax, header aliases and invoice metadata fill-down. Incomplete rows remain visible for correction. Unrecognizable values are rejected rather than guessed.
- R04 — Protected item matching: normalized name groups; one new master per name; first barcode; different-name barcode conflicts create a new master with no barcode. Existing masters remain unchanged. New master purchase cost is the arithmetic mean, MRP and discount are maxima; each source row remains a separate purchase batch.
- R05 — Atomic posting: serializable transaction, product/purchase application lock, fresh matching at commit, request replay, changed-payload rejection, invoice duplicate check and exact-file fingerprint journal. Item codes remain existing SQL identity IDs; no reseeding or renumbering.
- R06 — Supplier ledger: unique active supplier matches are linked; new suppliers are previewed and created in the posting transaction; ambiguous or inactive matches block posting.
- R07 — Purchase workspace: invoice, supplier, searchable items, unit/quantity/cost/MRP/discount/tax fields, live totals, draft recovery and frozen exact-payload retry after uncertain saves. Import has correction filters, paging and revalidation.
- R08 — Precision: reject quantities that cannot fit three stock decimal places. Preserve sub-paise base-unit rates by widening monetary rate columns to decimal(22,6), retaining the historic integer range. Discount rounds the purchased-unit price before converting to base units.

## Verification commands

Run from repository root, with .NET8, Node24 and SQL Server2019 available:

```powershell
dotnet run --project fixes/RetailPurchaseChecks --configuration Release
dotnet run --project fixes/RetailPurchaseChecks --configuration Release -- "Server=.\SQLEXPRESS2019;Integrated Security=true;TrustServerCertificate=true"
dotnet run --project fixes/JewelleryWorkflowChecks --configuration Release -- "Server=.\SQLEXPRESS2019;Integrated Security=true;TrustServerCertificate=true"
npm install --prefix fixes/ui-deps --no-package-lock --no-save jsdom@30.0.1
$env:NODE_PATH = "$PWD/fixes/ui-deps/node_modules"
node fixes/retail-purchase-ui.cjs
```

SQL checks create and drop only a randomly named RetailChecks database. Fixtures use synthetic data. The customer's workbook is not included in the repository or CI.

## Reversal

Each R pointer maps to the named modules in this branch. Revert the application commit to return to the prior interface/logic. Do not delete the added request journals or narrow monetary columns on a live database: they retain audit/retry history and precise rates. Existing item IDs and historic master values are not renumbered by this migration. Jewellery navigation, cream styling and register workflows are outside this change.
