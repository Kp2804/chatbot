-- Fix missing columns that are causing dashboard errors

-- 1. Add admin_notes to listings (Required for Admin Dashboard)
ALTER TABLE public.listings 
ADD COLUMN IF NOT EXISTS admin_notes text;

-- 2. Add company to profiles (Required for User Table display)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS company text;
