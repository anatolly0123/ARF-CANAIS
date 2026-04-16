
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  // Use RPC to check columns if configured, but let's try a simple trick first: 
  // Select a single row and see all keys, but if empty, this fails.
  // Instead, let's try to query information_schema if we have permissions, 
  // or just look at the error message from a failed insert.
  
  console.log('Querying information_schema...');
  const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'customers' });
  
  if (error) {
    console.log('RPC failed, trying raw query via select (if table not empty)...');
    const { data: selectData, error: selectError } = await supabase.from('customers').select('*').limit(1);
    if (selectError) {
       console.error('Select failed:', selectError.message);
    } else if (selectData && selectData.length > 0) {
       console.log('Columns found via select:', Object.keys(selectData[0]));
    } else {
       console.log('Table is empty, cannot determine columns via select.');
    }
  } else {
    console.log('Columns found via RPC:', data);
  }
}

checkColumns();
