
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testColumn(colName) {
  const { error } = await supabase.from('customers').select(colName).limit(1);
  if (error && error.message.includes('column')) {
    return `${colName}: NO\n`;
  }
  return `${colName}: YES\n`;
}

async function run() {
  let results = "";
  results += await testColumn('last_overdue_notified_date');
  results += await testColumn('last_overdue_not_date');
  results += await testColumn('last_notified_date');
  fs.writeFileSync('col_results.txt', results);
  console.log('Results written to col_results.txt');
}

run();
