import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// POST /api/v1/market/offers/[id]/respond - Respond to offer (accept/reject/counter)
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

  const { id: offerId } = await params;
  const body = await req.json();
  const { action, counter_text, counter_price_salt, counter_price_usdc } = body;

  // Validate action
  if (!["accept", "reject", "counter"].includes(action)) {
    return NextResponse.json({ 
      success: false, 
      error: "Invalid action. Must be 'accept', 'reject', or 'counter'" 
    }, { status: 400 });
  }

  // Get offer with task details
  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select(`
      *,
      task:task_id (
        id,
        poster_id,
        status,
        claimed_by
      )
    `)
    .eq("id", offerId)
    .single();

  if (offerError || !offer) {
    return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });
  }

  // Verify user is the task poster
  if (offer.task.poster_id !== profile.id) {
    return NextResponse.json({ 
      success: false, 
      error: "Only task poster can respond to offers" 
    }, { status: 403 });
  }

  // Check offer status
  if (offer.status !== "pending") {
    return NextResponse.json({ 
      success: false, 
      error: "Offer has already been responded to" 
    }, { status: 400 });
  }

  // Handle different actions
  if (action === "accept") {
    // Update offer status
    const { error: updateError } = await supabase
      .from("offers")
      .update({ status: "accepted" })
      .eq("id", offerId);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // Update task - assign to offerer
    const { error: taskError } = await supabase
      .from("tasks")
      .update({ 
        status: "claimed",
        claimed_by: offer.offerer_id,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", offer.task_id);

    if (taskError) {
      return NextResponse.json({ success: false, error: taskError.message }, { status: 500 });
    }

    // Reject other pending offers for this task
    await supabase
      .from("offers")
      .update({ status: "rejected" })
      .eq("task_id", offer.task_id)
      .eq("status", "pending")
      .neq("id", offerId);

    return NextResponse.json({ 
      success: true, 
      message: "Offer accepted",
      offer: { ...offer, status: "accepted" }
    });
  }

  if (action === "reject") {
    const { error: updateError } = await supabase
      .from("offers")
      .update({ status: "rejected" })
      .eq("id", offerId);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Offer rejected",
      offer: { ...offer, status: "rejected" }
    });
  }

  if (action === "counter") {
    if (!counter_text) {
      return NextResponse.json({ 
        success: false, 
        error: "Counter offer text is required" 
      }, { status: 400 });
    }

    // Update original offer status
    await supabase
      .from("offers")
      .update({ status: "countered" })
      .eq("id", offerId);

    // Create counter offer
    const { data: counterOffer, error: counterError } = await supabase
      .from("offers")
      .insert({
        task_id: offer.task_id,
        offerer_id: profile.id, // Poster becomes offerer in counter
        offer_text: counter_text,
        price_salt: counter_price_salt || null,
        price_usdc: counter_price_usdc || null,
        parent_offer_id: offerId,
        status: "pending",
      })
      .select()
      .single();

    if (counterError) {
      return NextResponse.json({ success: false, error: counterError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Counter offer created",
      counter_offer: counterOffer
    });
  }

  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
}
