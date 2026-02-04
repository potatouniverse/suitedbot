# SuitedBot - GID Workflow

## ✅ Workflow Established

Following proper GID development flow:
1. ✅ **Requirements Doc** → `DESIGN.md` (7KB)
2. ✅ **GID Graph** → `gid_design` + `gid_edit_graph`
3. ✅ **Task Nodes** → With checklist tasks
4. ✅ **Dependencies** → Edges showing blockers

## 📊 Current Graph State

**Health Score:** 95/100

**Nodes:** 7
- **Feature:** Marketplace (in_progress)
- **Components:**
  - Database (infrastructure, in_progress) — `migrations/001_initial_schema.sql`
  - MarketUI (interface, in_progress) — `src/app/market/page.tsx`
  - TaskAPI (application, in_progress) — `src/app/api/v1/market/tasks/`
  - SetupSupabase (infrastructure, draft) — **🔴 BLOCKER**
  - BuildOfferAPI (application, draft) — blocked by SetupSupabase
  - BuildSubmissionAPI (application, draft) — blocked by SetupSupabase

**Edges:** 4
- Marketplace → Database (depends_on)
- MarketUI → TaskAPI (depends_on)
- BuildOfferAPI → SetupSupabase (blocks)
- BuildSubmissionAPI → SetupSupabase (blocks)

## 📋 Task List (0/7 done)

### 🔴 SetupSupabase (Priority: BLOCKER)
- [ ] Create Supabase project at supabase.com
- [ ] Run migration: `migrations/001_initial_schema.sql`
- [ ] Configure `.env.local` with credentials

### BuildOfferAPI (Blocked)
- [ ] POST /api/v1/market/tasks/:id/offer
- [ ] POST /api/v1/market/offers/:id/respond

### BuildSubmissionAPI (Blocked)
- [ ] POST /api/v1/market/tasks/:id/submit
- [ ] POST /api/v1/market/submissions/:id/review

## 🎯 Next Steps

1. **User creates Supabase project** → Unblocks all API work
2. **Build Offer API** → Enables negotiation
3. **Build Submission API** → Enables work delivery
4. **Test full workflow** → End-to-end validation

## 📂 Key Files

- `DESIGN.md` — Requirements & architecture
- `.gid/graph.yml` — Project graph (GID)
- `migrations/001_initial_schema.sql` — Database schema (6 tables)
- `src/app/market/page.tsx` — Market UI (completed)
- `src/app/api/v1/market/tasks/` — Task API (partial)

## 🔍 GID Commands

```bash
# View tasks
mcporter call gid.gid_tasks graphPath=projects/suitedbot/.gid/graph.yml

# Mark task done
mcporter call gid.gid_task_update graphPath=projects/suitedbot/.gid/graph.yml node=SetupSupabase task="Create Supabase project" done=true

# View graph summary
mcporter call gid.gid_read graphPath=projects/suitedbot/.gid/graph.yml format=summary

# Visualize graph
mcporter call gid.gid_visual graphPath=projects/suitedbot/.gid/graph.yml outputPath=projects/suitedbot/graph.html
```

---

**Last Updated:** 2026-02-04  
**Status:** Awaiting Supabase setup
