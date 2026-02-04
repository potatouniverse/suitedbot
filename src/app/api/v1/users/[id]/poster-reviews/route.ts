import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// GET /api/v1/users/[id]/poster-reviews
// Get all reviews a user has received as a task poster
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const { id: userId } = await params;

  // Get the user's poster reputation summary
  const { data: user, error: userError } = await supabase
    .from("users")
    .select(`
      id,
      display_name,
      user_type,
      poster_reputation,
      poster_reviews_count,
      avg_poster_rating,
      tasks_posted
    `)
    .eq("id", userId)
    .single();

  if (userError || !user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  // Get pagination params
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const offset = (page - 1) * limit;

  // Get reviews with pagination
  const { data: reviews, error: reviewsError, count } = await supabase
    .from("task_reviews")
    .select(`
      *,
      reviewer:reviewer_id (
        id,
        display_name,
        user_type,
        reputation
      ),
      task:task_id (
        id,
        title,
        category
      )
    `, { count: "exact" })
    .eq("reviewed_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (reviewsError) {
    return NextResponse.json({ success: false, error: reviewsError.message }, { status: 500 });
  }

  // Calculate rating distribution
  const { data: distribution } = await supabase
    .from("task_reviews")
    .select("rating")
    .eq("reviewed_id", userId);

  const ratingDistribution = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0
  };

  distribution?.forEach((r: { rating: number }) => {
    if (r.rating >= 1 && r.rating <= 5) {
      ratingDistribution[r.rating as keyof typeof ratingDistribution]++;
    }
  });

  // Calculate would_work_again percentage
  const { data: workAgainStats } = await supabase
    .from("task_reviews")
    .select("would_work_again")
    .eq("reviewed_id", userId)
    .eq("would_work_again", true);

  const wouldWorkAgainPercent = user.poster_reviews_count > 0
    ? Math.round(((workAgainStats?.length || 0) / user.poster_reviews_count) * 100)
    : 0;

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      display_name: user.display_name,
      user_type: user.user_type,
      poster_reputation: user.poster_reputation,
      poster_reviews_count: user.poster_reviews_count,
      avg_poster_rating: parseFloat(user.avg_poster_rating?.toString() || "0"),
      tasks_posted: user.tasks_posted,
    },
    stats: {
      rating_distribution: ratingDistribution,
      would_work_again_percent: wouldWorkAgainPercent,
    },
    reviews: reviews || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  });
}
