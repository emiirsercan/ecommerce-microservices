"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Star, User } from "lucide-react"; // İkonlar
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Review = {
  id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export default function ReviewsSection({ productId }: { productId: number }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [newComment, setNewComment] = useState("");
  const [rating, setRating] = useState(0); // Seçilen yıldız sayısı
  const [hoverRating, setHoverRating] = useState(0); // Mouse ile üzerine gelinen yıldız

  // 1. Yorumları Çek
  const fetchReviews = async () => {
    try {
      // Gateway üzerinden Review Service'e git
      const res = await axios.get(`http://localhost:8080/api/reviews/${productId}`);
      // Tarihe göre sırala (En yeni en üstte)
      const sorted = res.data.sort((a: Review, b: Review) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setReviews(sorted || []);
    } catch (err) {
      console.error("Yorumlar çekilemedi", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [productId]);

  // 2. Yorum Gönder
  const handleSubmit = async () => {
    const userId = localStorage.getItem("user_id");
    // Basit bir kullanıcı adı simülasyonu (Normalde Auth servisinden gelir)
    const userName = "Kullanıcı " + userId; 

    if (!userId) {
      toast.error("Yorum yapmak için giriş yapmalısınız.");
      return;
    }
    if (rating === 0) {
        toast.error("Lütfen puan verin.");
        return;
    }

    try {
      await axios.post("http://localhost:8080/api/reviews", {
        product_id: productId,
        user_id: Number(userId),
        user_name: userName, // Gerçek projede token'dan alınır
        rating: rating,
        comment: newComment
      });

      toast.success("Yorumunuz eklendi!");
      setNewComment("");
      setRating(0);
      fetchReviews(); // Listeyi yenile

    } catch (err) {
      toast.error("Yorum gönderilemedi.");
    }
  };

  // Ortalama Puan Hesapla
  const averageRating = reviews.length 
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) 
    : "0.0";

  return (
    <div className="mt-16 border-t pt-10">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        Müşteri Yorumları 
        <span className="text-sm font-normal text-gray-500">({reviews.length})</span>
        <span className="ml-auto text-yellow-500 flex items-center text-lg">
            <Star className="w-5 h-5 fill-yellow-500 mr-1" /> {averageRating} / 5
        </span>
      </h2>

      {/* YORUM YAPMA FORMU */}
      <div className="bg-slate-50 p-6 rounded-xl mb-10 border border-slate-200">
        <h3 className="font-semibold mb-3">Bu ürünü değerlendir</h3>
        
        {/* Yıldız Seçimi */}
        <div className="flex gap-1 mb-4">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="focus:outline-none transition-transform hover:scale-110"
                >
                    <Star 
                        className={`w-8 h-8 ${
                            star <= (hoverRating || rating) 
                                ? "fill-yellow-400 text-yellow-400" 
                                : "text-gray-300"
                        }`} 
                    />
                </button>
            ))}
        </div>

        <Textarea 
            placeholder="Ürün hakkındaki deneyimleriniz neler?" 
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="bg-white mb-4"
        />
        <Button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-700">
            Yorumu Gönder
        </Button>
      </div>

      {/* YORUM LİSTESİ */}
      <div className="space-y-6">
        {reviews.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Henüz yorum yapılmamış. İlk yorumu sen yap!</p>
        ) : (
            reviews.map((review) => (
                <div key={review.id} className="border-b pb-6 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700">
                                <User className="w-4 h-4" />
                            </div>
                            <span className="font-semibold">{review.user_name}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                            {new Date(review.created_at).toLocaleDateString("tr-TR")}
                        </span>
                    </div>
                    
                    <div className="flex text-yellow-400 mb-2">
                        {[...Array(5)].map((_, i) => (
                            <Star 
                                key={i} 
                                className={`w-4 h-4 ${i < review.rating ? "fill-yellow-400" : "text-gray-200 fill-gray-200"}`} 
                            />
                        ))}
                    </div>
                    
                    <p className="text-gray-700 leading-relaxed">
                        {review.comment}
                    </p>
                </div>
            ))
        )}
      </div>
    </div>
  );
}