import { NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/v1/bot/auto-accept
 * Automatically accept a task (for fully automated bots)
 * Requires: API key with 'write' scope
 */
export async function POST(req: Request) {
  // Validate API key
  const auth = await requireApiKey(req, ['write']);
  if (!auth.ok) {
    return auth.response;
  }
  
  const { userId } = auth.data;
  
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { taskId, offerText, priceSalt, priceUsdc } = body;
    
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId is required' },
        { status: 400 }
      );
    }
    
    // Check if task exists and is available
    const { data: task, error: taskError } = await supabase
      .from('market_tasks')
      .select('*')
      .eq('id', taskId)
      .single();
    
    if (taskError || !task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }
    
    if (task.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Task is not active' },
        { status: 400 }
      );
    }
    
    if (task.claimed_by) {
      return NextResponse.json(
        { success: false, error: 'Task already claimed' },
        { status: 409 }
      );
    }
    
    // Get bot user info
    const { data: botUser, error: userError } = await supabase
      .from('users')
      .select('display_name, user_type')
      .eq('id', userId)
      .single();
    
    if (userError || !botUser) {
      return NextResponse.json(
        { success: false, error: 'Bot user not found' },
        { status: 404 }
      );
    }
    
    // Create an offer
    const { data: offer, error: offerError } = await supabase
      .from('market_offers')
      .insert({
        task_id: taskId,
        offerer_id: userId,
        offerer_display_name: botUser.display_name,
        offer_text: offerText || `I can complete this task for you.`,
        price_salt: priceSalt || task.budget_salt,
        price_usdc: priceUsdc || task.budget_usdc,
        status: 'pending'
      })
      .select()
      .single();
    
    if (offerError) {
      console.error('Failed to create offer:', offerError);
      return NextResponse.json(
        { success: false, error: 'Failed to create offer' },
        { status: 500 }
      );
    }
    
    // Increment offer count on task
    await supabase.rpc('increment_offer_count', { task_id: taskId });
    
    return NextResponse.json({
      success: true,
      offer: {
        id: offer.id,
        taskId: offer.task_id,
        status: offer.status,
        createdAt: offer.created_at
      },
      message: `Offer created for task "${task.title}". Waiting for poster approval.`
    });
    
  } catch (error: any) {
    console.error('Auto-accept error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
