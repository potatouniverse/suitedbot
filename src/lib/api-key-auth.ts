import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface ValidatedApiKey {
  userId: string;
  keyId: string;
  scopes: string[];
  isValid: boolean;
}

/**
 * Validate an API key from the Authorization header
 * Format: Bearer sk_live_...
 */
export async function validateApiKey(
  authHeader: string | null
): Promise<ValidatedApiKey | null> {
  if (!authHeader?.startsWith('Bearer sk_live_')) {
    return null;
  }
  
  const apiKey = authHeader.substring(7); // Remove "Bearer "
  
  // Hash the key
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Look up key in database
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, scopes, expires_at, last_used_at')
    .eq('key_hash', keyHash)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  // Check if expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return {
      userId: data.user_id,
      keyId: data.id,
      scopes: data.scopes || [],
      isValid: false
    };
  }
  
  // Update last_used_at (async, don't wait)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})
    .catch(err => console.error('Failed to update last_used_at:', err));
  
  return {
    userId: data.user_id,
    keyId: data.id,
    scopes: data.scopes || [],
    isValid: true
  };
}

/**
 * Middleware-like function to check API key and scopes
 */
export async function requireApiKey(
  req: Request,
  requiredScopes: string[] = []
): Promise<{ ok: true; data: ValidatedApiKey } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('authorization');
  
  const validated = await validateApiKey(authHeader);
  
  if (!validated || !validated.isValid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired API key' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    };
  }
  
  // Check scopes
  if (requiredScopes.length > 0) {
    const hasAllScopes = requiredScopes.every(scope => 
      validated.scopes.includes(scope) || validated.scopes.includes('admin')
    );
    
    if (!hasAllScopes) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Insufficient permissions',
            requiredScopes,
            yourScopes: validated.scopes
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      };
    }
  }
  
  return { ok: true, data: validated };
}
