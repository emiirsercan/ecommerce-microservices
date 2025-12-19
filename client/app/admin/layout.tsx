"use client";

/*
==============================================================================
                         ADMİN LAYOUT
==============================================================================

Bu layout admin panelindeki TÜM sayfalara uygulanır.
Görevleri:
1. Admin yetkisi kontrolü (is_admin check)
2. Sidebar navigasyonu
3. Logout işlemi

🔒 GÜVENLİK:
   - localStorage'da is_admin kontrolü yapılır
   - Admin değilse /admin/login'e yönlendirilir
   - /admin/login sayfası bu layout'u KULLANMAZ (ayrı)

==============================================================================
*/

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Package, ShoppingCart, LogOut, Tag, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    // Admin login sayfasında layout kontrolü yapma
    if (pathname === "/admin/login") {
      setIsAuthorized(true);
      setIsLoading(false);
      return;
    }

    // Admin yetkisi kontrolü
    const isAdmin = localStorage.getItem("is_admin");
    const adminToken = localStorage.getItem("admin_token"); // admin_token kullan, token değil!
    const adminSessionStr = localStorage.getItem("admin_session");

    // Admin session kontrolü - hem is_admin hem de admin_session olmalı
    // Bu sayede normal login'den gelen kullanıcılar admin paneline giremez
    if (!adminToken || isAdmin !== "true" || !adminSessionStr) {
      // Yetkisiz erişim - eski/bozuk admin verilerini temizle
      localStorage.removeItem("is_admin");
      localStorage.removeItem("admin_session");
      localStorage.removeItem("admin_token");

      toast.error("Admin paneline erişmek için giriş yapmalısınız");
      router.push("/admin/login");
      return;
    }

    // Admin adını session'dan al
    try {
      const adminSession = JSON.parse(adminSessionStr);
      setAdminName(adminSession.name || "Admin");
    } catch {
      setAdminName("Admin");
    }
    setIsAuthorized(true);
    setIsLoading(false);
  }, [router, pathname]);

  // Admin çıkış işlemi
  const handleLogout = () => {
    // Admin oturum bilgilerini temizle
    localStorage.removeItem("is_admin");
    localStorage.removeItem("admin_session");
    localStorage.removeItem("admin_token");

    toast.success("Çıkış yapıldı");
    router.push("/admin/login");
  };

  // Admin login sayfasında layout gösterme (sadece içeriği render et)
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Yükleniyor durumu
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-indigo-500 animate-pulse mx-auto mb-4" />
          <p className="text-slate-400">Yetki kontrol ediliyor...</p>
        </div>
      </div>
    );
  }

  // Yetkisiz
  if (!isAuthorized) {
    return null;
  }

  // Aktif sayfa kontrolü
  const isActive = (path: string) => pathname === path;

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full">
        {/* Logo */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">GoAdmin</h1>
              <p className="text-xs text-slate-500">Yönetim Paneli</p>
            </div>
          </div>
        </div>

        {/* Admin Bilgisi */}
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="flex items-center justify-between px-2 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">{adminName}</p>
                <p className="text-xs text-slate-500">Administrator</p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1 mt-4">
          <Link href="/admin">
            <Button
              variant="ghost"
              className={`w-full justify-start ${isActive("/admin")
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
            >
              <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
            </Button>
          </Link>
          <Link href="/admin/products">
            <Button
              variant="ghost"
              className={`w-full justify-start ${isActive("/admin/products")
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
            >
              <Package className="mr-2 h-4 w-4" /> Ürünler
            </Button>
          </Link>
          <Link href="/admin/orders">
            <Button
              variant="ghost"
              className={`w-full justify-start ${isActive("/admin/orders")
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
            >
              <ShoppingCart className="mr-2 h-4 w-4" /> Siparişler
            </Button>
          </Link>
          <Link href="/admin/coupons">
            <Button
              variant="ghost"
              className={`w-full justify-start ${isActive("/admin/coupons")
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
            >
              <Tag className="mr-2 h-4 w-4" /> Kuponlar
            </Button>
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800">
          <Button
            variant="destructive"
            className="w-full bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-600/30"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" /> Çıkış Yap
          </Button>
        </div>
      </aside >

      {/* MAIN CONTENT */}
      < main className="flex-1 ml-64 p-8" >
        {children}
      </main >
    </div >
  );
}