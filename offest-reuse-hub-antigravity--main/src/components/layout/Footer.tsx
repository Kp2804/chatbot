/**
 * @file Footer.tsx
 * @description The global footer component.
 * 
 * Key Features:
 * - Displays brand information, quick links, and support information
 * - Provides consistent bottom navigation across all pages
 */
import { RotateCcw } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const Footer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useAuth();

  const handleBrowseMarketplace = (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (location.pathname === '/') {
      // Already on home page, just scroll
      const marketplace = document.getElementById('marketplace');
      if (marketplace) {
        marketplace.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // Navigate to home page, then scroll
      navigate('/');
      setTimeout(() => {
        const marketplace = document.getElementById('marketplace');
        if (marketplace) {
          marketplace.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  return (
    <footer className="border-t border-border bg-secondary/30">
      <div className="container py-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <RotateCcw className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold leading-tight">Offset Reuse</span>
                <span className="text-xs font-medium leading-none text-muted-foreground">Hub</span>
              </div>
            </Link>
            <p className="mb-4 max-w-sm text-sm text-muted-foreground">
              India's trusted marketplace for pre-owned printing equipment, parts, and accessories.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-4 font-semibold">Quick Links</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a 
                  href="#marketplace" 
                  onClick={handleBrowseMarketplace}
                  className="transition-colors hover:text-foreground cursor-pointer"
                >
                  Browse Marketplace
                </a>
              </li>
              {!isAdmin && (
                <li>
                  <Link to="/dashboard" className="transition-colors hover:text-foreground">
                    Sell Item
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="mb-4 font-semibold">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/contact" className="transition-colors hover:text-foreground">
                  Contact Us
                </Link>
              </li>
              <li>
                <a href="tel:+91-9825060276" className="transition-colors hover:text-foreground">
                  Call Us: +91-9825060276
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Offset Reuse Hub. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="#" className="transition-colors hover:text-foreground">Privacy Policy</Link>
            <Link to="#" className="transition-colors hover:text-foreground">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
