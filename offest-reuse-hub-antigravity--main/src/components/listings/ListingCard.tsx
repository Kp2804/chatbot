/**
 * @file ListingCard.tsx
 * @description Renders a summary card for a specific equipment listing.
 * 
 * Key Features:
 * - Displays the primary image, title, condition, category, location, and price
 * - Handles optional rendering of the listing's approval status badge
 * - Links directly to the detailed listing page
 */
import { Listing, categoryLabels, conditionLabels } from '@/types/listing';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ListingCardProps {
  listing: Listing;
  showStatus?: boolean;
}

const ListingCard = ({ listing, showStatus = false }: ListingCardProps) => {
  return (
    <Link
      to={`/listing/${listing.id}`}
      className="group block overflow-hidden rounded-xl border border-border bg-card card-hover"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={listing.images[0]}
          alt={listing.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {showStatus && (
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
        )}
        <div className="absolute left-3 top-3">
          <Badge variant="category">{categoryLabels[listing.category]}</Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
            {listing.title}
          </h3>
        </div>

        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
            {conditionLabels[listing.condition]}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {listing.location}
          </span>
        </div>

        <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
          {listing.description}
        </p>

        {listing.price && (
          <div className="text-lg font-bold text-foreground">
            ₹{listing.price.toLocaleString('en-IN')}
          </div>
        )}
      </div>
    </Link>
  );
};

export default ListingCard;
