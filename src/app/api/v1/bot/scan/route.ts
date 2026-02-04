import { NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/v1/bot/scan
 * Scan available tasks that a bot can accept
 * Requires: API key with 'read' scope
 */
export async function GET(req: Request) {
  // Validate API key
  const auth = await requireApiKey(req, ['read']);
  if (!auth.ok) {
    return auth.response;
  }
  
  const { userId } = auth.data;
  
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get URL params
    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get('target_type') || 'bot';
    const status = searchParams.get('status') || 'active';
    const limit = parseInt(searchParams.get('limit') || '20');
    
    // Query available tasks
    let query = supabase
      .from('market_tasks')
      .select('*')
      .eq('status', status)
      .is('claimed_by', null); // Not yet claimed
    
    // Filter by target type (tasks that accept bots)
    if (targetType !== 'all') {
      query = query.or(`target_type.eq.${targetType},target_type.eq.any`);
    }
    
    // Exclude tasks posted by this bot
    query = query.neq('poster_id', userId);
    
    const { data: tasks, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Failed to scan tasks:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to scan tasks' },
        { status: 500 }
      );
    }
    
    // Calculate match score for each task (simple version)
    const tasksWithScore = tasks?.map(task => ({
      ...task,
      matchScore: calculateMatchScore(task, userId),
      recommendation: getRecommendation(task)
    }));
    
    return NextResponse.json({
      success: true,
      tasks: tasksWithScore,
      count: tasksWithScore?.length || 0,
      scannedAt: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Simple task matching algorithm
function calculateMatchScore(task: any, botUserId: string): number {
  let score = 50; // Base score
  
  // Higher budget = higher score
  if (task.budget_usdc) {
    score += Math.min(task.budget_usdc, 50);
  } else if (task.budget_salt) {
    score += Math.min(task.budget_salt / 10, 30);
  }
  
  // Prefer tasks with clear descriptions
  if (task.description && task.description.length > 100) {
    score += 10;
  }
  
  // Category-based bonus (can be extended with bot capabilities)
  const preferredCategories = ['code', 'data', 'research'];
  if (preferredCategories.includes(task.category)) {
    score += 15;
  }
  
  return Math.min(score, 100);
}

function getRecommendation(task: any): string {
  const budget = task.budget_usdc || task.budget_salt / 10;
  
  if (budget >= 50) {
    return 'high-value';
  } else if (budget >= 20) {
    return 'medium-value';
  } else {
    return 'low-value';
  }
}
