
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
  const table = 'customers';
  console.log(`Listing customers in ${table}...`);
  const { data, error } = await supabase.from(table).select('*').limit(20);
  if (error) {
    console.error(`Error checking ${table}:`, error.message);
  } else if (data && data.length > 0) {
    console.log(`Found ${data.length} records.`);
    console.log(`Names:`, data.map(c => c.name).join(', '));
    console.log(`A sample record:`, JSON.stringify(data[0], null, 2));
  } else {
    console.log(`No records found in ${table}.`);
  }
}

check().catch(console.error);
