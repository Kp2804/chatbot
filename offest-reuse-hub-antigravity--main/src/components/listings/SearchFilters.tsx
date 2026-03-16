/**
 * @file SearchFilters.tsx
 * @description UI component for filtering the marketplace inventory.
 * 
 * Key Features:
 * - Provides a text search bar for queries
 * - Includes a collapsible filter panel for Category, Condition, and Location
 * - Calls parent handler functions on each change to update standard filter state natively
 */
import { Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { categoryLabels, conditionLabels } from '@/types/listing';
import { useState } from 'react';

interface SearchFiltersProps {
  onSearch: (query: string) => void;
  onCategoryChange: (category: string) => void;
  onConditionChange: (condition: string) => void;
  onLocationChange: (location: string) => void;
  searchQuery: string;
  selectedCategory: string;
  selectedCondition: string;
  selectedLocation: string;
}

const SearchFilters = ({
  onSearch,
  onCategoryChange,
  onConditionChange,
  onLocationChange,
  searchQuery,
  selectedCategory,
  selectedCondition,
  selectedLocation,
}: SearchFiltersProps) => {
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = selectedCategory || selectedCondition || selectedLocation;

  const clearFilters = () => {
    onCategoryChange('');
    onConditionChange('');
    onLocationChange('');
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search machines, parts, accessories..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant={showFilters ? 'secondary' : 'outline'}
          onClick={() => setShowFilters(!showFilters)}
          className="shrink-0"
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {[selectedCategory, selectedCondition, selectedLocation].filter(Boolean).length}
            </span>
          )}
        </Button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="animate-fade-in rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[180px] flex-1">
              <label className="mb-1.5 block text-sm font-medium">Category</label>
              <Select value={selectedCategory} onValueChange={onCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px] flex-1">
              <label className="mb-1.5 block text-sm font-medium">Condition</label>
              <Select value={selectedCondition} onValueChange={onConditionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Condition</SelectItem>
                  {Object.entries(conditionLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px] flex-1">
              <label className="mb-1.5 block text-sm font-medium">Location</label>
              <Input
                placeholder="Enter city or state..."
                value={selectedLocation}
                onChange={(e) => onLocationChange(e.target.value)}
              />
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchFilters;
