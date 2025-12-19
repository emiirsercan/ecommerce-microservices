"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlidersHorizontal, X } from "lucide-react";

export type FilterOptions = {
  sort: string;
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
};

type FilterBarProps = {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  totalProducts: number;
};

export default function FilterBar({ 
  filters, 
  onFilterChange, 
  totalProducts 
}: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  const handleSortChange = (value: string) => {
    onFilterChange({ ...filters, sort: value });
  };

  const handleMinPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, minPrice: e.target.value });
  };

  const handleMaxPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, maxPrice: e.target.value });
  };

  const handleStockChange = () => {
    onFilterChange({ ...filters, inStock: !filters.inStock });
  };

  const clearFilters = () => {
    onFilterChange({
      sort: "newest",
      minPrice: "",
      maxPrice: "",
      inStock: false,
    });
  };

  const hasActiveFilters = filters.minPrice || filters.maxPrice || filters.inStock;

  return (
    <div className="space-y-4">
      {/* Üst Bar: Sonuç sayısı + Sıralama */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{totalProducts}</span> ürün bulundu
          </p>
          
          {/* Filtre Toggle (Mobile) */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden"
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filtrele
          </Button>
        </div>

        {/* Sıralama */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Sırala:</span>
          <Select value={filters.sort} onValueChange={handleSortChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sıralama seç" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">En Yeniler</SelectItem>
              <SelectItem value="oldest">En Eskiler</SelectItem>
              <SelectItem value="price_asc">Fiyat (Düşük → Yüksek)</SelectItem>
              <SelectItem value="price_desc">Fiyat (Yüksek → Düşük)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filtre Paneli (Desktop her zaman, Mobile toggle) */}
      <div className={`${showFilters ? 'block' : 'hidden'} sm:block`}>
        <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-50 rounded-xl">
          {/* Fiyat Aralığı */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 whitespace-nowrap">Fiyat:</span>
            <Input
              type="number"
              placeholder="Min"
              value={filters.minPrice}
              onChange={handleMinPriceChange}
              className="w-24 h-9"
            />
            <span className="text-slate-400">-</span>
            <Input
              type="number"
              placeholder="Max"
              value={filters.maxPrice}
              onChange={handleMaxPriceChange}
              className="w-24 h-9"
            />
          </div>

          {/* Stokta Var */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.inStock}
              onChange={handleStockChange}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700">Sadece Stokta Olanlar</span>
          </label>

          {/* Filtreleri Temizle */}
          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="w-4 h-4 mr-1" />
              Temizle
            </Button>
          )}
        </div>
      </div>

      {/* Aktif Filtre Chip'leri */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.minPrice && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">
              Min: {filters.minPrice} TL
              <button onClick={() => onFilterChange({ ...filters, minPrice: "" })}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.maxPrice && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">
              Max: {filters.maxPrice} TL
              <button onClick={() => onFilterChange({ ...filters, maxPrice: "" })}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.inStock && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
              Stokta Var
              <button onClick={handleStockChange}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

