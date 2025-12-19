import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/ui/navbar"; // Navbar Eklendi
import { Toaster } from "@/components/ui/sonner"; // Sonner (Bildirim) Eklendi

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GoCommerce",
  description: "Microservices E-Commerce",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50`}>
        <Navbar />
        <main>
            {children}
        </main>
        <Toaster position="bottom-right" richColors /> {/* Bildirimler sağ altta çıksın */}
      </body>
    </html>
  );
}