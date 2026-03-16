/**
 * @file PendingApproval.tsx
 * @description An interim page shown to newly registered users whose accounts are still pending admin approval.
 * 
 * Key Features:
 * - Explains the verification process to the user
 * - Uses a `setInterval` polling mechanism to continuously check if the admin has approved their account
 * - Automatically redirects to the home page once `is_approved` becomes true in the `profiles` table
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Clock, Mail, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const PendingApproval = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    // Check if user is now approved
    const checkApproval = async () => {
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('is_approved')
        .eq('id', user.id)
        .single();

      if (data?.is_approved) {
        navigate('/');
      }
    };

    checkApproval();

    // Set up interval to check periodically
    const interval = setInterval(checkApproval, 10000);
    return () => clearInterval(interval);
  }, [user, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar isLoggedIn={!!user} userName={user?.user_metadata?.full_name || user?.email?.split('@')[0]} />

      <main className="flex flex-1 items-center justify-center py-12">
        <div className="mx-auto w-full max-w-md px-4 text-center">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-warning/10 p-6">
              <Clock className="h-12 w-12 text-warning" />
            </div>
          </div>

          <h1 className="mb-4 text-2xl font-bold">Account Pending Approval</h1>

          <p className="mb-6 text-muted-foreground">
            Thank you for registering with Offset Reuse Hub. Your account is currently
            under review by our team. Only verified customers of our company can access
            the platform.
          </p>

          <div className="mb-8 rounded-xl border border-border bg-card p-6 text-left">
            <h3 className="mb-4 font-semibold">What happens next?</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <Building className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Our admin team will verify your company details</span>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>You'll receive an email once your account is approved</span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Approval typically takes 1-2 business days</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Signed in as <strong>{user?.email}</strong>
            </p>
            <Button variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PendingApproval;
