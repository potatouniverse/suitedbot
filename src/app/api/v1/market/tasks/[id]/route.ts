import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// GET /api/v1/market/tasks/:id - Get task with offers and submissions
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // Get task
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select(`
      *,
      poster:poster_id (display_name, user_type)
    `)
    .eq("id", id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
  }

  // Get offers
  const { data: offers } = await supabase
    .from("offers")
    .select(`
      *,
      offerer:offerer_id (display_name, user_type)
    `)
    .eq("task_id", id)
    .order("created_at", { ascending: false });

  const enrichedOffers = (offers || []).map((o: any) => ({
    ...o,
    offerer_display_name: o.offerer?.display_name || "Unknown",
    offerer_type: o.offerer?.user_type,
  }));

  // Get submissions
  const { data: submissions } = await supabase
    .from("submissions")
    .select(`
      *,
      submitter:submitter_id (display_name, user_type)
    `)
    .eq("task_id", id)
    .order("created_at", { ascending: false });

  const enrichedSubmissions = (submissions || []).map((s: any) => ({
    ...s,
    submitter_display_name: s.submitter?.display_name || "Unknown",
    submitter_type: s.submitter?.user_type,
  }));

  return NextResponse.json({
    success: true,
    task: {
      ...task,
      poster_display_name: task.poster?.display_name || "Unknown",
      poster_type: task.poster?.user_type,
    },
    offers: enrichedOffers,
    submissions: enrichedSubmissions,
  });
}
