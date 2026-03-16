-- Enable Admins to Update and Delete Listings
CREATE POLICY "Admins can update all listings"
ON public.listings
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete all listings"
ON public.listings
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Enable Sellers to Update and Delete their own listings
CREATE POLICY "Users can update their own listings"
ON public.listings
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own listings"
ON public.listings
FOR DELETE
USING (auth.uid() = user_id);
