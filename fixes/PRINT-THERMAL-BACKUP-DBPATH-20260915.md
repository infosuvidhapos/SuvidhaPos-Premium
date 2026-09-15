# Print Master / Thermal / Backup / Database path fixes — 2026-09-15

Baseline: main Build #266 / commit c639bc06bad072908b297c8c6ed6aa34cba3fcaf.

- P-01 — Print Master duplicate Bill Print Action radio panel is blocked and purged in both normal and Jewellery modes.
- P-02 — Default Bill Print Action remains in both Print Masters: Direct Print / Save As PDF / Print & Preview.
- P-03 — Jewellery new bills load the saved Jewellery default print action instead of forcing Direct Print.
- P-04 — Audit thermal receipt no longer uses the app-level semantic <header>; Outlet Name is a single centered top line and "Audit Report - Account Summary" is removed.
- P-05 — All common 80mm reports use the same isolated receipt header and Thermal Print 80mm / Preview / Print actions.
- P-06 — Settings no longer shows the duplicate LOCAL DATABASE / Create Backup Now card.
- P-07 — Jewellery SYSTEM sidebar exposes Print Master and Database Backup using the shared working modules.
- P-08 — Fresh SuvidhaPOS database MDF/LDF location is D:\Suvidha Pos\Database; if D: is unavailable, E:\Suvidha Pos\Database.
- P-09 — Existing databases are not moved automatically; the fixed file placement rule applies only when the SuvidhaPOS database is created fresh.
- P-10 — Installer creates the selected D/E database folder before first launch and validates the same D→E policy in CI.
