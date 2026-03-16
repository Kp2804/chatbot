import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wweumbkhwwtvsgmwpigx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3ZXVtYmtod3d0dnNnbXdwaWd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODA0NzIsImV4cCI6MjA4NDI1NjQ3Mn0.gHO4ihCedrYdCgHaXLlIAgv9p27CA_gVIPRJt6ZEVjE";

const supabase = createClient(supabaseUrl, supabaseKey);

// Test getting a public URL
const testPath = "test/example.png";
const { data } = supabase.storage
    .from('listing-images')
    .getPublicUrl(testPath);

console.log('Test public URL:', data.publicUrl);
console.log('Expected format: https://wweumbkhwwtvsgmwpigx.supabase.co/storage/v1/object/public/listing-images/test/example.png');
