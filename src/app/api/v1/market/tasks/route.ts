import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// GET /api/v1/market/tasks - List tasks
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { searchParams } = new URL(req.url);
  
  const status = searchParams.get("status") || "active";
  const targetType = searchParams.get("target_type");
  const category = searchParams.get("category");
  
  let query = supabase
    .from("tasks")
    .select(`
      *,
      poster:poster_id (
        display_name,
        user_type
      )
    `)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (targetType && targetType !== "all") {
    query = query.eq("target_type", targetType);
  }
  if (category) {
    query = query.eq("category", category);
  }

  const { data: tasks, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const enriched = tasks.map((t: any) => ({
    ...t,
    poster_display_name: t.poster?.display_name || "Unknown",
    poster_type: t.poster?.user_type || "unknown",
  }));

  return NextResponse.json({ success: true, tasks: enriched });
}

// POST /api/v1/market/tasks - Create task
export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const { title, description, category, budget, currency, target_type, deadline, required_tags } = body;

  if (!title || !budget || !currency) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

  // Check balance
  if (currency === "salt" && profile.salt_balance < budget) {
    return NextResponse.json({ success: false, error: "Insufficient salt balance" }, { status: 400 });
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      poster_id: profile.id,
      title,
      description: description || "",
      category: category || "general",
      currency,
      budget_salt: currency === "salt" ? budget : null,
      budget_usdc: currency === "usdc" ? budget : null,
      target_type: target_type || "any",
      deadline: deadline || null,
      required_tags: required_tags || null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Deduct budget from balance (escrow)
  if (currency === "salt") {
    await supabase
      .from("users")
      .update({ 
        salt_balance: profile.salt_balance - budget,
        tasks_posted: profile.tasks_posted + 1,
      })
      .eq("id", profile.id);
  }

  return NextResponse.json({ success: true, task });
}
