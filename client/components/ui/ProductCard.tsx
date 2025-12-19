"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Star, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import axios from "axios";

// Kategori tipi
export type Category = {
  ID: number;
  name: string;
  slug: string;
  icon: string;
};

export type Product = {
  ID: number;
  name: string;
  price: number;
  code: string;
  stock: number;
  category_id?: number;
  category?: Category;
};

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  /*
  Favori Durumu Kontrolü

  💡 OPTİMİZASYON NOTU:
     Şu an her ProductCard kendi wishlist kontrolünü yapıyor.
     50 ürün = 50 API isteği!

     İdeal Çözüm: React Context ile tek istekte tüm favorileri çek,
     sonra client-side kontrol et. Ama şimdilik bu yapıyı koruyoruz.

  🔇 SESSİZ HATA:
     401 hatası geldiğinde console'a yazmıyoruz.
     Neden? Kullanıcı giriş yapmamışsa her kart için hata görmek kötü UX.
  */
  useEffect(() => {
    const checkFavorite = async () => {
      const userId = localStorage.getItem("user_id");
      const token = localStorage.getItem("token");

      // Token veya UserID yoksa kontrol etme (kalp gri kalır)
      if (!userId || !token) return;

      try {
        const res = await axios.get(`http://localhost:8080/api/wishlist/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const favorites = res.data || [];
        
        // Gelen liste string array olabilir, number'a çevirip kontrol et
        const isInList = favorites.some((id: string | number) => Number(id) === product.ID);
        setIsFavorite(isInList);
      } catch {
        // 401 veya diğer hatalar sessizce geçilir
        // Kullanıcı giriş yapmamış veya token süresi bitmiş olabilir
        setIsFavorite(false);
      }
    };

    checkFavorite();
  }, [product.ID]);

  // 2. Favori Ekle/Çıkar Fonksiyonu
  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const userId = localStorage.getItem("user_id");
    const token = localStorage.getItem("token"); // Token al

    if (!userId || !token) {
      toast.error("Favorilere eklemek için giriş yapın!");
      return;
    }

    setLoading(true);
    try {
      if (isFavorite) {
        // Çıkar (DELETE)
        await axios.delete(`http://localhost:8080/api/wishlist/${userId}`, {
            data: { product_id: product.ID },
            headers: { Authorization: `Bearer ${token}` } // Token Ekle
        });
        toast.success("Favorilerden çıkarıldı");
        setIsFavorite(false);
      } else {
        // Ekle (POST)
        await axios.post(`http://localhost:8080/api/wishlist/${userId}`, {
            product_id: product.ID
        }, {
            headers: { Authorization: `Bearer ${token}` } // Token Ekle
        });
        toast.success("Favorilere eklendi ❤️");
        setIsFavorite(true);
      }
    } catch (err) {
      toast.error("İşlem başarısız");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();

    const userId = localStorage.getItem("user_id");
    const token = localStorage.getItem("token");

    if (!userId || !token) {
        toast.error("Lütfen önce giriş yapın!");
        return;
    }

    try {
        await axios.post(`http://localhost:8080/api/cart/${userId}`, {
            product_id: product.ID,
            quantity: 1
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        // --- SİHİRLİ SATIR (YENİ) ---
        // Tüm uygulamaya "Sepet Güncellendi" olayı yayıyoruz
        window.dispatchEvent(new Event("cart-updated"));

        toast.success(`${product.name} sepete eklendi!`, {
            description: "Alışverişe devam edebilirsiniz.",
            action: {
                label: "Sepete Git",
                onClick: () => window.location.href = "/cart",
            },
        });
    } catch (err) {
        toast.error("Sepete eklenirken hata oluştu.");
    }
  };

  return (
    <Card className="group overflow-hidden border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 rounded-2xl bg-white flex flex-col h-full relative">
      
      {/* FAVORİ BUTONU */}
      <button 
        onClick={toggleFavorite}
        disabled={loading}
        className="absolute top-3 right-3 z-20 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-all active:scale-95"
      >
        <Heart 
            className={`w-5 h-5 transition-colors ${isFavorite ? "fill-red-500 text-red-500" : "text-slate-400 hover:text-red-400"}`} 
        />
      </button>

      {/* RESİM ALANI */}
      <CardContent className="p-0 relative">
        <Link href={`/product/${product.ID}`}>
            <div className="relative h-64 w-full bg-slate-100 overflow-hidden flex items-center justify-center group-hover:bg-slate-50 transition-colors cursor-pointer">
            
            {/* Badge'ler - Sol üst köşede */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
              {/* Kategori Badge */}
              {product.category && (
                <Badge className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700">
                    {product.category.name}
                </Badge>
              )}

              {/* Stok Uyarısı */}
              {product.stock < 5 && product.stock > 0 && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700 shadow-sm">
                      Son {product.stock}!
                  </Badge>
              )}

              {/* Tükendi Badge */}
              {product.stock === 0 && (
                  <Badge variant="destructive" className="bg-red-500 text-white shadow-sm">
                      Tükendi
                  </Badge>
              )}
            </div>

            <img
                src={`https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80&random=${product.ID}`}
                alt={product.name}
                className="object-cover h-full w-full group-hover:scale-110 transition-transform duration-700"
            />
            </div>
        </Link>
      </CardContent>
      
      {/* BİLGİ ALANI */}
      <CardFooter className="flex flex-col items-start p-5 gap-4 mt-auto">
        <div className="w-full">
            <Link href={`/product/${product.ID}`}>
                <h3 className="font-bold text-lg text-slate-800 line-clamp-1 cursor-pointer hover:text-indigo-600 transition-colors">
                    {product.name}
                </h3>
            </Link>

            <div className="flex items-center gap-1 text-sm bg-yellow-50 px-2 py-0.5 rounded text-yellow-700 font-medium w-fit mt-2">
                <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                4.9
            </div>
        </div>

        <div className="flex items-center justify-between w-full pt-4 border-t border-slate-100 mt-2">
          <span className="text-2xl font-bold text-slate-900">{product.price} TL</span>
          <Button 
            onClick={handleAddToCart} 
            disabled={product.stock === 0}
            size="icon" 
            className="rounded-full w-10 h-10 bg-black hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all active:scale-95"
          >
            <ShoppingCart className="w-4 h-4 text-white" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}