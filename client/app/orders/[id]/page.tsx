"use client";

/*
==============================================================================
                         SİPARİŞ DETAY SAYFASI
==============================================================================

📚 BU SAYFA NE YAPAR?
   - Tek bir siparişin tüm detaylarını gösterir
   - Sipariş durumu timeline'ı gösterir
   - Siparişteki ürünleri listeler
   - Kupon ve fiyat bilgilerini gösterir

🏗️ MİMARİ KARARLAR:

   1. DYNAMIC ROUTE: [id]
      Next.js'te köşeli parantez dynamic segment demek.
      /orders/123 → id = "123"
      /orders/456 → id = "456"

      useParams() hook'u ile bu değeri alırız.

   2. SERVER vs CLIENT COMPONENT:
      "use client" → Client Component
      Neden? useParams, useState, useEffect kullanıyoruz.

      Server Component olsaydı:
      export default function Page({ params }) { ... }
      params.id ile direkt alırdık.

   3. TIMELINE PATTERN:
      Sipariş durumunu görsel olarak göstermek için.
      Aktif adım → Renkli
      Tamamlanan adımlar → Yeşil tik
      Bekleyen adımlar → Gri

==============================================================================
*/

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Package,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  ArrowLeft,
  MapPin,
  Tag,
  CreditCard,
  Calendar,
  Loader2,
  ShoppingBag
} from "lucide-react";

// ==============================================================================
// TİP TANIMLARI
// ==============================================================================

type OrderItem = {
  ID: number;
  product_id: number;
  product_name: string;
  product_image: string;
  unit_price: number;
  quantity: number;
  sub_total: number;
};

type Order = {
  ID: number;
  user_id: number;
  sub_total: number;
  coupon_code: string;
  coupon_discount: number;
  total_price: number;
  status: string;
  shipping_address: string;
  CreatedAt: string;
  UpdatedAt: string;
  items: OrderItem[];
};

// ==============================================================================
// DURUM ADIMLARI (Timeline için)
// ==============================================================================

/*
STATUS_STEPS: Sipariş durumu akışı

Her adım bir nesne:
- key: Backend'deki durum değeri
- label: Kullanıcıya gösterilecek metin
- icon: Lucide icon component'i

Sıralama önemli! Timeline bu sıraya göre çizilir.
*/
const STATUS_STEPS = [
  { key: "Hazırlanıyor", label: "Hazırlanıyor", icon: Clock },
  { key: "Kargolandı", label: "Kargoya Verildi", icon: Truck },
  { key: "Teslim Edildi", label: "Teslim Edildi", icon: CheckCircle },
];

// ==============================================================================
// ANA COMPONENT
// ==============================================================================

