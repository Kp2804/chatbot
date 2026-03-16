/**
 * @file Navbar.tsx
 * @description The global navigation bar component.
 * 
 * Key Features:
 * - Adapts to different user roles (admin, seller, viewer)
 * - Renders desktop and mobile responsive navigation menus
 * - Manages user sign out functionality
 * 
 * Props:
 * - `isLoggedIn`: Boolean indicating if user has an active session
 * - `userRole`: The role of the current user
 * - `userName`: Display name for the authenticated user
 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { RotateCcw, Menu, X, User, LogIn } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface NavbarProps {
  isLoggedIn?: boolean;
  userRole?: 'admin' | 'seller' | 'viewer';
  userName?: string;
}

const Navbar = ({ isLoggedIn = false, userRole, userName }: NavbarProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSignOutLoading, setIsSignOutLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { toast } = useToast();

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    try {
      setIsSignOutLoading(true);
      await signOut();
      toast({
        title: 'Signed out successfully',
        description: 'See you next time!',
      });
      navigate('/login');
    } catch (error: any) {
      toast({
        title: 'Error signing out',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSignOutLoading(false);
      setMobileMenuOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <RotateCcw className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold leading-tight text-foreground">Offset Reuse</span>
            <span className="text-xs font-medium leading-none text-muted-foreground">Hub</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          <Link to="/">
            <Button
              variant={isActive('/') ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(isActive('/') && 'bg-secondary')}
            >
              Marketplace
            </Button>
          </Link>
          {isLoggedIn && userRole === 'seller' && (
            <Link to="/dashboard">
              <Button
                variant={isActive('/dashboard') ? 'secondary' : 'ghost'}
                size="sm"
              >
                My Listings
              </Button>
            </Link>
          )}
          {isLoggedIn && userRole === 'admin' && (
            <Link to="/admin">
              <Button
                variant={isActive('/admin') ? 'secondary' : 'ghost'}
                size="sm"
              >
                Admin Panel
              </Button>
            </Link>
          )}
          <Link to="/contact">
            <Button
              variant={isActive('/contact') ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(isActive('/contact') && 'bg-secondary')}
            >
              Contact Us
            </Button>
          </Link>
        </nav>

        {/* Desktop Auth */}
        <div className="hidden items-center gap-3 md:flex">
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <Link to="/profile">
                <Button variant="ghost" className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 hover:bg-secondary/80">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{userName}</span>
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isSignOutLoading}>
                {isSignOutLoading ? 'Signing out...' : 'Sign Out'}
              </Button>
            </div>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  <LogIn className="mr-1 h-4 w-4" />
                  Sign In
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm">Get Started</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="animate-fade-in border-t border-border bg-background md:hidden">
          <nav className="container flex flex-col gap-2 py-4">
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>
              <Button variant={isActive('/') ? 'secondary' : 'ghost'} className="w-full justify-start">
                Marketplace
              </Button>
            </Link>
            {isLoggedIn && userRole === 'seller' && (
              <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                <Button variant={isActive('/dashboard') ? 'secondary' : 'ghost'} className="w-full justify-start">
                  My Listings
                </Button>
              </Link>
            )}
            {isLoggedIn && userRole === 'admin' && (
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                <Button variant={isActive('/admin') ? 'secondary' : 'ghost'} className="w-full justify-start">
                  Admin Panel
                </Button>
              </Link>
            )}
            <Link to="/contact" onClick={() => setMobileMenuOpen(false)}>
              <Button variant={isActive('/contact') ? 'secondary' : 'ghost'} className="w-full justify-start">
                Contact Us
              </Button>
            </Link>
            <div className="my-2 border-t border-border" />
            {isLoggedIn ? (
              <>
                <Link to="/profile" onClick={() => setMobileMenuOpen(false)}>
                  <div className="flex items-center gap-2 px-4 py-2 hover:bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{userName} (Edit Profile)</span>
                  </div>
                </Link>
                <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut} disabled={isSignOutLoading}>
                  {isSignOutLoading ? 'Signing out...' : 'Sign Out'}
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start">
                    Sign In
                  </Button>
                </Link>
                <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full">Get Started</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};

export default Navbar;
