/**
 * Validation System API Tests
 * 
 * These are integration test scenarios for the validation & trust system.
 * Run against a local or staging environment with test data.
 * 
 * Test scenarios:
 * 1. Time-Lock Auto-Approval
 * 2. Proof Attachments
 * 3. Bidirectional Reviews
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

interface TestContext {
  taskId?: string;
  submissionId?: string;
  posterId?: string;
  workerId?: string;
  authToken?: string;
}

/**
 * Helper to make authenticated API requests
 */
async function apiRequest(
  endpoint: string,
  options: RequestInit & { token?: string } = {}
) {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });
  
  const data = await response.json();
  return { status: response.status, data };
}

/**
 * Test 1: Submission with Proof Attachment
 */
async function testSubmissionWithProof(ctx: TestContext) {
  console.log("\n📎 Test: Submission with Proof Attachment");
  
  // Simulate submitting work with proof
  const submitResponse = await apiRequest(`/api/v1/market/tasks/${ctx.taskId}/submit`, {
    method: "POST",
    token: ctx.authToken,
    body: JSON.stringify({
      content: "Task completed. See attached proof.",
      proof_url: "https://example.com/proof.png",
      proof_metadata: {
        hash: "sha256:abc123",
        file_type: "image/png",
        file_size: 12345,
        original_name: "screenshot.png",
      },
    }),
  });
  
  console.log("  Submit response:", submitResponse.status);
  console.log("  Has auto_approve_at:", !!submitResponse.data.auto_approve_at);
  
  if (submitResponse.data.success) {
    ctx.submissionId = submitResponse.data.submission.id;
    console.log("  ✅ Submission created with proof");
    return true;
  }
  
  console.log("  ❌ Failed:", submitResponse.data.error);
  return false;
}

/**
 * Test 2: Auto-Approval Cron Job
 */
