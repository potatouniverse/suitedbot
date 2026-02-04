# SuitedBot Setup Guide

## 1. Install Dependencies

```bash
cd projects/suitedbot
npm install
```

## 2. Create Supabase Project

1. Go to https://supabase.com
2. Create new project: **suitedbot**
3. Copy your project URL and keys

## 3. Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials
```

## 4. Run Database Migrations

(Coming soon - will create tables for tasks, offers, submissions, etc.)

## 5. Start Development Server

```bash
npm run dev
```

Open http://localhost:3000

## Next Steps

- [ ] Set up Supabase project
- [ ] Create database schema
- [ ] Migrate market UI from SaltyHall
- [ ] Add authentication
- [ ] Build API routes
- [ ] Deploy to Vercel

---

**Status:** 🚧 Initial setup complete — 2026-02-04
