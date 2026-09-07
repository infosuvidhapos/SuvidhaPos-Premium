# SuvidhaPOS Premium — Full Local SQL

A production-oriented local billing, inventory, batch/expiry and reporting application with a premium dark POS interface.

## Included
- Fast POS billing with barcode/name/SKU search
- FEFO batch allocation and expired-stock blocking
- Purchase entry with batch, expiry, free quantity and tax
- Real-time stock ledger
- Sales return / purchase return with batch validation
- Stock adjustment
- Sales history, invoice detail, print and bill cancellation with stock reversal
- Customer/supplier master, outstanding balances and ledger payments
- Expenses
- Day closing / cash reconciliation
- Dashboard KPIs and sales chart
- Sales, profit, top-item, payment, GST, stock and stock-movement reporting endpoints
- User login, roles, user creation/disable and password change
- Local SQL Server / SQL Express database initialization
- Local `.bak` database backup
- Company/invoice settings
- IIS publish scripts

## Default local database
`Server=.\\SQLEXPRESS;Database=SuvidhaPOS;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True;`

Change `appsettings.json` if your SQL Server instance is different.

## First login
- Username: `admin`
- Password: `admin123`

The first login is flagged to change the password. Change it immediately before using the system in a live shop.

## Run locally
```powershell
.\Install-LocalSQL.ps1
```
Or:
```powershell
dotnet restore
dotnet run
```

The app creates the `SuvidhaPOS` database/tables automatically.

## IIS
```powershell
.\Publish-IIS.ps1
```
Point IIS to `publish`, install the ASP.NET Core 8 Hosting Bundle, and grant the IIS process account access to SQL Server if using a SQL login/instance configuration that requires it.

## Operational notes
- Core billing/inventory does not require internet access.
- Keep regular SQL backups outside the application folder as an additional protection.
- Configure company/GST/invoice details before live billing.
- Use Admin/Manager/Cashier accounts instead of sharing the default account.

## Premium location tagging
Products support Location Code, Rack Name and Shelf Name. Examples: A-1, B-4, R3-S2. Billing search displays the location directly beside the item, and the item catalog has a dedicated Rack / Location column.

## Outlet Master
Settings > Outlet Master contains store profiles including Retail Shop, Pharmacy / Medical Store, Agriculture Product Store, Seeds & Fertilizer, Pesticide / Crop Care, General Store, Grocery, Supermarket, Wholesale, Distributor, FMCG, Cosmetics, Stationery, Hardware, Electrical, Electronics, Garments, Footwear, Auto Parts, Pet / Veterinary, Dairy, Bakery, Restaurant / Cafe, Sweet Shop, Department Store and Other. Pharmacy/medical profiles can enforce batch and expiry tracking; agriculture-related profiles can enforce batch tracking.

## AI Import Center
AI Import accepts scanned PDF, XLSX/CSV, images/handwritten notes, and pasted WhatsApp/SMS-style messages. It extracts item master or purchase rows into a review screen. Rows are NOT posted automatically; the user must verify and post. For image/PDF extraction, an OpenAI API key is required. Set `OPENAI_API_KEY` on Windows or save it under Settings > AI Configuration. The application uses the OpenAI Responses API for multimodal file/image input.
