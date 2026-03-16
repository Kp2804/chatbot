/**
 * @file Index.tsx
 * @description The main public-facing landing page and marketplace directory.
 * 
 * Key Features:
 * - Displays a HeroSection and SearchFilters
 * - Fetches all 'approved' listings and determines if the current user has access to view details
 * - Accessible listings are shown with `ListingCard`, restricted ones with `RestrictedListingCard`
 * - Allows users to request access to restricted listings
 * 
 * Logic & State:
 * - `allApprovedListings`: Stores raw listings from DB
 * - `listings`: Stores listings the user has explicit access to (owned or granted)
 * - `filteredListings` & `transformedListings`: Uses useMemo to handle active search and filter categories
 */
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import HeroSection from '@/components/shared/HeroSection';
import SearchFilters from '@/components/listings/SearchFilters';
import ListingCard from '@/components/listings/ListingCard';
import RestrictedListingCard from '@/components/listings/RestrictedListingCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Send, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Listing {
  id: string;
  title: string;
  category: string;
  condition: string;
  description: string | null;
  images: string[] | null;
  location: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  price: number | null;
  status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface AccessRequest {
  id: string;
  listing_id: string;
  user_id: string;
  status: string;
}

const Index = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isApproved } = useAuth();
  const { toast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [allApprovedListings, setAllApprovedListings] = useState<Listing[]>([]);
  const [myRequests, setMyRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCondition, setSelectedCondition] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [requestDialog, setRequestDialog] = useState(false);
  const [selectedListingForRequest, setSelectedListingForRequest] = useState<Listing | null>(null);

  useEffect(() => {
    fetchData();
  }, [user, isAdmin]);

  const fetchData = async () => {
    setIsLoading(true);

    try {
      // 1. Fetch ALL approved listings
      const { data: allListings, error: listingsError } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (listingsError) throw listingsError;

      const approvedListings = allListings || [];
      setAllApprovedListings(approvedListings);

      // 2. Determine accessibility
      if (isAdmin) {
        // Admins see everything as available
        setListings(approvedListings);
      } else if (user) {
        // Fetch user's access permissions
        const { data: accessData, error: accessError } = await supabase
          .from('listing_access')
          .select('listing_id')
          .eq('user_id', user.id);

        if (accessError) throw accessError;

        const grantedListingIds = new Set(accessData?.map(a => a.listing_id) || []);

        // Filter: Available = Owned by user OR Access Granted
        const available = approvedListings.filter(l =>
          l.user_id === user.id || grantedListingIds.has(l.id)
        );

        setListings(available);

        // Fetch user's access requests (for status on restricted cards)
        const { data: requests } = await supabase
          .from('access_requests')
          .select('*')
          .eq('user_id', user.id);
        setMyRequests(requests || []);

      } else {
        // Public users see nothing as "Available" (or maybe just public ones if we had them, but for now strict)
        // If the requirement is "listing created by gkpatel not visible in vgpatel", 
        // it implies default is Restricted.
        setListings([]);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load listings', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestAccess = async () => {
    if (!user || !selectedListingForRequest) return;

    const { error } = await supabase
      .from('access_requests')
      .insert({
        listing_id: selectedListingForRequest.id,
        user_id: user.id
      });

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Already Requested', description: 'You have already requested access to this listing.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Request Sent', description: 'Your access request has been sent to the admin.' });
      fetchData();
    }

    setRequestDialog(false);
    setSelectedListingForRequest(null);
  };

  const getRequestStatus = (listingId: string) => {
    const request = myRequests.find(r => r.listing_id === listingId);
    return request?.status;
  };

  const hasAccess = (listingId: string) => {
    return listings.some(l => l.id === listingId);
  };

  // Filter listings (Apply to ALL approved listings)
  const filteredListings = useMemo(() => {
    return allApprovedListings.filter((listing) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          listing.title.toLowerCase().includes(query) ||
          (listing.description?.toLowerCase().includes(query) ?? false) ||
          (listing.location?.toLowerCase().includes(query) ?? false);
        if (!matchesSearch) return false;
      }

      if (selectedCategory && selectedCategory !== 'all' && listing.category !== selectedCategory) {
        return false;
      }

      if (selectedCondition && selectedCondition !== 'all' && listing.condition !== selectedCondition) {
        return false;
      }

      if (selectedLocation) {
        const locationQuery = selectedLocation.toLowerCase();
        if (!listing.location?.toLowerCase().includes(locationQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [allApprovedListings, searchQuery, selectedCategory, selectedCondition, selectedLocation]);

  // Sort: Accessible first, then Restricted
  const sortedListings = useMemo(() => {
    return [...filteredListings].sort((a, b) => {
      const aAccess = hasAccess(a.id);
      const bAccess = hasAccess(b.id);
      if (aAccess && !bAccess) return -1;
      if (!aAccess && bAccess) return 1;
      // Secondary sort: created_at desc (already sorted from DB, but good to be explicit if needed)
      return 0;
    });
  }, [filteredListings, listings]); // listings used for hasAccess check

  // Transform listings
  const transformedListings = sortedListings.map(listing => ({
    id: listing.id,
    title: listing.title,
    category: listing.category as 'printing_press' | 'finishing_equipment' | 'prepress' | 'spare_parts' | 'accessories' | 'other',
    condition: listing.condition as 'excellent' | 'good' | 'fair' | 'for_parts',
    description: listing.description || '',
    images: listing.images || ['/placeholder.svg'],
    location: listing.location || 'Unknown',
    contactName: '',
    contactEmail: listing.contact_email || '',
    contactPhone: listing.contact_phone || '',
    price: listing.price || undefined,
    status: listing.status as 'pending' | 'approved' | 'rejected',
    sellerId: listing.user_id,
    sellerName: 'Seller',
    createdAt: listing.created_at,
    created_at: listing.created_at, // Add this to satisfy RestrictedListingCard
    updatedAt: listing.updated_at,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        isLoggedIn={!!user}
        userName={user?.user_metadata?.full_name || user?.email?.split('@')[0]}
        userRole={isAdmin ? 'admin' : 'seller'}
      />

      <main className="flex-1">
        <HeroSection />

        {/* Marketplace Section */}
        <section id="marketplace" className="py-16">
          <div className="container">
            <div className="mb-8">
              <h2 className="mb-2 text-3xl font-bold">Browse Listings</h2>
              <p className="text-muted-foreground">
                {user ? 'View available equipment and request access to restricted items' : 'Sign in to see full details'}
              </p>
            </div>

            <SearchFilters
              onSearch={setSearchQuery}
              onCategoryChange={setSelectedCategory}
              onConditionChange={setSelectedCondition}
              onLocationChange={setSelectedLocation}
              searchQuery={searchQuery}
              selectedCategory={selectedCategory}
              selectedCondition={selectedCondition}
              selectedLocation={selectedLocation}
            />

            {/* Results */}
            <div className="mt-8">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {transformedListings.length > 0 && (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {transformedListings.map((listing) => {
                        const isAccessible = hasAccess(listing.id);
                        if (isAccessible) {
                          return (
                            <ListingCard
                              key={listing.id}
                              listing={listing}
                              showStatus={listing.sellerId === user?.id}
                            />
                          );
                        } else {
                          const requestStatus = getRequestStatus(listing.id) as 'pending' | 'approved' | 'rejected' | undefined;
                          return (
                            <RestrictedListingCard
                              key={listing.id}
                              listing={listing}
                              requestStatus={requestStatus}
                            />
                          );
                        }
                      })}
                    </div>
                  )}

                  {/* Not approved message for unapproved users */}
                  {user && !isApproved && !isAdmin && (
                    <div className="mt-8 rounded-xl border border-warning/20 bg-warning/5 p-6 text-center">
                      <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-warning" />
                      <h3 className="mb-2 font-semibold">Account Pending Approval</h3>
                      <p className="mb-4 text-sm text-muted-foreground">
                        Your account is awaiting admin approval. Once approved, you'll be able to browse and request access to listings.
                      </p>
                      <Button variant="outline" onClick={() => navigate('/pending-approval')}>
                        View Status
                      </Button>
                    </div>
                  )}

                  {transformedListings.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
                      <div className="mb-4 rounded-full bg-muted p-4">
                        <svg className="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <h3 className="mb-1 font-semibold">No listings found</h3>
                      <p className="text-sm text-muted-foreground">
                        {searchQuery || selectedCategory || selectedCondition || selectedLocation
                          ? 'Try adjusting your search or filters'
                          : 'Be the first to list your equipment!'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Request Access Dialog */}
      <Dialog open={requestDialog} onOpenChange={setRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Access</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              You are requesting access to view "{selectedListingForRequest?.title}".
              The admin will be notified and can approve or reject your request.
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
};

export default Index;
