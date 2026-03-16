-- Fix storage policies for listing-images bucket
-- This allows authenticated users to upload, update, and delete images

-- Drop existing policies (if any)
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated users can upload" on storage.objects;
drop policy if exists "Users can update own images" on storage.objects;
drop policy if exists "Users can delete own images" on storage.objects;
drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow authenticated updates" on storage.objects;
drop policy if exists "Allow authenticated deletes" on storage.objects;

-- Policy 1: Allow anyone to view images (public read)
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'listing-images' );

-- Policy 2: Allow authenticated users to upload images
create policy "Allow authenticated uploads"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'listing-images' );

-- Policy 3: Allow authenticated users to update images
create policy "Allow authenticated updates"
on storage.objects for update
to authenticated
using ( bucket_id = 'listing-images' );

-- Policy 4: Allow authenticated users to delete images
create policy "Allow authenticated deletes"
on storage.objects for delete
to authenticated
using ( bucket_id = 'listing-images' );
