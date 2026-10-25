HOUSEHOLD FINANCE PWA - VERSION 2

FEATURES
- Separate logins for you and your partner
- Shared household with invite code
- Monthly income
- Monthly expenses by category
- Monthly savings = income - expenses
- Savings rate
- Shared realtime shopping list
- Categories
- Monthly household budget
- Edit/delete income and expenses
- Installable PWA
- Supabase Row Level Security

SETUP
1. Create a new Supabase project.
2. Open SQL Editor and run supabase/schema.sql.
3. In Supabase Project Settings -> API copy:
   - Project URL
   - public/publishable anon key
4. Put those two values into js/config.js.
5. NEVER put a service_role or secret key in the frontend.
6. In Supabase Authentication enable Email/Password.
7. Recommended for production: enable email confirmation.
8. Add your final GitHub Pages URL as an allowed site/redirect URL.
9. Upload the CONTENTS of this folder to a GitHub repository, e.g. household-finance.
10. Enable GitHub Pages from main / root.
11. First user: create account and create household.
12. Second user: create separate account and join with household invite code.

SECURITY
- Financial records are stored in Supabase, not GitHub.
- RLS policies restrict records to authenticated users in the same household.
- Keep the GitHub repository free of secret/service-role keys.
- Use HTTPS hosting.
- Use strong passwords and email confirmation.

NEXT VERSION IDEAS
- Recurring bills and recurring income
- Receipt photo uploads
- Category-specific budgets
- Savings/investment transfers
- CSV import/export
- Activity/audit history
- Push notifications
- Android packaging with Capacitor / Play Store


VERSION 2
- Complete visual redesign.
- Supabase/database logic unchanged.
- Service worker cache bumped to household-finance-v2.


VERSION 4 CHANGES
- Delete expense/income/shopping items refreshes the current list immediately.
- Current tab is remembered across refreshes.
- Home dashboard adds Income vs Expenses comparison chart.
- Home dashboard adds Expenses by Category donut chart with percentages.
- Service worker/cache bumped to V4.


VERSION 6 SECURITY UPDATE
- Supabase JS is pinned to 2.118.0 instead of floating on any future v2 release.
- Service-worker assets are consistently versioned as V6.
- Household invite codes expire after 48 hours and rotate after a successful join.
- Household owners can generate a fresh invite code at any time.
- Household settings such as the monthly budget are owner-only.
- Income, expenses, categories and shopping remain shared/editable by household members.

IF YOU ALREADY RAN AN OLDER schema.sql:
Run supabase/migrate-v6-hardening.sql ONCE in the Supabase SQL Editor.
Do NOT rerun the full schema just to upgrade an existing database.


V7 DATABASE FIX
If V6 shows "function gen_random_bytes(integer) does not exist" when generating an invite, run supabase/migrate-v7-invite-generator-fix.sql in Supabase SQL Editor. This migration does not delete existing data.
