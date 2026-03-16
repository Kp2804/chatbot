import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars if needed - using hardcoded from previous file view for now as checked previously
const supabaseUrl = "https://wweumbkhwwtvsgmwpigx.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3ZXVtYmtod3d0dnNnbXdwaWd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODA0NzIsImV4cCI6MjA4NDI1NjQ3Mn0.gHO4ihCedrYdCgHaXLlIAgv9p27CA_gVIPRJt6ZEVjE";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testImageUpload() {
    console.log('Testing image upload to listing-images bucket...\n');

    // 0. Authenticate
    console.log('0. Authenticating test user...');
    const email = `test-${Date.now()}@example.com`;
    const password = 'testpassword123';

    // Try sign up
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
    });

    if (authError) {
        console.error('❌ Auth failed:', authError);
        return;
    }
    console.log('✅ Authenticated as:', authData.user?.email);

    // Create a simple test file (1x1 pixel PNG)
    const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
    );

    const fileName = `test/${Date.now()}-test.png`;

    console.log('1. Uploading test image...');
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('listing-images')
        .upload(fileName, testImageBuffer, {
            contentType: 'image/png'
        });

    if (uploadError) {
        console.error('❌ Upload failed:', uploadError);
        console.error('Details:', JSON.stringify(uploadError, null, 2));
        return;
    }

    console.log('✅ Upload successful!');
    console.log('   Path:', uploadData.path);

    console.log('\n2. Getting public URL...');
    const { data: urlData } = supabase.storage
        .from('listing-images')
        .getPublicUrl(fileName);

    console.log('✅ Public URL generated:');
    console.log('   URL:', urlData.publicUrl);

    console.log('\n3. Testing URL accessibility...');
    try {
        const response = await fetch(urlData.publicUrl);
        if (response.ok) {
            console.log('✅ Image is publicly accessible!');
            console.log('   Status:', response.status);
            console.log('   Content-Type:', response.headers.get('content-type'));
        } else {
            console.log('❌ Image not accessible');
            console.log('   Status:', response.status);
        }
    } catch (error) {
        console.error('❌ Error fetching image:', error);
    }

    console.log('\n4. Cleaning up test file...');
    const { error: deleteError } = await supabase.storage
        .from('listing-images')
        .remove([fileName]);

    if (deleteError) {
        console.log('⚠️  Could not delete test file:', deleteError);
    } else {
        console.log('✅ Test file cleaned up');
    }
}

testImageUpload();
