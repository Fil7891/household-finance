HOUSEHOLD FINANCE PWA - VERSION 8

NEW IN V8
- Reports page with custom date range
- Income / expense / savings report totals
- Monthly performance report
- Expense category percentages
- Recurring bills with weekly, fortnightly, monthly or yearly frequency
- Mark recurring bill as paid -> creates an expense and advances next due date
- Private receipt storage for expenses (JPG, PNG, WebP or PDF, max 5 MB)
- Expense and income CSV exports
- Full household JSON backup export

SECURITY
- Receipts are stored in a PRIVATE Supabase Storage bucket named receipts.
- Receipt paths use household-id/expense-id/file-name.
- Storage RLS checks that the logged-in user belongs to that household.
- The frontend uses only the Supabase publishable key.
- Never put service_role, sb_secret, database passwords or other secrets in js/config.js.

UPGRADING AN EXISTING V7 PROJECT
1. In Supabase -> SQL Editor -> New query.
2. Run the complete file:
      supabase/migrate-v8-features.sql
3. Do NOT rerun the full schema.sql on your existing database.
4. Upload/replace these frontend files on your host:
      index.html
      css/style.css
      js/app.js
      service-worker.js
5. Keep your existing js/config.js because it contains your working Supabase project URL and publishable key.
6. Upload supabase/schema.sql and the migration files to GitHub only as project/source documentation.
7. Refresh the website once before reopening an installed PWA.

RECEIPTS
- Files are private, not public URLs.
- The app creates a temporary signed URL only when a household member taps Receipt/View.
- Supported types: JPEG, PNG, WebP, PDF.
- Maximum file size: 5 MB.

RECURRING BILLS
- Recurring bills do not automatically create expenses in the background.
- Tap Mark paid to create the expense safely and advance the due date.
- This avoids accidental duplicate expenses and does not require a scheduled server job.

REPORTS / EXPORTS
- Reports accept any From / To date range.
- Expenses CSV and Income CSV use the current Reports date range.
- Full JSON backup exports all household categories, expenses, income, shopping items and recurring bills.
- Receipt files themselves are not embedded in the JSON backup; receipt_path references are included with the expense records.

FRESH INSTALL
- Run supabase/schema.sql on a new Supabase project.
- Then configure js/config.js with the Project URL and publishable key.
