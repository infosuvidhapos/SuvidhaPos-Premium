# UI/BTC/Feature Control/Jewellery/Icon Fix Pointer — 2026-09-11

Branch: `fix/btc-ui-feature-control-jewel-icon-20260911`

1. BTC Settlement must show the BTC customer's saved pending invoice records.
2. Remove hard-coded/default mobile/telephone `7004165765`; customer fields must be blank unless loaded from a selected customer/company.
3. Center the BTC company/customer popup from New Billing.
4. Credit/UPI must open its payment-entry option instead of doing nothing.
5. BTC popup buttons: `Submit` and `Close`; Submit must select customer/company and immediately Save & Print the BTC bill.
6. Any workflow that changes/uses payment mode BTC (new bill, modify bill, payment-mode change) must require BTC customer/company selection.
7. Counter billing cart/layout must remain aligned and adjustable as item rows grow.
8. Add/Edit Category must show only one Cancel/Close action.
9. Feature Control must expose real app masters/features with enable/disable access; disabled features must not route to the validity page.
10. Bill Reprint must work from Bill Management.
11. Remove standalone Opening Stock navigation because Opening Stock exists under Item Master.
12. Jewellery Inventory must contain Stock and Purchase only; Item Master must remain in Masters, not Inventory.
13. Jewellery Item Master must be compact/responsive/aligned.
14. Jewellery Feature Control must use the same real enable/disable feature access.
15. Use the supplied Suvidha POS icon for app/window/taskbar/desktop/start-menu icons with safe padding so it is never clipped.
16. GitHub Actions must not use a workflow concurrency rule that cancels/supersedes runs.

Each fix is committed separately or in a tightly scoped group so it can be reverted by commit.
