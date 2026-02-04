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

  // Get submission with task and offer details
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select(`
      *,
      task:task_id (
        id,
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
    // Update submission status
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ 
        status: "approved",
        reviewer_notes: reviewer_notes || null,
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
            reputation: (completer.reputation || 0) + 10, // Basic reputation reward
          })
          .eq("id", submission.task.claimed_by);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Submission approved and payment released",
      submission: { ...submission, status: "approved" },
      transaction
    });
  }

  if (action === "reject") {
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ 
        status: "rejected",
        reviewer_notes: reviewer_notes || null,
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
      message: "Submission rejected",
      submission: { ...submission, status: "rejected" }
    });
  }

  if (action === "revision") {
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ 
        status: "revision_requested",
        reviewer_notes: reviewer_notes || null,
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
