
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wweumbkhwwtvsgmwpigx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3ZXVtYmtod3d0dnNnbXdwaWd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODA0NzIsImV4cCI6MjA4NDI1NjQ3Mn0.gHO4ihCedrYdCgHaXLlIAgv9p27CA_gVIPRJt6ZEVjE";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking for subscription_end_date or access_expires_at column...');

    // We try to select the column. If it doesn't exist, it will error.
    const { data, error } = await supabase
        .from('profiles')
        .select('subscription_end_date')
        .limit(1);

    if (error) {
        console.log('❌ subscription_end_date likely MISSING:', error.message);
    } else {
        console.log('✅ subscription_end_date exists');
    }
}

checkSchema();
