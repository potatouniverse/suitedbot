import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/v1/bot/master-approve
 * Master approves or rejects a bot's task suggestion
 * Requires: Human user authentication (Supabase Auth)
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get authenticated user (human master)
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing authorization header' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid authentication' },
        { status: 401 }
      );
    }
    
    const body = await req.json();
    const { suggestionId, action } = body; // action: 'approve' | 'reject'
    
    if (!suggestionId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid suggestionId or action' },
        { status: 400 }
      );
    }
    
    // Get the suggestion
    const { data: suggestion, error: suggestionError } = await supabase
      .from('market_offers')
      .select('*')
      .eq('id', suggestionId)
      .eq('status', 'pending_master_approval')
      .single();
    
    if (suggestionError || !suggestion) {
      return NextResponse.json(
        { success: false, error: 'Suggestion not found or already processed' },
        { status: 404 }
      );
    }
    
    // Verify the user owns this bot
    // (In real app, you'd have a bots table linking bot user_id to master user_id)
    // For now, we assume the authenticated user is the master
    
    if (action === 'approve') {
      // Convert suggestion to actual offer
      const { error: updateError } = await supabase
        .from('market_offers')
        .update({
          status: 'pending', // Now it's a real offer
          metadata: {
            ...suggestion.metadata,
            approvedAt: new Date().toISOString(),
            approvedBy: user.id
          }
        })
        .eq('id', suggestionId);
      
      if (updateError) {
        console.error('Failed to approve suggestion:', updateError);
        return NextResponse.json(
          { success: false, error: 'Failed to approve suggestion' },
          { status: 500 }
        );
      }
      
      // Increment offer count on task
      await supabase.rpc('increment_offer_count', { task_id: suggestion.task_id });
      
      return NextResponse.json({
        success: true,
        message: 'Bot suggestion approved. Offer sent to task poster.',
        offerId: suggestionId,
        status: 'pending'
      });
      
    } else {
      // Reject suggestion
      const { error: updateError } = await supabase
        .from('market_offers')
        .update({
          status: 'rejected_by_master',
          metadata: {
            ...suggestion.metadata,
            rejectedAt: new Date().toISOString(),
            rejectedBy: user.id
          }
        })
        .eq('id', suggestionId);
      
      if (updateError) {
        console.error('Failed to reject suggestion:', updateError);
        return NextResponse.json(
          { success: false, error: 'Failed to reject suggestion' },
          { status: 500 }
        );
      }
      
      return NextResponse.json({
        success: true,
        message: 'Bot suggestion rejected.',
        suggestionId,
        status: 'rejected_by_master'
      });
    }
    
  } catch (error: any) {
    console.error('Master approve error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/bot/master-approve
 * Get pending suggestions for the authenticated master
 */
export async function GET(req: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get authenticated user
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing authorization header' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid authentication' },
        { status: 401 }
      );
    }
    
    // Get all pending suggestions for this user's bots
    // (In real app, join with bots table to filter by master_id)
    const { data: suggestions, error } = await supabase
      .from('market_offers')
      .select(`
        *,
        market_tasks (
          id,
          title,
          description,
          budget_salt,
          budget_usdc,
          currency,
          category
        )
      `)
      .eq('status', 'pending_master_approval')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Failed to fetch suggestions:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch suggestions' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      suggestions: suggestions || [],
      count: suggestions?.length || 0
    });
    
  } catch (error: any) {
    console.error('Get suggestions error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
