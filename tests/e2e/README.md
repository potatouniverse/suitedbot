# SuitedBot E2E Tests

## Overview

End-to-end tests using Playwright to verify complete user journeys through the application.

## Setup

### 1. Install Dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Set Environment Variables

Create `.env.test.local`:

```bash
# App URL
TEST_BASE_URL=http://localhost:3000

# Test user credentials (created by seed script)
TEST_POSTER_TOKEN=<generated-token>
TEST_WORKER_TOKEN=<generated-token>

# Cron secret (for testing auto-approval)
CRON_SECRET=your-cron-secret
```

### 3. Seed Test Data

```bash
# Start local Supabase
supabase start

# Run seed script
npm run db:seed:test
```

## Running Tests

### All tests (headless)
```bash
npm run test:e2e
```

### With UI mode (debugging)
```bash
npm run test:e2e:ui
```

### Specific test file
```bash
npm run test:e2e tests/e2e/task-lifecycle.spec.ts
```

### Headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Debug mode (step through)
```bash
npm run test:e2e:debug
```

## Test Structure

```
tests/e2e/
├── helpers/
│   ├── auth.ts          # Authentication utilities
│   ├── db.ts            # Database helpers
│   └── task-factory.ts  # Test data factories
├── task-lifecycle.spec.ts    # Full task workflow
├── auto-approval.spec.ts     # Auto-approval timeout
├── offers.spec.ts            # Offer system
└── reviews.spec.ts           # Bidirectional reviews
```

## Test Scenarios

### 1. Task Lifecycle (task-lifecycle.spec.ts)
- Poster creates task
- Worker claims task
- Worker submits work
- Poster approves
- Payment released
- Reviews exchanged

### 2. Auto-Approval (auto-approval.spec.ts)
- Submission with timeout
- Cron job triggers
- Auto-approval happens
- Payment released

### 3. Offers (offers.spec.ts)
- Worker makes counter-offer
- Poster accepts/rejects
- Task proceeds with new terms

### 4. Reviews (reviews.spec.ts)
- Worker reviews poster
- Poster reviews worker
- Aggregate ratings update
- Duplicate prevention

## CI/CD

Tests run automatically on:
- Every pull request
- Merges to `main`

GitHub Actions workflow: `.github/workflows/e2e-tests.yml`

## Debugging Failed Tests

### 1. View screenshots
```bash
open playwright-report/
```

### 2. View trace
```bash
npx playwright show-trace test-results/path/to/trace.zip
```

### 3. Run in debug mode
```bash
npm run test:e2e:debug -- task-lifecycle
```

## Writing New Tests

### Use Page Object Model

```typescript
// tests/e2e/pages/TaskPage.ts
export class TaskPage {
  constructor(private page: Page) {}
  
  async claim() {
    await this.page.click('[data-testid="claim-task-button"]');
  }
  
  async submit(content: string) {
    await this.page.click('[data-testid="submit-work-button"]');
    await this.page.fill('[name="content"]', content);
    await this.page.click('button[type="submit"]');
  }
}

// In test file
const taskPage = new TaskPage(page);
await taskPage.claim();
await taskPage.submit('My work');
```

### Use data-testid attributes

Always prefer `data-testid` over CSS selectors:

```typescript
// ✅ Good
await page.click('[data-testid="submit-button"]');

// ❌ Avoid
await page.click('button.btn-primary');
```

## Best Practices

1. **Independent tests** - Each test should set up its own data
2. **Cleanup** - Use `afterEach` to clean up test data
3. **Assertions** - Use explicit waits, not fixed timeouts
4. **Selectors** - Prefer `data-testid` over classes/IDs
5. **Screenshots** - Automatically captured on failure
6. **Traces** - Enabled on retry for debugging

## Troubleshooting

### Port already in use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill
```

### Database connection issues
```bash
# Restart Supabase
supabase stop
supabase start
```

### Flaky tests
- Add explicit `waitFor` conditions
- Increase timeout if needed
- Check for race conditions
