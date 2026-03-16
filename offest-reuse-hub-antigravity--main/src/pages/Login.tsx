/**
 * @file Login.tsx
 * @description Standard authentication page for users to sign in.
 * 
 * Key Features:
 * - Accepts email and password to log in via Supabase Auth
 * - Checks the `profiles` table after successful login to determine if the user is `is_approved`
 * - Automatically signs out and denies access if the user is registered but not approved by an admin
 */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Recycle, Mail, Lock, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      toast({
        title: 'Google Sign-In Failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsGoogleLoading(false);
    }
  };

  // Removed auto-redirect to allow checking is_approved in handleSubmit
  // useEffect(() => {
  //   const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  //     if (session) {
  //       navigate('/');
  //     }
  //   });
  //   return () => subscription.unsubscribe();
  // }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);


    if (error) {
      toast({
        title: 'Login Failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    // Check if user is approved or rejected
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_approved, is_rejected')
      .eq('id', (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (profile?.is_rejected) {
      await supabase.auth.signOut();
      toast({
        title: 'Account Rejected',
        description: 'Your access request was rejected. Please contact support.',
        variant: 'destructive',
      });
    } else if (profile && !profile.is_approved) {
      await supabase.auth.signOut();
      toast({
        title: 'Access Denied',
        description: 'Your account has been locked. Please contact support.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully signed in.',
      });
      navigate('/');
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex flex-1 items-center justify-center py-12">
        <div className="mx-auto w-full max-w-md px-4">
          <div className="mb-8 text-center">
            <Link to="/" className="mb-6 inline-flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Recycle className="h-6 w-6 text-primary-foreground" />
              </div>
            </Link>
            <h1 className="mb-2 text-2xl font-bold">Welcome Back</h1>
            <p className="text-muted-foreground">Sign in to manage your listings</p>
          </div>

          {/* Google Sign-In */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            onClick={handleGoogleSignIn}
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
            <span className="mx-3 text-xs text-muted-foreground">or sign in with email</span>
            <div className="flex-1 border-t" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="#" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
              {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Don't have an account? </span>
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Login;
