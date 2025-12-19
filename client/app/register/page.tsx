"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link"; // Link vermek için
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  
  // State'ler
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Gateway üzerinden Auth Service'e KAYIT isteği at
      // URL: http://localhost:8080/api/auth/register
      await axios.post("http://localhost:8080/api/auth/register", {
        name,
        email,
        password,
      });

      toast.success("Hesap başarıyla oluşturuldu! 🎉", {
        description: "Şimdi giriş yapabilirsiniz.",
      });
      
      // 2. Kullanıcıyı Login sayfasına yönlendir
      setTimeout(() => {
        router.push("/login");
      }, 1500);

    } catch (err: any) {
      console.error(err);
      // Backend'den gelen hata mesajını (Örn: "Bu email zaten kayıtlı") yakala
      const mesaj = err.response?.data?.message || "Kayıt işlemi başarısız.";
      toast.error("Hata!", { description: mesaj });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] bg-slate-50/50">
      <Card className="w-[400px] shadow-xl border-slate-200">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center text-indigo-700">Aramıza Katıl 🚀</CardTitle>
          <CardDescription className="text-center">
            GoCommerce ayrıcalıklarından yararlanmak için hesap oluştur.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="grid gap-4">
            
            {/* Ad Soyad Alanı */}
            <div className="grid gap-2">
              <Label htmlFor="name">Ad Soyad</Label>
              <Input 
                id="name" 
                placeholder="Örn: Ali Yılmaz" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required 
              />
            </div>

            {/* Email Alanı */}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="isim@ornek.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>

            {/* Şifre Alanı */}
            <div className="grid gap-2">
              <Label htmlFor="password">Şifre</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="******" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>

          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-lg" disabled={loading}>
              {loading ? "Kaydediliyor..." : "Kayıt Ol"}
            </Button>
            
            <p className="text-sm text-center text-gray-500">
              Zaten hesabın var mı?{" "}
              <Link href="/login" className="text-indigo-600 font-semibold hover:underline">
                Giriş Yap
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
