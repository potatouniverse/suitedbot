import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// POST /api/v1/market/submissions/[id]/review - Review submission (approve/reject/revision)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ success: false, error: "User profile not found" }, { status: 404 });
  }

  const { id: submissionId } = await params;
  const body = await req.json();
  const { action, reviewer_notes } = body;

  // Validate action
  if (!["approve", "reject", "revision"].includes(action)) {
    return NextResponse.json({ 
      success: false, 
      error: "Invalid action. Must be 'approve', 'reject', or 'revision'" 
    }, { status: 400 });
  }

  // Get submission with task, proof, and offer details
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select(`
      *,
      task:task_id (
        id,
        title,
        poster_id,
        status,
        claimed_by,
        currency,
        budget_salt,
        budget_usdc
      )
    `)
    .eq("id", submissionId)
    .single();

  if (submissionError || !submission) {
    return NextResponse.json({ success: false, error: "Submission not found" }, { status: 404 });
  }

  // Verify user is the task poster
  if (submission.task.poster_id !== profile.id) {
    return NextResponse.json({ 
      success: false, 
      error: "Only task poster can review submissions" 
    }, { status: 403 });
  }

  // Check submission status
  if (submission.status !== "pending") {
    return NextResponse.json({ 
      success: false, 
      error: "Submission has already been reviewed" 
    }, { status: 400 });
  }

  // Handle different actions
  if (action === "approve") {
    // Update submission status and clear auto-approve (since we're reviewing manually)
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ 
        status: "approved",
        reviewer_notes: reviewer_notes || null,
        auto_approve_at: null,  // Clear auto-approve since manually reviewed
      })
      .eq("id", submissionId);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // Update task status to completed
    const { error: taskError } = await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", submission.task_id);

    if (taskError) {
      return NextResponse.json({ success: false, error: taskError.message }, { status: 500 });
    }

    // Get the accepted offer for this task
    const { data: acceptedOffer } = await supabase
      .from("offers")
      .select("id")
      .eq("task_id", submission.task_id)
      .eq("status", "accepted")
      .single();

    // Create transaction record
    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .insert({
        task_id: submission.task_id,
        poster_id: submission.task.poster_id,
        completer_id: submission.task.claimed_by,
        offer_id: acceptedOffer?.id || null,
        submission_id: submissionId,
        currency: submission.task.currency,
        amount_salt: submission.task.currency === "salt" ? submission.task.budget_salt : null,
        amount_usdc: submission.task.currency === "usdc" ? submission.task.budget_usdc : null,
      })
      .select()
      .single();

    if (transactionError) {
      return NextResponse.json({ success: false, error: transactionError.message }, { status: 500 });
    }

    // Release payment to completer
    if (submission.task.currency === "salt") {
      const { data: completer } = await supabase
        .from("users")
        .select("salt_balance, tasks_completed, reputation")
        .eq("id", submission.task.claimed_by)
        .single();

      if (completer) {
        await supabase
          .from("users")
          .update({ 
            salt_balance: (completer.salt_balance || 0) + submission.task.budget_salt,
            tasks_completed: (completer.tasks_completed || 0) + 1,
            reputation: (completer.reputation || 0) + 10,
          })
          .eq("id", submission.task.claimed_by);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Submission approved and payment released",
      submission: { ...submission, status: "approved" },
      transaction,
      // Prompt worker to review the poster
      next_action: {
        type: "review_poster",
        task_id: submission.task_id,
        endpoint: `/api/v1/market/tasks/${submission.task_id}/review-poster`,
        message: "You can now review the task poster to help build trust in the marketplace.",
      },
    });
  }

  if (action === "reject") {
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ 
        status: "rejected",
        reviewer_notes: reviewer_notes || null,
        auto_approve_at: null,  // Clear auto-approve
      })
      .eq("id", submissionId);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // Update task status back to claimed (can resubmit)
    await supabase
      .from("tasks")
      .update({ status: "claimed" })
      .eq("id", submission.task_id);

    return NextResponse.json({ 
      success: true, 
      message: "Submission rejected. Worker can resubmit.",
      submission: { ...submission, status: "rejected" }
    });
  }

  if (action === "revision") {
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ 
        status: "revision_requested",
        reviewer_notes: reviewer_notes || null,
        auto_approve_at: null,  // Clear auto-approve while revisions pending
      })
      .eq("id", submissionId);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // Update task status back to claimed
    await supabase
      .from("tasks")
      .update({ status: "claimed" })
      .eq("id", submission.task_id);

    return NextResponse.json({ 
      success: true, 
      message: "Revision requested",
      submission: { ...submission, status: "revision_requested" }
    });
  }

  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
}

// GET /api/v1/market/submissions/[id]/review - Get submission with proof for review
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const { id: submissionId } = await params;

  // Get submission with full details including proof
  const { data: submission, error } = await supabase
    .from("submissions")
    .select(`
      *,
      submitter:submitter_id (
        id,
        display_name,
        user_type,
        reputation,
        tasks_completed
      ),
      task:task_id (
        id,
        title,
        description,
        poster_id,
        category,
        currency,
        budget_salt,
        budget_usdc
      )
    `)
    .eq("id", submissionId)
    .single();

  if (error || !submission) {
    return NextResponse.json({ success: false, error: "Submission not found" }, { status: 404 });
  }

  // Calculate time remaining for auto-approval
  let autoApproveInfo = null;
  if (submission.status === "pending" && submission.auto_approve_at) {
    const deadline = new Date(submission.auto_approve_at);
    const now = new Date();
    const msRemaining = deadline.getTime() - now.getTime();
    
    if (msRemaining > 0) {
      const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
      autoApproveInfo = {
        deadline: submission.auto_approve_at,
        hours_remaining: hoursRemaining,
        minutes_remaining: minutesRemaining,
        message: `Will auto-approve in ${hoursRemaining}h ${minutesRemaining}m if not reviewed`,
      };
    } else {
      autoApproveInfo = {
        deadline: submission.auto_approve_at,
        hours_remaining: 0,
        minutes_remaining: 0,
        message: "Auto-approval deadline has passed, awaiting cron job",
      };
    }
  }

  return NextResponse.json({
    success: true,
    submission,
    proof: submission.proof_url ? {
      url: submission.proof_url,
      metadata: submission.proof_metadata,
    } : null,
    auto_approve: autoApproveInfo,
  });
}
