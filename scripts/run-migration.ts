// Run migration script
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  const sql = readFileSync(join(__dirname, '../migrations/002_api_keys.sql'), 'utf-8');
  
  console.log('Running migration: 002_api_keys.sql...');
  
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
  
  console.log('✅ Migration completed successfully');
}

runMigration();
