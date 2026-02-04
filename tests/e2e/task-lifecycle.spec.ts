import { test, expect } from '@playwright/test';
import { login, testUsers } from './helpers/auth';

test.describe('Task Lifecycle - Happy Path', () => {
  test.describe.configure({ mode: 'serial' });
  
  let taskId: string;
  let submissionId: string;
  
  test('Poster creates a task', async ({ page }) => {
    // Login as poster
    await login(page, testUsers.poster);
    
    // Navigate to create task page
    await page.goto('/tasks/new');
    
    // Fill out task form
    await page.fill('[name="title"]', 'E2E Test Task: Documentation');
    await page.fill('[name="description"]', 'Write comprehensive API documentation for the REST endpoints.');
    await page.selectOption('[name="currency"]', 'salt');
    await page.fill('[name="budget"]', '100');
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Wait for redirect to task detail page
    await page.waitForURL(/\/tasks\/[a-f0-9-]+/, { timeout: 10000 });
    
    // Extract task ID from URL
    const url = page.url();
    taskId = url.match(/\/tasks\/([a-f0-9-]+)/)?.[1] || '';
    expect(taskId).toBeTruthy();
    
    // Verify task details are displayed
    await expect(page.locator('h1')).toContainText('E2E Test Task: Documentation');
    await expect(page.locator('[data-testid="task-budget"]')).toContainText('100');
    await expect(page.locator('[data-testid="task-status"]')).toContainText('open');
    
    console.log(`✅ Task created: ${taskId}`);
  });
  
  test('Worker browses and claims the task', async ({ page }) => {
    // Login as worker
    await login(page, testUsers.worker);
    
    // Navigate to task marketplace
    await page.goto('/tasks');
    
    // Find the test task
    await page.fill('[data-testid="search-input"]', 'E2E Test Task');
    await page.click('button[aria-label="Search"]');
    
    // Wait for search results
    await page.waitForSelector('[data-testid="task-card"]', { timeout: 5000 });
    
    // Click on the task
    await page.click(`[data-testid="task-card"][data-task-id="${taskId}"]`);
    
    // Verify task details page loaded
    await page.waitForURL(/\/tasks\/[a-f0-9-]+/);
    await expect(page.locator('h1')).toContainText('E2E Test Task');
    
    // Claim the task
    await page.click('[data-testid="claim-task-button"]');
    
    // Wait for claim confirmation
    await expect(page.locator('[data-testid="claim-success"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="task-status"]')).toContainText('in_progress');
    
    console.log(`✅ Task claimed by worker`);
  });
  
  test('Worker submits work with proof', async ({ page }) => {
    // Login as worker
    await login(page, testUsers.worker);
    
    // Navigate to task
    await page.goto(`/tasks/${taskId}`);
    
    // Click submit work button
    await page.click('[data-testid="submit-work-button"]');
    
    // Wait for submission form modal/page
    await page.waitForSelector('[name="content"]', { timeout: 5000 });
    
    // Fill submission form
    await page.fill('[name="content"]', 'API documentation completed. See attached screenshots.');
    
    // Upload proof file (if implemented)
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles({
        name: 'proof-screenshot.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fake-image-data'),
      });
    }
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Wait for success confirmation
    await expect(page.locator('[data-testid="submission-success"]')).toBeVisible({ timeout: 10000 });
    
    // Extract submission ID if displayed
    const submissionIdText = await page.locator('[data-testid="submission-id"]').textContent();
    submissionId = submissionIdText?.match(/[a-f0-9-]{36}/)?.[0] || '';
    
    console.log(`✅ Work submitted: ${submissionId}`);
  });
  
  test('Poster reviews and approves submission', async ({ page }) => {
    // Login as poster
    await login(page, testUsers.poster);
    
    // Navigate to task
    await page.goto(`/tasks/${taskId}`);
    
    // Click review submission button
    await page.click('[data-testid="review-submission-button"]');
    
    // Wait for review page/modal
    await page.waitForSelector('[data-testid="submission-content"]', { timeout: 5000 });
    
    // Verify submission content is displayed
    await expect(page.locator('[data-testid="submission-content"]')).toContainText('API documentation completed');
    
    // Verify proof is displayed (if implemented)
    const proofSection = page.locator('[data-testid="submission-proof"]');
    if (await proofSection.count() > 0) {
      await expect(proofSection).toBeVisible();
    }
    
    // Approve the submission
    await page.fill('[name="reviewer_notes"]', 'Great work! Documentation is clear and comprehensive.');
    await page.click('[data-testid="approve-button"]');
    
    // Wait for approval confirmation
    await expect(page.locator('[data-testid="approval-success"]')).toBeVisible({ timeout: 10000 });
    
    // Verify task status is completed
    await expect(page.locator('[data-testid="task-status"]')).toContainText('completed');
    
    console.log(`✅ Submission approved`);
  });
  
  test('Transaction record created and balances updated', async ({ page, request }) => {
    // This test verifies database state via API
    const response = await request.get(`/api/v1/market/tasks/${taskId}/transaction`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.transaction).toBeDefined();
    expect(data.transaction.task_id).toBe(taskId);
    expect(data.transaction.amount_salt).toBe(100);
    
    console.log(`✅ Transaction created: ${data.transaction.id}`);
    
    // Verify worker balance increased
    const workerResponse = await request.get(`/api/v1/users/me`);
    const workerData = await workerResponse.json();
    expect(workerData.user.salt_balance).toBeGreaterThanOrEqual(100);
    
    console.log(`✅ Worker balance updated`);
  });
  
  test('Bidirectional reviews can be submitted', async ({ page }) => {
    // Worker reviews poster
    await login(page, testUsers.worker);
    await page.goto(`/tasks/${taskId}`);
    
    await page.click('[data-testid="review-poster-button"]');
    await page.waitForSelector('[name="rating"]', { timeout: 5000 });
    
    // Fill review form
    await page.selectOption('[name="rating"]', '5');
    await page.fill('[name="comment"]', 'Clear requirements and fast payment!');
    await page.click('[name="would_work_again"]');
    
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="review-success"]')).toBeVisible({ timeout: 5000 });
    
    console.log(`✅ Worker reviewed poster`);
    
    // Poster reviews worker
    await login(page, testUsers.poster);
    await page.goto(`/tasks/${taskId}`);
    
    await page.click('[data-testid="review-worker-button"]');
    await page.waitForSelector('[name="rating"]', { timeout: 5000 });
    
    await page.selectOption('[name="rating"]', '5');
    await page.fill('[name="comment"]', 'Excellent documentation quality!');
    
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="review-success"]')).toBeVisible({ timeout: 5000 });
    
    console.log(`✅ Poster reviewed worker`);
  });
});
