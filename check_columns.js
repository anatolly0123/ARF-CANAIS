
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const tables = ['servers', 'plans', 'customers', 'renewals', 'manual_additions', 'settings', 'profiles'];
  console.log('--- Performance Diagnostics ---');
  
  for (const table of tables) {
    const { data, count, error } = await supabase.from(table).select('*', { count: 'exact' });
    if (error) {
      console.error(`Error checking ${table}:`, error.message);
      continue;
    }
    
    const rowCount = count || (data ? data.length : 0);
    const jsonSize = data ? JSON.stringify(data).length : 0;
    const sizeKB = (jsonSize / 1024).toFixed(2);
    
    console.log(`Table: ${table.padEnd(16)} | Rows: ${rowCount.toString().padEnd(5)} | Size: ${sizeKB.padStart(8)} KB`);
    
    // Check for specific large fields in settings or profiles
    if ((table === 'settings' || table === 'profiles') && data && data.length > 0) {
      for (const row of data) {
        for (const [key, value] of Object.entries(row)) {
          if (typeof value === 'string' && value.length > 1000) {
            console.log(`  [ALERT] Large field found in ${table}: ${key} (${(value.length / 1024).toFixed(2)} KB)`);
          }
        }
      }
    }
  }
}

check().catch(console.error);
