import { NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/v1/bot/suggest
 * Bot suggests a task to its master for approval
 * Requires: API key with 'write' scope
 * 
 * Creates a "pending_approval" offer that needs master confirmation
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
    const { taskId, reasoning, priceSalt, priceUsdc, notificationWebhook } = body;
    
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId is required' },
        { status: 400 }
      );
    }
    
    // Check if task exists
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
    
    // Get bot user info
    const { data: botUser, error: userError } = await supabase
      .from('users')
      .select('display_name, user_type, email')
      .eq('id', userId)
      .single();
    
    if (userError || !botUser) {
      return NextResponse.json(
        { success: false, error: 'Bot user not found' },
        { status: 404 }
      );
    }
    
    // Create a suggestion record (stored as an offer with special status)
    const offerText = reasoning || 
      `I found a task that matches my capabilities: "${task.title}". ` +
      `Budget: ${task.currency === 'usdc' ? '$' + task.budget_usdc : task.budget_salt + ' Salt'}. ` +
      `Do you approve?`;
    
    const { data: suggestion, error: suggestionError } = await supabase
      .from('market_offers')
      .insert({
        task_id: taskId,
        offerer_id: userId,
        offerer_display_name: botUser.display_name,
        offer_text: offerText,
        price_salt: priceSalt || task.budget_salt,
        price_usdc: priceUsdc || task.budget_usdc,
        status: 'pending_master_approval', // Special status
        metadata: {
          suggestedAt: new Date().toISOString(),
          botUserId: userId,
          taskTitle: task.title,
          reasoning: reasoning
        }
      })
      .select()
      .single();
    
    if (suggestionError) {
      console.error('Failed to create suggestion:', suggestionError);
      return NextResponse.json(
        { success: false, error: 'Failed to create suggestion' },
        { status: 500 }
      );
    }
    
    // Send notification to master (webhook or email)
    if (notificationWebhook) {
      // Send webhook (async, don't wait)
      fetch(notificationWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bot_task_suggestion',
          botName: botUser.display_name,
          botUserId: userId,
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            budget: task.currency === 'usdc' ? `$${task.budget_usdc}` : `${task.budget_salt} Salt`,
            url: `${process.env.NEXT_PUBLIC_APP_URL}/market?task=${task.id}`
          },
          suggestion: {
            id: suggestion.id,
            reasoning: reasoning,
            approveUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/bot/master-approve?id=${suggestion.id}&action=approve`,
            rejectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/bot/master-approve?id=${suggestion.id}&action=reject`
          }
        })
      }).catch(err => console.error('Webhook failed:', err));
    }
    
    // TODO: Send email notification if webhook not provided
    
    return NextResponse.json({
      success: true,
      suggestion: {
        id: suggestion.id,
        taskId: suggestion.task_id,
        status: suggestion.status,
        createdAt: suggestion.created_at
      },
      task: {
        title: task.title,
        budget: task.currency === 'usdc' ? `$${task.budget_usdc}` : `${task.budget_salt} Salt`
      },
      message: `Suggestion sent to master. Awaiting approval.`,
      approvalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/bot/suggestions/${suggestion.id}`
    });
    
  } catch (error: any) {
    console.error('Suggest error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
