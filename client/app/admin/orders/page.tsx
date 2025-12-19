"use client";

/*
==============================================================================
                    ADMIN SİPARİŞ YÖNETİMİ SAYFASI
==============================================================================

📚 BU SAYFA NE YAPAR?
   - TÜM siparişleri listeler (artık sadece kendi siparişlerimiz değil!)
   - Sipariş durumunu günceller
   - Sipariş detaylarını gösterir (ürünler, kupon, adres)
   - Filtreleme ve arama imkanı sunar

🏗️ MİMARİ KARARLAR:

   1. NEDEN "/api/orders" (user_id olmadan)?
      Önceki: /api/orders/${userId} → Sadece o kullanıcının siparişleri
      Yeni:   /api/orders            → TÜM siparişler

      Admin tüm siparişleri görmeli!

   2. NEDEN "Preload" ile Items geliyor?
      Backend'de Preload("Items") kullandık.
      Tek istekle hem sipariş hem ürünler geliyor.
      N+1 problemi yok!

   3. EXPAND/COLLAPSE Pattern:
      Her satırın altında detay gösteriyoruz.
      Neden modal değil? 
      - Daha hızlı UX
      - Karşılaştırma yapılabilir
      - Mobile-friendly

==============================================================================
*/

import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  Package, 
  Truck, 
  CheckCircle, 
  Clock, 
  XCircle,
  ChevronDown,
  ChevronUp,
  Search,
  Tag,
  MapPin,
  User,
  Calendar,
  Loader2,
  TrendingUp,
  DollarSign,
  ShoppingBag
} from "lucide-react";
import Pagination from "@/components/ui/pagination";

// ==============================================================================
// TİP TANIMLARI
// ==============================================================================

/*
TypeScript'te tip tanımlamanın önemi:

1. Otomatik tamamlama (IntelliSense)
2. Derleme zamanı hata kontrolü
3. Dokümantasyon görevi görür
4. Refactoring'i kolaylaştırır

Backend'den gelen veri yapısıyla AYNI olmalı!
*/

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
  sub_total: number;         // Kupon öncesi
  coupon_code: string;       // Kullanılan kupon
  coupon_discount: number;   // İndirim tutarı
  total_price: number;       // Kupon sonrası
  status: string;
  shipping_address: string;
  CreatedAt: string;
  items: OrderItem[];        // İlişkili ürünler
};

type OrderStats = {
  total_orders: number;
  total_revenue: number;
  total_discount: number;
  today_orders: number;
};

// ==============================================================================
// ANA COMPONENT
// ==============================================================================

