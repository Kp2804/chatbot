// @ts-ignore - Deno types
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// @ts-ignore - Deno types
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

/** Escape HTML special chars to prevent injection in email body */
const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

/** Resolve CORS origin: allow only listed origins, fall back to empty (blocks browser) */
const getCorsOrigin = (requestOrigin: string | null): string => {
  // @ts-ignore - Deno types
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((o: string) => o.trim())
  return allowed.includes(requestOrigin ?? '') ? (requestOrigin as string) : allowed[0]
}

serve(async (req: Request) => {
  const corsOrigin = getCorsOrigin(req.headers.get('origin'))
  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, name, company, description, contactNumber } = await req.json()

    // If no Resend API key is configured, return success anyway
    // (the submission is saved in the database)
    if (!RESEND_API_KEY) {
      console.log('Resend API key not configured. Email not sent.')
      return new Response(
        JSON.stringify({ message: 'Contact form submitted successfully (email not configured)' }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          status: 200,
        }
      )
    }

    // Escape all user-controlled values before embedding in HTML
    const safeName = escapeHtml(String(name ?? ''))
    const safeCompany = escapeHtml(String(company ?? ''))
    const safeContact = escapeHtml(String(contactNumber ?? ''))
    const safeDescription = escapeHtml(String(description ?? '')).replace(/\n/g, '<br>')

    // Send email using Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Offset Reuse Hub <onboarding@resend.dev>',
        to: [to],
        subject: `New Contact Form Submission from ${safeName}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          ${safeCompany ? `<p><strong>Company:</strong> ${safeCompany}</p>` : ''}
          <p><strong>Contact Number:</strong> ${safeContact}</p>
          <p><strong>Message:</strong></p>
          <p>${safeDescription}</p>
        `,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.message || 'Failed to send email')
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 400,
    })
  }
})
