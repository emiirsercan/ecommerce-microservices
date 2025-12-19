"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import ProductCard, { Product } from "@/components/ui/ProductCard"; // Kartı yeniden kullanıyoruz
import { HeartCrack, Loader2 } from "lucide-react";

export default function FavoritesList() {
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFavorites = async () => {
      const userId = localStorage.getItem("user_id");
      const token = localStorage.getItem("token");

      if (!userId || !token) return;

      try {
        // 1. Önce ID Listesini Çek (Redis)
        const resIds = await axios.get(`http://localhost:8080/api/wishlist/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const productIds: string[] = resIds.data; // ["101", "102"]

        if (productIds.length === 0) {
            setLoading(false);
            return;
        }

        // 2. Her ID için Ürün Detayını Çek (Postgres)
        // Promise.all ile tüm istekleri paralel atıyoruz (Hızlı olsun diye)
        const productPromises = productIds.map(id => 
            axios.get(`http://localhost:8080/api/products/${id}`)
        );

        const responses = await Promise.all(productPromises);
        
        // Gelen verileri al
        const productsData = responses.map(res => res.data);
        setFavorites(productsData);

      } catch (err) {
        console.error("Favoriler yüklenemedi", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, []);

  if (loading) {
    return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;
  }

  if (favorites.length === 0) {
    return (
        <div className="text-center py-10 border-2 border-dashed rounded-xl bg-slate-50">
            <HeartCrack className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 font-medium">Henüz favori ürününüz yok.</p>
        </div>
    );
  }

  return (
    <div>
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            Favori Ürünlerim 
            <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full">
                {favorites.length}
            </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((product) => (
                <ProductCard key={product.ID} product={product} />
            ))}
        </div>
    </div>
  );
}