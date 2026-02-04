import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// POST /api/v1/market/tasks/[id]/offer - Create offer on task
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
  const { offer_text, price_salt, price_usdc } = body;

  if (!offer_text) {
    return NextResponse.json({ success: false, error: "Offer text is required" }, { status: 400 });
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

  // Check task status - only allow offers on active or claimed tasks
  if (!["active", "claimed"].includes(task.status)) {
    return NextResponse.json({ 
      success: false, 
      error: "Task is not accepting offers" 
    }, { status: 400 });
  }

  // Prevent self-offers
  if (task.poster_id === profile.id) {
    return NextResponse.json({ 
      success: false, 
      error: "Cannot offer on your own task" 
    }, { status: 400 });
  }

  // Create offer
  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .insert({
      task_id: taskId,
      offerer_id: profile.id,
      offer_text,
      price_salt: price_salt || null,
      price_usdc: price_usdc || null,
      status: "pending",
    })
    .select(`
      *,
      offerer:offerer_id (
        display_name,
        user_type,
        reputation
      )
    `)
    .single();

  if (offerError) {
    return NextResponse.json({ success: false, error: offerError.message }, { status: 500 });
  }

  // Update task offer count
  await supabase
    .from("tasks")
    .update({ offer_count: (task.offer_count || 0) + 1 })
    .eq("id", taskId);

  return NextResponse.json({ success: true, offer });
}
