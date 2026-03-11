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

async function testPerformance() {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAgoISO = threeMonthsAgo.toISOString();

  console.log('Testing servers...');
  console.time('servers');
  const { data: servers, error: e1 } = await supabase.from('servers').select('*').order('name');
  console.timeEnd('servers');
  console.log('Servers count:', servers?.length, e1?.message || 'OK');

  console.log('Testing plans...');
  console.time('plans');
  const { data: plans, error: e2 } = await supabase.from('plans').select('*').order('months');
  console.timeEnd('plans');
  console.log('Plans count:', plans?.length, e2?.message || 'OK');

  console.log('Testing customers...');
  console.time('customers');
  const { data: customers, error: e3 } = await supabase.from('customers').select('*').order('name');
  console.timeEnd('customers');
  console.log('Customers count:', customers?.length, e3?.message || 'OK');

  console.log('Testing renewals...');
  console.time('renewals');
  const { data: renewals, error: e4 } = await supabase.from('renewals').select('*').gte('date', threeMonthsAgoISO).order('date', { ascending: false });
  console.timeEnd('renewals');
  console.log('Renewals count:', renewals?.length, e4?.message || 'OK');

  console.log('Testing additions...');
  console.time('additions');
  const { data: additions, error: e5 } = await supabase.from('manual_additions').select('*').gte('date', threeMonthsAgoISO).order('date', { ascending: false });
  console.timeEnd('additions');
  console.log('Additions count:', additions?.length, e5?.message || 'OK');

  console.log('Testing settings...');
  console.time('settings');
  const { data: settings, error: e6 } = await supabase.from('settings').select('*').single();
  console.timeEnd('settings');
  console.log('Settings fetched', e6?.message || 'OK');
}

testPerformance().catch(console.error);
