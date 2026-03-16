-- Confirm the specific admin user
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email = 'admin111@gmail.com';

-- SQL to confirm ALL users (if you want to fix everyone at once)
-- UPDATE auth.users SET email_confirmed_at = now();
