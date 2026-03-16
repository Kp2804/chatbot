/**
 * @file listing.ts
 * @description Global TypeScript definitions and constants for listings.
 * 
 * Key Features:
 * - Defines core data interfaces (`Listing`, `User`)
 * - Provides standardized string options (`ListingCategory`, `ListingCondition`)
 * - Exports label mapping objects for UI rendering (e.g., `categoryLabels`)
 */
export type ListingStatus = 'pending' | 'approved' | 'rejected';

export type ListingCategory =
  | 'printing_press'
  | 'finishing_equipment'
  | 'prepress'
  | 'spare_parts'
  | 'accessories'
  | 'other';

export type ListingCondition = 'excellent' | 'good' | 'fair' | 'for_parts';

export interface Listing {
  id: string;
  title: string;
  category: ListingCategory;
  condition: ListingCondition;
  description: string;
  images: string[];
  location: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  price?: number;
  status: ListingStatus;
  sellerId: string;
  sellerName: string;
  createdAt: string;
  updatedAt: string;
  adminNotes?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'seller' | 'viewer';
  isVerified: boolean;
  createdAt: Date;
}

export const categoryLabels: Record<ListingCategory, string> = {
  printing_press: 'Printing Press',
  finishing_equipment: 'Finishing Equipment',
  prepress: 'Prepress',
  spare_parts: 'Spare Parts',
  accessories: 'Accessories',
  other: 'Other',
};

export const conditionLabels: Record<ListingCondition, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  for_parts: 'For Parts',
};

export const statusLabels: Record<ListingStatus, string> = {
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};
