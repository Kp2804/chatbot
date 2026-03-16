-- Drop existing RESTRICTIVE policies on listings
DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;
DROP POLICY IF EXISTS "Users can view their own listings" ON public.listings;
DROP POLICY IF EXISTS "Users with access can view approved listings" ON public.listings;

-- Recreate as PERMISSIVE policies (default, uses OR logic)
CREATE POLICY "Admins can view all listings" 
ON public.listings 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own listings" 
ON public.listings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users with access can view approved listings" 
ON public.listings 
FOR SELECT 
USING (status = 'approved' AND has_listing_access(auth.uid(), id));