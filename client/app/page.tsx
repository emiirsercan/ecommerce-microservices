"use client";

/*
==============================================================================
                         ANA SAYFA - PAGİNATİON DESTEKLİ
==============================================================================

📚 YENİ ÖZELLİKLER:
   - Pagination (sayfalama)
   - Backend'den gelen toplam ürün sayısı
   - Sayfa başına ürün sayısı ayarlanabilir

🏗️ MİMARİ:
   Backend Response:
   {
     "data": [...products],
     "pagination": {
       "current_page": 1,
       "total_pages": 10,
       "total_items": 200,
       ...
     }
   }

   Frontend State:
   - products: Mevcut sayfadaki ürünler
   - currentPage: Şu anki sayfa
   - totalPages: Toplam sayfa sayısı
   - totalItems: Toplam ürün sayısı

==============================================================================
*/

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import ProductCard, { Product } from "@/components/ui/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import CategorySidebar from "@/components/ui/CategorySidebar";
import FilterBar, { FilterOptions } from "@/components/ui/FilterBar";
import Pagination from "@/components/ui/pagination";

// ==============================================================================
// TİP TANIMLARI
// ==============================================================================

/*
PaginationMeta: Backend'den gelen pagination bilgileri

💡 Bu yapı tüm servislerimizde aynı:
   - Product Service
   - Order Service
   - Coupon Service
   - Search Service
*/
type PaginationMeta = {
  current_page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

// ==============================================================================
// ANA COMPONENT
// ==============================================================================

export default function Home() {
  // Ürün State'leri
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Pagination State'leri
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const ITEMS_PER_PAGE = 12; // Sayfa başına ürün (3x4 grid için ideal)

  // Filtre State'leri
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({
    sort: "newest",
    minPrice: "",
    maxPrice: "",
    inStock: false,
  });

  // ==========================================================================
  // VERİ ÇEKME
  // ==========================================================================

  /*
  fetchProducts: Backend'den ürünleri çeker

  💡 YENİ PARAMETRELERİ:
     - page: Hangi sayfa?
     - limit: Sayfa başına kaç ürün?

  Backend artık şunu döner:
  {
    "data": [...],
    "pagination": {
      "current_page": 1,
      "total_pages": 10,
      "total_items": 120
    }
  }
  */
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      // Pagination parametreleri
      params.append("page", currentPage.toString());
      params.append("limit", ITEMS_PER_PAGE.toString());

      // Filtre parametreleri
      if (selectedCategory) {
        params.append("category", selectedCategory.toString());
      }
      if (filters.sort) {
        params.append("sort", filters.sort);
      }
      if (filters.minPrice) {
        params.append("min", filters.minPrice);
      }
      if (filters.maxPrice) {
        params.append("max", filters.maxPrice);
      }
      if (filters.inStock) {
        params.append("stock", "true");
      }

      const url = `http://localhost:8080/api/products?${params.toString()}`;
      const res = await axios.get(url);

      /*
      Backend Response Handling

      💡 Product Service pagination formatı:
         { products: [...], pagination: {...} }
      */
      if (res.data.pagination) {
        // Yeni format (pagination'lı)
        setProducts(res.data.products || []);
        setTotalPages(res.data.pagination.total_pages);
        setTotalItems(res.data.pagination.total_items);
      } else {
        // Eski format (geriye uyumluluk)
        setProducts(Array.isArray(res.data) ? res.data : []);
        setTotalPages(1);
        setTotalItems(Array.isArray(res.data) ? res.data.length : 0);
      }

      setError("");
    } catch (err) {
      console.error(err);
      setError("Ürünler yüklenemedi. Backend servislerini kontrol et.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedCategory, filters]);

  // İlk yükleme ve değişikliklerde çek
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Debounce: Fiyat inputları için (her tuşta istek atmasın)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 500);
    return () => clearTimeout(timer);
  }, [filters.minPrice, filters.maxPrice]);

  /*
  Filtre değiştiğinde sayfa 1'e dön

  💡 Neden?
     Kullanıcı 5. sayfadayken kategori değiştirdi.
     Yeni kategoride belki 3 sayfa var.
     5. sayfa olmayacağı için sayfa 1'e dönmeliyiz.
  */
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, filters.sort, filters.inStock]);

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Sayfanın üstüne scroll
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="container mx-auto px-4 py-10">
        {/* Hero Alanı */}
        <div className="mb-12 text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-slate-900">
            Teknolojiyi <span className="text-indigo-600">Keşfet.</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            En yeni ürünler, en uygun fiyatlarla burada. Mikroservis mimarisiyle güçlendirilmiş alışveriş deneyimi.
          </p>
        </div>

        {/* Ana Layout: Sidebar + Ürünler */}
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Sol Sidebar - Kategoriler */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <div className="sticky top-24">
              <h2 className="text-lg font-bold text-slate-900 mb-4 px-4">
                Kategoriler
              </h2>
              <CategorySidebar
                selectedCategory={selectedCategory}
                onCategoryChange={(id) => setSelectedCategory(id)}
              />
            </div>
          </aside>

          {/* Sağ Taraf - Ürünler */}
          <main className="flex-1">
            {/* Filtre Bar - Toplam ürün sayısı güncellendi */}
            <div className="mb-6">
              <FilterBar
                filters={filters}
                onFilterChange={setFilters}
                totalProducts={totalItems} // Artık gerçek toplam sayı
              />
            </div>

            {/* Hata Mesajı */}
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg text-center border border-red-100 mb-6">
                {error}
              </div>
            )}

            {/* Yükleniyor (Skeleton) */}
            {loading && !error && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {[...Array(ITEMS_PER_PAGE)].map((_, i) => (
                  <div key={i} className="space-y-4">
                    <Skeleton className="h-64 w-full rounded-2xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Ürün Listesi */}
            {!loading && !error && products.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <ProductCard key={product.ID} product={product} />
                  ))}
                </div>

                {/* ============================================================ */}
                {/* PAGİNATİON (YENİ!) */}
                {/* ============================================================ */}
                {totalPages > 1 && (
                  <div className="mt-12 pb-8">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={handlePageChange}
                      showInfo={true}
                    />
                  </div>
                )}
              </>
            )}

            {/* Ürün Bulunamadı */}
            {!loading && !error && products.length === 0 && (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">
                  Ürün Bulunamadı
                </h3>
                <p className="text-slate-500">
                  Arama kriterlerinize uygun ürün bulunamadı. Filtreleri değiştirmeyi deneyin.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
