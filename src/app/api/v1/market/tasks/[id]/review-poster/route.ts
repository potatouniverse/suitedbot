import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// POST /api/v1/market/tasks/[id]/review-poster
// Workers can review the task poster after task completion
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Get user profile (the reviewer/worker)
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
  const { 
    rating, 
    comment, 
    would_work_again,
    clarity_rating,
    communication_rating,
    payment_speed_rating,
  } = body;

  // Validate rating
  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ 
      success: false, 
      error: "Rating must be between 1 and 5" 
    }, { status: 400 });
  }

  // Get task with submission details
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select(`
      *,
      submissions (
        id,
        submitter_id,
        status
      )
    `)
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
  }

  // Verify task is completed
  if (task.status !== "completed") {
    return NextResponse.json({ 
      success: false, 
      error: "Can only review posters for completed tasks" 
    }, { status: 400 });
  }

  // Verify user was the worker who completed this task
  const wasWorker = task.claimed_by === profile.id || 
    task.submissions?.some((s: { submitter_id: string; status: string }) => 
      s.submitter_id === profile.id && s.status === "approved"
    );

  if (!wasWorker) {
    return NextResponse.json({ 
      success: false, 
      error: "Only the worker who completed this task can review the poster" 
    }, { status: 403 });
  }

  // Prevent self-review
  if (task.poster_id === profile.id) {
    return NextResponse.json({ 
      success: false, 
      error: "Cannot review yourself" 
    }, { status: 400 });
  }

  // Check if already reviewed
  const { data: existingReview } = await supabase
    .from("task_reviews")
    .select("id")
    .eq("task_id", taskId)
    .eq("reviewer_id", profile.id)
    .single();

  if (existingReview) {
    return NextResponse.json({ 
      success: false, 
      error: "You have already reviewed the poster for this task" 
    }, { status: 400 });
  }

  // Validate optional sub-ratings
  const validateSubRating = (r: number | undefined) => {
    if (r === undefined || r === null) return null;
    if (r < 1 || r > 5) return null;
    return r;
  };

  // Create the review
  const { data: review, error: reviewError } = await supabase
    .from("task_reviews")
    .insert({
      task_id: taskId,
      reviewer_id: profile.id,
      reviewed_id: task.poster_id,
      rating,
      comment: comment || null,
      would_work_again: would_work_again ?? true,
      clarity_rating: validateSubRating(clarity_rating),
      communication_rating: validateSubRating(communication_rating),
      payment_speed_rating: validateSubRating(payment_speed_rating),
    })
    .select(`
      *,
      reviewer:reviewer_id (
        display_name,
        user_type
      ),
      reviewed:reviewed_id (
        display_name,
        user_type,
        poster_reputation,
        avg_poster_rating
      )
    `)
    .single();

  if (reviewError) {
    // Handle unique constraint violation
    if (reviewError.code === "23505") {
      return NextResponse.json({ 
        success: false, 
        error: "You have already reviewed the poster for this task" 
      }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: reviewError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    review,
    message: "Thank you for your review! This helps build trust in our marketplace.",
  });
}

// GET /api/v1/market/tasks/[id]/review-poster
// Get the review for a specific task (if any)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const { id: taskId } = await params;

  const { data: reviews, error } = await supabase
    .from("task_reviews")
    .select(`
      *,
      reviewer:reviewer_id (
        display_name,
        user_type
      ),
      reviewed:reviewed_id (
        display_name,
        user_type,
        poster_reputation,
        avg_poster_rating
      )
    `)
    .eq("task_id", taskId);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    reviews: reviews || [],
  });
}
