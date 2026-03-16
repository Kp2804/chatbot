/**
 * @file RestrictedListingCard.tsx
 * @description A modified listing card for unauthorized users to preview restricted inventory.
 * 
 * Key Features:
 * - Blurs the primary image and shows a lock icon
 * - Hides sensitive details like price and full description
 * - Displays the user's current request status (Pending, Denied, or a prompt to request access)
 */
import { Badge } from '@/components/ui/badge';
import { Lock, Clock, XCircle, ChevronRight } from 'lucide-react';
import { categoryLabels } from '@/types/listing';
import { Link } from 'react-router-dom';

interface RestrictedListingCardProps {
  listing: {
    id: string;
    title: string;
    category: string;
    condition: string;
    images: string[] | null;
    created_at: string;
  };
  requestStatus?: 'pending' | 'approved' | 'rejected' | null;
}

const RestrictedListingCard = ({ listing, requestStatus }: RestrictedListingCardProps) => {
  return (
    <Link
      to={`/listing/${listing.id}`}
      className="group relative block overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50"
    >
      {/* Blurred Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={listing.images?.[0] || '/placeholder.svg'}
          alt="Restricted listing"
          className="h-full w-full object-cover blur-lg scale-110"
        />
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

        {/* Category badge - visible */}
        <div className="absolute left-3 top-3 z-10">
          <Badge variant="category">
            {categoryLabels[listing.category as keyof typeof categoryLabels] || listing.category}
          </Badge>
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-background/80 p-4 transition-transform group-hover:scale-110">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Content - Limited Info */}
      <div className="p-4">
        <h3 className="mb-2 font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {listing.title}
        </h3>

        <p className="mb-4 text-sm text-muted-foreground">
          Restricted Listing
        </p>

        {/* Request Status / Action */}
        {requestStatus === 'pending' ? (
          <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
            <Clock className="h-4 w-4 text-warning" />
            <span className="text-warning">Request Pending</span>
          </div>
        ) : requestStatus === 'rejected' ? (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-destructive">Access Denied</span>
          </div>
        ) : (
          <div className="flex items-center text-sm text-primary font-medium">
            View Details to Request
            <ChevronRight className="ml-1 h-3 w-3" />
          </div>
        )}
      </div>
    </Link>
  );
};

export default RestrictedListingCard;
