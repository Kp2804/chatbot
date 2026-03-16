/**
 * @file SellerDashboard.tsx
 * @description The dashboard for sellers (verified users) to manage their equipment listings.
 * 
 * Key Features:
 * - Displays all listings created by the authenticated user
 * - Tabs to filter by status (Pending, Approved, Rejected)
 * - Allows creating, editing, and deleting listings using the `ListingForm` component
 * 
 * State Management:
 * - `listings`: Array of user's listings fetched from Supabase
 * - `isCreateDialogOpen`, `isEditDialogOpen`: Controls modal visibility
 * - `editingListing`: Stores the listing currently being edited
 * - `isSubmitting`: Tracks form submission state to prevent double clicks
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import ListingForm, { ListingFormData } from '@/components/listings/ListingForm';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Package, Clock, CheckCircle, XCircle, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { categoryLabels, conditionLabels } from '@/types/listing';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

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
  updated_at: string;
}

const SellerDashboard = () => {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchMyListings();
    }
  }, [user]);

  const fetchMyListings = async () => {
    if (!user) return;

    setIsLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching listings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your listings.',
        variant: 'destructive',
      });
    } else {
      setListings((data as Listing[]) || []);
    }
    setIsLoading(false);
  };

  const handleCreate = async (data: ListingFormData) => {
    if (!user || !data.category || !data.condition) return;

    setIsSubmitting(true);

    const { error } = await supabase.from('listings').insert({
      user_id: user.id,
      title: data.title,
      price: data.price ? parseFloat(data.price) : null,
      category: data.category,
      condition: data.condition,
      description: data.description,
      location: data.location,
      contact_email: data.contactEmail,
      contact_phone: data.contactPhone || null,
      images: data.images.length > 0 ? data.images : null,
      status: 'pending',
    });

    setIsSubmitting(false);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setIsCreateDialogOpen(false);
      fetchMyListings();
      toast({
        title: 'Listing Submitted',
        description: 'Your listing has been submitted for admin review.',
      });
    }
  };

  const handleEdit = async (data: ListingFormData) => {
    if (!editingListing || !data.category || !data.condition) return;

    setIsSubmitting(true);

    const { error } = await supabase
      .from('listings')
      .update({
        title: data.title,
        price: data.price ? parseFloat(data.price) : null,
        category: data.category,
        condition: data.condition,
        description: data.description,
        location: data.location,
        contact_email: data.contactEmail,
        contact_phone: data.contactPhone || null,
        images: data.images.length > 0 ? data.images : null,
        status: 'pending', // Re-submit for review after edit
      })
      .eq('id', editingListing.id)
      .eq('user_id', user.id);

    setIsSubmitting(false);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setIsEditDialogOpen(false);
      setEditingListing(null);
      fetchMyListings();
      toast({
        title: 'Listing Updated',
        description: 'Your listing has been updated and resubmitted for review.',
      });
    }
  };

  const handleDelete = async (listingId: string) => {
    const { error } = await supabase.from('listings').delete().eq('id', listingId).eq('user_id', user!.id);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      fetchMyListings();
      toast({
        title: 'Listing Deleted',
        description: 'Your listing has been removed.',
      });
    }
  };

  const openEditDialog = (listing: Listing) => {
    setEditingListing(listing);
    setIsEditDialogOpen(true);
  };

  const getEditFormData = (listing: Listing): ListingFormData => ({
    title: listing.title,
    price: listing.price?.toString() || '',
    category: listing.category,
    condition: listing.condition,
    description: listing.description || '',
    location: listing.location || '',
    contactEmail: listing.contact_email || '',
    contactPhone: listing.contact_phone || '',
    images: listing.images || [],
  });

  const pendingListings = listings.filter((l) => l.status === 'pending');
  const approvedListings = listings.filter((l) => l.status === 'approved');
  const rejectedListings = listings.filter((l) => l.status === 'rejected');

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        isLoggedIn={!!user}
        userName={user.user_metadata?.full_name || user.email?.split('@')[0]}
        userRole={isAdmin ? 'admin' : 'seller'}
      />

      <main className="flex-1 py-8">
        <div className="container">
          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold">My Listings</h1>
              <p className="text-muted-foreground">Manage your equipment listings</p>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Listing
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Listing</DialogTitle>
                </DialogHeader>
                <ListingForm
                  key={isCreateDialogOpen ? 'create' : 'closed'}
                  userId={user.id}
                  initialData={{
                    title: '',
                    price: '',
                    category: '',
                    condition: '',
                    description: '',
                    location: '',
                    contactEmail: user.email || '',
                    contactPhone: '',
                    images: [],
                  }}
                  onSubmit={handleCreate}
                  onCancel={() => setIsCreateDialogOpen(false)}
                  isSubmitting={isSubmitting}
                  submitLabel="Submit for Review"
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Edit Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Listing</DialogTitle>
              </DialogHeader>
              {editingListing && (
                <ListingForm
                  key={`edit-${editingListing.id}`}
                  userId={user.id}
                  initialData={getEditFormData(editingListing)}
                  onSubmit={handleEdit}
                  onCancel={() => {
                    setIsEditDialogOpen(false);
                    setEditingListing(null);
                  }}
                  isSubmitting={isSubmitting}
                  submitLabel="Save Changes"
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Stats */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{pendingListings.length}</div>
                  <div className="text-sm text-muted-foreground">Pending Review</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{approvedListings.length}</div>
                  <div className="text-sm text-muted-foreground">Live Listings</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{rejectedListings.length}</div>
                  <div className="text-sm text-muted-foreground">Rejected</div>
                </div>
              </div>
            </div>
          </div>

          {/* Listings Tabs */}
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="all">All ({listings.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({pendingListings.length})</TabsTrigger>
              <TabsTrigger value="approved">Approved ({approvedListings.length})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({rejectedListings.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <ListingsGrid
                listings={listings}
                isLoading={isLoading}
                onEdit={openEditDialog}
                onDelete={handleDelete}
              />
            </TabsContent>
            <TabsContent value="pending">
              <ListingsGrid
                listings={pendingListings}
                isLoading={isLoading}
                onEdit={openEditDialog}
                onDelete={handleDelete}
              />
            </TabsContent>
            <TabsContent value="approved">
              <ListingsGrid
                listings={approvedListings}
                isLoading={isLoading}
                onEdit={openEditDialog}
                onDelete={handleDelete}
              />
            </TabsContent>
            <TabsContent value="rejected">
              <ListingsGrid
                listings={rejectedListings}
                isLoading={isLoading}
                emptyMessage="No rejected listings"
                onEdit={openEditDialog}
                onDelete={handleDelete}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
};

interface ListingsGridProps {
  listings: Listing[];
  isLoading?: boolean;
  emptyMessage?: string;
  onEdit: (listing: Listing) => void;
  onDelete: (listingId: string) => void;
}

const ListingsGrid = ({
  listings,
  isLoading,
  emptyMessage = 'No listings yet',
  onEdit,
  onDelete,
}: ListingsGridProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
        <Package className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-1 font-semibold">{emptyMessage}</h3>
        <p className="text-sm text-muted-foreground">Create a new listing to get started</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <ListingCardWithActions
          key={listing.id}
          listing={listing}
          onEdit={() => onEdit(listing)}
          onDelete={() => onDelete(listing.id)}
        />
      ))}
    </div>
  );
};

