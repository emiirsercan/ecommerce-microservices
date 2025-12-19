"use client";

/*
==============================================================================
                         ADMİN GİRİŞ SAYFASI
==============================================================================

Bu sayfa normal kullanıcı girişinden AYRI bir admin giriş sayfasıdır.

🔒 GÜVENLİK:
   - Sadece is_admin: true olan kullanıcılar admin paneline girebilir
   - Normal kullanıcılar buradan giriş yapamaz
   - Token + is_admin kontrolü yapılır

🎯 AKIM:
   1. Admin email/şifre girer
   2. /api/auth/login'e istek atılır
   3. Response'daki is_admin kontrol edilir
   4. is_admin: true ise → /admin'e yönlendir
   5. is_admin: false ise → "Yetkiniz yok" hatası

==============================================================================
*/

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Normal login endpoint'ine istek at
      const res = await axios.post("http://localhost:8080/api/auth/login", {
        email,
        password,
      });

      const { token, user } = res.data;

      // 2. Admin kontrolü - Backend'den gelen is_admin alanını kontrol et
      if (!user.is_admin) {
        toast.error("Bu hesap admin yetkisine sahip değil!");
        setLoading(false);
        return;
      }

      // 3. SADECE Admin bilgilerini localStorage'a kaydet
      /*
         ⚠️ ÖNEMLİ: token, user, user_id KAYDETME!
         
         Bu key'ler normal kullanıcı oturumu için kullanılıyor.
         Eğer bunları kaydedersek, admin ana siteye gidince
         sepete/favorilere ürün ekleyebilir (istemediğimiz durum).
         
         Admin'in sepet/favori kullanmasını engellemek için
         sadece admin-spesifik key'leri kaydediyoruz.
      */

      // Varsa normal kullanıcı oturumunu temizle (iki oturum aynı anda olmasın)
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("user_id");

      // Admin bilgilerini kaydet
      localStorage.setItem("is_admin", "true");
      localStorage.setItem("admin_token", token);
      localStorage.setItem("admin_session", JSON.stringify({
        id: user.id,
        name: user.name,
        email: user.email,
        loginTime: new Date().toISOString()
      }));

      // Navbar & diğer client'lara auth değişimini bildir
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("profile-updated"));
      }

      toast.success("Admin girişi başarılı! 🛡️");

      // 4. Admin paneline yönlendir
      setTimeout(() => {
        router.push("/admin");
      }, 500);

    } catch (err: any) {
      console.error(err);
      const message = err.response?.data?.message || "Giriş yapılamadı!";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative">
      {/* Arkaplan deseni */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      <Card className="w-[400px] shadow-2xl border-slate-700 bg-slate-800/50 backdrop-blur-sm relative z-10">
        <CardHeader className="text-center space-y-4">
          {/* Admin ikonu */}
          <div className="mx-auto w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl text-white">Admin Girişi</CardTitle>
            <CardDescription className="text-slate-400">
              Yönetim paneline erişmek için admin bilgilerinizi girin
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleAdminLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@gocommerce.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Şifre</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-indigo-500"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-4"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Giriş yapılıyor...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Girişi
                </>
              )}
            </Button>
          </CardContent>
        </form>


      </Card>

      {/* Demo bilgisi */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
        <p className="text-slate-500 text-sm">
          Demo Admin: <span className="text-indigo-400">admin@test.com</span> / <span className="text-indigo-400">123456</span>
        </p>
      </div>
    </div>
  );
}

