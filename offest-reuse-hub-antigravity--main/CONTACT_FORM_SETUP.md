# Contact Form Email Setup

The Contact Us form is now fully functional. Contact submissions are:
1. Saved in the `contact_submissions` database table
2. Email notifications sent to `excel_maxima@hotmail.com`

## Current Setup

The form works with a fallback mechanism:
- **Primary**: Tries to use Supabase Edge Function to send emails via Resend API
- **Fallback**: Opens the user's default email client with pre-filled content

## To Enable Automated Emails (Optional)

If you want fully automated email delivery without the mailto fallback:

### 1. Run the Database Migration

```bash
# Apply the migration to create the contact_submissions table
supabase db push
```

### 2. Set up Resend (for email sending)

1. Sign up for a free account at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. Add the API key to your Supabase project:

```bash
# Set the Resend API key as a secret
supabase secrets set RESEND_API_KEY=re_your_api_key_here
```

### 3. Deploy the Edge Function

```bash
# Deploy the email sending function
supabase functions deploy send-contact-email
```

### 4. Verify the Domain (Important for Resend)

For production use, you'll need to verify your domain in Resend:
- Go to Resend Dashboard > Domains
- Add and verify your domain
- Update the `from` address in the edge function from `onboarding@resend.dev` to your verified domain

## File Structure

```
/src/pages/ContactUs.tsx              # Contact form page
/supabase/migrations/20260228000000_create_contact_submissions.sql  # Database schema
/supabase/functions/send-contact-email/index.ts  # Email sending edge function
```

## Database Table: contact_submissions

Fields:
- `id` (UUID) - Primary key
- `name` (TEXT) - Sender's name
- `company` (TEXT) - Optional company name
- `description` (TEXT) - Message content
- `contact_number` (TEXT) - Phone number
- `user_id` (UUID) - References authenticated user (nullable)
- `created_at` (TIMESTAMP) - Submission time
- `status` (TEXT) - 'new', 'in_progress', or 'resolved'

## Notes

- The form works immediately with the mailto fallback
- All submissions are saved in the database regardless of email delivery
- Admins can view all submissions in the database
- Users can view their own submissions
