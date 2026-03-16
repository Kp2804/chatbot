
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // Using publishable key is fine for select if RLS allows

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking schema columns...');
    let hasError = false;

    // 1. Check listings.admin_notes
    const { data: listings, error: listingError } = await supabase
        .from('listings')
        .select('admin_notes')
        .limit(1);

    if (listingError) {
        console.error('❌ Error checking listings.admin_notes:', listingError.message);
        hasError = true;
    } else {
        console.log('✅ listings.admin_notes exists');
    }

    // 2. Check profiles.company
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('company')
        .limit(1);

    if (profileError) {
        console.error('❌ Error checking profiles.company:', profileError.message);
        hasError = true;
    } else {
        console.log('✅ profiles.company exists');
    }
}

checkSchema();