export default function AdminOrdersPage() {
  // State'ler
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  
  // Pagination State'leri
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const ITEMS_PER_PAGE = 20;
  
  // Filtreleme
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // ==========================================================================
  // VERİ ÇEKME
  // ==========================================================================

  useEffect(() => {
    fetchOrders();
    fetchStats();
  }, [currentPage, statusFilter]);

  /*
  fetchOrders: TÜM siparişleri çeker - PAGİNATİON DESTEKLİ

  💡 YENİ:
     - page ve limit parametreleri
     - status filtresi backend'e gönderiliyor
     - Backend pagination response döndürüyor
  */
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", currentPage.toString());
      params.append("limit", ITEMS_PER_PAGE.toString());
      
      // Durum filtresi backend'e gönder
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      const res = await axios.get(`http://localhost:8080/api/orders?${params.toString()}`);
      
      // Order Service pagination formatı: { orders: [...], pagination: {...} }
      if (res.data.pagination) {
        setOrders(res.data.orders || []);
        setTotalPages(res.data.pagination.total_pages);
        setTotalItems(res.data.pagination.total_items);
      } else {
        // Geriye uyumluluk (eski format)
        setOrders(Array.isArray(res.data) ? res.data : []);
        setTotalPages(1);
        setTotalItems(Array.isArray(res.data) ? res.data.length : 0);
      }
    } catch (err) {
      console.error(err);
      toast.error("Siparişler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get("http://localhost:8080/api/orders/stats");
      setStats(res.data);
    } catch (err) {
      console.error("Stats çekilemedi:", err);
    }
  };

  // ==========================================================================
  // DURUM GÜNCELLEME
  // ==========================================================================

  /*
  updateStatus: Sipariş durumunu günceller

  💡 Optimistic UI nedir?
     1. Önce UI'ı güncelle (hızlı feedback)
     2. Sonra backend'e istek at
     3. Hata olursa geri al

  Burada klasik yaklaşım kullanıyoruz:
     1. Backend'e istek at
     2. Başarılıysa UI'ı güncelle

  Neden? Sipariş durumu kritik, yanlış gösterim kabul edilemez.
  */
  const updateStatus = async (orderId: number, newStatus: string) => {
    try {
      await axios.patch(`http://localhost:8080/api/orders/${orderId}/status`, {
        status: newStatus
      });
      
      // UI'ı güncelle
      setOrders(prev => prev.map(o => 
        o.ID === orderId ? { ...o, status: newStatus } : o
      ));

      toast.success(`Sipariş #${orderId} → ${newStatus}`);
    } catch (err) {
      console.error(err);
      toast.error("Güncelleme başarısız");
    }
  };

  // ==========================================================================
  // YARDIMCI FONKSİYONLAR
  // ==========================================================================

  /*
  getStatusBadge: Duruma göre renkli badge döner

  💡 Switch vs Object Map:
     Switch daha okunabilir ama uzun.
     Object map daha kısa ama karmaşık badge'ler için uygun değil.

  const statusMap = {
    "Hazırlanıyor": { color: "secondary", icon: Clock },
    ...
  }
  */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Hazırlanıyor":
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
            <Clock className="w-3 h-3 mr-1" /> Hazırlanıyor
          </Badge>
        );
      case "Kargolandı":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            <Truck className="w-3 h-3 mr-1" /> Kargolandı
          </Badge>
        );
      case "Teslim Edildi":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" /> Teslim Edildi
          </Badge>
        );
      case "İptal Edildi":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            <XCircle className="w-3 h-3 mr-1" /> İptal Edildi
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  /*
  formatDate: Tarihi Türkçe formata çevirir

  toLocaleDateString parametreleri:
  - "tr-TR": Türkçe locale
  - options: Gün, ay, yıl formatı
  */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // ==========================================================================
  // FİLTRELEME (Client-side - sadece arama için)
  // ==========================================================================

  /*
  filteredOrders: Arama filtresine göre siparişleri filtreler

  💡 Durum filtresi artık backend'de yapılıyor (pagination ile uyumlu)
     Arama hâlâ client-side (mevcut sayfadaki siparişlerde)

  NOT: Full-text search için backend'e taşınabilir
  */
  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      order.ID.toString().includes(search) ||
      order.user_id.toString().includes(search) ||
      order.coupon_code?.toLowerCase().includes(search)
    );
  });

  // Sayfa değiştiğinde
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Filtre değiştiğinde sayfa 1'e dön
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3">Siparişler yükleniyor...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sipariş Yönetimi</h1>
          <p className="text-slate-500 mt-1">
            Tüm siparişleri görüntüle ve yönet
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {totalItems} Sipariş
        </Badge>
      </div>

      {/* ================================================================== */}
      {/* İSTATİSTİK KARTLARI */}
      {/* ================================================================== */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <ShoppingBag className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Toplam Sipariş</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total_orders}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-green-50 to-white border-green-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Toplam Gelir</p>
                <p className="text-2xl font-bold text-slate-900">
                  {stats.total_revenue.toLocaleString("tr-TR")} ₺
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-amber-50 to-white border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Tag className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Kupon İndirimleri</p>
                <p className="text-2xl font-bold text-slate-900">
                  {stats.total_discount.toLocaleString("tr-TR")} ₺
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-purple-50 to-white border-purple-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Bugünkü Sipariş</p>
                <p className="text-2xl font-bold text-slate-900">{stats.today_orders}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ================================================================== */}
      {/* FİLTRELER */}
      {/* ================================================================== */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Sipariş ID, Kullanıcı ID veya Kupon ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Durum Filtrele" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Durumlar</SelectItem>
            <SelectItem value="Hazırlanıyor">Hazırlanıyor</SelectItem>
            <SelectItem value="Kargolandı">Kargolandı</SelectItem>
            <SelectItem value="Teslim Edildi">Teslim Edildi</SelectItem>
            <SelectItem value="İptal Edildi">İptal Edildi</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ================================================================== */}
      {/* SİPARİŞ TABLOSU */}
      {/* ================================================================== */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-12"></TableHead>
              <TableHead>Sipariş</TableHead>
              <TableHead>Müşteri</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead>Tutar</TableHead>
              <TableHead>Kupon</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  Sipariş bulunamadı
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <React.Fragment key={order.ID}>
                  {/* Ana Satır */}
                  <TableRow 
                    className={`hover:bg-slate-50 cursor-pointer ${
                      expandedOrder === order.ID ? "bg-indigo-50" : ""
                    }`}
                    onClick={() => setExpandedOrder(
                      expandedOrder === order.ID ? null : order.ID
                    )}
                  >
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        {expandedOrder === order.ID ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-semibold text-indigo-600">
                        #{order.ID}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                          <User className="w-4 h-4 text-slate-500" />
                        </div>
                        <span>Kullanıcı #{order.user_id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {formatDate(order.CreatedAt)}
                    </TableCell>
                    <TableCell>
                      <div>
                        {order.coupon_discount > 0 && (
                          <span className="text-xs text-slate-400 line-through block">
                            {order.sub_total?.toLocaleString("tr-TR")} ₺
                          </span>
                        )}
                        <span className="font-semibold">
                          {order.total_price.toLocaleString("tr-TR")} ₺
                        </span>
                      </div>
                </TableCell>
                <TableCell>
                      {order.coupon_code ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <Tag className="w-3 h-3 mr-1" />
                          {order.coupon_code}
                          <span className="ml-1 text-xs">
                            (-{order.coupon_discount} ₺)
                          </span>
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {getStatusBadge(order.status)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select 
                    defaultValue={order.status} 
                    onValueChange={(val) => updateStatus(order.ID, val)}
                  >
                        <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Durum Seç" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Hazırlanıyor">Hazırlanıyor</SelectItem>
                      <SelectItem value="Kargolandı">Kargolandı</SelectItem>
                      <SelectItem value="Teslim Edildi">Teslim Edildi</SelectItem>
                      <SelectItem value="İptal Edildi">İptal Edildi</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>

                  {/* ============================================================ */}
                  {/* GENİŞLETİLMİŞ DETAY SATIRI */}
                  {/* ============================================================ */}
                  {expandedOrder === order.ID && (
                    <TableRow className="bg-slate-50">
                      <TableCell colSpan={8} className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Sol: Ürünler */}
                          <div>
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              Sipariş Ürünleri ({order.items?.length || 0})
                            </h4>
                            <div className="space-y-2">
                              {order.items?.map((item) => (
                                <div 
                                  key={item.ID}
                                  className="flex items-center gap-3 p-3 bg-white rounded-lg border"
                                >
                                  <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden">
                                    <img 
                                      src={item.product_image || `https://via.placeholder.com/48?text=${item.product_id}`}
                                      alt={item.product_name}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{item.product_name || `Ürün #${item.product_id}`}</p>
                                    <p className="text-xs text-slate-500">
                                      {item.unit_price?.toLocaleString("tr-TR")} ₺ x {item.quantity}
                                    </p>
                                  </div>
                                  <div className="font-semibold text-sm">
                                    {item.sub_total?.toLocaleString("tr-TR")} ₺
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Sağ: Özet */}
                          <div className="space-y-4">
                            {/* Adres */}
                            {order.shipping_address && (
                              <div className="p-4 bg-white rounded-lg border">
                                <h4 className="font-semibold mb-2 flex items-center gap-2">
                                  <MapPin className="w-4 h-4" />
                                  Teslimat Adresi
                                </h4>
                                <p className="text-sm text-slate-600">
                                  {order.shipping_address}
                                </p>
                              </div>
                            )}

                            {/* Fiyat Özeti */}
                            <div className="p-4 bg-white rounded-lg border">
                              <h4 className="font-semibold mb-3">Fiyat Detayı</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Ara Toplam</span>
                                  <span>{order.sub_total?.toLocaleString("tr-TR")} ₺</span>
                                </div>
                                {order.coupon_discount > 0 && (
                                  <div className="flex justify-between text-green-600">
                                    <span className="flex items-center gap-1">
                                      <Tag className="w-3 h-3" />
                                      Kupon ({order.coupon_code})
                                    </span>
                                    <span>-{order.coupon_discount.toLocaleString("tr-TR")} ₺</span>
                                  </div>
                                )}
                                <div className="border-t pt-2 flex justify-between font-semibold">
                                  <span>Toplam</span>
                                  <span>{order.total_price.toLocaleString("tr-TR")} ₺</span>
                                </div>
                              </div>
                            </div>

                            {/* Tarih Bilgisi */}
                            <div className="p-4 bg-white rounded-lg border">
                              <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Calendar className="w-4 h-4" />
                                Sipariş Tarihi: {formatDate(order.CreatedAt)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ================================================================== */}
      {/* PAGİNATİON */}
      {/* ================================================================== */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            showInfo={true}
          />
        </div>
      )}
    </div>
  );
}
