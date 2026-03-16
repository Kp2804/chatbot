/**
 * @file AdminDashboard.tsx
 * @description The main dashboard for administrators to manage users, listings, and access requests.
 * 
 * Key Features:
 * - Fetches and displays metrics (Total Listings, Pending Requests, Total Users)
 * - Tabs for User Approvals, Listings, Access Requests, Permissions, and Admin Management
 * - Handles approving/rejecting listings and user registrations
 * - Manages granting and revoking access to restricted listings
 * 
 * State Management:
 * - `listings`, `profiles`, `accessRequests`, `listingAccess`, `userRoles`: Store data fetched from Supabase
 * - `isLoading`: Tracks the initial data fetching state
 * - Dialog states (`grantAccessDialog`, `makeAdminDialog`): Control UI modals
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Eye, Clock, Package, Users, LayoutDashboard, Shield, Bell, UserPlus, Lock, UserCheck, Trash2, Activity, UserCog, KeyRound, ListChecks, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { categoryLabels, conditionLabels } from '@/types/listing';

interface Listing {
  id: string;
  title: string;
  category: string;
  condition: string;
  description: string | null;
  images: string[] | null;
  location: string | null;
  price: number | null;
  status: string;
  user_id: string;
  created_at: string;
  admin_notes: string | null;
}

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  is_approved: boolean;
  is_rejected?: boolean;
  created_at: string;
}

interface AccessRequest {
  id: string;
  listing_id: string;
  user_id: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  listing?: Listing;
  profile?: Profile;
}

interface ListingAccess {
  id: string;
  listing_id: string;
  user_id: string;
  granted_by: string;
  created_at: string;
  listing?: Listing;
  profile?: Profile;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: Profile;
}

const AdminDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, isAdmin, isLoading: loading } = useAuth();

  const [listings, setListings] = useState<Listing[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [listingAccess, setListingAccess] = useState<ListingAccess[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  const [grantAccessDialog, setGrantAccessDialog] = useState(false);
  const [selectedUserForAccess, setSelectedUserForAccess] = useState('');
  const [selectedListingForAccess, setSelectedListingForAccess] = useState('');

  const [listingToDelete, setListingToDelete] = useState<Listing | null>(null);

  // Removed redundant redirect to prevent flickering during data updates.
  // Security is handled by ProtectedRoute in App.tsx.
  /*
  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/');
    }
  }, [loading, isAdmin, navigate]);
  */

  useEffect(() => {
    if (isAdmin) {
      fetchAllData();
    }
  }, [isAdmin]);

  const fetchAllData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchListings(),
      fetchProfiles(),
      fetchAccessRequests(),
      fetchListingAccess(),
      fetchUserRoles(),
    ]);
    setIsLoading(false);
  };

  const fetchListings = async () => {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setListings(data);
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .rpc('get_active_profiles');
    if (!error && data) setProfiles(data as unknown as Profile[]);
  };

  const fetchAccessRequests = async () => {
    const { data, error } = await supabase
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setAccessRequests(data);
  };

  const fetchListingAccess = async () => {
    const { data, error } = await supabase
      .from('listing_access')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setListingAccess(data);
  };

  const fetchUserRoles = async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('*');
    if (!error && data) setUserRoles(data);
  };

  const getProfile = (userId: string) => profiles.find(p => p.id === userId);
  const getListing = (listingId: string) => listings.find(l => l.id === listingId);
  const isUserAdmin = (userId: string) => userRoles.some(r => r.user_id === userId && r.role === 'admin');

  const pendingListings = listings.filter((l) => l.status === 'pending');
  const approvedListings = listings.filter((l) => l.status === 'approved');
  const rejectedListings = listings.filter((l) => l.status === 'rejected');
  const pendingRequests = accessRequests.filter((r) => r.status === 'pending');
  const pendingUsers = profiles.filter((p) => !p.is_approved && !p.is_rejected && !isUserAdmin(p.id));

  const handleListingAction = async () => {
    if (!selectedListing || !actionType) return;

    const { error } = await supabase
      .from('listings')
      .update({
        status: actionType === 'approve' ? 'approved' : 'rejected',
        admin_notes: adminNotes || null
      })
      .eq('id', selectedListing.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: actionType === 'approve' ? 'Listing Approved' : 'Listing Rejected',
        description: `"${selectedListing.title}" has been ${actionType === 'approve' ? 'approved' : 'rejected'}.`,
      });
      fetchListings();
    }

    setSelectedListing(null);
    setAdminNotes('');
    setActionType(null);
  };

  const handleAccessRequest = async (requestId: string, approve: boolean) => {
    const request = accessRequests.find(r => r.id === requestId);
    if (!request) return;

    if (approve) {
      // Grant access
      const { error: accessError } = await supabase
        .from('listing_access')
        .insert({
          listing_id: request.listing_id,
          user_id: request.user_id,
          granted_by: user?.id
        });

      if (accessError) {
        toast({ title: 'Error', description: accessError.message, variant: 'destructive' });
        return;
      }
    }

    // Update request status
    const { error } = await supabase
      .from('access_requests')
      .update({ status: approve ? 'approved' : 'rejected' })
      .eq('id', requestId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: approve ? 'Access Granted' : 'Request Rejected',
        description: approve ? 'User can now view the listing.' : 'Access request has been rejected.',
      });
      fetchAccessRequests();
      fetchListingAccess();
    }
  };

  const handleGrantAccess = async () => {
    if (!selectedUserForAccess || !selectedListingForAccess) return;

    const { error } = await supabase
      .from('listing_access')
      .insert({
        listing_id: selectedListingForAccess,
        user_id: selectedUserForAccess,
        granted_by: user?.id
      });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Access Granted', description: 'User can now view the listing.' });
      fetchListingAccess();
    }

    setGrantAccessDialog(false);
    setSelectedUserForAccess('');
    setSelectedListingForAccess('');
  };

  const handleRevokeAccess = async (accessId: string) => {
    const { error } = await supabase
      .from('listing_access')
      .delete()
      .eq('id', accessId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Access Revoked', description: 'User can no longer view this listing.' });
      fetchListingAccess();
    }
  };

  const handleToggleUserAccess = async (userId: string, currentIsApproved: boolean) => {
    const newStatus = !currentIsApproved;

    // If unlocking, we clear the subscription end date to prevent auto-expiry
    const updates: any = { is_approved: newStatus };
    if (newStatus) {
      updates.subscription_end_date = null;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: newStatus ? 'User Unlocked' : 'User Locked',
        description: `User access has been ${newStatus ? 'restored' : 'revoked'}.`
      });
      fetchProfiles();
    }
  };

  const handleApproveUser = async (userId: string) => {
    // Calculate 1 year from now
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    const { error } = await supabase
      .from('profiles')
      .update({
        is_approved: true,
        subscription_end_date: oneYearFromNow.toISOString()
      })
      .eq('id', userId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'User Approved', description: 'User approved for 1 year membership.' });
      fetchProfiles();
    }
  };

  const handleRejectUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_rejected: true, is_approved: false })
      .eq('id', userId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'User Rejected', description: 'User has been blocked from logging in.' });
      fetchProfiles();
    }
  };

  const handleViewListing = (listing: Listing) => {
    navigate(`/listing/${listing.id}`);
  };

  const handleDeleteListing = (listing: Listing) => {
    setListingToDelete(listing);
  };

  const confirmDeleteListing = async () => {
    if (!listingToDelete) return;
    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', listingToDelete.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Listing Deleted', description: `"${listingToDelete.title}" has been permanently removed.` });
      fetchListings();
    }
    setListingToDelete(null);
  };

  const openActionDialog = (listing: Listing, type: 'approve' | 'reject') => {
    setSelectedListing(listing);
    setActionType(type);
    setAdminNotes('');
  };

  if (loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar isLoggedIn={!!user} userName={user?.user_metadata?.full_name || 'Admin'} userRole="admin" />

      <main className="flex-1 py-8">
        <div className="container">
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage listings, users, and access permissions</p>
          </div>

          {/* Stats */}
          <div className="mb-8 grid gap-4 sm:grid-cols-5">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{listings.length}</div>
                  <div className="text-sm text-muted-foreground">Total Listings</div>
                </div>
              </div>
            </div>
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
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Bell className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{pendingRequests.length}</div>
                  <div className="text-sm text-muted-foreground">Access Requests</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <Users className="h-5 w-5 text-success" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{profiles.length}</div>
                  <div className="text-sm text-muted-foreground">Total Users</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                  <Shield className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{userRoles.filter(r => r.role === 'admin').length}</div>
                  <div className="text-sm text-muted-foreground">Admins</div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Tabs */}
          <Tabs defaultValue="user-approvals" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="user-approvals" className="gap-2">
                <UserCheck className="h-4 w-4" />
                User Approvals ({pendingUsers.length})
              </TabsTrigger>
              <TabsTrigger value="listings" className="gap-2">
                <Package className="h-4 w-4" />
                Listings
              </TabsTrigger>
              <TabsTrigger value="access-requests" className="gap-2">
                <Bell className="h-4 w-4" />
                Access Requests ({pendingRequests.length})
              </TabsTrigger>
              <TabsTrigger value="permissions" className="gap-2">
                <Lock className="h-4 w-4" />
                Permissions
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-2">
                <Activity className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            {/* User Approvals Tab */}
            <TabsContent value="user-approvals">
              {pendingUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
                  <UserCheck className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-1 font-semibold">No pending approvals</h3>
                  <p className="text-sm text-muted-foreground">New user registrations will appear here for approval</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Registered</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingUsers.map((profile) => (
                        <TableRow key={profile.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{profile.full_name || 'Unknown'}</div>
                              <div className="text-sm text-muted-foreground">{profile.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-muted-foreground">{profile.company || '-'}</span>
                          </TableCell>
                          <TableCell>{new Date(profile.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApproveUser(profile.id)}
                              >
                                <CheckCircle className="mr-1 h-4 w-4" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRejectUser(profile.id)}
                              >
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Listings Tab */}
            <TabsContent value="listings">
              <Tabs defaultValue="pending" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="pending">Pending ({pendingListings.length})</TabsTrigger>
                  <TabsTrigger value="approved">Approved ({approvedListings.length})</TabsTrigger>
                  <TabsTrigger value="rejected">Rejected ({rejectedListings.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                  <ListingsTable
                    listings={pendingListings}
                    profiles={profiles}
                    showActions
                    onApprove={(l) => openActionDialog(l, 'approve')}
                    onReject={(l) => openActionDialog(l, 'reject')}
                    onView={handleViewListing}
                    onDelete={handleDeleteListing}
                    emptyTitle="All Caught Up!"
                    emptyMessage="Great job! There are no pending listings to review."
                  />
                </TabsContent>
                <TabsContent value="approved">
                  <ListingsTable listings={approvedListings} profiles={profiles} onView={handleViewListing} onDelete={handleDeleteListing} />
                </TabsContent>
                <TabsContent value="rejected">
                  <ListingsTable listings={rejectedListings} profiles={profiles} showNotes onView={handleViewListing} onDelete={handleDeleteListing} />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Access Requests Tab */}
            <TabsContent value="access-requests">
              {pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
                  <Bell className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-1 font-semibold">No pending requests</h3>
                  <p className="text-sm text-muted-foreground">Access requests from users will appear here</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Listing</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((request) => {
                        const profile = getProfile(request.user_id);
                        const listing = getListing(request.listing_id);
                        return (
                          <TableRow key={request.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{profile?.full_name || 'Unknown'}</div>
                                <div className="text-sm text-muted-foreground">{profile?.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{listing?.title || 'Unknown Listing'}</div>
                            </TableCell>
                            <TableCell>{new Date(request.created_at).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleAccessRequest(request.id, true)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleAccessRequest(request.id, false)}
                                >
                                  Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Permissions Tab */}
            <TabsContent value="permissions">
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Listings Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.filter((profile) => !profile.is_rejected).map((profile) => {
                      const userListingsCount = listings.filter(l => l.user_id === profile.id).length;
                      const isLocked = !profile.is_approved;
                      const isAdmin = isUserAdmin(profile.id);

                      return (
                        <TableRow key={profile.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{profile.full_name || 'Unknown'}</div>
                              <div className="text-sm text-muted-foreground">{profile.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {userListingsCount}
                          </TableCell>
                          <TableCell>
                            {isLocked ? (
                              <Badge variant="destructive">Locked</Badge>
                            ) : (
                              <Badge className="bg-green-600 hover:bg-green-700">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!isAdmin && (
                              <Button
                                size="sm"
                                variant={isLocked ? "default" : "destructive"}
                                onClick={() => handleToggleUserAccess(profile.id, profile.is_approved)}
                              >
                                {isLocked ? (
                                  <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Unlock
                                  </>
                                ) : (
                                  <>
                                    <Lock className="mr-2 h-4 w-4" />
                                    Lock
                                  </>
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity">
              <ActivityFeed
                profiles={profiles}
                listings={listings}
                accessRequests={accessRequests}
                listingAccess={listingAccess}
                getProfile={getProfile}
                getListing={getListing}
              />
            </TabsContent>

          </Tabs>
        </div>
      </main>

      {/* Listing Action Dialog */}
      <Dialog open={!!selectedListing && !!actionType} onOpenChange={() => setSelectedListing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Listing' : 'Reject Listing'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <h4 className="font-medium">{selectedListing?.title}</h4>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Admin Notes {actionType === 'reject' && '(required)'}
              </label>
              <Textarea
                placeholder={actionType === 'approve'
                  ? 'Optional notes...'
                  : 'Reason for rejection...'}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedListing(null)}>Cancel</Button>
            <Button
              variant={actionType === 'approve' ? 'default' : 'destructive'}
              onClick={handleListingAction}
              disabled={actionType === 'reject' && !adminNotes.trim()}
            >
              {actionType === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant Access Dialog */}
      <Dialog open={grantAccessDialog} onOpenChange={setGrantAccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Listing Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select User</label>
              <Select value={selectedUserForAccess} onValueChange={setSelectedUserForAccess}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Listing</label>
              <Select value={selectedListingForAccess} onValueChange={setSelectedListingForAccess}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a listing" />
                </SelectTrigger>
                <SelectContent>
                  {approvedListings.map((listing) => (
                    <SelectItem key={listing.id} value={listing.id}>
                      {listing.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantAccessDialog(false)}>Cancel</Button>
            <Button onClick={handleGrantAccess} disabled={!selectedUserForAccess || !selectedListingForAccess}>
              Grant Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />

      {/* Delete listing confirmation */}
      <AlertDialog open={!!listingToDelete} onOpenChange={(open) => { if (!open) setListingToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Listing</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete &quot;{listingToDelete?.title}&quot;? This cannot be undone and will remove all associated access records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteListing}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface ListingsTableProps {
  listings: Listing[];
  showActions?: boolean;
  showNotes?: boolean;
  onApprove?: (listing: Listing) => void;
  onReject?: (listing: Listing) => void;
  onView?: (listing: Listing) => void;
  onDelete?: (listing: Listing) => void;
  emptyTitle?: string;
  emptyMessage?: string;
  profiles?: Profile[];
}

const ListingsTable = ({
  listings,
  showActions,
  showNotes,
  onApprove,
  onReject,
  onView,
  onDelete,
  emptyTitle = "No listings",
  emptyMessage = "No listings in this category",
  profiles = []
}: ListingsTableProps) => {
  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
        <Package className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-1 font-semibold">{emptyTitle}</h3>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Listing</TableHead>
            <TableHead>Seller</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead>Date</TableHead>
            {showNotes && <TableHead>Notes</TableHead>}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.map((listing) => (
            <TableRow key={listing.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-lg bg-muted">
                    <img
                      src={listing.images?.[0] || '/placeholder.svg'}
                      alt={listing.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="font-medium">{listing.title}</div>
                    <div className="text-sm text-muted-foreground">{listing.location}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm font-medium">
                  {profiles.find(p => p.id === listing.user_id)?.full_name || 'Unknown'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {profiles.find(p => p.id === listing.user_id)?.email}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {categoryLabels[listing.category as keyof typeof categoryLabels] || listing.category}
                </Badge>
              </TableCell>
              <TableCell>
                {conditionLabels[listing.condition as keyof typeof conditionLabels] || listing.condition}
              </TableCell>
              <TableCell>{new Date(listing.created_at).toLocaleDateString()}</TableCell>
              {showNotes && (
                <TableCell>
                  <span className="text-sm text-muted-foreground">{listing.admin_notes || '-'}</span>
                </TableCell>
              )}
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onView?.(listing)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDelete?.(listing)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {showActions && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-success hover:bg-success/10 hover:text-success"
                        onClick={() => onApprove?.(listing)}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onReject?.(listing)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AdminDashboard;

// ─── Activity Feed ────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  profiles: Profile[];
  listings: Listing[];
  accessRequests: AccessRequest[];
  listingAccess: ListingAccess[];
  getProfile: (id: string) => Profile | undefined;
  getListing: (id: string) => Listing | undefined;
}

interface ActivityEvent {
  id: string;
  timestamp: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  detail: string;
}

const ActivityFeed = ({ profiles, listings, accessRequests, listingAccess, getProfile, getListing }: ActivityFeedProps) => {
  const events: ActivityEvent[] = [];

  // New user registrations
  profiles.forEach((p) => {
    events.push({
      id: `reg-${p.id}`,
      timestamp: p.created_at,
      icon: <UserPlus className="h-4 w-4" />,
      iconBg: 'bg-blue-500/10 text-blue-500',
      title: 'New user registered',
      detail: `${p.full_name || 'Unknown'} (${p.email})${p.company ? ` — ${p.company}` : ''} signed up and is awaiting approval.`,
    });
  });

  // Listing submitted for review
  listings.forEach((l) => {
    const submitter = getProfile(l.user_id);
    events.push({
      id: `listing-created-${l.id}`,
      timestamp: l.created_at,
      icon: <ListChecks className="h-4 w-4" />,
      iconBg: 'bg-purple-500/10 text-purple-500',
      title: 'Listing submitted for review',
      detail: `"${l.title}" was submitted by ${submitter?.full_name || submitter?.email || 'a user'} and is ${l.status === 'pending' ? 'awaiting review' : l.status}.`,
    });
  });

  // Listing approved
  listings
    .filter((l) => l.status === 'approved')
    .forEach((l) => {
      events.push({
        id: `listing-approved-${l.id}`,
        timestamp: l.created_at,
        icon: <CheckCircle className="h-4 w-4" />,
        iconBg: 'bg-green-500/10 text-green-500',
        title: 'Listing approved',
        detail: `"${l.title}" was approved and is now visible on the marketplace.`,
      });
    });

  // Listing rejected
  listings
    .filter((l) => l.status === 'rejected')
    .forEach((l) => {
      events.push({
        id: `listing-rejected-${l.id}`,
        timestamp: l.created_at,
        icon: <AlertCircle className="h-4 w-4" />,
        iconBg: 'bg-red-500/10 text-red-500',
        title: 'Listing rejected',
        detail: `"${l.title}" was rejected${l.admin_notes ? `: "${l.admin_notes}"` : '.'}`,
      });
    });

  // Access requested for a restricted listing
  accessRequests.forEach((r) => {
    const requester = getProfile(r.user_id);
    const listing = getListing(r.listing_id);
    events.push({
      id: `access-request-${r.id}`,
      timestamp: r.created_at,
      icon: <KeyRound className="h-4 w-4" />,
      iconBg: 'bg-yellow-500/10 text-yellow-500',
      title: `Access requested — ${r.status === 'pending' ? 'awaiting decision' : r.status}`,
      detail: `${requester?.full_name || requester?.email || 'A user'} requested access to "${listing?.title || 'a listing'}".`,
    });
  });

  // Access granted
  listingAccess.forEach((a) => {
    const grantedTo = getProfile(a.user_id);
    const listing = getListing(a.listing_id);
    events.push({
      id: `access-granted-${a.id}`,
      timestamp: a.created_at,
      icon: <UserCog className="h-4 w-4" />,
      iconBg: 'bg-teal-500/10 text-teal-500',
      title: 'Access granted to listing',
      detail: `${grantedTo?.full_name || grantedTo?.email || 'A user'} was granted access to "${listing?.title || 'a listing'}".`,
    });
  });

  // Sort newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
        <Activity className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-1 font-semibold">No activity yet</h3>
        <p className="text-sm text-muted-foreground">Events will appear here as things happen on the platform</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {events.map((event, idx) => (
        <div key={event.id} className="flex gap-4 rounded-lg px-2 py-3 hover:bg-muted/40 transition-colors">
          {/* Timeline line + icon */}
          <div className="flex flex-col items-center">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${event.iconBg}`}>
              {event.icon}
            </div>
            {idx < events.length - 1 && (
              <div className="mt-1 w-px flex-1 bg-border" />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 pt-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{event.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(event.timestamp).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">{event.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