interface ListingCardWithActionsProps {
  listing: Listing;
  onEdit: () => void;
  onDelete: () => void;
}

const ListingCardWithActions = ({ listing, onEdit, onDelete }: ListingCardWithActionsProps) => {
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card">
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={listing.images?.[0] || '/placeholder.svg'}
          alt={listing.title}
          className="h-full w-full object-cover"
        />
        <div className="absolute right-3 top-3">
          <Badge
            variant={
              listing.status === 'approved'
                ? 'approved'
                : listing.status === 'pending'
                  ? 'pending'
                  : 'rejected'
            }
          >
            {listing.status === 'approved' ? 'Live' : listing.status === 'pending' ? 'Pending' : 'Rejected'}
          </Badge>
        </div>
        <div className="absolute left-3 top-3">
          <Badge variant="category">{categoryLabels[listing.category]}</Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="mb-2 line-clamp-2 font-semibold leading-tight">{listing.title}</h3>

        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
            {conditionLabels[listing.condition]}
          </span>
          {listing.location && <span>{listing.location}</span>}
        </div>

        {listing.price && (
          <div className="mb-4 text-lg font-bold">₹{listing.price.toLocaleString('en-IN')}</div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive hover:text-destructive-foreground">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Listing</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{listing.title}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

export default SellerDashboard;
