"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "next/navigation"; // URL'deki ID'yi okumak için
import { ShoppingCart, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReviewsSection from "@/components/ui/ReviewsSection"; // Yorum bileşenimiz

type Product = {
  ID: number;
  name: string;
  price: number;
  stock: number;
  code: string;
};

export default function ProductDetailPage() {
  const { id } = useParams(); // URL'den id'yi al (product/5 -> id=5)
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Ürün Detayını Çek
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await axios.get(`http://localhost:8080/api/products/${id}`);
        setProduct(res.data);
      } catch (err) {
        console.error(err);
        toast.error("Ürün bulunamadı.");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchProduct();
  }, [id]);

  // 2. Sepete Ekleme Fonksiyonu
  const addToCart = async () => {
    const userId = localStorage.getItem("user_id");
    const token = localStorage.getItem("token");
    
    if (!userId || !token) {
      toast.error("Sepete eklemek için giriş yapmalısın.");
      return;
    }

    try {
      await axios.post(`http://localhost:8080/api/cart/${userId}`, {
        product_id: Number(id),
        quantity: 1
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Navbar'daki sepet sayacını güncelle
      window.dispatchEvent(new Event("cart-updated"));
      
      toast.success("Ürün sepete eklendi!");
    } catch (err) {
      toast.error("Sepete eklenirken hata oluştu.");
    }
  };

  if (loading) return <div className="p-20 text-center">Yükleniyor...</div>;
  if (!product) return <div className="p-20 text-center">Ürün bulunamadı.</div>;

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      
      {/* ÜST KISIM: Ürün Detayları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
        {/* SOL: Resim */}
        <div className="bg-gray-100 rounded-2xl overflow-hidden shadow-sm h-[500px]">
           <img 
             src={`https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80&random=${product.ID}`} 
             alt={product.name}
             className="w-full h-full object-cover"
           />
        </div>

        {/* SAĞ: Bilgiler */}
        <div className="flex flex-col justify-center space-y-6">
          <div>
             <h1 className="text-4xl font-extrabold text-slate-900 mb-2">{product.name}</h1>
             <p className="text-gray-500 text-lg">Ürün Kodu: {product.code}</p>
          </div>

          <div className="text-3xl font-bold text-indigo-600">
            {product.price} TL
          </div>

          {/* Stok Durumu */}
          <div className="flex items-center gap-2">
            {product.stock > 0 ? (
                <span className="flex items-center text-green-600 font-medium bg-green-50 px-3 py-1 rounded-full">
                    <Check className="w-4 h-4 mr-1" /> Stokta Var ({product.stock} adet)
                </span>
            ) : (
                <span className="flex items-center text-red-600 font-medium bg-red-50 px-3 py-1 rounded-full">
                    <AlertTriangle className="w-4 h-4 mr-1" /> Tükendi
                </span>
            )}
          </div>

          <p className="text-gray-600 leading-relaxed text-lg">
            Bu harika ürün, son teknoloji ile üretilmiş olup günlük hayatınızı kolaylaştırmak için tasarlanmıştır. 
            Dayanıklı malzemesi ve şık tasarımı ile vazgeçilmeziniz olacak.
          </p>

          <div className="pt-6">
            <Button 
                onClick={addToCart} 
                disabled={product.stock === 0}
                className="w-full md:w-auto text-lg h-14 px-8 bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-200"
            >
                <ShoppingCart className="mr-2 w-5 h-5" /> Sepete Ekle
            </Button>
          </div>
        </div>
      </div>

      {/* ALT KISIM: Yorumlar Bölümü (MongoDB'den Geliyor) */}
      <ReviewsSection productId={product.ID} />

    </div>
  );
}