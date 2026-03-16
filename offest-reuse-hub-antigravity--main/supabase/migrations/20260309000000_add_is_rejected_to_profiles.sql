-- Add rejected status to profiles so admins can block users from logging in
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_rejected BOOLEAN NOT NULL DEFAULT false;
