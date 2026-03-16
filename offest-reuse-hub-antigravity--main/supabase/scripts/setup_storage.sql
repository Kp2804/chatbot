-- Create the bucket for listing images
insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do update set public = true;

-- Drop existing policies to avoid conflicts
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated users can upload" on storage.objects;
drop policy if exists "Users can update own images" on storage.objects;
drop policy if exists "Users can delete own images" on storage.objects;

-- Allow public access to read images
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'listing-images' );

-- Allow authenticated users to upload images
create policy "Authenticated users can upload"
  on storage.objects for insert
  with check ( bucket_id = 'listing-images' and auth.role() = 'authenticated' );

-- Allow users to update their own images
create policy "Users can update own images"
  on storage.objects for update
  using ( bucket_id = 'listing-images' and auth.uid() = owner );

-- Allow users to delete their own images
create policy "Users can delete own images"
  on storage.objects for delete
  using ( bucket_id = 'listing-images' and auth.uid() = owner );
