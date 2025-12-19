"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import ProductCard, { Product } from "@/components/ui/ProductCard"; 
import { Skeleton } from "@/components/ui/skeleton";
import { SearchX, Search, Clock, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Son aramalar için key
const RECENT_SEARCHES_KEY = "recent_searches";

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";

  const [products, setProducts] = useState<Product[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Son aramaları yükle
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (e) {}
  }, []);

  // Arama yap
  useEffect(() => {
    const searchProducts = async () => {
      if (!query) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        const res = await axios.get(`http://localhost:8080/api/search?q=${encodeURIComponent(query)}`);
        
        // Search Service response formatı: { products: [...], pagination: {...} }
        const data = res.data;
        const rawList = Array.isArray(data.products) ? data.products : [];
        
        const mappedProducts: Product[] = rawList.map((item: any) => ({
            ID: item.id || item.ID || 0,
            name: item.name || item.Name || "İsimsiz Ürün",
            price: item.price || item.Price || 0,
            code: item.code || "N/A",
            stock: item.stock || item.Stock || 10,
            category_id: item.category_id,
            category: item.category
        }));

        setProducts(mappedProducts);
        // Pagination formatından total_items al
        setTotalResults(data.pagination?.total_items || mappedProducts.length);
      } catch (err) {
        console.error("Arama hatası:", err);
        setProducts([]);
        setTotalResults(0);
      } finally {
        setLoading(false);
      }
    };

    searchProducts();
  }, [query]);

  // Son aramayı sil
  const removeRecentSearch = (term: string) => {
    const filtered = recentSearches.filter(s => s !== term);
    setRecentSearches(filtered);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(filtered));
  };

  // Tüm son aramaları temizle
  const clearAllRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  // Arama yap
  const performSearch = (term: string) => {
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  // Query yoksa son aramaları göster
  if (!query) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="text-center mb-10">
          <Search className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Ürün Ara</h1>
          <p className="text-slate-500">Aradığınız ürünü bulmak için yukarıdaki arama çubuğunu kullanın.</p>
        </div>

        {/* Son Aramalar */}
        {recentSearches.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-400" />
                Son Aramalarınız
              </h2>
              <Button variant="ghost" size="sm" onClick={clearAllRecentSearches} className="text-slate-500 hover:text-red-500">
                Tümünü Temizle
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((term, i) => (
                <Badge 
                  key={i} 
                  variant="secondary" 
                  className="px-4 py-2 text-sm cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 transition-colors group"
                  onClick={() => performSearch(term)}
                >
                  {term}
                  <button 
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); removeRecentSearch(term); }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      {/* Üst Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.back()}
            className="rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              "{query}" <span className="font-normal text-slate-500">için sonuçlar</span>
            </h1>
            {!loading && (
              <p className="text-sm text-slate-500 mt-1">
                {totalResults > 0 ? (
                  <>{totalResults} ürün bulundu</>
                ) : (
                  <>Sonuç bulunamadı</>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Yükleniyor */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        // Sonuç Yok
        <div className="flex flex-col items-center justify-center py-20">
          <SearchX className="w-24 h-24 mb-6 text-slate-200" />
          <h2 className="text-2xl font-bold text-slate-700 mb-2">Sonuç Bulunamadı</h2>
          <p className="text-slate-500 mb-6 text-center max-w-md">
            "{query}" ile eşleşen ürün bulunamadı. Farklı anahtar kelimeler deneyebilir veya kategorilere göz atabilirsiniz.
          </p>
          <div className="flex gap-4">
            <Button variant="outline" onClick={() => router.push("/")}>
              Ana Sayfaya Dön
            </Button>
          </div>

          {/* Önerilen Son Aramalar */}
          {recentSearches.length > 0 && (
            <div className="mt-10">
              <p className="text-sm text-slate-400 mb-3">Bunları da deneyebilirsiniz:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {recentSearches.slice(0, 3).map((term, i) => (
                  <Badge 
                    key={i} 
                    variant="secondary" 
                    className="px-4 py-2 cursor-pointer hover:bg-indigo-100"
                    onClick={() => performSearch(term)}
                  >
                    {term}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Ürün Listesi
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.ID} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

// Suspense ile sarmalayarak useSearchParams'ı güvenli kullanıyoruz
export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
