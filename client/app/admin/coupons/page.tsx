"use client";

/*
==============================================================================
                     ADMİN KUPON YÖNETİM SAYFASI
==============================================================================

📚 BU SAYFA NE YAPAR?
   - Tüm kuponları listeler
   - Yeni kupon oluşturur
   - Mevcut kuponları düzenler
   - Kupon istatistiklerini gösterir

💡 TASARIM KARARLARI:

   1. Tablo + Modal Yapısı
      - Tablo: Kuponları listelemek için ideal
      - Modal: Ekleme/düzenleme için pop-up (sayfa değişmez)

   2. Tarih Yönetimi
      - HTML5 date input kullanıyoruz
      - Backend'e ISO format gönderiyoruz
      - Timezone sorunlarına dikkat!

   3. İstatistikler
      - Kullanım yüzdesi progress bar ile gösteriliyor
      - Görsel feedback kullanıcı için önemli

==============================================================================
*/

import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Tag, 
  Plus, 
  Pencil, 
  Trash2, 
  Percent, 
  DollarSign,
  Calendar,
  Users,
  TrendingUp,
  ToggleLeft,
  ToggleRight
} from "lucide-react";

// ==============================================================================
// TİP TANIMLARI
// ==============================================================================

type Coupon = {
  ID: number;
  code: string;
  description: string;
  discount_type: string;    // "percentage" | "fixed"
  discount_value: number;
  min_order_amount: number;
  max_uses: number;
  used_count: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  CreatedAt: string;
};

// Form için boş değerler
const emptyForm = {
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: "",
  min_order_amount: "",
  max_uses: "",
  start_date: "",
  end_date: "",
  is_active: true
};

// ==============================================================================
// ANA COMPONENT
// ==============================================================================

