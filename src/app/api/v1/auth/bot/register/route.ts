import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Generate a secure API key
function generateApiKey(): { key: string; hash: string; prefix: string } {
  // Format: sk_live_[32 random bytes in hex]
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const key = `sk_live_${randomBytes}`;
  
  // Store SHA-256 hash
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  
  // First 12 chars for display
  const prefix = key.substring(0, 15);
  
  return { key, hash, prefix };
}

export async function POST(req: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get authenticated user
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid authentication token' },
        { status: 401 }
      );
    }
    
    const body = await req.json();
    const { name, scopes, expiresInDays } = body;
    
    // Generate API key
    const { key, hash, prefix } = generateApiKey();
    
    // Calculate expiry if provided
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    
    // Store in database
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        key_hash: hash,
        key_prefix: prefix,
        name: name || 'Unnamed API Key',
        scopes: scopes || ['read', 'write'],
        expires_at: expiresAt
      })
      .select()
      .single();
    
    if (error) {
      console.error('Failed to create API key:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create API key' },
        { status: 500 }
      );
    }
    
    // Return the key ONLY once (never stored in plain text)
    return NextResponse.json({
      success: true,
      apiKey: key, // Full key - show this ONCE
      keyInfo: {
        id: data.id,
        prefix: data.key_prefix,
        name: data.name,
        scopes: data.scopes,
        expiresAt: data.expires_at,
        createdAt: data.created_at
      }
    });
    
  } catch (error: any) {
    console.error('API key generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
