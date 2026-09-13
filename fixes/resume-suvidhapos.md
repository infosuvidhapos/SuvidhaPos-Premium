# SuvidhaPOS Premium continuation checkpoint

Updated 2026-09-13. This file exists so work can continue from a new normal chat if the current Work session ends. Read the latest branch, PR and Actions state before acting; this checkpoint does not claim a new installer is ready.

## Open project

- Repository: https://github.com/infosuvidhapos/SuvidhaPos-Premium
- Active branch: `fix/retail-item-discount-import-20260912`
- Draft PR: https://github.com/infosuvidhapos/SuvidhaPos-Premium/pull/12
- Actions: https://github.com/infosuvidhapos/SuvidhaPos-Premium/actions
- Design: `docs/superpowers/specs/2026-09-12-retail-purchase-design.md`
- Implementation plan: `docs/superpowers/plans/2026-09-12-retail-purchase.md`
- Change and verification details: `fixes/retail-purchase-release-notes.md`

The user has authorized finishing the fixes, checking builds, and producing the updated Windows installer. Continue autonomously; do not restart the implementation or ask for the same approval. Do not claim automatic chat transfer or background continuation. Earlier jewellery-only sidebar, stock/customer routing, feature-control, cream UI, compact entry and workshop/finance-register fixes are on main's successful Build205. Preserve those fixes while finishing the active normal-retail work below.

## Last verified CI state

- Main `2696f46ffa2a57414dcb99f3ace058753e96e550`: Build205 succeeded. Its installer predates this retail change.
- Build206 was rejected before runner allocation due to a GitHub account billing/spending annotation. Later runners did start, so do not assume that old account restriction is the current blocker.
- Build207 on PR head `d6446c6557b996c175a6f4e97e45ec8ba3505969`: CS8801 from unqualified `P` in `RetailItemRules` and `ManualPurchaseService`. Fixed by qualifying `PurchasePostingService.P`.
- Build208 on PR head `d13e30789038eff2350810946fda6b617fec7ce3`, run `34768093390`, job `103752584982`: C# parser/rule checks passed; all 10 UI behavior checks passed; solution compiled with zero warnings/errors; jewellery calculations passed. Stopped on obsolete source assertion `THEN 'Item Name' ELSE 'Barcode' END ConflictType`. This checkpoint's commit updates the assertion to current `NAME`/`BARCODE` labels and route wiring. SQL behavior gates remain required.
- A later push may already have a newer run. Always read the newest PR head, workflow jobs and logs before making changes.
- During the follow-up review, the backup step was found to open a fresh sqlcmd connection for every migration without selecting a database. Existing scripts contain USE statements, but the new additive completion/retail scripts intentionally use the caller's database. The workflow now uses master only for schema bootstrap and explicitly selects SuvidhaPOS for later scripts. Verify this fix in the newest build as well.

## Required behavior already implemented; protect it

