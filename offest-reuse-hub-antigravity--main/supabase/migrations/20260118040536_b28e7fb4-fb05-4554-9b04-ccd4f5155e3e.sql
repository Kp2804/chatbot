-- Add approval status to profiles
ALTER TABLE public.profiles 
ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT false;

-- Add company field if not exists (needed for B2B context)
-- Already exists from previous schema

-- Update existing profiles to be approved (grandfather clause for existing users)
UPDATE public.profiles SET is_approved = true WHERE is_approved = false;

-- Create policy for admins to update approval status
CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add unique constraint to access_requests to prevent duplicate requests
ALTER TABLE public.access_requests 
ADD CONSTRAINT unique_user_listing_request UNIQUE (user_id, listing_id);