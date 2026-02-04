import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy initialization of Supabase client (service role for cron jobs, bypasses RLS)
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      throw new Error("Missing Supabase credentials for cron job");
    }
    
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  // If no secret configured, allow (dev mode) but log warning
  if (!cronSecret) {
    console.warn("CRON_SECRET not configured - allowing request");
    return true;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

// GET /api/cron/auto-approve-submissions
// Called periodically to auto-approve submissions past their deadline
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const results = {
    processed: 0,
    approved: 0,
    errors: [] as string[],
  };

  try {
    // Find all pending submissions past auto-approve deadline
    const { data: expiredSubmissions, error: fetchError } = await supabase
      .from("submissions")
      .select(`
        id,
        task_id,
        submitter_id,
        content,
        task:task_id (
          id,
          poster_id,
          currency,
          budget_salt,
          budget_usdc,
          claimed_by
        )
      `)
      .eq("status", "pending")
      .not("auto_approve_at", "is", null)
      .lte("auto_approve_at", now);

    if (fetchError) {
      throw new Error(`Fetch error: ${fetchError.message}`);
    }

    if (!expiredSubmissions || expiredSubmissions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No submissions to auto-approve",
        ...results,
      });
    }

    results.processed = expiredSubmissions.length;

    for (const submission of expiredSubmissions) {
      try {
        // Type assertion for the joined task data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const taskData = submission.task as any;
        const task = {
          id: taskData?.id as string,
          poster_id: taskData?.poster_id as string,
          currency: taskData?.currency as string,
          budget_salt: taskData?.budget_salt as number | null,
          budget_usdc: taskData?.budget_usdc as number | null,
          claimed_by: taskData?.claimed_by as string,
        };

        // 1. Update submission status to approved
        const { error: updateSubError } = await supabase
          .from("submissions")
          .update({
            status: "approved",
            reviewer_notes: "Auto-approved: poster did not review within deadline",
          })
          .eq("id", submission.id);

        if (updateSubError) {
          results.errors.push(`Submission ${submission.id}: ${updateSubError.message}`);
          continue;
        }

        // 2. Update task status to completed
        const { error: updateTaskError } = await supabase
          .from("tasks")
          .update({ status: "completed" })
          .eq("id", submission.task_id);

        if (updateTaskError) {
          results.errors.push(`Task ${submission.task_id}: ${updateTaskError.message}`);
          continue;
        }

        // 3. Get accepted offer (if any)
        const { data: acceptedOffer } = await supabase
          .from("offers")
          .select("id")
          .eq("task_id", submission.task_id)
          .eq("status", "accepted")
          .single();

        // 4. Create transaction record
        const { error: transactionError } = await supabase
          .from("transactions")
          .insert({
            task_id: submission.task_id,
            poster_id: task.poster_id,
            completer_id: task.claimed_by,
            offer_id: acceptedOffer?.id || null,
            submission_id: submission.id,
            currency: task.currency,
            amount_salt: task.currency === "salt" ? task.budget_salt : null,
            amount_usdc: task.currency === "usdc" ? task.budget_usdc : null,
          });

        if (transactionError) {
          results.errors.push(`Transaction for ${submission.id}: ${transactionError.message}`);
          continue;
        }

        // 5. Release payment to completer
        if (task.currency === "salt" && task.budget_salt) {
          const { data: completer } = await supabase
            .from("users")
            .select("salt_balance, tasks_completed, reputation")
            .eq("id", task.claimed_by)
            .single();

          if (completer) {
            await supabase
              .from("users")
              .update({
                salt_balance: (completer.salt_balance || 0) + task.budget_salt,
                tasks_completed: (completer.tasks_completed || 0) + 1,
                reputation: (completer.reputation || 0) + 10,
              })
              .eq("id", task.claimed_by);
          }
        }

        // 6. TODO: Notify poster about auto-approval (via email/webhook in future)
        console.log(`Auto-approved submission ${submission.id} for task ${submission.task_id}`);

        results.approved++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        results.errors.push(`Submission ${submission.id}: ${errorMessage}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Auto-approved ${results.approved}/${results.processed} submissions`,
      ...results,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// POST endpoint for Vercel Cron compatibility
export async function POST(req: NextRequest) {
  return GET(req);
}
