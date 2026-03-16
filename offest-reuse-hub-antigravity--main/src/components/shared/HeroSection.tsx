/**
 * @file HeroSection.tsx
 * @description The main hero banner displayed on the landing page.
 * 
 * Key Features:
 * - Contains main call-to-action buttons for browsing and selling
 * - Visually introduces the application's core purpose
 */
import { ArrowRight, ShieldCheck, Users, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const HeroSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleStartSelling = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/signup');
    }
  };

  const handleBrowseListings = () => {
    const marketplace = document.getElementById('marketplace');
    if (marketplace) {
      marketplace.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative overflow-hidden gradient-hero">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary-foreground/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-primary-foreground/20 blur-3xl" />
      </div>

      <div className="container relative py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-1.5 text-sm text-primary-foreground">
            <RotateCcw className="h-4 w-4" />
            <span>Industrial Equipment Marketplace</span>
          </div>

          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-primary-foreground md:text-5xl lg:text-6xl animate-fade-in-up">
            Buy & Sell{' '}
            <span className="relative">
              Printing Equipment
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                <path d="M2 10C50 2 150 2 198 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-accent" />
              </svg>
            </span>
          </h1>

          <p className="mb-8 text-lg text-primary-foreground/80 md:text-xl animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            India's trusted marketplace for pre-owned offset printing equipment, spare parts, and accessories.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <Button variant="hero" size="xl" onClick={handleStartSelling}>
              List Equipment
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={handleBrowseListings}
            >
              Browse Listings
            </Button>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="mx-auto mt-16 grid max-w-4xl gap-6 md:grid-cols-3 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 p-6 backdrop-blur-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/20">
              <ShieldCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <h3 className="mb-2 font-semibold text-primary-foreground">Verified Listings</h3>
            <p className="text-sm text-primary-foreground/70">
              All listings reviewed before publishing.
            </p>
          </div>

          <div className="rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 p-6 backdrop-blur-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/20">
              <Users className="h-5 w-5 text-primary-foreground" />
            </div>
            <h3 className="mb-2 font-semibold text-primary-foreground">Industry Network</h3>
            <p className="text-sm text-primary-foreground/70">
              Connect with verified professionals.
            </p>
          </div>

          <div className="rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 p-6 backdrop-blur-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/20">
              <RotateCcw className="h-5 w-5 text-primary-foreground" />
            </div>
            <h3 className="mb-2 font-semibold text-primary-foreground">Maximize Value</h3>
            <p className="text-sm text-primary-foreground/70">
              Extend equipment lifecycle, reduce costs.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
