"use client";

/*
==============================================================================
                    PAGİNATİON COMPONENT
==============================================================================

💡 Bu component nedir?

   Uzun listeleri sayfalara bölen ve sayfalar arası gezinmeyi sağlayan
   yeniden kullanılabilir (reusable) bir UI component'i.

🎯 Kullanım Alanları:
   - Ana sayfa ürün listesi
   - Arama sonuçları
   - Admin siparişler
   - Admin kuponlar
   - Profil siparişlerim

📝 Kullanım Örneği:
   <Pagination
     currentPage={1}
     totalPages={10}
     onPageChange={(page) => setPage(page)}
   />

🏗️ Tasarım Kararları:

   1. KONTROLLÜ COMPONENT (Controlled Component)
      - State dışarıdan yönetiliyor (currentPage prop)
      - Sayfa değişince onPageChange callback'i çağrılıyor
      - Parent component state'i güncelliyor

   2. NEDEN BU YAPI?
      - Yeniden kullanılabilirlik (her listede kullanılabilir)
      - Test edilebilirlik (state dışarıda)
      - Esneklik (URL query param ile de çalışabilir)

==============================================================================
*/

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

// ==============================================================================
// TİP TANIMLARI
// ==============================================================================

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  showInfo?: boolean; // "Sayfa 1/10" göster
}

// ==============================================================================
// ANA COMPONENT
// ==============================================================================

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className = "",
  showInfo = true,
}: PaginationProps) {
  /*
  Sayfa değiştirme fonksiyonu

  💡 Boundary kontrolü:
     - page < 1 → 1'e git
     - page > totalPages → totalPages'e git

  Bu sayede butona basılsa bile geçersiz sayfaya gidilmez.
  */
  const goToPage = (page: number) => {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    if (page !== currentPage) {
      onPageChange(page);
    }
  };

  /*
  Görünür sayfa numaralarını hesapla

  💡 Mantık:
     - Her zaman mevcut sayfanın etrafında 2 sayfa göster
     - İlk ve son sayfa her zaman görünür
     - Arada boşluk varsa "..." göster

  Örnek (currentPage=5, totalPages=10):
     [1] ... [3] [4] [5] [6] [7] ... [10]

  Örnek (currentPage=1, totalPages=10):
     [1] [2] [3] ... [10]
  */
  const getVisiblePages = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const delta = 2; // Mevcut sayfanın her iki yanında kaç sayfa gösterilecek

    // Toplam sayfa 7 veya daha azsa hepsini göster
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    // İlk sayfa her zaman
    pages.push(1);

    // Mevcut sayfanın etrafı
    const rangeStart = Math.max(2, currentPage - delta);
    const rangeEnd = Math.min(totalPages - 1, currentPage + delta);

    // İlk sayfa ile range arasında boşluk varsa "..." ekle
    if (rangeStart > 2) {
      pages.push("...");
    }

    // Range içindeki sayfalar
    for (let i = rangeStart; i <= rangeEnd; i++) {
      pages.push(i);
    }

    // Range ile son sayfa arasında boşluk varsa "..." ekle
    if (rangeEnd < totalPages - 1) {
      pages.push("...");
    }

    // Son sayfa her zaman
    pages.push(totalPages);

    return pages;
  };

  // Sayfa yoksa veya 1 sayfaysa pagination gösterme
  if (totalPages <= 1) {
    return null;
  }

  const visiblePages = getVisiblePages();

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 ${className}`}>
      {/* Sayfa Bilgisi */}
      {showInfo && (
        <span className="text-sm text-slate-500">
          Sayfa {currentPage} / {totalPages}
        </span>
      )}

      {/* Navigation Butonları */}
      <div className="flex items-center gap-1">
        {/* İlk Sayfa */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          className="h-9 w-9"
          title="İlk sayfa"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        {/* Önceki Sayfa */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-9 w-9"
          title="Önceki sayfa"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Sayfa Numaraları */}
        <div className="flex items-center gap-1 mx-2">
          {visiblePages.map((page, index) => {
            if (page === "...") {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 text-slate-400"
                >
                  ...
                </span>
              );
            }

            const pageNum = page as number;
            const isActive = pageNum === currentPage;

            return (
              <Button
                key={pageNum}
                variant={isActive ? "default" : "outline"}
                size="icon"
                onClick={() => goToPage(pageNum)}
                className={`h-9 w-9 ${
                  isActive
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "hover:bg-slate-100"
                }`}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>

        {/* Sonraki Sayfa */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-9 w-9"
          title="Sonraki sayfa"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Son Sayfa */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className="h-9 w-9"
          title="Son sayfa"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