export default function OrderDetailPage() {
  /*
  useParams(): Next.js App Router hook'u
  URL'deki dynamic segment'leri alır.

  /orders/[id]/page.tsx → useParams() = { id: "123" }
  */
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // ==========================================================================
  // VERİ ÇEKME
  // ==========================================================================

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      try {
        const res = await axios.get(`http://localhost:8080/api/orders/${orderId}`);
        setOrder(res.data);
      } catch (err) {
        console.error(err);
        toast.error("Sipariş bulunamadı");
        router.push("/profile");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, router]);

  // ==========================================================================
  // YARDIMCI FONKSİYONLAR
  // ==========================================================================

  /*
  getStatusIndex: Mevcut durumun timeline'daki index'ini döner

  Örnek:
  - "Hazırlanıyor" → 0
  - "Kargolandı" → 1
  - "Teslim Edildi" → 2
  - "İptal Edildi" → -1 (timeline'da yok)
  */
  const getStatusIndex = (status: string) => {
    return STATUS_STEPS.findIndex(step => step.key === status);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Hazırlanıyor": return "bg-amber-100 text-amber-700 border-amber-200";
      case "Kargolandı": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Teslim Edildi": return "bg-green-100 text-green-700 border-green-200";
      case "İptal Edildi": return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="ml-3 text-slate-600">Sipariş yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="text-center py-20">
          <Package className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h2 className="text-xl font-semibold text-slate-700">Sipariş Bulunamadı</h2>
          <Button onClick={() => router.push("/profile")} className="mt-4">
            Profile Dön
          </Button>
        </div>
      </div>
    );
  }

  const currentStatusIndex = getStatusIndex(order.status);
  const isCancelled = order.status === "İptal Edildi";

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      {/* ================================================================== */}
      {/* HEADER */}
      {/* ================================================================== */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            Sipariş #{order.ID}
          </h1>
          <p className="text-slate-500 flex items-center gap-2 mt-1">
            <Calendar className="w-4 h-4" />
            {formatDate(order.CreatedAt)}
          </p>
        </div>
        <Badge className={`text-sm px-4 py-2 ${getStatusColor(order.status)}`}>
          {order.status}
        </Badge>
      </div>

      {/* ================================================================== */}
      {/* DURUM TİMELINE */}
      {/* ================================================================== */}
      {!isCancelled && (
        <Card className="p-6 mb-6">
          <h2 className="font-semibold mb-6 flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Sipariş Durumu
          </h2>

          {/*
          Timeline Render Mantığı:

          Her adım için:
          1. index < currentStatusIndex → Tamamlandı (yeşil)
          2. index === currentStatusIndex → Aktif (mavi)
          3. index > currentStatusIndex → Bekliyor (gri)

          Çizgi de aynı mantıkla renklenir.
          */}
          <div className="flex items-center justify-between relative">
            {/* Arka plan çizgisi */}
            <div className="absolute top-6 left-0 right-0 h-1 bg-slate-200 -z-10" />
            
            {STATUS_STEPS.map((step, index) => {
              const isCompleted = index < currentStatusIndex;
              const isCurrent = index === currentStatusIndex;
              const IconComponent = step.icon;

              return (
                <div key={step.key} className="flex flex-col items-center z-10">
                  {/* İkon Dairesi */}
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      isCompleted
                        ? "bg-green-500 text-white"
                        : isCurrent
                        ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                        : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : (
                      <IconComponent className="w-6 h-6" />
                    )}
                  </div>

                  {/* Etiket */}
                  <span
                    className={`mt-3 text-sm font-medium ${
                      isCompleted || isCurrent ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>

                  {/* Tamamlanma işareti */}
                  {isCompleted && (
                    <span className="text-xs text-green-600 mt-1">Tamamlandı</span>
                  )}
                  {isCurrent && (
                    <span className="text-xs text-indigo-600 mt-1">Mevcut</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* İptal Edildi Uyarısı */}
      {isCancelled && (
        <Card className="p-6 mb-6 bg-red-50 border-red-200">
          <div className="flex items-center gap-3">
            <XCircle className="w-8 h-8 text-red-500" />
            <div>
              <h3 className="font-semibold text-red-800">Sipariş İptal Edildi</h3>
              <p className="text-sm text-red-600">
                Bu sipariş iptal edilmiştir. Ödeme iadesi 3-5 iş günü içinde yapılacaktır.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ================================================================ */}
        {/* SOL: ÜRÜNLER */}
        {/* ================================================================ */}
        <div className="md:col-span-2">
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Sipariş Ürünleri ({order.items?.length || 0})
            </h2>

            <div className="space-y-4">
              {order.items?.map((item) => (
                <div
                  key={item.ID}
                  className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  {/* Ürün Resmi */}
                  <div className="w-20 h-20 bg-white rounded-lg overflow-hidden border">
                    <img
                      src={
                        item.product_image ||
                        `https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=100&q=80`
                      }
                      alt={item.product_name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Ürün Bilgisi */}
                  <div className="flex-1">
                    <h3 className="font-medium text-slate-900">
                      {item.product_name || `Ürün #${item.product_id}`}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Birim Fiyat: {item.unit_price?.toLocaleString("tr-TR")} ₺
                    </p>
                    <p className="text-sm text-slate-500">
                      Adet: {item.quantity}
                    </p>
                  </div>

                  {/* Fiyat */}
                  <div className="text-right">
                    <p className="font-semibold text-lg text-slate-900">
                      {item.sub_total?.toLocaleString("tr-TR")} ₺
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ================================================================ */}
        {/* SAĞ: ÖZET */}
        {/* ================================================================ */}
        <div className="space-y-4">
          {/* Fiyat Özeti */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Ödeme Özeti
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Ara Toplam</span>
                <span>{order.sub_total?.toLocaleString("tr-TR")} ₺</span>
              </div>

              {order.coupon_discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Kupon ({order.coupon_code})
                  </span>
                  <span>-{order.coupon_discount.toLocaleString("tr-TR")} ₺</span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Kargo</span>
                <span className="text-green-600">Ücretsiz</span>
              </div>

              <div className="border-t pt-3 flex justify-between font-semibold text-lg">
                <span>Toplam</span>
                <span className="text-indigo-600">
                  {order.total_price.toLocaleString("tr-TR")} ₺
                </span>
              </div>
            </div>
          </Card>

          {/* Teslimat Adresi */}
          {order.shipping_address && (
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Teslimat Adresi
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {order.shipping_address}
              </p>
            </Card>
          )}

          {/* Aksiyonlar */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/profile")}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Siparişlerime Dön
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

