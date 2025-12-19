"use client";


import { useEffect, useState } from "react";
import axios from "axios";
import { Trash2, CreditCard, Minus, Plus, Tag, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

// ==============================================================================
// TİP TANIMLARI
// ==============================================================================

type CartItem = {
  product_id: number;
  quantity: number;
};

type Product = {
  ID: number;
  name: string;
  price: number;
};

/*
AppliedCoupon: Frontend'de tuttuğumuz kupon state'i

💡 NEDEN AYRI TİP?
   - Backend'den gelen response ile birebir aynı olmak zorunda değil
   - Frontend'e özel alanlar ekleyebiliriz
   - Type safety sağlar
*/
type AppliedCoupon = {
  code: string;
  couponId: number;
  discountType: string;  // "percentage" | "fixed"
  discount: number;       // Hesaplanmış indirim tutarı
  message: string;
};

// ==============================================================================
// ANA COMPONENT
// ==============================================================================

export default function CartPage() {
  const router = useRouter();
  
  // Sepet State'leri
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Ödeme Modal State'leri
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  // --- KUPON STATE'LERİ (YENİ) ---
  const [couponCode, setCouponCode] = useState("");           // Input değeri
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);  // Uygulanan kupon
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);  // Loading state

  // ==========================================================================
  // VERİ ÇEKME
  // ==========================================================================

  useEffect(() => {
    const fetchData = async () => {
      const userId = localStorage.getItem("user_id");
      if (!userId) {
        toast.error("Sepeti görmek için giriş yapmalısın.");
        router.push("/login");
        return;
      }

      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        // Paralel istekler (Promise.all daha hızlı)
        const [cartRes, prodRes] = await Promise.all([
          axios.get(`http://localhost:8080/api/cart/${userId}`, { headers }),
          axios.get("http://localhost:8080/api/products?limit=1000") // Ürünler için token gerekmez
        ]);
        
        setCartItems(cartRes.data || []);
        // Product Service pagination formatında dönüyor: { products: [...], pagination: {...} }
        setProducts(prodRes.data.products || []);
      } catch (err) {
        console.error(err);
        toast.error("Sepet yüklenemedi.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router]);

  // ==========================================================================
  // HESAPLAMALAR
  // ==========================================================================

  /*
  calculateSubtotal: Kupon öncesi ara toplam
  
  💡 reduce vs forEach:
     reduce daha fonksiyonel ve tek satırda yazılabilir
     ama forEach daha okunabilir (junior-friendly)
  */
  const calculateSubtotal = () => {
    return cartItems.reduce((total, item) => {
      const product = products.find((p) => p.ID === item.product_id);
      return total + (product ? product.price * item.quantity : 0);
    }, 0);
  };

  /*
  calculateTotal: Kupon indirimi düşülmüş toplam
  
  💡 NEDEN AYRI FONKSİYON?
     - Single Responsibility: Her fonksiyon tek iş yapar
     - Testability: Bağımsız test edilebilir
     - Reusability: Farklı yerlerden çağrılabilir
  */
  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const discount = appliedCoupon?.discount || 0;
    return Math.max(subtotal - discount, 0); // Negatif olamaz
  };

  // ==========================================================================
  // SEPET İŞLEMLERİ
  // ==========================================================================

  const handleDelete = async (productId: number) => {
    const userId = localStorage.getItem("user_id");
    const token = localStorage.getItem("token");
    if (!userId || !token) return;

    try {
      await axios.delete(`http://localhost:8080/api/cart/${userId}/${productId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCartItems((prev) => prev.filter((item) => item.product_id !== productId));
      toast.success("Ürün sepetten çıkarıldı.");
      
      // Navbar'daki sepet sayacını güncelle
      window.dispatchEvent(new Event("cart-updated"));
      
      // Kupon varsa yeniden hesapla (sepet tutarı değişti)
      if (appliedCoupon) {
        revalidateCoupon();
      }
    } catch (err) {
      console.error(err);
      toast.error("Ürün silinemedi.");
    }
  };

  const updateQuantity = async (productId: number, change: number) => {
    const userId = localStorage.getItem("user_id");
    const token = localStorage.getItem("token");
    if (!userId || !token) return;

    try {
      await axios.post(`http://localhost:8080/api/cart/${userId}`, {
        product_id: productId,
        quantity: change 
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setCartItems((prev) => {
        return prev.map(item => {
          if (item.product_id === productId) {
             return { ...item, quantity: item.quantity + change };
          }
          return item;
        }).filter(item => item.quantity > 0);
      });

      // 🔔 Navbar'a haber ver
      window.dispatchEvent(new Event("cart-updated"));
      
      // Kupon varsa yeniden hesapla
      if (appliedCoupon) {
        // Debounce: Hızlı tıklamalarda çok fazla istek atmamak için
        setTimeout(() => revalidateCoupon(), 500);
      }
    } catch (err) {
      console.error(err);
      toast.error("Güncellenemedi.");
    }
  };

  // ==========================================================================
  // KUPON İŞLEMLERİ (YENİ)
  // ==========================================================================

  /*
  applyCoupon: Kupon kodunu doğrula ve uygula
  
  🔄 AKIŞ:
     1. Input'tan kodu al
     2. Backend'e gönder (/api/coupons/apply)
     3. Backend doğrular ve indirim hesaplar
     4. Başarılıysa state'e kaydet
     5. UI güncellenir
  */
  const applyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Kupon kodu giriniz");
      return;
    }

    const userId = localStorage.getItem("user_id");
    if (!userId) {
      toast.error("Giriş yapmalısınız");
      return;
    }

    setIsApplyingCoupon(true);

    try {
      const response = await axios.post("http://localhost:8080/api/coupons/apply", {
        code: couponCode.trim().toUpperCase(),
        user_id: Number(userId),
        order_total: calculateSubtotal()
      });

      const data = response.data;

      if (data.valid) {
        // ✅ Kupon geçerli!
        setAppliedCoupon({
          code: couponCode.toUpperCase(),
          couponId: data.coupon_id,
          discountType: data.discount_type,
          discount: data.discount,
          message: data.message
        });
        setCouponCode(""); // Input'u temizle
        toast.success(data.message);
      } else {
        // ❌ Kupon geçersiz
        toast.error(data.message);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Kupon uygulanamadı");
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  /*
  removeCoupon: Uygulanan kuponu kaldır
  
  💡 Basit ama önemli:
     - Sadece state temizlenir
     - Backend'e istek yok (henüz kullanılmadı)
  */
  const removeCoupon = () => {
    setAppliedCoupon(null);
    toast.info("Kupon kaldırıldı");
  };

  /*
  revalidateCoupon: Sepet değişince kuponu yeniden doğrula
  
  💡 NEDEN GEREKLİ?
     - Kullanıcı ürün sildi → Minimum tutar şartı sağlanmıyor olabilir
     - Ürün adedi azaldı → İndirim tutarı değişmiş olabilir
  */
  const revalidateCoupon = async () => {
    if (!appliedCoupon) return;

    const userId = localStorage.getItem("user_id");
    const newSubtotal = calculateSubtotal();

    try {
      const response = await axios.post("http://localhost:8080/api/coupons/apply", {
        code: appliedCoupon.code,
        user_id: Number(userId),
        order_total: newSubtotal
      });

      const data = response.data;

      if (data.valid) {
        // Kuponu güncelle (indirim tutarı değişmiş olabilir)
        setAppliedCoupon(prev => prev ? {
          ...prev,
          discount: data.discount
        } : null);
      } else {
        // Kupon artık geçerli değil
        setAppliedCoupon(null);
        toast.warning("Kupon artık geçerli değil: " + data.message);
      }
    } catch (err) {
      // Sessizce başarısız ol
      console.error("Kupon yeniden doğrulanamadı", err);
    }
  };

  // ==========================================================================
  // ÖDEME İŞLEMİ
  // ==========================================================================

  /*
  handlePayment: Sipariş oluşturma işlemi

  🔄 YENİ AKIŞ:
     1. Ürün detaylarını hazırla (ad, fiyat, resim - sipariş anındaki)
     2. Kupon bilgisini ekle
     3. Backend'e gönder
     4. Kupon kullanımını kaydet
     5. Başarılıysa sipariş detay sayfasına yönlendir

  💡 NEDEN ÜRÜN DETAYLARINI GÖNDERİYORUZ?

     Senaryo: Kullanıcı "iPhone 15" aldı (5000 TL)
     1 ay sonra: Ürün adı "iPhone 15 (Yeni)" oldu, fiyatı 6000 TL oldu

     Soru: Sipariş geçmişinde ne göstermeli?
     Cevap: "iPhone 15" ve 5000 TL (ALDIĞI ANDAKİ değerler)

     Bu yüzden sipariş anındaki bilgileri Backend'e gönderiyoruz.
     Backend bunları order_items tablosuna KOPYALIYOR.
  */
  const handlePayment = async () => {
    setIsPaying(true);
    const userId = localStorage.getItem("user_id");

    /*
    orderItems: Backend'e gönderilecek ürün listesi

    Her ürün için:
    - product_id: Referans için (stok düşürme)
    - product_name: O anki ürün adı
    - product_image: O anki ürün resmi
    - unit_price: O anki birim fiyat
    - quantity: Adet

    💡 Neden product'tan alıyoruz?
       cartItems sadece {product_id, quantity} tutuyor.
       Detayları products array'inden buluyoruz.
    */
    const orderItems = cartItems.map((item) => {
      const product = products.find((p) => p.ID === item.product_id);
      return {
        product_id: item.product_id,
        product_name: product?.name || `Ürün #${item.product_id}`,
        product_image: `https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80`,
        unit_price: product?.price || 0,
        quantity: item.quantity
      };
    });

    const subtotal = calculateSubtotal();
    const total = calculateTotal();

    try {
      /*
      Sipariş Oluşturma İsteği

      YENİ ALANLAR:
      - sub_total: Kupon öncesi tutar (muhasebe için)
      - coupon_code: Kullanılan kupon kodu
      - coupon_discount: İndirim tutarı
      - items: Detaylı ürün listesi (ad, fiyat, resim dahil)

      Backend bu bilgileri:
      1. orders tablosuna ana sipariş olarak kaydeder
      2. order_items tablosuna her ürünü ayrı kaydeder
      */
      const orderResponse = await axios.post("http://localhost:8080/api/orders", {
        user_id: Number(userId),
        items: orderItems,
        sub_total: subtotal,
        total_price: total,
        coupon_code: appliedCoupon?.code || "",
        coupon_discount: appliedCoupon?.discount || 0,
        card_number: cardNumber,
        cvv: cvv,
        expiry: expiry,
        shipping_address: "" // TODO: Profildeki varsayılan adresi çek
      });

      const orderId = orderResponse.data.order?.ID;

      // Kupon kullanıldıysa kaydet (istatistik için)
      if (appliedCoupon && orderId) {
        try {
          await axios.post("http://localhost:8080/api/coupons/use", {
            coupon_id: appliedCoupon.couponId,
            user_id: Number(userId),
            order_id: orderId,
            discount: appliedCoupon.discount
          });
        } catch (err) {
          // Sipariş oluştu, kupon kaydı başarısız olsa bile devam et
          console.error("Kupon kullanımı kaydedilemedi:", err);
        }
      }

      toast.success("Sipariş Oluşturuldu! 🎉");
      
      /*
      SEPETİ TEMİZLE (Redis'ten)

      💡 Neden API çağrısı yapıyoruz?
         setCartItems([]) sadece React state'ini temizler.
         Ama sepet verileri Redis'te tutuluyor.
         Sayfa yenilendiğinde eski sepet geri gelir!

         Bu yüzden backend'e "sepeti sil" isteği atıyoruz.
      */
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`http://localhost:8080/api/cart/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        // Sepet temizleme başarısız olsa bile sipariş oluştu
        console.error("Sepet temizlenemedi:", err);
      }

      // State'leri temizle
      setCartItems([]);
      setAppliedCoupon(null);
      setIsCheckoutOpen(false);
      
      // Navbar'daki sepet sayacını güncelle
      window.dispatchEvent(new Event("cart-updated"));
      
      // Sipariş detay sayfasına yönlendir
      if (orderId) {
        setTimeout(() => router.push(`/orders/${orderId}`), 1500);
      } else {
        setTimeout(() => router.push("/profile"), 1500);
      }

    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || "Ödeme başarısız.");
    } finally {
      setIsPaying(false);
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
          <span className="ml-3 text-slate-600">Sepet yükleniyor...</span>
        </div>
      </div>
    );
  }

  const subtotal = calculateSubtotal();
  const total = calculateTotal();

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
        Sepetim 
        <span className="text-gray-400 text-lg font-normal">
          ({cartItems.length} Ürün)
        </span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* SOL TARAF: Ürün Listesi */}
        <div className="md:col-span-2 space-y-4">
          {cartItems.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed">
              <div className="text-5xl mb-4">🛒</div>
              <h3 className="text-xl font-semibold text-slate-700 mb-2">Sepetiniz boş</h3>
              <p className="text-slate-500 mb-4">Hadi alışverişe başlayalım!</p>
              <Button onClick={() => router.push("/")} variant="outline">
                Ürünleri Keşfet
              </Button>
            </div>
          ) : (
            cartItems.map((item, index) => {
              const product = products.find((p) => p.ID === item.product_id);
              if (!product) return null;

              return (
                <Card key={index} className="flex flex-row items-center p-4 gap-4 hover:shadow-md transition-shadow">
                  {/* Resim */}
                  <div className="w-24 h-24 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
                    <img 
                      src={`https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80&random=${product.ID}`} 
                      alt={product.name}
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  
                  {/* Bilgiler */}
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 text-lg">{product.name}</h3>
                    <p className="text-sm text-slate-500">Ürün Kodu: #{product.ID}</p>
                    <div className="font-bold text-indigo-600 mt-1 text-lg">
                      {product.price.toLocaleString("tr-TR")} TL
                    </div>
                  </div>

                  {/* Adet Kontrolü */}
                  <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center border rounded-xl bg-slate-50 overflow-hidden">
                      <button 
                        onClick={() => updateQuantity(product.ID, -1)} 
                        className="p-2.5 hover:bg-slate-200 text-slate-600 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-10 text-center font-semibold text-slate-900">
                        {item.quantity}
                      </span>
                      <button 
                        onClick={() => updateQuantity(product.ID, 1)} 
                        className="p-2.5 hover:bg-slate-200 text-slate-600 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <button 
                      onClick={() => handleDelete(product.ID)} 
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 hover:underline"
                    >
                      <Trash2 className="w-3 h-3" /> Kaldır
                    </button>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* ================================================================ */}
        {/* SAĞ TARAF: SİPARİŞ ÖZETİ + KUPON */}
        {/* ================================================================ */}
        <div>
          <Card className="p-6 sticky top-24 shadow-lg border-indigo-100 bg-white">
            <h2 className="text-xl font-bold mb-4">Sipariş Özeti</h2>
            
            {/* ============================================================ */}
            {/* KUPON ALANI (YENİ!) */}
            {/* ============================================================ */}
            <div className="mb-6 pb-4 border-b">
              <Label className="text-sm text-slate-600 mb-2 block">
                Kupon Kodu
              </Label>
              
              {/* Kupon uygulanmışsa göster */}
              {appliedCoupon ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-green-800">
                          {appliedCoupon.code}
                        </p>
                        <p className="text-xs text-green-600">
                          {appliedCoupon.discountType === "percentage" 
                            ? `%${appliedCoupon.discount / subtotal * 100} indirim`
                            : `${appliedCoupon.discount} TL indirim`
                          }
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={removeCoupon}
                      className="p-1.5 hover:bg-green-100 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-green-700" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Kupon giriş alanı */
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      placeholder="HOSGELDIN" 
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                      className="pl-9 uppercase"
                      disabled={isApplyingCoupon}
                    />
                  </div>
                  <Button 
                    onClick={applyCoupon}
                    disabled={isApplyingCoupon || !couponCode.trim()}
                    variant="outline"
                    className="px-4"
                  >
                    {isApplyingCoupon ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Uygula"
                    )}
                  </Button>
                </div>
              )}

              {/* Örnek kuponlar */}
              {!appliedCoupon && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  <span className="text-xs text-slate-400">Dene:</span>
                  {["HOSGELDIN", "YAZ2024", "SUPER100"].map((code) => (
                    <button 
                      key={code}
                      onClick={() => setCouponCode(code)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      {code}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ============================================================ */}
            {/* FİYAT ÖZETİ */}
            {/* ============================================================ */}
            <div className="space-y-2 mb-6 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Ara Toplam</span>
                <span>{subtotal.toLocaleString("tr-TR")} TL</span>
              </div>
              
              {/* İndirim satırı (kupon varsa) */}
              {appliedCoupon && (
                <div className="flex justify-between text-green-600">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Kupon İndirimi
                  </span>
                  <span>-{appliedCoupon.discount.toLocaleString("tr-TR")} TL</span>
                </div>
              )}
              
              <div className="flex justify-between text-slate-600">
                <span>Kargo</span>
                <span className="text-green-600 font-medium">Bedava</span>
              </div>
              
              <div className="border-t pt-3 mt-3 flex justify-between text-lg font-bold text-slate-900">
                <span>Toplam</span>
                <div className="text-right">
                  {appliedCoupon && (
                    <span className="text-sm font-normal text-slate-400 line-through block">
                      {subtotal.toLocaleString("tr-TR")} TL
                    </span>
                  )}
                  <span className={appliedCoupon ? "text-green-600" : ""}>
                    {total.toLocaleString("tr-TR")} TL
                  </span>
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* ÖDEME BUTONU VE MODAL */}
            {/* ============================================================ */}
            <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
              <DialogTrigger asChild>
                <Button 
                  disabled={cartItems.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-lg shadow-md hover:shadow-lg transition-all"
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  Ödemeyi Tamamla
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Güvenli Ödeme</DialogTitle>
                  <DialogDescription>
                    Kart bilgilerinizi giriniz. (Test: Sonu 1,3,5 ile biterse hata verir)
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                  {/* Ödeme Özeti */}
                  {appliedCoupon && (
                    <div className="bg-green-50 p-3 rounded-lg flex items-center justify-between">
                      <span className="text-sm text-green-700 flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        {appliedCoupon.code} uygulandı
                      </span>
                      <Badge className="bg-green-600">
                        -{appliedCoupon.discount} TL
                      </Badge>
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Label>Kart Numarası</Label>
                    <Input 
                      placeholder="0000 0000 0000 0000" 
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Son Kullanma</Label>
                      <Input 
                        placeholder="AA/YY" 
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>CVV</Label>
                      <Input 
                        placeholder="123" 
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button 
                    onClick={handlePayment} 
                    disabled={isPaying} 
                    className="w-full bg-indigo-600 text-lg h-12"
                  >
                    {isPaying ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        İşleniyor...
                      </>
                    ) : (
                      `Öde (${total.toLocaleString("tr-TR")} TL)`
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <p className="text-xs text-slate-400 text-center mt-4">
              🔒 Güvenli ödeme altyapısı ile korunmaktadır.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
