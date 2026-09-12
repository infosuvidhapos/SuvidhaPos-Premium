# Jewellery workspace fixes and registers — 12 September 2026

Scope: Jewellery mode only. Retail navigation, combined Customer/Company master, theme, billing and feature settings retain their existing behavior. New tables and APIs are separate jewellery registers. AI Import remains inside Item Master.

- J-01: Prevent retail navigation patching jewellery icon/label spans; Inventory shows Stock and opens tag-wise stock. Item Master remains under Masters with its own active state.
- J-02: Jewellery Customer opens the original customer details/list. The combined Customer/Company master remains retail-only.
- J-03: One Feature Control entry. List every actual jewellery sidebar option and persist switches under Jewellery.Sidebar.*. Keep Feature Control and Sign Out available. Disable navigation even when sidebar search runs; block disabled routes. Legacy P-code and retail flags do not overwrite this UI.
- J-04: Cream/gold CSS overrides scoped to body.jewel-suite-mode, including print radios, feature switches, auto Day Close, barcode and other shared cards.
- J-05: Item Entry uses a 1100px maximum dialog, compact responsive fields, inline required markers, a scrollable form body and visible title/save controls.
- J-06: Estimates — line items, quantities, gram/piece rates, making, GST mode/rate, total, expiry, accept/cancel and print.
- J-07: Karigar — create, edit contact/skill details, activate/deactivate and history.
- J-08: Issue Register — issue an in-stock tag to an active Karigar, reserve it as WORKSHOP_ISSUED, return the whole tag, record weight loss reason and reconcile gross/net/fine weight transactionally. Reserved tags cannot be edited through Item Master.
- J-09: Karigar Jobs and Repairs — intake, due date, assigned Karigar for jobs, charges/advance, start/ready/deliver, payments/refunds, cancellation rules and print/history.
- J-10: Girvi Loans — collateral, principal, user-entered annual simple rate on a 365-day basis, dated receipts, interest-first allocation, principal balance and full settlement. Live Girvi Report includes active/overdue/closed filters, principal, accrued interest, total due and CSV export. No automatic rate/penalty is invented.
- J-11: Cr/Dr Ledger — jewellery customer manual debit/credit entries, customer balance/history and one-time reversal with a reason.
- J-12: Saving Schemes — customer account, monthly instalment and term, receipts up to target, redemption after target/maturity, or recorded refund with reference.
- J-13: Register requests/actions use idempotency keys, row locks, revision checks, transactional audit/events and separate SQL tables. New endpoints reject normal-mode outlets. No sample transactions are inserted into production data.
- J-14: Build-time loader cache version is updated and workflow tests cover calculation/state rules and isolated SQL persistence/rollback/replay. Screens are checked with local API fixtures; CI supplies the real SQL checks.

Reversal: revert this branch's code commit to restore previous behavior. Preserve JewelleryRegisters and JewelleryRegisterEvents if real transactions have been entered; do not drop user records. Jewellery.Sidebar.* settings are independent of existing retail keys.

Browser verification: all eight sidebar routes, create forms, saved detail rendering, action payloads and print payloads pass. All 32 sidebar switches are listed. Stock and Item Master are independent; Customer opens the original list. Normal Customer, Item Master, Feature Control and Settings text/styles match origin/main. UI API fixtures are separate from the isolated SQL integration tests.
