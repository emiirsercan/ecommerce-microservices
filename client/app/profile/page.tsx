"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { Package, User, LogOut, MapPin, Lock, Plus, Pencil, Trash2, Star, Phone, Mail, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// --- TİPLER ---
type UserProfile = {
  id: number;
  name: string;
  email: string;
  phone: string;
  is_admin: boolean;
  created_at: string;
};

type Address = {
  ID: number;
  title: string;
  full_name: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  postal_code: string;
  is_default: boolean;
};

/*
Order tipi: Profil sayfasında gösterilecek sipariş bilgileri

💡 Backend'deki Order struct'ıyla uyumlu olmalı.
   Burada sadece ihtiyacımız olan alanları tanımlıyoruz.
   TypeScript'te "Pick" veya "Partial" ile de yapılabilir ama
   açık tanımlama daha okunabilir.
*/
type Order = {
  ID: number;
  sub_total: number;
  coupon_code: string;
  coupon_discount: number;
  total_price: number;
  status: string;
  CreatedAt: string;
  items?: { ID: number }[];  // Ürün sayısı için
};

export default function ProfilePage() {
  const router = useRouter();
  
  // State'ler
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State'leri
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  // Form State'leri
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
  const [addressForm, setAddressForm] = useState({
    title: "",
    full_name: "",
    phone: "",
    city: "",
    district: "",
    address: "",
    postal_code: ""
  });

  const [saving, setSaving] = useState(false);

  // Token ve UserID
  const getAuthData = () => {
    const userId = localStorage.getItem("user_id");
    const token = localStorage.getItem("token");
    return { userId, token };
  };

  // Verileri Yükle
  useEffect(() => {
    const { userId, token } = getAuthData();

    if (!userId || !token) {
      toast.error("Giriş yapmalısınız");
      router.push("/login");
      return;
    }

    const fetchData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };

        /*
        Paralel İstekler (Promise.all)

        💡 Promise.all neden kullanıyoruz?
           - 3 istek sırayla: ~900ms (300ms + 300ms + 300ms)
           - 3 istek paralel: ~300ms (en yavaş olanı kadar)

        .catch(() => ({ data: [] })):
           Sipariş yoksa hata yerine boş array döner.
           Defensive programming - hata sayfayı kırmasın.

        YENİ ENDPOINT: /api/orders/user/:userid
           Eski: /api/orders/:userid
           Bu değişiklik /api/orders/:id ile çakışmayı önler.
        */
        const [profileRes, addressesRes, ordersRes] = await Promise.all([
          axios.get(`http://localhost:8080/api/profile/${userId}`, { headers }),
          axios.get(`http://localhost:8080/api/addresses/${userId}`, { headers }),
          axios.get(`http://localhost:8080/api/orders/user/${userId}`, { headers }).catch(() => ({ data: { orders: [] } }))
        ]);

        setProfile(profileRes.data);
        setAddresses(addressesRes.data || []);
        // Order Service artık pagination formatında dönüyor: { orders: [...], pagination: {...} }
        setOrders(ordersRes.data.orders || []);

        // Profil formunu doldur
        setProfileForm({
          name: profileRes.data.name || "",
          phone: profileRes.data.phone || ""
        });

      } catch (err: any) {
        /*
        401 Unauthorized Hatası

        💡 Bu hata ne zaman oluşur?
           1. Token süresi dolmuş (24 saat geçmiş)
           2. Token geçersiz/manipüle edilmiş
           3. Backend yeniden başlatılmış (farklı secret key - DEV ortamında)

        Çözüm: Kullanıcıyı logout yap ve login'e yönlendir.
        */
        if (err?.response?.status === 401) {
          // Token geçersiz - oturumu sonlandır
          localStorage.removeItem("user_id");
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          toast.error("Oturumunuz sona erdi. Lütfen tekrar giriş yapın.");
          router.push("/login");
          return;
        }
        
        console.error("Veri yüklenemedi:", err);
        toast.error("Bilgiler yüklenirken hata oluştu");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  // --- PROFİL GÜNCELLE ---
  const handleUpdateProfile = async () => {
    const { userId, token } = getAuthData();
    setSaving(true);

    try {
      const res = await axios.put(
        `http://localhost:8080/api/profile/${userId}`,
        profileForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setProfile({ ...profile!, name: res.data.user.name, phone: res.data.user.phone });
      localStorage.setItem("user", res.data.user.name); // Navbar için
      window.dispatchEvent(new Event("profile-updated"));
      
      toast.success("Profil güncellendi! ✏️");
      setIsEditProfileOpen(false);
    } catch (err) {
      toast.error("Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  };

  // --- ŞİFRE DEĞİŞTİR ---
  const handleChangePassword = async () => {
    if (passwordForm.new !== passwordForm.confirm) {
      toast.error("Yeni şifreler eşleşmiyor!");
      return;
    }

    if (passwordForm.new.length < 6) {
      toast.error("Şifre en az 6 karakter olmalı!");
      return;
    }

    const { userId, token } = getAuthData();
    setSaving(true);

    try {
      await axios.post(
        `http://localhost:8080/api/profile/${userId}/password`,
        { current_password: passwordForm.current, new_password: passwordForm.new },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Şifre değiştirildi! 🔐");
      setPasswordForm({ current: "", new: "", confirm: "" });
      setIsPasswordOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Şifre değiştirilemedi");
    } finally {
      setSaving(false);
    }
  };

  // --- ADRES EKLE/GÜNCELLE ---
  const handleSaveAddress = async () => {
    const { userId, token } = getAuthData();
    setSaving(true);

    try {
      if (editingAddress) {
        // Güncelle
        await axios.put(
          `http://localhost:8080/api/addresses/${editingAddress.ID}`,
          addressForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Adres güncellendi! ✏️");
      } else {
        // Ekle
        await axios.post(
          `http://localhost:8080/api/addresses/${userId}`,
          addressForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Adres eklendi! 📍");
      }

      // Adresleri yeniden yükle
      const res = await axios.get(`http://localhost:8080/api/addresses/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAddresses(res.data || []);

      resetAddressForm();
      setIsAddressOpen(false);
    } catch (err) {
      toast.error("İşlem başarısız");
    } finally {
      setSaving(false);
    }
  };

  // --- ADRES SİL ---
  const handleDeleteAddress = async (addressId: number) => {
    if (!confirm("Bu adresi silmek istediğinize emin misiniz?")) return;

    const { userId, token } = getAuthData();

    try {
      await axios.delete(`http://localhost:8080/api/addresses/${addressId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setAddresses(addresses.filter(a => a.ID !== addressId));
      toast.success("Adres silindi! 🗑️");
    } catch (err) {
      toast.error("Silme başarısız");
    }
  };

  // --- VARSAYILAN ADRES YAP ---
  const handleSetDefault = async (addressId: number) => {
    const { token } = getAuthData();

    try {
      await axios.put(
        `http://localhost:8080/api/addresses/${addressId}/default`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAddresses(addresses.map(a => ({
        ...a,
        is_default: a.ID === addressId
      })));

      toast.success("Varsayılan adres güncellendi! ⭐");
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  // --- ADRES DÜZENLEME MODAL'INI AÇ ---
  const openEditAddress = (address: Address) => {
    setEditingAddress(address);
    setAddressForm({
      title: address.title,
      full_name: address.full_name,
      phone: address.phone,
      city: address.city,
      district: address.district,
      address: address.address,
      postal_code: address.postal_code
    });
    setIsAddressOpen(true);
  };

  // --- YENİ ADRES MODAL'INI AÇ ---
  const openNewAddress = () => {
    setEditingAddress(null);
    resetAddressForm();
    setIsAddressOpen(true);
  };

  const resetAddressForm = () => {
    setAddressForm({
      title: "",
      full_name: "",
      phone: "",
      city: "",
      district: "",
      address: "",
      postal_code: ""
    });
  };

  // --- ÇIKIŞ YAP ---
  const handleLogout = () => {
    localStorage.removeItem("user_id");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    toast.success("Çıkış yapıldı");
    router.push("/");
  };

  // --- SİPARİŞ DURUMU BADGE ---
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Hazırlanıyor": return <Badge className="bg-yellow-100 text-yellow-800">Hazırlanıyor</Badge>;
      case "Kargolandı": return <Badge className="bg-blue-100 text-blue-800">Kargolandı</Badge>;
      case "Teslim Edildi": return <Badge className="bg-green-100 text-green-800">Teslim Edildi</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      
      {/* BAŞLIK */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Hesabım</h1>
          <p className="text-slate-500">Hoş geldin, {profile.name}!</p>
        </div>
        <Button variant="destructive" onClick={handleLogout} className="gap-2">
          <LogOut className="w-4 h-4" /> Çıkış Yap
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* SOL KOLON */}
        <div className="space-y-6">
          
          {/* PROFİL BİLGİLERİ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="w-5 h-5 text-indigo-600" /> Üyelik Bilgileri
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">İsim:</span>
                <span className="font-medium ml-auto">{profile.name}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">E-Posta:</span>
                <span className="font-medium ml-auto text-right break-all">{profile.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">Telefon:</span>
                <span className="font-medium ml-auto">{profile.phone || "-"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">Üyelik:</span>
                <span className="font-medium ml-auto">
                  {new Date(profile.created_at).toLocaleDateString("tr-TR")}
                </span>
              </div>

              <div className="pt-4 border-t space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2"
                  onClick={() => setIsEditProfileOpen(true)}
                >
                  <Pencil className="w-4 h-4" /> Bilgilerimi Düzenle
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2"
                  onClick={() => setIsPasswordOpen(true)}
                >
                  <Lock className="w-4 h-4" /> Şifremi Değiştir
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ADRESLERİM */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="w-5 h-5 text-indigo-600" /> Adreslerim
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={openNewAddress}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {addresses.length === 0 ? (
                <div className="text-center py-6 text-slate-500">
                  <MapPin className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">Henüz adres eklenmemiş</p>
                  <Button variant="link" size="sm" onClick={openNewAddress}>
                    İlk adresini ekle
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <div 
                      key={addr.ID} 
                      className={`p-3 rounded-lg border text-sm ${addr.is_default ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{addr.title}</span>
                          {addr.is_default && (
                            <Badge className="bg-indigo-600 text-white text-xs">Varsayılan</Badge>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {!addr.is_default && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => handleSetDefault(addr.ID)}
                              title="Varsayılan yap"
                            >
                              <Star className="w-3 h-3" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7"
                            onClick={() => openEditAddress(addr)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-red-500 hover:text-red-600"
                            onClick={() => handleDeleteAddress(addr.ID)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-slate-600 text-xs leading-relaxed">
                        {addr.full_name} • {addr.phone}<br/>
                        {addr.address}, {addr.district}/{addr.city}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {addresses.length > 0 && (
                <Button 
                  variant="outline" 
                  className="w-full mt-4 gap-2"
                  onClick={openNewAddress}
                >
                  <Plus className="w-4 h-4" /> Yeni Adres Ekle
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SAĞ KOLON - SİPARİŞLER */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" /> Son Siparişlerim
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Package className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                  <p className="font-medium">Henüz siparişiniz yok</p>
                  <Button variant="link" onClick={() => router.push("/")}>
                    Alışverişe Başla
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    /*
                    Sipariş Kartı - Tıklanabilir

                    💡 onClick ile router.push:
                       Tıklama olayında /orders/[id] sayfasına yönlendir.
                       Kullanıcı sipariş detayını görebilsin.

                    cursor-pointer: Fare imlecini "el" işaretine çevirir
                    hover:border-indigo-300: Hover'da kenar rengi değişir
                    group: Tailwind grup hover için (alt elementleri etkile)
                    */
                    <div 
                      key={order.ID} 
                      onClick={() => router.push(`/orders/${order.ID}`)}
                      className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-xs text-slate-500">Sipariş No</p>
                          <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            #{order.ID}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Tarih</p>
                          <p className="font-medium">
                            {new Date(order.CreatedAt).toLocaleDateString("tr-TR")}
                          </p>
                        </div>
                      </div>

                      {/* Kupon Bilgisi (varsa) */}
                      {order.coupon_code && (
                        <div className="flex items-center gap-2 mb-3 text-xs">
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            🎫 {order.coupon_code}
                          </Badge>
                          <span className="text-green-600">
                            -{order.coupon_discount?.toLocaleString("tr-TR")} TL indirim
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-3 border-t">
                        <div>
                          <p className="text-xs text-slate-500">Tutar</p>
                          <div>
                            {order.coupon_discount > 0 && (
                              <span className="text-xs text-slate-400 line-through mr-2">
                                {order.sub_total?.toLocaleString("tr-TR")} TL
                              </span>
                            )}
                            <span className="font-bold text-indigo-600 text-lg">
                              {order.total_price.toLocaleString("tr-TR")} TL
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(order.status)}
                          <span className="text-indigo-400 group-hover:translate-x-1 transition-transform">
                            →
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* PROFİL DÜZENLEME MODAL */}
      <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profil Bilgilerini Düzenle</DialogTitle>
            <DialogDescription>
              İsim ve telefon numaranızı güncelleyebilirsiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>İsim Soyisim</Label>
              <Input 
                value={profileForm.name}
                onChange={(e) => setProfileForm({...profileForm, name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input 
                placeholder="0555 123 45 67"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({...profileForm, phone: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditProfileOpen(false)}>İptal</Button>
            <Button onClick={handleUpdateProfile} disabled={saving}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ŞİFRE DEĞİŞTİRME MODAL */}
      <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Şifre Değiştir</DialogTitle>
            <DialogDescription>
              Güvenliğiniz için mevcut şifrenizi doğrulamanız gerekiyor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mevcut Şifre</Label>
              <Input 
                type="password"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm({...passwordForm, current: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Yeni Şifre</Label>
              <Input 
                type="password"
                value={passwordForm.new}
                onChange={(e) => setPasswordForm({...passwordForm, new: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Yeni Şifre (Tekrar)</Label>
              <Input 
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordOpen(false)}>İptal</Button>
            <Button onClick={handleChangePassword} disabled={saving}>
              {saving ? "Değiştiriliyor..." : "Şifreyi Değiştir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADRES MODAL */}
      <Dialog open={isAddressOpen} onOpenChange={setIsAddressOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAddress ? "Adresi Düzenle" : "Yeni Adres Ekle"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Adres Başlığı</Label>
                <Input 
                  placeholder="Ev, İş, vb."
                  value={addressForm.title}
                  onChange={(e) => setAddressForm({...addressForm, title: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Alıcı Adı</Label>
                <Input 
                  placeholder="Ad Soyad"
                  value={addressForm.full_name}
                  onChange={(e) => setAddressForm({...addressForm, full_name: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input 
                placeholder="0555 123 45 67"
                value={addressForm.phone}
                onChange={(e) => setAddressForm({...addressForm, phone: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>İl</Label>
                <Input 
                  placeholder="İstanbul"
                  value={addressForm.city}
                  onChange={(e) => setAddressForm({...addressForm, city: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>İlçe</Label>
                <Input 
                  placeholder="Kadıköy"
                  value={addressForm.district}
                  onChange={(e) => setAddressForm({...addressForm, district: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Açık Adres</Label>
              <Input 
                placeholder="Mahalle, Sokak, Bina No, Daire No"
                value={addressForm.address}
                onChange={(e) => setAddressForm({...addressForm, address: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Posta Kodu</Label>
              <Input 
                placeholder="34000"
                value={addressForm.postal_code}
                onChange={(e) => setAddressForm({...addressForm, postal_code: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddressOpen(false)}>İptal</Button>
            <Button onClick={handleSaveAddress} disabled={saving}>
              {saving ? "Kaydediliyor..." : (editingAddress ? "Güncelle" : "Ekle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
