/**
 * @file ListingForm.tsx
 * @description A comprehensive form for creating and editing equipment listings.
 * 
 * Key Features:
 * - Collects title, price, category, condition, description, location, contact details
 * - Integrates with `ImageUpload` component for managing attached photos
 * - Reusable for both "Create New" and "Edit Existing" workflows via `initialData`
 * 
 * Note: Data submission logic is handled by the parent component via the `onSubmit` prop.
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import ImageUpload from '@/components/shared/ImageUpload';
import type { Database } from '@/integrations/supabase/types';

type ListingCategory = Database['public']['Enums']['listing_category'];
type ListingCondition = Database['public']['Enums']['listing_condition'];

const categoryLabels: Record<ListingCategory, string> = {
  printing_press: 'Printing Press',
  finishing_equipment: 'Finishing Equipment',
  prepress: 'Prepress',
  spare_parts: 'Spare Parts',
  accessories: 'Accessories',
  other: 'Other',
};

const conditionLabels: Record<ListingCondition, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  for_parts: 'For Parts',
};

export interface ListingFormData {
  title: string;
  price: string;
  category: ListingCategory | '';
  condition: ListingCondition | '';
  description: string;
  location: string;
  contactEmail: string;
  contactPhone: string;
  images: string[];
}

interface ListingFormProps {
  userId: string;
  initialData?: ListingFormData;
  onSubmit: (data: ListingFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
}

const ListingForm = ({
  userId,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = 'Submit',
}: ListingFormProps) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [price, setPrice] = useState(initialData?.price || '');
  const [category, setCategory] = useState<ListingCategory | ''>(initialData?.category || '');
  const [condition, setCondition] = useState<ListingCondition | ''>(initialData?.condition || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [location, setLocation] = useState(initialData?.location || '');
  const [contactEmail, setContactEmail] = useState(initialData?.contactEmail || '');
  const [contactPhone, setContactPhone] = useState(initialData?.contactPhone || '');
  const [images, setImages] = useState<string[]>(initialData?.images || []);

  // useEffect removed to prevent state reset on parent re-renders.
  // Component instance should be recreated by parent using a key prop when data changes.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !condition) return;

    await onSubmit({
      title,
      price,
      category,
      condition,
      description,
      location,
      contactEmail,
      contactPhone,
      images,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            placeholder="e.g., Heidelberg Speedmaster XL 106"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Price (₹)</Label>
          <Input
            id="price"
            type="number"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Category *</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ListingCategory)} required>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Condition *</Label>
          <Select value={condition} onValueChange={(v) => setCondition(v as ListingCondition)} required>
            <SelectTrigger>
              <SelectValue placeholder="Select condition" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(conditionLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          placeholder="Describe the equipment, its history, and condition..."
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Location *</Label>
        <Input
          id="location"
          placeholder="e.g., Ahmedabad, Gujarat"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contactEmail">Contact Email *</Label>
          <Input
            id="contactEmail"
            type="email"
            placeholder="you@example.com"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactPhone">Contact Phone</Label>
          <Input
            id="contactPhone"
            type="tel"
            placeholder="+91 98250 60276"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Images</Label>
        <ImageUpload userId={userId} images={images} onImagesChange={setImages} maxImages={5} />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
};

export default ListingForm;