async function testAutoApprovalCron(ctx: TestContext) {
  console.log("\n⏰ Test: Auto-Approval Cron Job");
  
  const cronSecret = process.env.CRON_SECRET || "";
  
  const response = await apiRequest("/api/cron/auto-approve-submissions", {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${cronSecret}`,
    },
  });
  
  console.log("  Response:", response.status);
  console.log("  Processed:", response.data.processed);
  console.log("  Approved:", response.data.approved);
  
  if (response.data.success) {
    console.log("  ✅ Cron job executed successfully");
    return true;
  }
  
  console.log("  ❌ Failed:", response.data.error);
  return false;
}

/**
 * Test 3: Review Submission (clears auto-approve)
 */
async function testReviewSubmission(ctx: TestContext) {
  console.log("\n✅ Test: Review Submission");
  
  const response = await apiRequest(`/api/v1/market/submissions/${ctx.submissionId}/review`, {
    method: "POST",
    token: ctx.authToken,
    body: JSON.stringify({
      action: "approve",
      reviewer_notes: "Great work!",
    }),
  });
  
  console.log("  Response:", response.status);
  console.log("  Has next_action:", !!response.data.next_action);
  
  if (response.data.success) {
    console.log("  ✅ Submission approved");
    console.log("  Next action:", response.data.next_action?.type);
    return true;
  }
  
  console.log("  ❌ Failed:", response.data.error);
  return false;
}

/**
 * Test 4: Bidirectional Review (Worker reviews Poster)
 */
async function testBidirectionalReview(ctx: TestContext) {
  console.log("\n⭐ Test: Bidirectional Review (Worker → Poster)");
  
  const response = await apiRequest(`/api/v1/market/tasks/${ctx.taskId}/review-poster`, {
    method: "POST",
    token: ctx.authToken,
    body: JSON.stringify({
      rating: 5,
      comment: "Clear requirements, fast payment!",
      would_work_again: true,
      clarity_rating: 5,
      communication_rating: 4,
      payment_speed_rating: 5,
    }),
  });
  
  console.log("  Response:", response.status);
  
  if (response.data.success) {
    console.log("  ✅ Review submitted");
    console.log("  Review ID:", response.data.review.id);
    return true;
  }
  
  console.log("  ❌ Failed:", response.data.error);
  return false;
}

/**
 * Test 5: Get Poster Reviews
 */
async function testGetPosterReviews(ctx: TestContext) {
  console.log("\n📊 Test: Get Poster Reviews");
  
  const response = await apiRequest(`/api/v1/users/${ctx.posterId}/poster-reviews`, {
    method: "GET",
  });
  
  console.log("  Response:", response.status);
  
  if (response.data.success) {
    console.log("  ✅ Poster reviews retrieved");
    console.log("  Avg rating:", response.data.user.avg_poster_rating);
    console.log("  Review count:", response.data.user.poster_reviews_count);
    console.log("  Would work again %:", response.data.stats.would_work_again_percent);
    return true;
  }
  
  console.log("  ❌ Failed:", response.data.error);
  return false;
}

/**
 * Test 6: Duplicate Review Prevention
 */
async function testDuplicateReviewPrevention(ctx: TestContext) {
  console.log("\n🚫 Test: Duplicate Review Prevention");
  
  const response = await apiRequest(`/api/v1/market/tasks/${ctx.taskId}/review-poster`, {
    method: "POST",
    token: ctx.authToken,
    body: JSON.stringify({
      rating: 3,
      comment: "Trying to review again",
    }),
  });
  
  console.log("  Response:", response.status);
  
  if (response.status === 400 && response.data.error?.includes("already reviewed")) {
    console.log("  ✅ Duplicate review correctly prevented");
    return true;
  }
  
  console.log("  ❌ Should have blocked duplicate review");
  return false;
}

/**
 * Test 7: Get Submission with Proof for Review
 */
async function testGetSubmissionForReview(ctx: TestContext) {
  console.log("\n👁️ Test: Get Submission with Proof for Review");
  
  const response = await apiRequest(`/api/v1/market/submissions/${ctx.submissionId}/review`, {
    method: "GET",
    token: ctx.authToken,
  });
  
  console.log("  Response:", response.status);
  
  if (response.data.success) {
    console.log("  ✅ Submission retrieved");
    console.log("  Has proof:", !!response.data.proof);
    console.log("  Auto-approve info:", response.data.auto_approve?.message || "N/A");
    return true;
  }
  
  console.log("  ❌ Failed:", response.data.error);
  return false;
}

/**
 * Run all tests
 */
async function runTests() {
  console.log("🧪 Validation System Tests");
  console.log("=".repeat(50));
  console.log(`Base URL: ${BASE_URL}`);
  
  const ctx: TestContext = {
    // These would be set up in a real test environment
    taskId: process.env.TEST_TASK_ID,
    posterId: process.env.TEST_POSTER_ID,
    workerId: process.env.TEST_WORKER_ID,
    authToken: process.env.TEST_AUTH_TOKEN,
  };
  
  if (!ctx.taskId || !ctx.authToken) {
    console.log("\n⚠️  Test context not configured. Set environment variables:");
    console.log("  TEST_TASK_ID - ID of a claimed task");
    console.log("  TEST_POSTER_ID - ID of the task poster");
    console.log("  TEST_WORKER_ID - ID of the worker");
    console.log("  TEST_AUTH_TOKEN - Auth token for API calls");
    console.log("\nRunning structural tests only...\n");
    
    // Just test the cron endpoint (doesn't need context)
    await testAutoApprovalCron(ctx);
    return;
  }
  
  const results: Record<string, boolean> = {};
  
  results["Submit with Proof"] = await testSubmissionWithProof(ctx);
  results["Get Submission for Review"] = await testGetSubmissionForReview(ctx);
  results["Review Submission"] = await testReviewSubmission(ctx);
  results["Bidirectional Review"] = await testBidirectionalReview(ctx);
  results["Get Poster Reviews"] = await testGetPosterReviews(ctx);
  results["Duplicate Prevention"] = await testDuplicateReviewPrevention(ctx);
  results["Auto-Approval Cron"] = await testAutoApprovalCron(ctx);
  
  console.log("\n" + "=".repeat(50));
  console.log("📋 Results Summary");
  console.log("=".repeat(50));
  
  let passed = 0;
  let failed = 0;
  
  for (const [name, result] of Object.entries(results)) {
    const status = result ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${status} - ${name}`);
    if (result) passed++;
    else failed++;
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`Total: ${passed} passed, ${failed} failed`);
}

// Run if executed directly
runTests().catch(console.error);
