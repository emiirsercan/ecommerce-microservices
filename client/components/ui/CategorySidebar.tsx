"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { cn } from "@/lib/utils";
import { 
  Laptop, 
  Smartphone, 
  Monitor, 
  Headphones, 
  Watch, 
  Gamepad2,
  LayoutGrid,
  ChevronRight
} from "lucide-react";

// İkon mapping'i
const iconMap: { [key: string]: React.ReactNode } = {
  laptop: <Laptop className="w-4 h-4" />,
  smartphone: <Smartphone className="w-4 h-4" />,
  monitor: <Monitor className="w-4 h-4" />,
  headphones: <Headphones className="w-4 h-4" />,
  watch: <Watch className="w-4 h-4" />,
  "gamepad-2": <Gamepad2 className="w-4 h-4" />,
};

export type Category = {
  ID: number;
  name: string;
  slug: string;
  icon: string;
  parent_id: number | null;
};

type CategorySidebarProps = {
  selectedCategory: number | null;
  onCategoryChange: (categoryId: number | null) => void;
};

export default function CategorySidebar({ 
  selectedCategory, 
  onCategoryChange 
}: CategorySidebarProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await axios.get("http://localhost:8080/api/categories");
        setCategories(res.data || []);
      } catch (err) {
        console.error("Kategoriler yüklenemedi:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Tüm Ürünler */}
      <button
        onClick={() => onCategoryChange(null)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200",
          selectedCategory === null
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
            : "hover:bg-slate-100 text-slate-700"
        )}
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="font-medium">Tüm Ürünler</span>
        {selectedCategory === null && (
          <ChevronRight className="w-4 h-4 ml-auto" />
        )}
      </button>

      {/* Kategoriler */}
      {categories.map((category) => (
        <button
          key={category.ID}
          onClick={() => onCategoryChange(category.ID)}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200",
            selectedCategory === category.ID
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
              : "hover:bg-slate-100 text-slate-700"
          )}
        >
          {iconMap[category.icon] || <LayoutGrid className="w-4 h-4" />}
          <span className="font-medium">{category.name}</span>
          {selectedCategory === category.ID && (
            <ChevronRight className="w-4 h-4 ml-auto" />
          )}
        </button>
      ))}
    </div>
  );
}

