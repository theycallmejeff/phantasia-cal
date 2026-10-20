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

## Sharing & subscribing
- **Event links:** clicking an event changes the address to `/#/event/<id>`; anyone opening that link lands on the event.
- **Add to calendar:** every event popup has *Share / Copy link*, *Google Calendar* and *Apple / Outlook* (.ics) buttons.
- **Subscribe:** the deploy workflow publishes `calendar.ics` next to the site and rebuilds it every 3 hours (`scripts/build-ics.mjs`), so subscribers see new events within a few hours (calendar apps also refresh on their own schedule).

## Editor & admin tools
Run `supabase/migrations/002_editor_tools.sql` once in the Supabase SQL Editor to turn these on:
- **Repeating events:** choose *Every week / Every 2 weeks / Every month (same weekday)* and an end date when adding an event. Deleting one asks *Only this date* or *This and later dates*.
- **Duplicate:** copies an event into a new one; change the date and save.
- **Added / edited by:** editors see who added and last edited each event.
- **Recent changes:** the Admin page lists every add, edit and delete, with *Remove*, *Restore* and *Undo edit*.
- **Request alerts:** a count badge on the Admin link, and the *Account request alert* workflow checks hourly and opens a GitHub issue that @mentions you (GitHub emails you). It closes itself once the queue is empty.

## Location autocomplete (Google Places, optional)
With a key set, the event **Location** field suggests businesses and addresses as you type (biased to New Orleans). Without one, it's a normal text box. Event locations always link to Google Maps for directions (no key needed).

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project, and add a billing account. New accounts start on Google Cloud's **90-day Free Trial**; to keep suggestions working after it ends, upgrade the billing account to paid. Maps then includes 10,000 free autocomplete requests every month (about 5 are used per event added).
2. **APIs & Services → Library:** enable **Maps JavaScript API** and **Places API (New)**.
3. **APIs & Services → Credentials → Create credentials → API key.** Edit the key:
   - *Application restrictions:* **Websites**, add `https://theycallmejeff.github.io/*` and `http://localhost:5173/*`
   - *API restrictions:* restrict to **Maps JavaScript API** and **Places API (New)**
4. **Watch spending:** add a $1 budget alert under *Billing → Budgets & alerts* (it emails you; it does not stop charges). Places API (New) only has per-minute rate limits, not a daily cap, and Free Trial accounts can't change quotas. Leave the Maps JavaScript API quotas at their defaults; the site never draws a map.
5. Add the key as the repository secret `VITE_GOOGLE_MAPS_API_KEY`, then re-run the deploy workflow.

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