export default function AdminCouponsPage() {
  // State'ler
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State'leri
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // ==========================================================================
  // VERİ ÇEKME
  // ==========================================================================

  const fetchCoupons = async () => {
    try {
      const res = await axios.get("http://localhost:8080/api/coupons?limit=1000");
      // Coupon Service pagination formatında dönüyor: { coupons: [...], pagination: {...} }
      setCoupons(res.data.coupons || []);
    } catch (err) {
      console.error(err);
      toast.error("Kuponlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  // ==========================================================================
  // MODAL İŞLEMLERİ
  // ==========================================================================

  // Yeni kupon için modal aç
  const openNewModal = () => {
    setEditingCoupon(null);
    setFormData({
      ...emptyForm,
      start_date: new Date().toISOString().split("T")[0], // Bugün
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] // +30 gün
    });
    setIsModalOpen(true);
  };

  // Düzenleme için modal aç
  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value.toString(),
      min_order_amount: coupon.min_order_amount.toString(),
      max_uses: coupon.max_uses.toString(),
      start_date: coupon.start_date.split("T")[0],
      end_date: coupon.end_date.split("T")[0],
      is_active: coupon.is_active
    });
    setIsModalOpen(true);
  };

  // ==========================================================================
  // CRUD İŞLEMLERİ
  // ==========================================================================

  const handleSave = async () => {
    // Validasyon
    if (!formData.code.trim()) {
      toast.error("Kupon kodu zorunludur");
      return;
    }

    setSaving(true);
    const token = localStorage.getItem("token");

    try {
      const payload = {
        code: formData.code.toUpperCase(),
        description: formData.description,
        discount_type: formData.discount_type,
        discount_value: Number(formData.discount_value),
        min_order_amount: Number(formData.min_order_amount) || 0,
        max_uses: Number(formData.max_uses) || 100,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
        is_active: formData.is_active
      };

      if (editingCoupon) {
        // Güncelle
        await axios.put(
          `http://localhost:8080/api/coupons/${editingCoupon.ID}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Kupon güncellendi! ✏️");
      } else {
        // Yeni oluştur
        await axios.post(
          "http://localhost:8080/api/coupons",
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Kupon oluşturuldu! 🎫");
      }

      setIsModalOpen(false);
      fetchCoupons();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || "İşlem başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (couponId: number) => {
    if (!confirm("Bu kuponu silmek istediğinize emin misiniz?")) return;

    const token = localStorage.getItem("token");

    try {
      await axios.delete(`http://localhost:8080/api/coupons/${couponId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Kupon silindi! 🗑️");
      fetchCoupons();
    } catch (err) {
      console.error(err);
      toast.error("Silme başarısız");
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    const token = localStorage.getItem("token");

    try {
      await axios.put(
        `http://localhost:8080/api/coupons/${coupon.ID}`,
        { is_active: !coupon.is_active },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(coupon.is_active ? "Kupon devre dışı" : "Kupon aktif edildi");
      fetchCoupons();
    } catch (err) {
      toast.error("Güncelleme başarısız");
    }
  };

  // ==========================================================================
  // YARDIMCI FONKSİYONLAR
  // ==========================================================================

  const getStatusBadge = (coupon: Coupon) => {
    const now = new Date();
    const endDate = new Date(coupon.end_date);
    const startDate = new Date(coupon.start_date);

    if (!coupon.is_active) {
      return <Badge variant="secondary">Pasif</Badge>;
    }
    if (now < startDate) {
      return <Badge className="bg-blue-100 text-blue-800">Beklemede</Badge>;
    }
    if (now > endDate) {
      return <Badge variant="destructive">Süresi Doldu</Badge>;
    }
    if (coupon.used_count >= coupon.max_uses) {
      return <Badge variant="destructive">Limit Doldu</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">Aktif</Badge>;
  };

  const getUsagePercent = (coupon: Coupon) => {
    return Math.min((coupon.used_count / coupon.max_uses) * 100, 100);
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="space-y-6">
      {/* BAŞLIK */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Kupon Yönetimi</h1>
          <p className="text-slate-500">İndirim kuponlarını oluşturun ve yönetin</p>
        </div>
        <Button onClick={openNewModal} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-4 h-4" />
          Yeni Kupon
        </Button>
      </div>

      {/* İSTATİSTİK KARTLARI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                <Tag className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{coupons.length}</p>
                <p className="text-sm text-slate-500">Toplam Kupon</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {coupons.filter(c => c.is_active && new Date(c.end_date) > new Date()).length}
                </p>
                <p className="text-sm text-slate-500">Aktif Kupon</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {coupons.reduce((sum, c) => sum + c.used_count, 0)}
                </p>
                <p className="text-sm text-slate-500">Toplam Kullanım</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <Percent className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {coupons.filter(c => c.discount_type === "percentage").length}
                </p>
                <p className="text-sm text-slate-500">Yüzdelik İndirim</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KUPON TABLOSU */}
      <Card>
        <CardHeader>
          <CardTitle>Kuponlar</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10">Yükleniyor...</div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-16">
              <Tag className="w-16 h-16 mx-auto mb-4 text-slate-200" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Henüz kupon yok</h3>
              <p className="text-slate-500 mb-4">İlk kuponunuzu oluşturun!</p>
              <Button onClick={openNewModal}>
                <Plus className="w-4 h-4 mr-2" /> Kupon Oluştur
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Kupon</th>
                    <th className="px-4 py-3 text-left">İndirim</th>
                    <th className="px-4 py-3 text-left">Min. Tutar</th>
                    <th className="px-4 py-3 text-left">Kullanım</th>
                    <th className="px-4 py-3 text-left">Tarih</th>
                    <th className="px-4 py-3 text-left">Durum</th>
                    <th className="px-4 py-3 text-center">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.ID} className="border-b hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-bold text-indigo-600">{coupon.code}</p>
                          <p className="text-xs text-slate-500 max-w-[200px] truncate">
                            {coupon.description}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          {coupon.discount_type === "percentage" ? (
                            <>
                              <Percent className="w-4 h-4 text-purple-500" />
                              <span className="font-semibold">{coupon.discount_value}%</span>
                            </>
                          ) : (
                            <>
                              <DollarSign className="w-4 h-4 text-green-500" />
                              <span className="font-semibold">{coupon.discount_value} TL</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {coupon.min_order_amount > 0 
                          ? `${coupon.min_order_amount} TL` 
                          : "-"
                        }
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{coupon.used_count}/{coupon.max_uses}</span>
                          </div>
                          <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                getUsagePercent(coupon) >= 90 
                                  ? "bg-red-500" 
                                  : getUsagePercent(coupon) >= 70 
                                    ? "bg-orange-500" 
                                    : "bg-green-500"
                              }`}
                              style={{ width: `${getUsagePercent(coupon)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-xs">
                          <p className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(coupon.start_date).toLocaleDateString("tr-TR")}
                          </p>
                          <p className="text-slate-400">
                            → {new Date(coupon.end_date).toLocaleDateString("tr-TR")}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(coupon)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => toggleActive(coupon)}
                            title={coupon.is_active ? "Devre dışı bırak" : "Aktif et"}
                          >
                            {coupon.is_active ? (
                              <ToggleRight className="w-4 h-4 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-slate-400" />
                            )}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => openEditModal(coupon)}
                          >
                            <Pencil className="w-4 h-4 text-indigo-600" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleDelete(coupon.ID)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KUPON MODAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-indigo-600" />
              {editingCoupon ? "Kuponu Düzenle" : "Yeni Kupon Oluştur"}
            </DialogTitle>
            <DialogDescription>
              {editingCoupon 
                ? "Kupon bilgilerini güncelleyebilirsiniz." 
                : "Yeni bir indirim kuponu oluşturun."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* Kupon Kodu */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kupon Kodu *</Label>
                <Input 
                  placeholder="YUZDE10"
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                  className="uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label>İndirim Tipi *</Label>
                <Select 
                  value={formData.discount_type}
                  onValueChange={(v) => setFormData({...formData, discount_type: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Yüzde (%)</SelectItem>
                    <SelectItem value="fixed">Sabit Tutar (TL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Açıklama */}
            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Input 
                placeholder="Yeni üyelere özel indirim"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>

            {/* İndirim ve Minimum */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  İndirim {formData.discount_type === "percentage" ? "(%)" : "(TL)"} *
                </Label>
                <Input 
                  type="number"
                  placeholder={formData.discount_type === "percentage" ? "15" : "50"}
                  value={formData.discount_value}
                  onChange={(e) => setFormData({...formData, discount_value: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum Sepet (TL)</Label>
                <Input 
                  type="number"
                  placeholder="100"
                  value={formData.min_order_amount}
                  onChange={(e) => setFormData({...formData, min_order_amount: e.target.value})}
                />
              </div>
            </div>

            {/* Max Kullanım */}
            <div className="space-y-2">
              <Label>Maksimum Kullanım Sayısı</Label>
              <Input 
                type="number"
                placeholder="100"
                value={formData.max_uses}
                onChange={(e) => setFormData({...formData, max_uses: e.target.value})}
              />
            </div>

            {/* Tarihler */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Başlangıç Tarihi</Label>
                <Input 
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Bitiş Tarihi</Label>
                <Input 
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600">
              {saving ? "Kaydediliyor..." : (editingCoupon ? "Güncelle" : "Oluştur")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

