
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetCooldown() {
  const customers = ['LUCAS AMARAL', 'MICHELLE MARY'];
  
  for (const name of customers) {
    console.log(`Resetting cooldown for ${name}...`);
    const { error } = await supabase
      .from('customers')
      .update({ last_overdue_not_date: null })
      .ilike('name', `%${name}%`);
    
    if (error) {
      console.error(`Error resetting ${name}:`, error.message);
    } else {
      console.log(`[OK] Cooldown reset for ${name}`);
    }
  }
}

resetCooldown().catch(console.error);
