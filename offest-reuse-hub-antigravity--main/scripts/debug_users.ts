
import { createClient } from '@supabase/supabase-js';

const url = 'https://wweumbkhwwtvsgmwpigx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3ZXVtYmtod3d0dnNnbXdwaWd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODA0NzIsImV4cCI6MjA4NDI1NjQ3Mn0.gHO4ihCedrYdCgHaXLlIAgv9p27CA_gVIPRJt6ZEVjE';

const supabase = createClient(url, key);

async function checkUsers() {
    console.log('Fetching profiles...');
    const { data: profiles, error: profileError } = await supabase.from('profiles').select('*');
    if (profileError) console.error('Profile/Network Error:', profileError);

    console.log('Fetching roles...');
    const { data: roles, error: roleError } = await supabase.from('user_roles').select('*');
    if (roleError) console.error('Role Error:', roleError);

    if (profiles && roles) {
        const combined = profiles.map(p => {
            const roleEntry = roles.find(r => r.id === p.id);
            return {
                email: p.email,
                role: roleEntry ? roleEntry.role : 'viewer (default)',
                id: p.id
            };
        });
        console.log('User Status:', JSON.stringify(combined, null, 2));
    }
}

checkUsers();
