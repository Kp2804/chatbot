-- Allow all authenticated users to view approved listings (for the restricted view)
DROP POLICY IF EXISTS "Users with access can view approved listings" ON public.listings;

CREATE POLICY "Anyone can view approved listings"
ON public.listings
FOR SELECT
USING (status = 'approved'::listing_status);