1. Compact normal Item Entry: item name; barcode, MRP, Discount%; GST plus Inclusive/Exclusive radio default Inclusive; rack then small SKU; new-item multi-unit toggle OFF. Existing configured units reopen ON. Price after discount is MRP times (1 minus discount/100).
2. `Products.Dis_Rate` stores the item discount. Item Rate Update includes Discount Per and accepts an explicit zero. Purchase discount is editable per batch; purchase cost is independent of selling-price discount.
3. New normal item/import/purchase tax defaults Inclusive. Preserve historical explicit tax, sale price, units and inventory settings on unrelated edits. Jewellery behavior stays scoped separately.
4. Deterministic XLS/XLSX/CSV import needs no AI. Supported uploaded headers: Date, Vch/Bill No, Particulars (supplier), Group, Item Details, TAX RATE, HSN CODE, BCN, MRP, Disc., Qty., Unit, Price, Amount. Exempt means GST0; percentage text/cells and numeric barcodes are handled; invoice metadata fills down. Invalid or ambiguous inputs stay visible for correction rather than being guessed or silently skipped.
5. Group repeated normalized item names into one new master using the first barcode, arithmetic mean purchase cost (10 and 9 becomes 9.5), highest MRP and highest discount. Keep every source row as a separate purchase batch; stock sums quantities.
6. Different item names sharing a barcode create the later new item with a NULL barcode; retain the original barcode owner. Existing matching products receive purchase/batch/stock entries only. Do not replace their identity, tax, category, rates or units. Block ambiguous historical matches.
7. Item codes remain SQL identity primary keys, start at 1 only in a fresh database, and are never reseeded or renumbered. Do not use MAX+1.
8. Preview, editable correction, revalidation, serializable posting, application lock, request replay and changed-payload rejection, duplicate invoice guard, source-file SHA256 journal and rollback protect stock from duplicate/partial imports. Suppliers are resolved uniquely or created transactionally and linked to purchase ledgers.
9. Stock quantities must fit 3 decimal places. Monetary rate columns widen to decimal(22,6), preserving their former integer range. Purchased-unit discount rounds before conversion to base units. Uncertain manual saves freeze the exact request for a safe retry, including after draft recovery.
10. AI Import remains inside Item Master only. Never introduce AI into the deterministic purchase parser.

## Continue from here

1. Check the latest PR #12 run. Fetch the failed job log, isolate the actual first failing gate, and fix its cause. Never bypass SQL/UI/installer gates just to turn the build green.
2. Required checks are already in `.github/workflows/build.yml`: C# retail parser/rules, 10 DOM UI behavior checks, full solution build, existing jewellery/static checks, SQL Server2019 isolated jewellery and retail integration checks, self-contained backend/desktop publishing, Inno Setup packaging and installer verification.
3. Review material changes and test the exact final PR revision. Then make the PR ready, merge it, wait for the main release workflow, and verify that the release asset corresponds to that merge before presenting it as updated.
4. The rolling installer URL is `https://github.com/infosuvidhapos/SuvidhaPos-Premium/releases/download/latest-build/SuvidhaPOS-Premium-Windows-Setup.exe`. This URL alone does not prove the retail update is released; check release metadata and the successful main run.
5. Update this checkpoint or PR status with the actual final result. Keep the user informed in concise Hinglish while working.

## Environment and evidence

The previous workspace was `/workspace/scratch/1f33613903b8/SuvidhaPos-Premium`; scratch can disappear. GitHub is the durable source of truth. Git push had no shell credentials, so commits were uploaded with the authorized GitHub connector using blob/tree/commit/update-ref. Local and remote commit IDs differed but their tree SHAs were checked for equality. Do not force-push or overwrite newer work when resuming.

This workspace had no .NET SDK and its attempted SDK download timed out. Windows CI is the C#/SQL execution environment. Local DOM checks use `fixes/retail-purchase-ui.cjs` and jsdom; they are real UI code with mocked HTTP, not visual screenshots. Browser access to the local preview was blocked, so do not claim visual QA or a Windows installation was manually exercised.

The customer's original `Purchase import bill(1).xls` was inspected read-only: 116 item rows, 90 unique normalized names, 24 repeated groups, quantity sum 3630. Private source rows are not committed. C# tests use synthetic XLS/XLSX/CSV fixtures with the same supported headers. If the original attachment is unavailable in a new session, do not fabricate it; use the existing fixtures and request the file only if needed for an additional exact-file check.

Do not promise 100% accuracy for arbitrary unknown files. The intended protection is deterministic supported parsing, explicit correction for unrecognized data, preserved existing masters, atomic writes and tested duplicate/retry handling.

## Paste into a new normal chat

> Continue SuvidhaPOS Premium from https://github.com/infosuvidhapos/SuvidhaPos-Premium/blob/fix/retail-item-discount-import-20260912/fixes/resume-suvidhapos.md . Read that checkpoint and PR #12, inspect the newest failed GitHub Actions job, finish all required tests and fixes, then build and deliver the updated installer. Preserve existing items and jewellery behavior. Continue the existing implementation; do not rebuild the project from scratch.
