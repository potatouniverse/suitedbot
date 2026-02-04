# SuitedBot E2E Testing Plan

## Test Pyramid

```
     /\        E2E Tests (Playwright)
    /  \       - Full user journeys
   /----\      - Browser automation
  /      \     
 / Unit + \    Integration Tests (Vitest)
/  Tests   \   - API endpoints
------------   - Database operations
```

## E2E Test Scenarios

### 1. **Task Lifecycle - Happy Path**
**User Story:** Poster creates task → Worker claims → Submits → Poster approves → Payment

**Steps:**
1. Poster signs up/logs in
2. Posts new task (title, description, budget)
3. Worker signs up/logs in
4. Browses available tasks
5. Claims task
6. Submits work with proof (file upload)
7. Poster reviews submission
8. Approves submission
9. Verify transaction record created
10. Verify balances updated

**Expected Duration:** ~2 min

---

### 2. **Offer Workflow**
**User Story:** Worker makes offer → Poster accepts → Task proceeds

**Steps:**
1. Worker views task details
2. Submits counter-offer (different amount/timeline)
3. Poster receives notification
4. Reviews offer
5. Accepts offer
6. Verify task updated with accepted offer
7. Worker can now claim task

**Expected Duration:** ~1 min

---

### 3. **Auto-Approval Timeout**
**User Story:** Worker submits → Poster doesn't review → Auto-approves after 48h

**Steps:**
1. Worker submits work
2. Verify `auto_approve_at` set to +48h
3. **Fast-forward time** (mock system time to 49h later)
4. Trigger cron job manually
5. Verify submission auto-approved
6. Verify task completed
7. Verify payment released

**Expected Duration:** ~30s (with time mocking)

---

### 4. **Rejection & Resubmission**
**User Story:** Poster rejects work → Worker fixes → Resubmits

**Steps:**
1. Poster rejects submission with notes
2. Verify task status = "in_progress"
3. Worker views rejection feedback
4. Resubmits improved work
5. Poster approves
6. Payment released

**Expected Duration:** ~1 min

---

### 5. **Bidirectional Reviews**
**User Story:** Both poster and worker leave reviews for each other

**Steps:**
1. Complete task (approval flow)
2. Poster reviews worker (rating, comment)
3. Worker reviews poster (rating, comment)
4. Verify reviews appear on profiles
5. Verify aggregate ratings updated
6. Test duplicate review prevention

**Expected Duration:** ~45s

---

### 6. **Proof Attachment System**
**User Story:** Worker uploads proof files with submission

**Steps:**
1. Worker submits with file upload
2. Verify file metadata stored
3. Verify file accessible to poster
4. Poster views proof in review UI
5. Download proof file
6. Verify file integrity (hash check)

**Expected Duration:** ~1 min

---

### 7. **Edge Cases & Error Handling**

#### 7a. Double Claim Prevention
- Worker A claims task
- Worker B tries to claim same task
- Verify error: "Task already claimed"

#### 7b. Unauthorized Actions
- Worker tries to approve own submission
- Poster tries to claim own task
- Verify 403 Forbidden errors

#### 7c. Insufficient Balance
- Poster with 0 balance creates task
- Verify funds locked in escrow
- Test task creation failure if balance < budget

#### 7d. Expired Task Claiming
- Task with deadline past due
- Worker tries to claim
- Verify error or auto-archive

---

## Test Data Setup

### Fixtures (seeded via migration)
```sql
-- Test users
INSERT INTO users (id, username, email, user_type, salt_balance) VALUES
  ('poster-1', 'alice_poster', 'alice@test.com', 'human', 1000),
  ('worker-1', 'bob_worker', 'bob@test.com', 'human', 500),
  ('worker-2', 'charlie_worker', 'charlie@test.com', 'human', 300);

-- Test task
INSERT INTO tasks (id, poster_id, title, description, currency, budget_salt, status) VALUES
  ('task-test-1', 'poster-1', 'Test Task', 'Write docs', 'salt', 100, 'open');
```

### Dynamic Test Data
- Use factory functions to create unique test data per run
- Clean up after each test (transactions + rollback)

---

## Test Environment

### Local
```bash
# Start test database
supabase start

# Run E2E tests
npm run test:e2e

# Run specific test file
npm run test:e2e -- task-lifecycle.spec.ts
```

### CI/CD (GitHub Actions)
```yaml
- name: E2E Tests
  run: |
    npm run build
    npm run test:e2e:ci
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

---

## Tools & Setup

### Playwright (E2E)
- Browser: Chromium (headless in CI, headed locally)
- Page Object Model for reusable components
- Screenshot on failure
- Video recording for debugging

### Vitest (Unit/Integration)
- API endpoint tests
- Database helpers
- Validation logic

### Test Utilities
```typescript
// tests/helpers/auth.ts
export async function loginAs(page: Page, username: string)

// tests/helpers/task-factory.ts
export async function createTask(data: Partial<Task>)

// tests/helpers/db.ts
export async function cleanupTestData()
```

---

## Success Criteria

✅ All 7 core scenarios pass  
✅ No flaky tests (3 consecutive green runs)  
✅ Test execution < 5 minutes total  
✅ Coverage > 80% for critical paths  
✅ Tests run in CI on every PR  

---

## Migration from Current State

**Phase 1: Setup** (1-2 hours)
- Install Playwright
- Create test fixtures
- Set up test database

**Phase 2: Core Flows** (3-4 hours)
- Implement scenarios 1-3
- Add Page Object Models

**Phase 3: Edge Cases** (2-3 hours)
- Implement scenarios 4-7
- Add error handling tests

**Phase 4: CI Integration** (1 hour)
- GitHub Actions workflow
- Test data seeding

---

## Next Steps

1. ✅ Review this plan with team
2. Install Playwright: `npm install -D @playwright/test`
3. Create `tests/e2e/` directory
4. Implement first scenario (Task Lifecycle)
5. Set up test database seeding
6. Add to CI pipeline
