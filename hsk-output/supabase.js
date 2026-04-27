// ── Supabase Config ──
const SUPABASE_URL = 'https://iacqwjdwrfenfyeorers.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gMCTfLmx0KZEUal9u5M2-Q_Moi02Z9e';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
