/**
 * @file ContactUs.tsx
 * @description Contact Us page with a form for users to reach out.
 * 
 * Key Features:
 * - Form with name, company, description, and contact number fields
 * - Sends inquiries to excel_maxima@hotmail.com via EmailJS or similar service
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Mail, Phone, Building, User, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ContactUs = () => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    company: '',
    description: '',
    contactNumber: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim() || !formData.description.trim() || !formData.contactNumber.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Best-effort DB save — never block the form submission if this fails
      supabase
        .from('contact_submissions')
        .insert({
          name: formData.name,
          company: formData.company || null,
          description: formData.description,
          contact_number: formData.contactNumber,
          user_id: user?.id || null,
        })
        .then(({ error }) => {
          if (error) console.warn('Contact submission DB save failed:', error.message);
        });

      // Try to send email via Supabase Edge Function
      const { data: fnData, error: fnError } = await supabase.functions.invoke('send-contact-email', {
        body: {
          to: 'krishpatel28112004@gmail.com',
          name: formData.name,
          company: formData.company,
          description: formData.description,
          contactNumber: formData.contactNumber,
        },
      });

      const emailNotConfigured = fnError || fnData?.message?.includes('not configured');
      if (emailNotConfigured) {
        // Resend not set up — open the user's mail client as fallback
        console.warn('Email not configured, using mailto fallback');
        const subject = `Contact Form: ${formData.name}${formData.company ? ' - ' + formData.company : ''}`;
        const body = `Name: ${formData.name}\nCompany: ${formData.company || 'N/A'}\nContact Number: ${formData.contactNumber}\n\nMessage:\n${formData.description}`;
        window.location.href = `mailto:krishpatel28112004@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }

      toast({
        title: 'Message Sent!',
        description: 'Thank you for contacting us. We will get back to you soon.',
      });

      setFormData({ name: '', company: '', description: '', contactNumber: '' });

    } catch (error: any) {
      console.error('Error submitting contact form:', error);
      toast({
        title: 'Error',
        description: 'Failed to send your message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        isLoggedIn={!!user}
        userName={user?.user_metadata?.full_name || user?.email?.split('@')[0]}
        userRole={isAdmin ? 'admin' : 'seller'}
      />

      <main className="flex-1 py-16">
        <div className="container max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-4xl font-bold">Contact Us</h1>
            <p className="text-muted-foreground">
              Have a question or need assistance? We're here to help!
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Send us a message</CardTitle>
              <CardDescription>
                Fill out the form below and we'll get back to you as soon as possible.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Your full name"
                      value={formData.name}
                      onChange={handleChange}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="company"
                      name="company"
                      type="text"
                      placeholder="Your company (optional)"
                      value={formData.company}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactNumber">
                    Contact Number <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="contactNumber"
                      name="contactNumber"
                      type="tel"
                      placeholder="Your phone number"
                      value={formData.contactNumber}
                      onChange={handleChange}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">
                    Message <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Tell us how we can help you..."
                    value={formData.description}
                    onChange={handleChange}
                    rows={6}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>You can also reach us directly at:</p>
            <a
              // href="mailto:excel_maxima@hotmail.com"
              href="mailto:krishpatel28112004@gmail.com"
              className="mt-2 inline-flex items-center gap-2 text-primary hover:underline"
            >
              <Mail className="h-4 w-4" />
              {/* excel_maxima@hotmail.com */}
              krishpatel28112004@gmail.com
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ContactUs;
