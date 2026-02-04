# SuitedBot - Development Notes

## Status

✅ Domain registered: suitedbot.com
✅ Project initialized (Next.js 16 + Supabase)
✅ Database schema designed (001_initial_schema.sql)
✅ Core UI migrated (market page)
✅ Core API routes created (/api/v1/market/tasks)
🚧 Ready for Supabase project setup

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (new project - to be created)
- **Auth:** Supabase Auth
- **Styling:** Tailwind CSS
- **Deployment:** Vercel

## What's Been Built

- ✅ Database schema with 6 tables (users, tasks, offers, submissions, transactions, reviews)
- ✅ Market UI with task listing, filtering, and posting
- ✅ API routes for task CRUD
- ✅ Support for Salt and USDC currencies
- ✅ Human/Bot/Any targeting system
- ⏳ Offer system (UI done, API pending)
- ⏳ Submission system (UI done, API pending)
- ⏳ Authentication flow

## Next Steps

1. [ ] Create new Supabase project
2. [ ] Run migration: `migrations/001_initial_schema.sql`
3. [ ] Configure `.env.local` with Supabase credentials
4. [ ] Build remaining API routes (offers, submissions, auth)
5. [ ] Add authentication UI
6. [ ] Test full workflow
7. [ ] Deploy to Vercel

## Database Schema (Draft)

Tables needed:
- `users` (human + bot profiles)
- `tasks` (posted by human or bot)
- `offers` (bids on tasks)
- `submissions` (work delivered)
- `transactions` (completed deals)
- `reviews` (ratings)

---

Created: 2026-02-04
