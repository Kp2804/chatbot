/**
 * @file ListingDetail.tsx
 * @description Displays the full details of a single equipment listing.
 * 
 * Key Features:
 * - Retrieves listing data using the `id` from the URL params
 * - Implements complex access control: Checks if user is Admin, Owner, or has been Granted access
 * - Renders a "Blurred/Restricted" view if access is not granted
 * - Renders the standard full view if access is granted
 * 
 * Note: Data is re-fetched and verified directly from the database to prevent unauthorized access.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { categoryLabels, conditionLabels } from '@/types/listing';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Calendar, User, Mail, Phone, Loader2, Lock, Send, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

type ListingCategory = Database['public']['Enums']['listing_category'];
type ListingCondition = Database['public']['Enums']['listing_condition'];

interface Listing {
  id: string;
  title: string;
  category: ListingCategory;
  condition: ListingCondition;
  description: string | null;
  images: string[] | null;
  location: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  price: number | null;
  status: 'pending' | 'approved' | 'rejected';
  user_id: string;
  created_at: string;
}

interface Profile {
  full_name: string | null;
  email: string | null;
  is_verified: boolean;
}

const ListingDetail = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [sellerProfile, setSellerProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [requestDialog, setRequestDialog] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (id && user !== undefined) { // Wait for user auth to be determined (user can be null, but undefined check if logic needed)
      // Actually useAuth isLoading handles the wait, but useEffect might run.
      // We'll rely on fetchListing to do checks.
      fetchListing(id);
    }
  }, [id, user, isAdmin]);

  const fetchListing = async (listingId: string) => {
    setIsLoading(true);
    try {
      // 1. Fetch listing details
      const { data: listingData, error: listingError } = await supabase
        .from('listings')
        .select('*')
        .eq('id', listingId)
        .single();

      if (listingError) throw listingError;

      if (listingData) {
        setListing(listingData as Listing);

        // 2. Determine Access
        let access = false;
        if (isAdmin) {
          access = true;
        } else if (user) {
          if (listingData.user_id === user.id) {
            access = true;
          } else {
            // Check listing_access table
            const { data: accessData } = await supabase
              .from('listing_access')
              .select('id')
              .eq('listing_id', listingId)
              .eq('user_id', user.id)
              .single();
            if (accessData) access = true;

            // Check request status
            const { data: requestData } = await supabase
              .from('access_requests')
              .select('status')
              .eq('listing_id', listingId)
              .eq('user_id', user.id)
              .single();

            if (requestData) {
              setRequestStatus(requestData.status as any);
            }
          }
        }
        setHasAccess(access);

        // 3. Fetch seller profile (only if access granted or we want to show generic info)
        // We'll fetch it anyway but only display if access granted
        if (listingData.user_id) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', listingData.user_id)
            .single();

          if (!profileError && profileData) {
            setSellerProfile({
              full_name: profileData.full_name,
              email: profileData.email,
              is_verified: false
            });
          }
        }
      }
    } catch (error: any) {
      console.error('Error fetching listing:', error);
      toast({
        title: 'Error',
        description: 'Failed to load listing details.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestAccess = async () => {
    if (!user || !listing) return;

    const { error } = await supabase
      .from('access_requests')
      .insert({
        listing_id: listing.id,
        user_id: user.id
      });

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Already Requested', description: 'You have already requested access.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Request Sent', description: 'Your access request has been sent to the admin.' });
      setRequestStatus('pending');
    }
    setRequestDialog(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar isLoggedIn={!!user} userName={user?.user_metadata?.full_name} userRole={isAdmin ? 'admin' : 'seller'} />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar isLoggedIn={!!user} userName={user?.user_metadata?.full_name} userRole={isAdmin ? 'admin' : 'seller'} />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="mb-2 text-2xl font-bold">Listing Not Found</h1>
            <p className="mb-4 text-muted-foreground">The listing you're looking for doesn't exist.</p>
            <Link to="/">
              <Button>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Marketplace
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Not approved handling
  if (listing.status !== 'approved' && !isAdmin && listing.user_id !== user?.id) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar isLoggedIn={!!user} userName={user?.user_metadata?.full_name} userRole={isAdmin ? 'admin' : 'seller'} />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="mb-2 text-2xl font-bold">Listing Unavailable</h1>
            <p className="mb-4 text-muted-foreground">This listing is not currently available for viewing.</p>
            <Link to="/">
              <Button>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Marketplace
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Use generic seller info if blurred?
  const sellerName = sellerProfile?.full_name || 'Seller';
  const displayEmail = listing.contact_email || sellerProfile?.email || 'No email provided';

  // BLURRED VIEW
  if (!hasAccess) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar isLoggedIn={!!user} userName={user?.user_metadata?.full_name} userRole={isAdmin ? 'admin' : 'seller'} />
        <main className="flex-1 py-8">
          <div className="container relative">
            <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to Marketplace
            </Link>

            <div className="grid gap-8 lg:grid-cols-2">
              {/* Blurred Image */}
              <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
                <img
                  src={listing.images?.[0] || '/placeholder.svg'}
                  alt="Restricted"
                  className="h-full w-full object-cover blur-xl filter"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                  <Lock className="h-12 w-12 text-muted-foreground" />
                </div>
              </div>

              {/* Blurred Details */}
              <div className="relative">
                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge variant="category">{categoryLabels[listing.category]}</Badge>
                  <Badge variant="secondary">{conditionLabels[listing.condition]}</Badge>
                </div>

                <h1 className="mb-4 text-3xl font-bold">{listing.title}</h1>

                <div className="mb-6 text-3xl font-bold text-primary blur-sm select-none">
                  $XX,XXX
                </div>

                <div className="mb-6 space-y-3 blur-sm select-none">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>Location Hidden</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Listed on ...</span>
                  </div>
                </div>

                <div className="mb-8 blur-sm select-none">
                  <h2 className="mb-3 font-semibold">Description</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    This content is hidden. Please request access to view full details including price, location, and seller contact information.
                  </p>
                </div>

                {/* Overlay for Action */}
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-background/60 text-center backdrop-blur-sm p-6">
                  <ShieldAlert className="mb-4 h-12 w-12 text-primary" />
                  <h2 className="mb-2 text-2xl font-bold">Restricted Access</h2>
                  <p className="mb-6 max-w-md text-muted-foreground">
                    To view full details, pricing, and contact the seller, you must request access from the administrator.
                  </p>

                  {requestStatus === 'pending' ? (
                    <Button disabled>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Request Pending
                    </Button>
                  ) : requestStatus === 'approved' ? (
                    <Button onClick={() => window.location.reload()}>
                      Access Granted - Refresh
                    </Button>
                  ) : (
                    <Button size="lg" onClick={() => setRequestDialog(true)}>
                      Request Access
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>

        <Dialog open={requestDialog} onOpenChange={setRequestDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Access to "{listing.title}"</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                The admin will be notified of your request. Once approved, you will be able to see full details and contact the seller.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRequestDialog(false)}>Cancel</Button>
              <Button onClick={handleRequestAccess}>
                <Send className="mr-2 h-4 w-4" />
                Send Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Footer />
      </div>
    );
  }

  // STANDARD VIEW (HAS ACCESS)
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar isLoggedIn={!!user} userName={user?.user_metadata?.full_name} userRole={isAdmin ? 'admin' : 'seller'} />

      <main className="flex-1 py-8">
        <div className="container">
          {/* Breadcrumb */}
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Marketplace
          </Link>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Image Carousel */}
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
                <img
                  src={listing.images?.[currentImageIndex] || '/placeholder.svg'}
                  alt={`${listing.title} — photo ${currentImageIndex + 1}`}
                  className="h-full w-full object-cover"
                />
                {listing.images && listing.images.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentImageIndex(i => (i - 1 + listing.images!.length) % listing.images!.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 shadow hover:bg-background transition-colors"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setCurrentImageIndex(i => (i + 1) % listing.images!.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 shadow hover:bg-background transition-colors"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {listing.images.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentImageIndex(idx)}
                          className={`h-2 w-2 rounded-full transition-colors ${
                            idx === currentImageIndex ? 'bg-white' : 'bg-white/50'
                          }`}
                          aria-label={`Go to image ${idx + 1}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* Thumbnail strip */}
              {listing.images && listing.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {listing.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`shrink-0 h-16 w-16 overflow-hidden rounded-md border-2 transition-colors ${
                        idx === currentImageIndex ? 'border-primary' : 'border-transparent'
                      }`}
                    >
                      <img src={img} alt={`Thumbnail ${idx + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant="category">{categoryLabels[listing.category]}</Badge>
                <Badge variant="secondary">{conditionLabels[listing.condition]}</Badge>
              </div>

              <h1 className="mb-4 text-3xl font-bold">{listing.title}</h1>

              {listing.price && (
                <div className="mb-6 text-3xl font-bold text-primary">
                  ₹{listing.price.toLocaleString('en-IN')}
                </div>
              )}

              <div className="mb-6 space-y-3">
                {listing.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{listing.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Listed on {new Date(listing.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="mb-8">
                <h2 className="mb-3 font-semibold">Description</h2>
                <p className="text-muted-foreground leading-relaxed">{listing.description}</p>
              </div>


            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ListingDetail;
