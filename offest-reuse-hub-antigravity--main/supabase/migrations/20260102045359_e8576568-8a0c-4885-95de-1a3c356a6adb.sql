-- Create table for listing access permissions
CREATE TABLE public.listing_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

-- Create table for access requests
CREATE TABLE public.access_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

-- Enable RLS
ALTER TABLE public.listing_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for listing_access
CREATE POLICY "Admins can manage all listing access"
ON public.listing_access
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own access grants"
ON public.listing_access
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policies for access_requests
CREATE POLICY "Admins can manage all access requests"
ON public.access_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own requests"
ON public.access_requests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create access requests"
ON public.access_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Function to check if user has access to a listing
CREATE OR REPLACE FUNCTION public.has_listing_access(_user_id uuid, _listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.listing_access
    WHERE user_id = _user_id
      AND listing_id = _listing_id
  )
$$;

-- Drop old listing policies and create new ones
DROP POLICY IF EXISTS "Anyone can view approved listings" ON public.listings;
DROP POLICY IF EXISTS "Authenticated users can view their own listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;

-- New listing SELECT policies
CREATE POLICY "Admins can view all listings"
ON public.listings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own listings"
ON public.listings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users with access can view approved listings"
ON public.listings
FOR SELECT
USING (
  status = 'approved'::listing_status 
  AND has_listing_access(auth.uid(), id)
);

-- Trigger for access_requests updated_at
CREATE TRIGGER update_access_requests_updated_at
BEFORE UPDATE ON public.access_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();