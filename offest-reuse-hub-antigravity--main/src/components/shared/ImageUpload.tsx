/**
 * @file ImageUpload.tsx
 * @description A reusable component for uploading and managing multiple images.
 * 
 * Key Features:
 * - Direct upload to Supabase Storage bucket ('listing-images')
 * - Generates unique filenames and handles file size/type validation
 * - Displays a grid preview of uploaded images with the ability to remove them
 * - Restricts uploads to a specified `maxImages` limit
 */
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Upload, Loader2, ImagePlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ImageUploadProps {
  userId: string;
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
}

const ImageUpload = ({ userId, images, onImagesChange, maxImages = 5 }: ImageUploadProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      toast({
        title: 'Maximum images reached',
        description: `You can only upload up to ${maxImages} images.`,
        variant: 'destructive',
      });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setIsUploading(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of filesToUpload) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast({
            title: 'Invalid file type',
            description: `${file.name} is not an image file.`,
            variant: 'destructive',
          });
          continue;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast({
            title: 'File too large',
            description: `${file.name} exceeds 5MB limit.`,
            variant: 'destructive',
          });
          continue;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast({
            title: 'Upload failed',
            description: `Failed to upload ${file.name}`,
            variant: 'destructive',
          });
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('listing-images')
          .getPublicUrl(fileName);

        uploadedUrls.push(urlData.publicUrl);
      }

      if (uploadedUrls.length > 0) {
        const newImages = [...images, ...uploadedUrls];
        console.log('ImageUpload - Uploading complete, new images array:', newImages);
        onImagesChange(newImages);
        toast({
          title: 'Images uploaded',
          description: `Successfully uploaded ${uploadedUrls.length} image(s).`,
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeImage = (indexToRemove: number) => {
    onImagesChange(images.filter((_, index) => index !== indexToRemove));
  };

  // Debug: Log images whenever they change
  console.log('ImageUpload - Current images:', images);

  return (
    <div className="space-y-4">
      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((url, index) => (
            <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
              <img
                src={url}
                alt={`Upload ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
              {index === 0 && (
                <div className="absolute bottom-2 left-2 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  Cover
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Area */}
      {images.length < maxImages && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-primary hover:bg-muted/50"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          {isUploading ? (
            <>
              <Loader2 className="mb-2 h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium">Uploading...</p>
            </>
          ) : (
            <>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ImagePlus className="h-6 w-6 text-primary" />
              </div>
              <p className="mb-1 text-sm font-medium">Click to upload images</p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG up to 5MB • {images.length}/{maxImages} uploaded
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
