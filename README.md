# Phantasia Community Calendar

A free, shared events calendar. Anyone can view it; people request an account, an admin approves them, and approved members can add, edit, and drag-to-reschedule events.

- **Frontend:** React + FullCalendar, built with Vite, hosted free on **GitHub Pages**
- **Backend:** **Supabase** free tier — Postgres database + email/password logins
- **Security:** enforced in the database with row-level security (`supabase/schema.sql`), so the browser can't bypass it

| Who | Can do |
|---|---|
| Visitors (not signed in) | View the calendar |
| Pending / declined accounts | View the calendar |
| Editors (approved) | Add events, edit any event, delete their own events |
| Admins | Everything editors can, plus delete any event and approve, promote, or revoke accounts |

## Setup (about 15 minutes, $0)

### 1. Create the Supabase project
1. Sign up at [supabase.com](https://supabase.com) and create a new project (free plan).
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and click **Run**.
3. Open **Authentication → URL Configuration**:
   - **Site URL:** `https://<your-github-username>.github.io/<repo-name>/`
   - **Redirect URLs:** add the same URL, plus `http://localhost:5173/` for local testing.
4. Copy two values: the **Project URL** (click **Connect** at the top of the dashboard) and the **publishable** key (or legacy **anon** key) from **Project Settings → API Keys**. Never use the secret / service_role key.

> **Email limits:** Supabase's built-in email sender is limited to a few emails per hour, which is fine for a small group. If you'd rather skip confirmation emails, turn off **Authentication → Sign In / Providers → Email → Confirm email**. Admin approval still gates who can post, so this is safe.

### 2. Configure GitHub
1. In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `VITE_SUPABASE_URL` — the Project URL
   - `VITE_SUPABASE_ANON_KEY` — the publishable (or legacy anon) key
2. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). The site appears at `https://<username>.github.io/<repo-name>/`.

### 3. Make yourself the admin
1. Open the site and click **Request account** with your own email.
2. Back in Supabase **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
3. Sign in. You'll see the **Admin** link, where new requests show up for approval.

## Local development

```bash
cp .env.example .env    # fill in your Supabase URL and anon key
npm install
npm run dev             # http://localhost:5173
```

## Notes
- The anon key is meant to be public; the database rules decide what each user can do. Never put the `service_role` key in this project.
- Supabase pauses free projects after 7 days without database activity. The **Keep Supabase awake** workflow (`.github/workflows/keepalive.yml`) reads one event every Monday and Thursday to prevent that. If it ever fails, GitHub emails you; resume the project from the Supabase dashboard. GitHub turns off scheduled workflows in repos with no commits for 60 days and emails a warning first; click the link in that email (or the Actions tab) to keep it on.
- Routes use `#/` URLs (e.g. `/#/admin`) because GitHub Pages can't rewrite paths.
