/**
 * @file Signup.tsx
 * @description Registration page for new users to request access to the platform.
 * 
 * Key Features:
 * - Collects Name, Email, Company, Password, and requires Terms agreement
 * - Uses Supabase Auth for registration
 * - On success, stores the company name in the `profiles` table
 * - Automatically redirects new users to the PendingApproval page because `is_approved` defaults to false
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Recycle, Mail, Lock, User, ArrowRight, Check, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      toast({
        title: 'Google Sign-Up Failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsGoogleLoading(false);
    }
    // On success Supabase redirects the browser — no further action needed
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) {
      toast({
        title: 'Terms Required',
        description: 'Please agree to the terms and conditions.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    // Clear any existing session so a previous account can't interfere
    await supabase.auth.signOut();

    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: name,
          company: company,
        },
      },
    });

    setIsLoading(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast({
          title: 'Account Exists',
          description: 'This email is already registered. Please sign in instead.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Signup Failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    } else {
      // Update company in profile
      const { data: { user: newUser } } = await supabase.auth.getUser();
      if (newUser && company) {
        await supabase
          .from('profiles')
          .update({ company })
          .eq('id', newUser.id);
      }
      navigate('/pending-approval');
    }
  };

  const benefits = [
    'Access exclusive machine resale marketplace',
    'Connect with verified industry buyers',
    'Admin-verified listings for trust',
    'Secure communication through platform',
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex flex-1 items-center justify-center py-12">
        <div className="mx-auto grid w-full max-w-4xl gap-8 px-4 lg:grid-cols-2">
          {/* Benefits */}
          <div className="hidden lg:block">
            <div className="rounded-xl bg-primary p-8 text-primary-foreground">
              <h2 className="mb-6 text-2xl font-bold">Join Offset Reuse Hub</h2>
              <p className="mb-4 text-primary-foreground/80">
                This platform is exclusively for verified customers of our machine manufacturing company.
              </p>
              <div className="mb-6 rounded-lg bg-primary-foreground/10 p-4 text-sm">
                <strong>Note:</strong> Your account will require admin approval before you can access the marketplace.
              </div>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground/20">
                      <Check className="h-4 w-4" />
                    </div>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Form */}
          <div>
            <div className="mb-8 text-center lg:text-left">
              <Link to="/" className="mb-6 inline-flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                  <Recycle className="h-6 w-6 text-primary-foreground" />
                </div>
              </Link>
              <h1 className="mb-2 text-2xl font-bold">Request Access</h1>
              <p className="text-muted-foreground">Register to join the Offset Reuse Hub</p>
            </div>

            <div className="mb-4 rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm text-warning-foreground">
              <strong>Approval Required:</strong> Only verified customers can access the platform. Your account will be reviewed by our team.
            </div>

            {/* Google Sign-Up */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              onClick={handleGoogleSignUp}
              disabled={isGoogleLoading}
            >
              {isGoogleLoading ? (
                'Redirecting…'
              ) : (
                <>
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </Button>

            <div className="relative my-2 flex items-center">
              <div className="flex-1 border-t" />
              <span className="mx-3 text-xs text-muted-foreground">or register with email</span>
              <div className="flex-1 border-t" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Company Name</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="company"
                    type="text"
                    placeholder="Your Company Ltd."
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="terms"
                  checked={agreeTerms}
                  onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
                />
                <label htmlFor="terms" className="text-sm text-muted-foreground">
                  I agree to the{' '}
                  <Link to="#" className="text-primary hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="#" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
                </label>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? 'Creating account...' : 'Create Account'}
                {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Signup;
