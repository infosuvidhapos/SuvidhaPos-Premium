# Retail Purchase Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the backend task and review; the controller integrates and verifies the frontend against the same contracts. Do not dispatch nested helpers.

**Goal:** Deliver compact item entry and safe, deterministic purchase-bill import with protected existing masters.

**Architecture:** Keep parsing/rules separate from transactional SQL persistence. Extend existing product, purchase and rate contracts additively; keep frontend responsibilities in the existing normal retail modules and a focused import workspace module.

**Tech Stack:** Existing .NET 8, SQL Server, NPOI 2.7.3, vanilla JavaScript/CSS. No new AI service or framework migration.

**Spec:** docs/superpowers/specs/2026-09-12-retail-purchase-design.md

## Global Constraints

- Import never overwrites an existing product's identity, rates, tax mode, unit conversion, category or other master data.
- Discount is the retail discount from MRP: sale price = MRP × (1 − DiscountPer / 100).
- Products.Dis_Rate persists the percentage (0–100). ItemCode exposes the existing SQL identity Id as a read-only code; fresh databases start at 1.
- New item, normal item import and purchase default to INCLUSIVE. Explicit EXCLUSIVE input and historic records retain their meaning.
- Do not upload the actual user workbook or extracted customer data to the public repository.
- Preserve jewellery UI/workflows, installer elevation/path and existing build gates.

### Task 1: Backend rules, parsing and transactional persistence

**Files:**
- Modify: src/SuvidhaPOS-Premium/PurchaseImportModules.cs, Program.cs, RetailExpansionModules.cs, RuntimeFix6126Modules.cs, PremiumCompletionModules.cs and applicable normal-import code.
- Create: src/SuvidhaPOS-Premium/RetailItemRules.cs, PurchaseImportParser.cs, PurchaseImportRules.cs, PurchasePostingService.cs as needed, with one clear responsibility each.
- Create: src/SuvidhaPOS-Premium/Database/retail-purchase-schema.sql; register in Data/DatabaseInitializer.cs.
- Create tests: fixes/RetailPurchaseChecks/Program.cs and RetailPurchaseChecks.csproj.

**Interfaces:**
- ProductRequest gains nullable decimal DiscountPer; read API returns Dis_Rate and ItemCode. Omitted discount on edits preserves the old value/sale price. Explicit discount recalculates SalePrice from MRP. Keep optional arguments at the end.
- PurchaseLine gains nullable decimal DiscountPer and string TaxMode default INCLUSIVE. PurchaseRequest gains nullable PurchaseDate and RequestId. Persist line Dis_Rate/TaxMode and batch discount where needed for billing, without master edits.
- RateApplyRow gains nullable DiscountPer; preview exposes CurrentDiscountPer and DiscountPer.
- PurchaseImportRow retains existing fields, adds TaxMode, Errors (list), Warnings (list), Status, SourceBarcode, EffectiveBarcode, GroupKey, BaseFactor as required. Discount retains its existing name and means retail MRP discount. Preview retains { rows, summary } and adds requestId, totals and groups. Existing ProductId/Conflict/NewItem fields remain available for compatibility.
- Commit retains Rows plus optional RequestId and source/preview token. Keep error response {message}; success includes purchase ids, invoiceNo, total, newItems, existingItems, alreadyImported.
- Add a JSON revalidation endpoint /api/purchase-import/validate so corrected rows receive identical server validation.

- [ ] Write tests before implementation using the existing reflection-accessible parser and route behavior. Synthetic XLS header: Date,Vch/Bill No,Particulars,Group,Item Details,TAX RATE,HSN CODE,BCN,MRP,Disc.,Qty.,Unit,Price,Amount. Use two same-name rows with costs 10/9, quantities 2/3, MRP 12/14 and discounts 5/10; assert one new master, cost 9.5, MRP 14, discount 10, stock 5, two unchanged batch costs. A different-name barcode collision must keep both names and clear only the new barcode.
- [ ] Run available C# tests; if local dotnet is unavailable, prepare a test-only commit and notify the controller to run Windows CI, then use its result to establish failure before implementation. Do not claim unexecuted tests passed.
- [ ] Implement parser with explicit aliases, cell types, common dates, currency/percent decorations, exempt tax, blank metadata fill-down, and error collection. Test literals: 10% -> 10, Exempt -> 0, 25/08/2026 -> 2026-08-25, Excel numeric barcode -> plain digits; bad text -> row error, not 0.
- [ ] Implement migration preserving existing rows and SQL identity; use transaction locks and constraints for concurrent safety. Existing duplicate names must block ambiguity rather than be cleaned destructively.
- [ ] Implement preview matching/aggregation and commit grouping, with retry/payload protection, duplicate invoice protection, full rollback and audit. Compare preview versus actual commit matches; do not trust client ProductId or NewItem flags.
- [ ] Extend explicit item/rate/manual purchase APIs, normal import defaults and batch discount. Keep existing master data unchanged during purchase. Preserve explicit legacy sale rates when unrelated fields are saved.
- [ ] Run pure and SQL tests; test replay, changed request payload, concurrent same names/code allocation, invalid later-row rollback and historical master preservation. Write report with exact commands/output and commit only owned backend/test files.

### Task 2: Compact item entry and purchase workspace

**Files:**
- Modify: wwwroot/js/specialized-pos.js, retail-masters-ui.js, runtime-fixes-6126.js only normal default, billing-actions-6128.js asset version, wwwroot/index.html asset versions.
- Create: wwwroot/js/purchase-import-ui.js and wwwroot/css/retail-purchase.css.
- Test: fixes/retail-purchase-ui.cjs.

**Interfaces:** Consume Task 1 DTOs; do not send product master updates from purchase/import. Revalidation uses /api/purchase-import/validate. RequestId survives retries and draft restoration; editing a posted/rejected payload starts a new request explicitly.

- [ ] Write behavioral tests opening existing openUomProduct: new toggle off, compact visible fields, Inclusive selected, MRP100/Discount10 shows Sale90; existing multi-unit configuration and unrelated legacy rates survive reopen/save. Run against the current JS to observe missing behavior.
- [ ] Reorder existing fields and add the toggle/discount/tax controls. Preserve hidden unit/rate configuration; simple items use base PCS by default and conversion 1. Avoid duplicate IDs and global modal CSS.
- [ ] Upgrade Purchase dashboard and entry layout with direct import actions, date, Discount %, TaxMode, live summaries and save guards. Keep cost and retail discount distinct and visible.
- [ ] Implement upload → review/correct → server validate → commit with status filters, source row numbers, totals, master-protection notice and disabled commit when errors remain. Show original barcode and effective action; never silently drop bad rows.
- [ ] Add current/new Discount Per to rate update, including zero and template support. Update normal item import's default tax only.
- [ ] Run UI tests at desktop and smaller window sizes; verify existing jewellery mode renders unchanged and no runtime errors. Commit frontend/test files.

### Task 3: Integration review and Windows installer

**Files:** .github/workflows/build.yml, fixes/RetailPurchaseChecks/*, release notes under fixes/.

**Interfaces:** Existing workflow SQL connection argument; tests create/drop only their own temporary databases.

- [ ] Add pure/SQL retail test steps next to the existing jewellery workflow checks. Preserve the release job and artifact quota restrictions.
- [ ] Review backend and UI diffs for contract mismatches, omitted defaults, overwrite paths, concurrency and tax rounding. Resolve findings and rerun covering tests.
- [ ] Build and test the exact branch revision, then integrate using the existing authorized GitHub release workflow. Confirm installer build success and its release asset before providing the link.
