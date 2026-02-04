import { test, expect } from '@playwright/test';
import { login, testUsers } from './helpers/auth';

test.describe('Auto-Approval System', () => {
  test.describe.configure({ mode: 'serial' });
  
  let taskId: string;
  let submissionId: string;
  
  test.beforeAll(async ({ request }) => {
    // Create a task via API for faster setup
    const createTaskResponse = await request.post('/api/v1/market/tasks', {
      data: {
        title: 'Auto-Approval Test Task',
        description: 'This task will test auto-approval timeout',
        currency: 'salt',
        budget_salt: 50,
      },
      headers: {
        'Authorization': `Bearer ${process.env.TEST_POSTER_TOKEN}`,
      },
    });
    
    const taskData = await createTaskResponse.json();
    taskId = taskData.task.id;
    
    // Claim the task
    await request.post(`/api/v1/market/tasks/${taskId}/claim`, {
      headers: {
        'Authorization': `Bearer ${process.env.TEST_WORKER_TOKEN}`,
      },
    });
    
    console.log(`✅ Test task created and claimed: ${taskId}`);
  });
  
  test('Worker submits work and auto_approve_at is set', async ({ page, request }) => {
    // Submit work via API
    const submitResponse = await request.post(`/api/v1/market/tasks/${taskId}/submit`, {
      data: {
        content: 'Work completed for auto-approval test',
        proof_url: 'https://example.com/proof.png',
      },
      headers: {
        'Authorization': `Bearer ${process.env.TEST_WORKER_TOKEN}`,
      },
    });
    
    expect(submitResponse.status()).toBe(200);
    
    const submitData = await submitResponse.json();
    submissionId = submitData.submission.id;
    
    // Verify auto_approve_at is set (48 hours from now)
    expect(submitData.submission.auto_approve_at).toBeTruthy();
    
    const autoApproveTime = new Date(submitData.submission.auto_approve_at);
    const now = new Date();
    const hoursDiff = (autoApproveTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    // Should be approximately 48 hours (allow 1 hour margin)
    expect(hoursDiff).toBeGreaterThan(47);
    expect(hoursDiff).toBeLessThan(49);
    
    console.log(`✅ Submission created with auto_approve_at: ${submitData.submission.auto_approve_at}`);
  });
  
  test('Poster can see auto-approval deadline', async ({ page }) => {
    await login(page, testUsers.poster);
    
    await page.goto(`/tasks/${taskId}`);
    
    // Should show a warning about auto-approval
    const autoApprovalWarning = page.locator('[data-testid="auto-approval-warning"]');
    await expect(autoApprovalWarning).toBeVisible();
    await expect(autoApprovalWarning).toContainText(/48 hours?/i);
    
    console.log(`✅ Auto-approval deadline displayed to poster`);
  });
  
  test('Reviewing submission clears auto_approve_at', async ({ page, request }) => {
    // Poster reviews (rejects for testing)
    await login(page, testUsers.poster);
    
    await page.goto(`/tasks/${taskId}`);
    await page.click('[data-testid="review-submission-button"]');
    
    await page.waitForSelector('[name="reviewer_notes"]', { timeout: 5000 });
    await page.fill('[name="reviewer_notes"]', 'Please add more details');
    await page.click('[data-testid="reject-button"]');
    
    await expect(page.locator('[data-testid="rejection-success"]')).toBeVisible({ timeout: 5000 });
    
    // Verify auto_approve_at is now null
    const submissionResponse = await request.get(`/api/v1/market/submissions/${submissionId}`);
    const submissionData = await submissionResponse.json();
    
    expect(submissionData.submission.auto_approve_at).toBeNull();
    expect(submissionData.submission.status).toBe('revision_requested');
    
    console.log(`✅ auto_approve_at cleared on manual review`);
  });
  
  test('Worker resubmits after revision request', async ({ page, request }) => {
    // Worker resubmits
    const resubmitResponse = await request.post(`/api/v1/market/tasks/${taskId}/submit`, {
      data: {
        content: 'Revised work with additional details',
        proof_url: 'https://example.com/proof-v2.png',
      },
      headers: {
        'Authorization': `Bearer ${process.env.TEST_WORKER_TOKEN}`,
      },
    });
    
    expect(resubmitResponse.status()).toBe(200);
    
    const resubmitData = await resubmitResponse.json();
    submissionId = resubmitData.submission.id;
    
    // New submission should have auto_approve_at set again
    expect(resubmitData.submission.auto_approve_at).toBeTruthy();
    
    console.log(`✅ Resubmission has new auto_approve_at`);
  });
  
  test('Cron job auto-approves expired submissions', async ({ request }) => {
    // Update submission's auto_approve_at to 1 hour ago (simulate expiry)
    await request.post('/api/test/set-auto-approve-expired', {
      data: {
        submission_id: submissionId,
        hours_ago: 1,
      },
    });
    
    // Trigger cron job
    const cronResponse = await request.get('/api/cron/auto-approve-submissions', {
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      },
    });
    
    expect(cronResponse.status()).toBe(200);
    
    const cronData = await cronResponse.json();
    expect(cronData.success).toBe(true);
    expect(cronData.processed).toBeGreaterThanOrEqual(1);
    expect(cronData.approved).toBeGreaterThanOrEqual(1);
    
    console.log(`✅ Cron job processed ${cronData.processed} submissions`);
    
    // Verify submission is now approved
    const submissionResponse = await request.get(`/api/v1/market/submissions/${submissionId}`);
    const submissionData = await submissionResponse.json();
    
    expect(submissionData.submission.status).toBe('approved');
    expect(submissionData.submission.reviewer_notes).toContain('Auto-approved');
    
    console.log(`✅ Submission auto-approved successfully`);
    
    // Verify task is completed
    const taskResponse = await request.get(`/api/v1/market/tasks/${taskId}`);
    const taskData = await taskResponse.json();
    
    expect(taskData.task.status).toBe('completed');
    
    console.log(`✅ Task marked as completed`);
  });
  
  test('Transaction created and payment released', async ({ request }) => {
    // Verify transaction record
    const transactionResponse = await request.get(`/api/v1/market/tasks/${taskId}/transaction`);
    expect(transactionResponse.status()).toBe(200);
    
    const transactionData = await transactionResponse.json();
    expect(transactionData.transaction).toBeDefined();
    expect(transactionData.transaction.submission_id).toBe(submissionId);
    expect(transactionData.transaction.amount_salt).toBe(50);
    
    console.log(`✅ Transaction created on auto-approval`);
  });
});
