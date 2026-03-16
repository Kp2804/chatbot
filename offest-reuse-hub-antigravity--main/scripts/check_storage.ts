
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wweumbkhwwtvsgmwpigx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3ZXVtYmtod3d0dnNnbXdwaWd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODA0NzIsImV4cCI6MjA4NDI1NjQ3Mn0.gHO4ihCedrYdCgHaXLlIAgv9p27CA_gVIPRJt6ZEVjE";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStorage() {
    console.log('Checking storage buckets...');

    // List buckets
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
        console.error('Error listing buckets:', error);
        return;
    }

    console.log('Buckets:', buckets);

    const listingBucket = buckets.find(b => b.name === 'listing-images');
    if (listingBucket) {
        console.log('✅ listing-images bucket found.');
        console.log('Public:', listingBucket.public);
    } else {
        console.log('❌ listing-images bucket NOT found.');
    }
}

checkStorage();
