# MrJ Treasury

A GitHub Pages-hosted class finance portal using React + TypeScript + Supabase Auth/Postgres. Currency: PKR. The starter includes a ledger dashboard, student roster, event budgets, committee tasks, shared in-app notices, CSV export, and database-triggered audit history.

## Roles

- **Finance Manager**: manage student roster and money transactions; manage events, tasks and notices; view ledger and audit history.
- **CR**: read the financial ledger for transparency; manage events, committee tasks and shared notices; cannot create/edit/delete money transactions or student roster.
- **Pending**: signed-in account awaiting explicit role assignment.

## 1. Create the Supabase backend

1. Create a Supabase project at <https://supabase.com/dashboard>.
2. Open **SQL Editor → New query** and run all of `supabase/schema.sql`.
3. In **Authentication → Providers**, keep Email enabled. Disable public sign-ups for production and use invited users only.
4. In **Authentication → Users**, invite the finance manager and CR using their email addresses. Set a strong password or use the invitation flow.
5. Run the two role assignment statements at the bottom of `supabase/schema.sql`, replacing the example emails and names with the exact values. Assign one `finance_manager` and one `cr`.
6. In **Project Settings → API** (or the project's **Connect** panel), copy the project URL and **publishable** key. Older projects may call this the `anon` key. Never use a service-role/secret key in the browser.
7. Under **Authentication → URL Configuration**, add your local URL `http://localhost:5173` and your eventual GitHub Pages URL to allowed redirect URLs. Use the GitHub Pages URL as Site URL after deployment.

> Important: this is a starter application and its RLS policies are the security boundary. Review policies and run tests with both roles before putting real student financial data into production. Do not make profile role updates available from the client.

## 2. Run locally

Install Node.js 20+ (Node 22 is used in CI), then from the project folder:

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Then run:

```bash
npm run dev
```

Open <http://localhost:5173>. Sign in with the invited account. If using PowerShell, manually copy `.env.example` to `.env.local` instead of using `cp`.

## 3. Push to GitHub

1. Create a new repository named `mrj-treasury` (or another name) on GitHub.
2. Copy these project files into the repository. Do not upload `.env.local`.
3. Commit and push the files to the `main` branch.
4. Open **Settings → Secrets and variables → Actions → Variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
6. Open **Actions** and wait for **Deploy MrJ Treasury to GitHub Pages** to succeed.
7. Visit `https://YOUR_GITHUB_USERNAME.github.io/mrj-treasury/` (replace the username/repository). Add this URL to Supabase Auth's allowed redirect URLs and set the Site URL.

The workflow uses the repository name as Vite's base path. If you rename the repository, the next deployment should use the new name. For a custom domain or username root site, adjust `BASE_PATH` in `.github/workflows/deploy.yml` and `vite.config.ts` as appropriate.

## 4. Backups and reconciliation

- Export transactions using the app's **Export CSV** button regularly.
- For a database backup, use Supabase's database backup/export facilities and keep a second copy in a private, access-controlled location. Free-plan backup availability/retention can vary; check the current project plan before relying on automated backups.
- Do not treat a CSV transaction export as a complete backup: it does not include all students, events, committee tasks, notices, or audit rows.
- Reconcile the recorded balance against actual cash/bank balance after every event. Store receipt images in a private bucket or another private storage location; this starter stores receipt references only, not receipt uploads.
- Protect GitHub repository access with 2FA. Keep the repository private if desired, but remember GitHub Pages visibility/plan behavior may vary. The frontend bundle and publishable key are public by design; database protection must come from Supabase Auth + RLS.

## Security notes / current scope

- RLS is enabled on all app tables.
- Only the Finance Manager can mutate transactions and student records; the CR can manage event and committee planning records.
- Audit rows are written by Postgres triggers for student, event, transaction, and task insert/update/delete operations. Direct browser writes to audit logs are not granted.
- In-app notifications are stored in Supabase, with per-user read receipts. This does **not** send email, browser push or WhatsApp messages. A real external delivery channel needs a server-side Edge Function/provider and secrets kept server-side.
- The UI shows all-time totals and the most recent 500 transactions. If the ledger grows, use server-side aggregate queries/pagination rather than relying on a limited client-side result set.
- The event spend chart uses recorded expense transactions. Refunds are currently shown as a separate received amount and are included in the net balance as positive; adjust the transaction model if your class needs outgoing refunds or reversed contributions.
- The starter does not calculate outstanding dues because the class contribution requirement per student has not been specified. Add a per-student assessed amount before showing an accurate dues balance.
- Audit history captures row snapshots, but it is not a tamper-proof legal audit archive: project owners/database administrators can change the database. Use separate backups and restricted project-owner access.

## Suggested first tests

1. Sign in as Finance Manager; add a student, event, contribution and expense.
2. Verify the available balance matches contributions + refunds − expenses.
3. Sign in as CR in a separate browser/profile; verify ledger is visible and transaction creation is blocked by RLS.
4. Verify CR can create an event and committee task, and the new audit rows appear.
5. Attempt to access data signed out; all private tables should return no records / permission errors.
6. Confirm role assignment cannot be changed from the browser.
