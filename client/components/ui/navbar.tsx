"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react"; 
import { ShoppingCart, Search, LogOut, User, Package, Heart, Clock, TrendingUp } from "lucide-react"; 
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; 
import { useRouter, usePathname } from "next/navigation";
import axios from "axios";

// Son aramaları localStorage'da tutmak için key
const RECENT_SEARCHES_KEY = "recent_searches";
const MAX_RECENT_SEARCHES = 5;

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = useState("");

  if (pathname?.startsWith("/admin")) {
    return null;
  }
  const [user, setUser] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);

  // Autocomplete State'leri
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sepet Sayacı
  const updateCartCount = async () => {
    const userId = localStorage.getItem("user_id");
    const token = localStorage.getItem("token");
    
    if (!userId || !token) {
        setCartCount(0); 
        return;
    }

    try {
        const res = await axios.get(`http://localhost:8080/api/cart/${userId}/count`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setCartCount(res.data.count);
    } catch (error) {
        console.error("❌ Navbar Hatası:", error);
    }
  };

  // Son aramaları yükle
  const loadRecentSearches = () => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Son aramalar yüklenemedi");
    }
  };

  // Son aramaya ekle
  const addToRecentSearches = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    let searches = [...recentSearches];
    
    // Varsa kaldır (en başa eklemek için)
    searches = searches.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
    
    // En başa ekle
    searches.unshift(trimmed);
    
    // Max sayıyı aşmasın
    searches = searches.slice(0, MAX_RECENT_SEARCHES);
    
    setRecentSearches(searches);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
  };

  // Öneri getir (debounced)
  const fetchSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await axios.get(`http://localhost:8080/api/search/suggest?q=${encodeURIComponent(query)}`);
      setSuggestions(res.data || []);
    } catch (error) {
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Input değiştiğinde
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowDropdown(true);

    // Debounce: 300ms bekle
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
  };

  // Arama yap
  const performSearch = (term: string) => {
    if (term.trim() === "") return;
    
    addToRecentSearches(term);
    setShowDropdown(false);
    setSearchTerm("");
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  // Enter tuşu
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      performSearch(searchTerm);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  // Dışarı tıklandığında dropdown'u kapat
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(storedUser);
    } else {
      // Kullanıcı bilgisi yoksa state'i de temizle
      setUser(null);
    }
    
    updateCartCount();
    loadRecentSearches();

    window.addEventListener("cart-updated", updateCartCount);

    const handleProfileUpdated = () => {
      const newUser = localStorage.getItem("user");
      // user varsa set et, yoksa null yap
      setUser(newUser || null);
      // Auth değiştiyse sepet sayısını da güncelle
      updateCartCount();
    };

    window.addEventListener("profile-updated", handleProfileUpdated);

    return () => {
      window.removeEventListener("cart-updated", updateCartCount);
      window.removeEventListener("profile-updated", handleProfileUpdated);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user");
    window.location.href = "/"; 
  };

  // Son aramayı sil
  const removeRecentSearch = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = recentSearches.filter(s => s !== term);
    setRecentSearches(filtered);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(filtered));
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        
        <Link href="/" className="flex items-center gap-2">
          <span className="font-bold text-2xl bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            GoCommerce
          </span>
        </Link>

        {/* ARAMA ALANI */}
        <div ref={searchRef} className="hidden md:flex items-center flex-1 max-w-md relative">
          <div className="flex items-center w-full bg-slate-100 rounded-full px-4 py-2">
            <Search className="w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Ürün ara..." 
              className="bg-transparent border-none outline-none text-sm w-full ml-2"
              value={searchTerm}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowDropdown(true)}
            />
            {isLoading && (
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* AUTOCOMPLETE DROPDOWN */}
          {showDropdown && (searchTerm.length > 0 || recentSearches.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
              
              {/* Öneriler */}
              {suggestions.length > 0 && (
                <div className="p-2">
                  <p className="text-xs text-slate-400 px-3 py-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Öneriler
                  </p>
                  {suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 rounded-lg flex items-center gap-2 transition-colors"
                      onClick={() => performSearch(suggestion)}
                    >
                      <Search className="w-3 h-3 text-slate-400" />
                      <span dangerouslySetInnerHTML={{
                        __html: suggestion.replace(
                          new RegExp(`(${searchTerm})`, 'gi'),
                          '<strong class="text-indigo-600">$1</strong>'
                        )
                      }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Son Aramalar */}
              {suggestions.length === 0 && recentSearches.length > 0 && searchTerm.length === 0 && (
                <div className="p-2">
                  <p className="text-xs text-slate-400 px-3 py-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Son Aramalar
                  </p>
                  {recentSearches.map((term, i) => (
                    <button
                      key={i}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-lg flex items-center justify-between group transition-colors"
                      onClick={() => performSearch(term)}
                    >
                      <span className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-slate-300" />
                        {term}
                      </span>
                      <span 
                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => removeRecentSearch(term, e)}
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Boş durum */}
              {searchTerm.length >= 2 && suggestions.length === 0 && !isLoading && (
                <div className="p-4 text-center text-sm text-slate-500">
                  <Search className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  Öneri bulunamadı
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2"> 
            
            <Link href="/favorites">
                <Button variant="ghost" size="icon" className="relative hover:bg-red-50 hover:text-red-600 transition-colors rounded-full">
                    <Heart className="w-5 h-5" />
                </Button>
            </Link>
        
            <Link href="/cart">
                <Button variant="ghost" size="icon" className="relative hover:bg-indigo-50 hover:text-indigo-600 transition-colors rounded-full">
                <ShoppingCart className="w-5 h-5" />
                
                {cartCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 bg-red-500 text-white rounded-full text-[10px]">
                    {cartCount}
                    </Badge>
                )}
                </Button>
            </Link>
          
            {user ? (
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="ml-2 gap-2 rounded-full border-indigo-200 hover:bg-indigo-50 text-indigo-900">
                    <User className="w-4 h-4 text-indigo-600" />
                    <span className="font-semibold hidden sm:inline">{user}</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Hesabım</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <Link href="/profile">
                        <DropdownMenuItem className="cursor-pointer">
                            <Package className="w-4 h-4 mr-2" /> Siparişlerim
                        </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem>Ayarlar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer focus:text-red-600 focus:bg-red-50">
                        <LogOut className="w-4 h-4 mr-2" /> Çıkış Yap
                    </DropdownMenuItem>
                </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                <Link href="/login">
                <Button className="hidden md:inline-flex bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 ml-2">
                    Giriş Yap
                </Button>
                </Link>
            )}
        </div>
      </div>
    </header>
  );
}
