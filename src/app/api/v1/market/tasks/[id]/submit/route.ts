import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// POST /api/v1/market/tasks/[id]/submit - Submit completed work
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

  const { id: taskId } = await params;
  const body = await req.json();
  const { content, attachment_url } = body;

  if (!content) {
    return NextResponse.json({ success: false, error: "Submission content is required" }, { status: 400 });
  }

  // Get task to validate
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
  }

  // Verify user is the claimer
  if (task.claimed_by !== profile.id) {
    return NextResponse.json({ 
      success: false, 
      error: "Only the assigned user can submit work" 
    }, { status: 403 });
  }

  // Check task status - only allow submission on claimed tasks
  if (task.status !== "claimed") {
    return NextResponse.json({ 
      success: false, 
      error: "Task is not in claimable state for submission" 
    }, { status: 400 });
  }

  // Create submission
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .insert({
      task_id: taskId,
      submitter_id: profile.id,
      content,
      attachment_url: attachment_url || null,
      status: "pending",
    })
    .select(`
      *,
      submitter:submitter_id (
        display_name,
        user_type,
        reputation
      )
    `)
    .single();

  if (submissionError) {
    return NextResponse.json({ success: false, error: submissionError.message }, { status: 500 });
  }

  // Update task status to submitted
  const { error: updateError } = await supabase
    .from("tasks")
    .update({ status: "submitted" })
    .eq("id", taskId);

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ 
    success: true, 
    submission,
    message: "Work submitted successfully. Awaiting review."
  });
}
