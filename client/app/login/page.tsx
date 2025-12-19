"use client"; // Bu sayfa kullanıcının tarayıcısında çalışacak

import { useState } from "react";
import { useRouter } from "next/navigation"; // Sayfa yönlendirmesi için
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner"; // O güzel bildirimler için
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter();
  
  // State'ler: Kullanıcının yazdığı verileri anlık tuttuğumuz yerler
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); // Butona basınca dönen tekerlek için

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // Sayfanın klasik yenilenme huyunu engelle
    setLoading(true);

    try {
      // 1. GATEWAY'E İSTEK AT
      // Frontend (3000) -> Gateway (8080) -> Auth Service (3002)
      const res = await axios.post("http://localhost:8080/api/auth/login", {
        email,
        password,
      });

      // 2. CEVABI AL VE SAKLA
      const token = res.data.token;
      const user = res.data.user; // <-- Backend'den gelen user objesi
      
      // 3. ADMIN KONTROLÜ - Admin kullanıcılar buradan giriş yapamaz!
      if (user.is_admin) {
        toast.error("Admin hesapları bu sayfadan giriş yapamaz!", {
          description: "Lütfen admin paneli için /admin/login adresini kullanın.",
          action: {
            label: "Admin Girişi",
            onClick: () => window.location.href = "/admin/login",
          },
        });
        setLoading(false);
        return;
      }
      
      // Varsa admin oturumunu temizle (iki oturum aynı anda olmasın)
      localStorage.removeItem("is_admin");
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_session");

      // Normal kullanıcı bilgilerini kaydet
      localStorage.setItem("token", token); 
      localStorage.setItem("user", user.name); 
      localStorage.setItem("user_id", user.id);

      toast.success("Giriş başarılı! Yönlendiriliyorsunuz...");
      
      // 3. ANASAYFAYA POSTALA
      // Biraz bekle ki kullanıcı "Başarılı" yazısını görsün
      setTimeout(() => {
        // window.location kullanıyorum ki tüm sayfa yenilensin ve Navbar güncellensin
        window.location.href = "/"; 
      }, 1000);

    } catch (err: any) {
      console.error(err);
      // Backend'den gelen hata mesajını göster yoksa genel mesaj bas
      const mesaj = err.response?.data?.message || "Giriş yapılamadı, bilgileri kontrol et.";
      toast.error(mesaj);
    } finally {
      setLoading(false); // Yüklenme bitti, butonu aktif et
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      {/* Shadcn Card Bileşeni: Çerçeve */}
      <Card className="w-[350px] shadow-lg">
        <CardHeader>
          <CardTitle>Giriş Yap</CardTitle>
          <CardDescription>Hesabınıza erişmek için bilgilerinizi girin.</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="admin@test.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="password">Şifre</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <div className="flex justify-between w-full">
                <Button variant="outline" type="button" onClick={() => router.push("/")}>İptal</Button>
                <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                {loading ? "Giriş Yapılıyor..." : "Giriş Yap"}
                </Button>
            </div>
            
            {/* YENİ EKLENEN KISIM: KAYIT OL LİNKİ */}
            <p className="text-sm text-center text-gray-500 mt-2">
              Hesabın yok mu?{" "}
              <Link href="/register" className="text-indigo-600 font-semibold hover:underline">
                Kayıt Ol
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}