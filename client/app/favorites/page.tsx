"use client";

import FavoritesList from "@/components/ui/FavoriteList";
import { Heart } from "lucide-react";

export default function FavoritesPage() {
  return (
    <div className="container mx-auto px-4 py-10 min-h-screen">
      <div className="flex items-center gap-3 mb-8 border-b pb-4">
        <div className="p-3 bg-red-100 rounded-full">
            <Heart className="w-6 h-6 text-red-600 fill-red-600" />
        </div>
        <div>
            <h1 className="text-3xl font-bold text-slate-900">Favorilerim</h1>
            <p className="text-slate-500 text-sm">Beğendiğiniz ürünler burada saklanır.</p>
        </div>
      </div>
      
      <FavoritesList />
    </div>
  );
}