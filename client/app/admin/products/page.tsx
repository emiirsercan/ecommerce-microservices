"use client";

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
import { Trash2, Package, Pencil, X } from "lucide-react";

type Category = {
  ID: number;
  name: string;
  slug: string;
  icon: string;
};

type Product = {
  ID: number;
  name: string;
  code: string;
  price: number;
  stock: number;
  category_id?: number;
  category?: Category;
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({ 
    name: "", 
    code: "", 
    price: "", 
    stock: "",
    category_id: "" 
  });
  const [loading, setLoading] = useState(false);

  // Düzenleme Modal State'leri
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    code: "",
    price: "",
    stock: "",
    category_id: ""
  });
  const [editLoading, setEditLoading] = useState(false);

  // Ürünleri ve Kategorileri Getir
  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        axios.get("http://localhost:8080/api/products?limit=1000"), // Tüm ürünleri al
        axios.get("http://localhost:8080/api/categories")
      ]);
      // Product Service artık pagination formatında dönüyor: { products: [...], pagination: {...} }
      setProducts(productsRes.data.products || []);
      setCategories(categoriesRes.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Ürün Ekle (POST -> Product Service -> RabbitMQ -> Search Service)
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const token = localStorage.getItem("token");

    try {
      const payload: any = {
        name: formData.name,
        code: formData.code,
        price: Number(formData.price),
        stock: Number(formData.stock)
      };

      // Kategori seçildiyse ekle
      if (formData.category_id) {
        payload.category_id = Number(formData.category_id);
      }

      await axios.post("http://localhost:8080/api/products", payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("Ürün eklendi ve senkronize edildi! 🚀");
      setFormData({ name: "", code: "", price: "", stock: "", category_id: "" });
      fetchData();

    } catch (err) {
      console.error(err);
      toast.error("Ürün eklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  // Düzenleme Modal'ını Aç
  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditFormData({
      name: product.name,
      code: product.code,
      price: product.price.toString(),
      stock: product.stock.toString(),
      category_id: product.category_id?.toString() || ""
    });
    setIsEditOpen(true);
  };

  // Ürün Güncelle (PUT)
  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    
    setEditLoading(true);
    const token = localStorage.getItem("token");

    try {
      const payload: any = {
        name: editFormData.name,
        code: editFormData.code,
        price: Number(editFormData.price),
        stock: Number(editFormData.stock)
      };

      // Kategori seçildiyse ekle
      if (editFormData.category_id) {
        payload.category_id = Number(editFormData.category_id);
      }

      await axios.put(`http://localhost:8080/api/products/${editingProduct.ID}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("Ürün başarıyla güncellendi! ✏️");
      setIsEditOpen(false);
      setEditingProduct(null);
      fetchData();

    } catch (err) {
      console.error(err);
      toast.error("Ürün güncellenirken hata oluştu.");
    } finally {
      setEditLoading(false);
    }
  };

  // Ürün Sil
  const handleDeleteProduct = async (productId: number) => {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    
    const token = localStorage.getItem("token");

    try {
      await axios.delete(`http://localhost:8080/api/products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("Ürün silindi! 🗑️");
      fetchData();

    } catch (err) {
      console.error(err);
      toast.error("Ürün silinirken hata oluştu.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* SOL: Ürün Ekleme Formu */}
      <Card className="lg:col-span-1 h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Yeni Ürün Ekle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="space-y-2">
                <Label>Ürün Adı</Label>
                <Input 
                    placeholder="Örn: Gaming Laptop" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                />
            </div>
            <div className="space-y-2">
                <Label>Ürün Kodu</Label>
                <Input 
                    placeholder="Örn: GL-550" 
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                    required
                />
            </div>

            {/* KATEGORİ SEÇİMİ */}
            <div className="space-y-2">
                <Label>Kategori</Label>
                <Select 
                  value={formData.category_id} 
                  onValueChange={(value) => setFormData({...formData, category_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kategori seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.ID} value={category.ID.toString()}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Fiyat (TL)</Label>
                    <Input 
                        type="number" 
                        placeholder="0" 
                        value={formData.price}
                        onChange={(e) => setFormData({...formData, price: e.target.value})}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label>Stok</Label>
                    <Input 
                        type="number" 
                        placeholder="0" 
                        value={formData.stock}
                        onChange={(e) => setFormData({...formData, stock: e.target.value})}
                        required
                    />
                </div>
            </div>
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
                {loading ? "Ekleniyor..." : "Kaydet ve Yayınla"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* SAĞ: Ürün Listesi */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Mevcut Ürünler ({products.length})</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                            <th className="px-4 py-3">ID</th>
                            <th className="px-4 py-3">Ürün Adı</th>
                            <th className="px-4 py-3">Kategori</th>
                            <th className="px-4 py-3">Kod</th>
                            <th className="px-4 py-3">Fiyat</th>
                            <th className="px-4 py-3">Stok</th>
                            <th className="px-4 py-3 text-center">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map((p) => (
                            <tr key={p.ID} className="border-b hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-900">{p.ID}</td>
                                <td className="px-4 py-3 font-medium">{p.name}</td>
                                <td className="px-4 py-3">
                                  {p.category ? (
                                    <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                                      {p.category.name}
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-400 text-xs">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-500">{p.code}</td>
                                <td className="px-4 py-3 font-bold text-indigo-600">{p.price} TL</td>
                                <td className="px-4 py-3">
                                  <span className={`font-medium ${p.stock === 0 ? 'text-red-500' : p.stock < 5 ? 'text-orange-500' : 'text-green-600'}`}>
                                    {p.stock}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-center gap-1">
                                    {/* Düzenle Butonu */}
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="text-indigo-600 hover:bg-indigo-50"
                                      onClick={() => openEditModal(p)}
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                    {/* Sil Butonu */}
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="text-red-500 hover:bg-red-50"
                                      onClick={() => handleDeleteProduct(p.ID)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Ürün yoksa */}
                {products.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Henüz ürün eklenmemiş.</p>
                  </div>
                )}
            </div>
        </CardContent>
      </Card>

      {/* DÜZENLEME MODAL'I */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-indigo-600" />
              Ürünü Düzenle
            </DialogTitle>
            <DialogDescription>
              Ürün bilgilerini güncelleyebilirsiniz.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Ürün Adı */}
            <div className="grid gap-2">
              <Label>Ürün Adı</Label>
              <Input 
                value={editFormData.name}
                onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
              />
            </div>

            {/* Ürün Kodu */}
            <div className="grid gap-2">
              <Label>Ürün Kodu</Label>
              <Input 
                value={editFormData.code}
                onChange={(e) => setEditFormData({...editFormData, code: e.target.value})}
              />
            </div>

            {/* Kategori */}
            <div className="grid gap-2">
              <Label>Kategori</Label>
              <Select 
                value={editFormData.category_id || "none"} 
                onValueChange={(value) => setEditFormData({...editFormData, category_id: value === "none" ? "" : value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kategori Yok</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.ID} value={category.ID.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fiyat ve Stok */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fiyat (TL)</Label>
                <Input 
                  type="number"
                  value={editFormData.price}
                  onChange={(e) => setEditFormData({...editFormData, price: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label>Stok</Label>
                <Input 
                  type="number"
                  value={editFormData.stock}
                  onChange={(e) => setEditFormData({...editFormData, stock: e.target.value})}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsEditOpen(false)}
            >
              <X className="w-4 h-4 mr-2" />
              İptal
            </Button>
            <Button 
              onClick={handleUpdateProduct}
              disabled={editLoading}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {editLoading ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
